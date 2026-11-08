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
  private transition: "login" | "logout" | undefined;
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
    if (this.transition) return;
    const attempt = ++this.attempt;
    try {
      const session = await readSession(this.boundary);
      if (attempt === this.attempt) this.accept(session, true);
    } catch (error) {
      if (attempt !== this.attempt) return;
      if (error instanceof ApiError && error.status === 401) this.expire();
      else {
        clearTimeout(this.timer);
        this.clearSessionCache();
        this.publish({ status: "unavailable", session: null });
      }
    }
  }
  async login(input: Login) {
    if (this.transition)
      throw new ApiError(
        401,
        "SESSION_CHANGED",
        "Phiên đang thay đổi. Vui lòng thử lại.",
      );
    this.transition = "login";
    const attempt = ++this.attempt;
    clearTimeout(this.timer);
    this.clearSessionCache();
    try {
      const session = await loginSession(input, this.boundary);
      if (attempt !== this.attempt) return;
      this.accept(session);
    } catch (error) {
      if (attempt === this.attempt)
        this.publish({
          status: this.previousUserId ? "expired" : "anonymous",
          session: null,
        });
      throw error;
    } finally {
      this.transition = undefined;
    }
  }
  private accept(session: Session, refresh = false) {
    // A live continuity check may renew idle metadata, but must not revoke
    // pending work or draft leases. Login/reauthentication always transitions.
    // The public DTO has no token/session ID; absolute expiry is immutable
    // within a session, unlike the sliding idle deadline.
    if (
      refresh &&
      this.state.status === "authenticated" &&
      this.boundary.isActive() &&
      this.state.session?.user.userId === session.user.userId &&
      this.state.session.expiresAt === session.expiresAt
    ) {
      this.activate(session);
      return;
    }
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
    // These deadlines only hint when to ask the authoritative DB again.
    // A valid server response can be in the client's past after clock skew
    // or a clock jump. Wait a minute in that case instead of a zero-delay
    // loop; bound future waits too (including JS timer overflow on clock rewind).
    const remaining = expires - Date.now();
    const delay =
      remaining > 0 ? Math.max(1000, Math.min(remaining, 7200000)) : 60000;
    this.timer = setTimeout(() => {
      void this.refresh();
    }, delay);
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
    if (this.transition) return false;
    if (this.hasDirtyState() && !discard) return false;
    this.transition = "logout";
    this.attempt += 1;
    clearTimeout(this.timer);
    // Stop writes immediately, including while logout is in flight.
    this.clearSessionCache();
    this.publish({ status: "loading", session: null });
    try {
      await logoutSession(this.boundary);
      this.clearSensitiveState();
      this.previousUserId = undefined;
      this.publish({ status: "anonymous", session: null });
      return true;
    } catch (error) {
      // Revocation may have committed despite a lost response. Never restore
      // the old snapshot; an explicit fresh check can recover from unavailable.
      this.publish({ status: "unavailable", session: null });
      throw error;
    } finally {
      this.attempt += 1;
      clearTimeout(this.timer);
      this.clearSessionCache();
      this.transition = undefined;
    }
  }
}
