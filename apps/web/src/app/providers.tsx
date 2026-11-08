import { useEffect, useState } from "react";
import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider, SessionRuntime } from "@/features/session/index";
import { ApiError } from "@/shared/api/transport";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (count, error) =>
          !(error instanceof ApiError && error.status === 401) && count < 2,
      },
      mutations: { retry: false },
    },
  });
}

let activeRuntime: SessionRuntime | undefined;
export function clearSessionCache(): void {
  activeRuntime?.clearSessionCache();
}

export function Providers({ children }: PropsWithChildren) {
  const [runtime] = useState(() => new SessionRuntime(createQueryClient()));
  useEffect(() => {
    activeRuntime = runtime;
    return () => {
      if (activeRuntime === runtime) activeRuntime = undefined;
    };
  }, [runtime]);
  return (
    <QueryClientProvider client={runtime.queryClient}>
      <SessionProvider runtime={runtime}>{children}</SessionProvider>
    </QueryClientProvider>
  );
}
