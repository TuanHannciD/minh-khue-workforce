import type { SessionRuntime } from "@/features/session/index";
import type { Employee, EmploymentDetails } from "../api/employees";
import { ApiError } from "@/shared/api/transport";

export type EmployeeFields = {
  name: string;
  startDate: string;
  endDate: string;
};
export type EmployeeOutcome = {
  type: "editing" | "saved" | "rejected" | "conflict" | "unknown";
  message?: string;
  details?: EmploymentDetails;
};
const fields = (e: Employee | null): EmployeeFields => ({
  name: e?.name ?? "",
  startDate: e?.startDate ?? "",
  endDate: e?.endDate ?? "",
});

// Kept by the app, separate from month membership and RHF's mounted fields.
export class EmployeeDraft {
  baseline: Employee | null;
  values: EmployeeFields;
  outcome: EmployeeOutcome = { type: "editing" };
  private version = 0;
  private generation = 0;
  private readonly listeners = new Set<() => void>();
  constructor(employee: Employee | null = null) {
    this.baseline = employee ? { ...employee } : null;
    this.values = fields(employee);
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.version;
  private publish() {
    this.version++;
    for (const listener of this.listeners) listener();
  }
  change(values: EmployeeFields) {
    this.values = { ...values };
    if (["editing", "saved", "rejected"].includes(this.outcome.type))
      this.outcome = { type: "editing" };
    this.publish();
  }
  dirty = () =>
    JSON.stringify(this.values) !== JSON.stringify(fields(this.baseline)) ||
    ["unknown", "conflict"].includes(this.outcome.type);
  clear = () => {
    this.generation++;
    this.baseline = null;
    this.values = fields(null);
    this.outcome = { type: "editing" };
    this.publish();
  };
  begin() {
    return this.generation;
  }
  accept(employee: Employee, generation: number) {
    if (generation !== this.generation) return false;
    this.baseline = { ...employee };
    this.values = fields(employee);
    this.outcome = { type: "saved" };
    this.publish();
    return true;
  }
  reject(error: unknown, generation: number) {
    if (generation !== this.generation) return;
    this.outcome =
      error instanceof ApiError &&
      error.status < 500 &&
      error.code !== "SESSION_CHANGED"
        ? {
            type: error.status === 409 ? "conflict" : "rejected",
            message: error.message,
            ...(error.details === undefined
              ? {}
              : { details: error.details as EmploymentDetails }),
          }
        : {
            type: "unknown",
            message:
              "Chưa xác định kết quả lưu. Giữ bản nháp và kiểm tra dữ liệu đã lưu trước khi tạo lần lưu mới.",
          };
    this.publish();
  }
  connect(runtime: SessionRuntime) {
    let owner: string | undefined, unregister: (() => void) | undefined;
    const attach = () => {
      const state = runtime.snapshot();
      if (
        state.status !== "authenticated" ||
        !state.session ||
        owner === state.session.user.userId
      )
        return;
      unregister?.();
      owner = state.session.user.userId;
      unregister = runtime.registerSensitiveState({
        ownerUserId: owner,
        dirty: this.dirty,
        clear: () => {
          owner = undefined;
          this.clear();
        },
      });
    };
    const unsubscribe = runtime.subscribe(attach);
    attach();
    return () => {
      unsubscribe();
      unregister?.();
    };
  }
}
