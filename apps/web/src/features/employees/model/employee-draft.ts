import type { SessionRuntime } from "@/features/session/index";
import {
  saveEmployee,
  type Employee,
  type EmploymentDetails,
  type EmployeeIntent,
} from "../api/employees";
import { ApiError } from "@/shared/api/transport";
import { reconcileByIdentity } from "@/shared/api/reconcile";
import {
  sessionBoundary,
  type SessionBoundary,
} from "@/shared/api/session-boundary";

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
  current: Employee | null = null;
  // Recovery provenance outlives the outcome of any newer PATCH. In particular,
  // a rejected PATCH cannot turn a lost POST back into an unsent create.
  private unresolvedWrite = false;
  confirmedId: string | null = null;
  readError = "";
  reconciling = false;
  pending = false;
  epoch: number | undefined;
  private boundary: SessionBoundary = sessionBoundary;
  private connected = false;
  private readEpoch = -1;
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
  // Only explicit clear starts a new mounted form lifecycle. Ordinary draft
  // publications must preserve RHF raw fields and validation errors.
  get lifecycle() {
    return this.generation;
  }
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
    this.pending ||
    JSON.stringify(this.values) !== JSON.stringify(fields(this.baseline)) ||
    this.requiresReconciliation;
  clear = () => {
    this.generation++;
    this.baseline = null;
    this.values = fields(null);
    this.outcome = { type: "editing" };
    this.current = null;
    this.unresolvedWrite = false;
    this.confirmedId = null;
    this.readError = "";
    this.pending = false;
    this.reconciling = false;
    this.epoch = this.connected ? this.boundary.current() : undefined;
    this.publish();
  };
  begin() {
    this.pending = true;
    this.current = null;
    this.publish();
    return this.generation;
  }
  get needsRecovery() {
    return (
      this.connected &&
      this.epoch !== undefined &&
      !this.boundary.canWrite(this.epoch)
    );
  }
  get requiresReconciliation() {
    return this.unresolvedWrite;
  }
  get recoveryReady() {
    return (
      this.current !== null &&
      (!this.connected || this.boundary.canWrite(this.readEpoch))
    );
  }
  resumeUnsentCreate() {
    if (
      this.baseline ||
      this.pending ||
      this.reconciling ||
      this.requiresReconciliation ||
      !this.boundary.isActive()
    )
      return false;
    this.epoch = this.boundary.current();
    this.publish();
    return true;
  }
  select(employee: Employee) {
    if (this.pending || this.reconciling) return false;
    this.clear();
    this.baseline = { ...employee };
    this.values = fields(employee);
    this.publish();
    return true;
  }
  accept(employee: Employee, generation: number) {
    if (generation !== this.generation) return false;
    if (this.needsRecovery) {
      this.reject(new Error("Session transition"), generation);
      return false;
    }
    this.pending = false;
    this.baseline = { ...employee };
    this.unresolvedWrite = false;
    this.confirmedId = null;
    this.values = fields(employee);
    this.outcome = { type: "saved" };
    this.publish();
    return true;
  }
  reject(error: unknown, generation: number) {
    if (generation !== this.generation) return;
    this.pending = false;
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
    if (["unknown", "conflict"].includes(this.outcome.type))
      this.unresolvedWrite = true;
    this.publish();
  }
  async reconcile(
    id: string | undefined = undefined,
    read = reconcileByIdentity,
  ) {
    if (
      this.pending ||
      this.reconciling ||
      (this.connected && !this.boundary.isActive())
    )
      return;
    const identity = this.baseline?.id ?? this.confirmedId ?? id;
    if (!identity) {
      this.readError =
        "Chưa có ID để đối chiếu. Tải lại danh sách và tự xác định đúng ID; tên trùng không chứng minh đã tạo.";
      this.publish();
      return;
    }
    // UUID input accepts either case; the API/DB identity is canonical lowercase.
    // Leave malformed input unchanged so its existing validation contract holds.
    const employeeId = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(
      identity,
    )
      ? identity.toLowerCase()
      : identity;
    const generation = this.generation,
      epoch = this.boundary.current();
    this.reconciling = true;
    this.current = null;
    this.readError = "";
    this.publish();
    try {
      const result = await read(
        { employeeIds: [employeeId], cells: [] },
        epoch,
      );
      if (generation !== this.generation) return;
      if (this.connected && !this.boundary.canWrite(epoch))
        throw new Error("Session transition");
      this.current = result.employees.find((e) => e.id === employeeId) ?? null;
      if (this.current && !this.baseline) this.confirmedId = employeeId;
      this.readEpoch = epoch;
      if (!this.current)
        this.readError =
          "Không tìm thấy ID nhân sự. Bản nháp được giữ, không tự tạo lại.";
    } catch {
      if (generation !== this.generation) return;
      this.current = null;
      this.readError =
        "Chưa thể đối chiếu nhân sự. Lỗi đọc không có nghĩa ID bị thiếu; bản nháp được giữ.";
    } finally {
      if (generation === this.generation) {
        this.reconciling = false;
        this.publish();
      }
    }
  }
  async recover(
    choice: "draft" | "current",
    save: (intent: EmployeeIntent) => Promise<Employee> = saveEmployee,
  ) {
    const current = this.current;
    if (
      !current ||
      this.pending ||
      this.reconciling ||
      (this.connected && !this.boundary.canWrite(this.readEpoch))
    )
      return false;
    const values = choice === "current" ? fields(current) : this.values;
    const generation = this.begin();
    this.epoch = this.readEpoch;
    try {
      const employee = await save({
        id: current.id,
        expectedEpoch: this.readEpoch,
        input: {
          expectedRevision: current.revision,
          name: values.name.trim(),
          startDate: values.startDate,
          endDate: values.endDate || null,
        },
      });
      return this.accept(employee, generation);
    } catch (error) {
      this.reject(error, generation);
      return false;
    }
  }
  connect(runtime: SessionRuntime) {
    this.connected = true;
    this.boundary = runtime.boundary;
    let owner: string | undefined, unregister: (() => void) | undefined;
    const attach = () => {
      const state = runtime.snapshot();
      if (state.status !== "authenticated" || !state.session) return;
      if (owner === state.session.user.userId) {
        if (!this.dirty()) this.epoch = runtime.boundary.current();
        return;
      }
      unregister?.();
      owner = state.session.user.userId;
      this.epoch = runtime.boundary.current();
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
