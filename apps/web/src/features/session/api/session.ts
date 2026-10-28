import type { components } from "@/shared/api/generated/schema";
import { apiRequest } from "@/shared/api/transport";
import type { SessionBoundary } from "@/shared/api/session-boundary";

export type Session = components["schemas"]["SessionDto"];
export type Login = components["schemas"]["LoginDto"];
export const readSession = (boundary: SessionBoundary) =>
  apiRequest<Session>("/auth/session", { boundary });
export const loginSession = (input: Login, boundary: SessionBoundary) =>
  apiRequest<Session>("/auth/login", { method: "POST", body: input, boundary });
export const logoutSession = (boundary: SessionBoundary) =>
  apiRequest<void>("/auth/logout", { method: "POST", body: {}, boundary });
