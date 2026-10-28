import type { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/shared/api/transport";
import { sessionBoundary } from "@/shared/api/session-boundary";
import type { SessionBoundary } from "@/shared/api/session-boundary";
import { loginSession, logoutSession, readSession } from "../api/session";
import type { Login, Session } from "../api/session";

type State = {
  status:
    | "loading"
    | "anonymous"
    | "authenticated"
    | "expired"
    | "account-change"
    | "unavailable";
  session: Session | null;
};
export interface SensitiveState {
  ownerUserId: string;
  dirty(): boolean;
  clear(): void;
}

export class SessionRuntime {
  private state: State = { status: "loading", session: null };
  private readonly listeners = new Set<() => void>();
  private readonly sensitive = new Set<SensitiveState>();
  private previousUserId: string | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private attempt = 0;
  constructor(
    readonly queryClient: QueryClient,
    readonly boundary: SessionBoundary = sessionBoundary,
  ) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: State) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  registerSensitiveState(value: SensitiveState) {
    if (
      this.state.status !== "authenticated" ||
      value.ownerUserId !== this.state.session?.user.userId
    )
      throw new ApiError(
        401,
        "SESSION_CHANGED",
        "Bản nháp không thuộc tài khoản hiện tại.",
      );
    this.sensitive.add(value);
    return () => {
      this.sensitive.delete(value);
    };
  }
  hasDirtyState() {
    return [...this.sensitive].some((value) => value.dirty());
  }
  private clearSensitiveState() {
    for (const value of this.sensitive) value.clear();
    this.sensitive.clear();
  }
  clearSessionCache = () => {
    this.boundary.invalidate();
    void this.queryClient.cancelQueries();
    this.queryClient.clear();
  };

  connect() {
    const unsubscribe = this.boundary.onFailure(this.expire);
    const focus = () => {
      if (this.state.status === "authenticated") void this.refresh();
    };
    window.addEventListener("focus", focus);
    void this.refresh();
    return () => {
      this.attempt += 1;
      clearTimeout(this.timer);
      unsubscribe();
      window.removeEventListener("focus", focus);
    };
  }
  async refresh() {
    const attempt = ++this.attempt;
    try {
      const session = await readSession(this.boundary);
      if (attempt === this.attempt) this.accept(session);
    } catch (error) {
      if (attempt !== this.attempt) return;
      if (error instanceof ApiError && error.status === 401) this.expire();
      else {
        this.clearSessionCache();
        this.publish({ status: "unavailable", session: null });
      }
    }
  }
  async login(input: Login) {
    const attempt = ++this.attempt;
    const session = await loginSession(input, this.boundary);
    if (attempt !== this.attempt) return;
    this.accept(session);
  }
  private accept(session: Session) {
    const different =
      this.previousUserId !== undefined &&
      session.user.userId !== this.previousUserId;
    this.clearSessionCache();
    if (different && this.hasDirtyState()) {
      clearTimeout(this.timer);
      this.publish({ status: "account-change", session });
      return;
    }
    if (different) this.clearSensitiveState();
    this.activate(session);
  }
  confirmAccountChange() {
    if (this.state.status !== "account-change" || !this.state.session) return;
    this.clearSensitiveState();
    this.activate(this.state.session);
  }
  private activate(session: Session) {
    this.previousUserId = session.user.userId;
    this.boundary.allowWrites();
    this.publish({ status: "authenticated", session });
    clearTimeout(this.timer);
    const expires = Math.min(
      Date.parse(session.expiresAt),
      Date.parse(session.idleExpiresAt),
    );
    // DB remains authoritative: other valid requests can extend idle time.
    this.timer = setTimeout(
      () => {
        void this.refresh();
      },
      Math.max(0, expires - Date.now()),
    );
  }
  expire = () => {
    const wasAuthenticated = this.previousUserId !== undefined;
    this.attempt += 1;
    clearTimeout(this.timer);
    this.clearSessionCache();
    this.publish({
      status: wasAuthenticated ? "expired" : "anonymous",
      session: null,
    });
  };
  async logout(discard = false) {
    if (this.hasDirtyState() && !discard) return false;
    this.attempt += 1;
    // Stop writes immediately, including while logout is in flight.
    this.clearSessionCache();
    await logoutSession(this.boundary);
    clearTimeout(this.timer);
    this.clearSensitiveState();
    this.previousUserId = undefined;
    this.publish({ status: "anonymous", session: null });
    return true;
  }
}
