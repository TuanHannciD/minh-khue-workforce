import type { SessionRuntime } from "@/features/session/index";
import {
  sessionBoundary,
  type SessionBoundary,
} from "@/shared/api/session-boundary";
import { ApiError } from "@/shared/api/transport";
import { writeAttendance, reconcileByIdentity } from "../api/attendance";
import type {
  WriteAttendance,
  WriteResult,
  ReconcileRequest,
  ReconcileSnapshot,
} from "../api/attendance";
import type { CellSnapshotDto, MonthDto, EmployeeDto } from "./types";
import { cellIdentity } from "./month-view";
import { parseNumberInput, formatAttendanceValue } from "./number-input";

export type EditingCell = {
  month: string;
  cell: CellSnapshotDto;
  employee: EmployeeDto;
  raw: string;
  reminder: boolean;
  custom: boolean;
  error: string;
  ownerUserId: string;
  epoch: number;
  targets: WriteAttendance["targets"];
  mode: "patch-cell";
  source: null;
};
export type SaveOutcome = {
  type: "editing" | "pending" | "saved" | "rejected" | "conflict" | "unknown";
  message?: string;
};
type Write = (input: WriteAttendance, epoch: number) => Promise<WriteResult>;
type Read = (
  input: ReconcileRequest,
  epoch: number,
) => Promise<ReconcileSnapshot>;
const key = (cell: CellSnapshotDto) => ({
  employeeId: cell.employeeId,
  date: cell.date,
  kind: cell.kind,
});
const equalValue = (a: CellSnapshotDto["value"], b: CellSnapshotDto["value"]) =>
  JSON.stringify(a) === JSON.stringify(b);

