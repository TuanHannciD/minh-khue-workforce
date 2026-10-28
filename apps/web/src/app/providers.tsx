import type { PropsWithChildren } from "react";

// Composition point; state/query providers are added only with their first consumer.
export function Providers({ children }: PropsWithChildren) {
  return children;
}
