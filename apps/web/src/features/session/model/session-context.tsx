import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import type { PropsWithChildren } from "react";
import type { SessionRuntime } from "./session-runtime";

const SessionContext = createContext<SessionRuntime | null>(null);
export function SessionProvider({
  runtime,
  children,
}: PropsWithChildren<{ runtime: SessionRuntime }>) {
  useEffect(() => runtime.connect(), [runtime]);
  return (
    <SessionContext.Provider value={runtime}>
      {children}
    </SessionContext.Provider>
  );
}
export function useSession() {
  const runtime = useContext(SessionContext);
  if (!runtime) throw new Error("SessionProvider is required");
  const state = useSyncExternalStore(runtime.subscribe, runtime.snapshot);
  return { runtime, ...state };
}