// Query snapshots may change; edit is a frozen identity/baseline plus local raw.
// Only explicit recovery creates a new write using the separately viewed read.
export class AttendanceDraft {
  edit: EditingCell | null = null;
  outcome: SaveOutcome = { type: "editing" };
  current: ReconcileSnapshot | null = null;
  conflictCells: CellSnapshotDto[] = [];
  readError = "";
  reconciling = false;
  private readEpoch = -1;
  private version = 0;
  private generation = 0;
  private readonly listeners = new Set<() => void>();
  constructor(readonly boundary: SessionBoundary = sessionBoundary) {}
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
  dirty = () => Boolean(this.edit) || this.outcome.type === "unknown";
  get recoveryReady() {
    return this.current !== null && this.boundary.canWrite(this.readEpoch);
  }
  clear = () => {
    this.generation++;
    this.edit = null;
    this.current = null;
    this.conflictCells = [];
    this.readEpoch = -1;
    this.outcome = { type: "editing" };
    this.readError = "";
    this.reconciling = false;
    this.publish();
  };
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
  open(month: MonthDto, cell: CellSnapshotDto, ownerUserId: string) {
    if (this.edit || cell.state !== "editable" || !this.boundary.isActive())
      return false;
    const employee = month.employees.find((e) => e.id === cell.employeeId);
    if (!employee) return false;
    this.generation++;
    this.current = null;
    this.readError = "";
    this.edit = {
      month: month.month,
      cell: structuredClone(cell),
      employee: { ...employee },
      raw: formatAttendanceValue(cell.value),
      reminder: cell.reminder,
      custom: cell.value?.type === "number" && cell.value.value > 2.5,
      error: "",
      ownerUserId,
      epoch: this.boundary.current(),
      targets: [{ ...key(cell), expectedRevision: cell.revision }],
      mode: "patch-cell",
      source: null,
    };
    this.outcome = { type: "editing" };
    this.publish();
    return true;
  }
  change(
    fields: Partial<Pick<EditingCell, "raw" | "reminder" | "custom" | "error">>,
  ) {
    if (!this.edit || this.outcome.type === "pending" || this.reconciling)
      return;
    this.edit = { ...this.edit, ...fields };
    if (this.outcome.type === "rejected") this.outcome = { type: "editing" };
    this.publish();
  }
  discard() {
    if (this.outcome.type === "pending" || this.reconciling) return false;
    const unknown = this.outcome.type === "unknown";
    this.clear();
    if (unknown) {
      this.outcome = {
        type: "unknown",
        message:
          "Phần nhập đã bỏ. Kết quả yêu cầu cũ vẫn chưa xác định; bỏ bản nháp không hủy yêu cầu đã gửi. Tải lại bảng để xem dữ liệu mới.",
      };
      this.publish();
    }
    return true;
  }
  async submit(write: Write = writeAttendance) {
    const edit = this.edit;
    if (
      !edit ||
      this.reconciling ||
      ["pending", "unknown", "conflict"].includes(this.outcome.type)
    )
      return false;
    if (!this.boundary.canWrite(edit.epoch)) {
      this.outcome = {
        type: "conflict",
        message: "Phiên đã thay đổi. Đối chiếu trước khi tạo lần lưu mới.",
      };
      this.publish();
      return false;
    }
    const parsed = parseNumberInput(edit.raw, edit.cell.kind);
    if (!parsed.valid) {
      this.change({ error: parsed.message });
      return false;
    }
    const patch: WriteAttendance["operation"]["patch"] = {};
    if (!equalValue(parsed.value, edit.cell.value)) patch.value = parsed.value;
    if (edit.reminder !== edit.cell.reminder) patch.reminder = edit.reminder;
    if (!Object.keys(patch).length) {
      this.outcome = { type: "rejected", message: "Chưa có thay đổi để lưu." };
      this.publish();
      return false;
    }
    return this.send(edit.cell, edit.employee, patch, edit.epoch, write);
  }
  private async send(
    cell: CellSnapshotDto,
    employee: EmployeeDto,
    patch: WriteAttendance["operation"]["patch"],
    epoch: number,
    write: Write,
  ) {
    const edit = this.edit!;
    const generation = this.generation;
    this.outcome = { type: "pending" };
    this.current = null;
    this.publish();
    try {
      const result = await write(
        {
          month: edit.month,
          expectedEmployees: [
            { employeeId: employee.id, expectedRevision: employee.revision },
          ],
          targets: [{ ...key(cell), expectedRevision: cell.revision }],
          operation: { type: "patch-cell", patch },
        },
        epoch,
      );
      if (generation !== this.generation) return false;
      if (!this.boundary.canWrite(epoch)) throw new Error("Session transition");
      if (result.counts.eligible !== 1 || result.counts.skipped !== 0)
        throw new Error("No accepted eligible fence");
      this.edit = null;
      this.outcome = {
        type: "saved",
        message: "Đã lưu ô. Tổng đang được cập nhật từ bảng tháng.",
      };
      this.publish();
      return true;
    } catch (error) {
      if (generation !== this.generation) return false;
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        typeof error.details === "object" &&
        error.details !== null &&
        "cells" in error.details &&
        Array.isArray(error.details.cells)
      )
        this.conflictCells = error.details.cells as CellSnapshotDto[];
      this.outcome =
        error instanceof ApiError &&
        error.status < 500 &&
        error.code !== "SESSION_CHANGED"
          ? {
              type: error.status === 409 ? "conflict" : "rejected",
              message: error.message,
            }
          : {
              type: "unknown",
              message:
                "Chưa xác định kết quả lưu. Bản nháp được giữ. Đối chiếu dữ liệu trước khi quyết định lưu lại.",
            };
      this.publish();
      return false;
    }
  }
  async reconcile(read: Read = reconcileByIdentity) {
    const edit = this.edit;
    if (
      !edit ||
      this.outcome.type === "pending" ||
      this.reconciling ||
      !this.boundary.isActive()
    )
      return;
    const generation = this.generation;
    const epoch = this.boundary.current();
    this.reconciling = true;
    this.current = null;
    this.readError = "";
    this.publish();
    try {
      const current = await read(
        { employeeIds: [edit.employee.id], cells: [key(edit.cell)] },
        epoch,
      );
      if (generation !== this.generation) return;
      if (!this.boundary.canWrite(epoch)) throw new Error("Session transition");
      this.current = current;
      this.readEpoch = epoch;
      if (current.missingEmployeeIds.length)
        this.readError =
          "Không tìm thấy ID nhân sự. Bản nháp được giữ; không thể lưu sang người khác.";
    } catch {
      if (generation !== this.generation) return;
      this.current = null;
      this.readError =
        "Chưa thể đối chiếu dữ liệu. Bản nháp được giữ; lỗi đọc không có nghĩa nhân sự bị thiếu.";
    } finally {
      if (generation === this.generation) {
        this.reconciling = false;
        this.publish();
      }
    }
  }
  async recover(choice: "draft" | "current", write: Write = writeAttendance) {
    const edit = this.edit,
      current = this.current;
    if (
      !edit ||
      !current ||
      this.reconciling ||
      this.outcome.type === "pending" ||
      !this.boundary.canWrite(this.readEpoch)
    )
      return false;
    const cell = current.cells.find(
      (c) => cellIdentity(c) === cellIdentity(edit.cell),
    );
    const employee = current.employees.find((e) => e.id === edit.employee.id);
    if (
      !cell ||
      !employee ||
      cell.state !== "editable" ||
      current.missingEmployeeIds.length
    )
      return false;
    const parsed = parseNumberInput(edit.raw, cell.kind);
    if (choice === "draft" && !parsed.valid) {
      this.change({ error: parsed.message });
      return false;
    }
    // Explicit choice sends both fields even when unchanged. A read alone is no fence.
    return this.send(
      cell,
      employee,
      {
        value:
          choice === "current"
            ? cell.value
            : parsed.valid
              ? parsed.value
              : null,
        reminder: choice === "current" ? cell.reminder : edit.reminder,
      },
      this.readEpoch,
      write,
    );
  }
}
