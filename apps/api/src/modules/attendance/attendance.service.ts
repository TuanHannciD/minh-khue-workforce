import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Database } from "../../infrastructure/db/database.js";
import type { ProductTransaction } from "../../infrastructure/db/database.js";
import { SessionAuthorizer } from "../auth/index.js";
import type { MutationCredential } from "../auth/index.js";
import { EmploymentConsistency, calendarMonth } from "../employees/index.js";
import type {
  MonthDto,
  AttendancePageDto,
  ReconcileRequestDto,
  ReconcileSnapshotDto,
  WriteAttendanceDto,
  WriteResultDto,
} from "./attendance.dto.js";
import { parseMonth } from "./attendance-validation.js";
import { AttendanceRepository } from "./attendance.repository.js";
import { attendanceError } from "./attendance-errors.js";
import { normalizeValue, sameValue } from "./attendance-values.js";
import { attendanceTotals } from "./attendance-totals.js";
import { cellId, compareCells } from "./attendance.types.js";
import type {
  CellKey,
  CellSnapshot,
  ParsedAttendancePageQuery,
} from "./attendance.types.js";
import { projectAttendanceCell as project } from "./attendance-projection.js";
import { readAttendancePage } from "./attendance-page-read.js";

const employeeIds = (keys: CellKey[]) =>
  [...new Set(keys.map((k) => k.employeeId))].sort();
@Injectable()
export class AttendanceService {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(SessionAuthorizer) private readonly authorizer: SessionAuthorizer,
    @Inject(EmploymentConsistency)
    private readonly employment: EmploymentConsistency,
    @Inject(AttendanceRepository)
    private readonly repository: AttendanceRepository,
  ) {}
  private snapshot<T>(
    read: (tx: ProductTransaction, fetchedAt: string) => Promise<T>,
  ) {
    return this.db.client.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const [clock] = await tx.$queryRaw<
          { now: Date }[]
        >`SELECT transaction_timestamp() AS now`;
        return read(tx, clock!.now.toISOString());
      },
      { isolationLevel: "RepeatableRead", timeout: 10000 },
    );
  }
  readPage(input: ParsedAttendancePageQuery): Promise<AttendancePageDto> {
    return this.snapshot((tx, fetchedAt) =>
      readAttendancePage(
        tx,
        fetchedAt,
        input,
        this.employment,
        this.repository,
      ),
    );
  }
  async readMonth(month: string): Promise<MonthDto> {
    const calendar = calendarMonth(parseMonth(month));
    return this.snapshot(async (tx, fetchedAt) => {
      const employees = await this.employment.listForMonth(
        tx,
        calendar.start,
        calendar.end,
      );
      const collator = new Intl.Collator("vi");
      employees.sort(
        (a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id),
      );
      const stored = await this.repository.readMonth(
        tx,
        calendar.start,
        calendar.end,
      );
      // Also detect corrupt persisted cells for employees no longer in membership.
      const owners = await this.employment.readByIds(tx, employeeIds(stored));
      const ownersById = new Map(owners.map((e) => [e.id, e]));
      for (const cell of stored) {
        const owner = ownersById.get(cell.employeeId);
        if (!owner)
          attendanceError(
            503,
            "TEMPORARILY_UNAVAILABLE",
            "Chưa thể đọc dữ liệu.",
          );
        project(cell, owner, cell);
      }
      const byKey = new Map(stored.map((c) => [cellId(c), c]));
      const cells: CellSnapshot[] = [];
      for (const employee of [...employees].sort((a, b) =>
        a.id.localeCompare(b.id),
      ))
        for (const { date } of calendar.days)
          for (const kind of ["overtime", "work"] as const) {
            const key = { employeeId: employee.id, date, kind };
            cells.push(project(key, employee, byKey.get(cellId(key))));
          }
      return {
        month,
        fetchedAt,
        employees,
        cells,
        totals: attendanceTotals(
          employees.map((e) => e.id),
          calendar.days.map((d) => d.date),
          cells,
        ),
      };
    });
  }
  async reconcile(input: ReconcileRequestDto): Promise<ReconcileSnapshotDto> {
    return this.snapshot(async (tx, fetchedAt) => {
      const ids = [
        ...new Set([...input.employeeIds, ...employeeIds(input.cells)]),
      ].sort();
      const employees = await this.employment.readByIds(tx, ids);
      const byId = new Map(employees.map((e) => [e.id, e]));
      const keys = input.cells
        .filter((k) => byId.has(k.employeeId))
        .sort(compareCells);
      const stored = new Map(
        (await this.repository.readKeys(tx, keys)).map((c) => [cellId(c), c]),
      );
      return {
        fetchedAt,
        employees,
        cells: keys.map((k) =>
          project(k, byId.get(k.employeeId)!, stored.get(cellId(k))),
        ),
        missingEmployeeIds: ids.filter((id) => !byId.has(id)),
      };
    });
  }
  async write(
    input: WriteAttendanceDto,
    credential: MutationCredential,
  ): Promise<WriteResultDto> {
    const source = "source" in input ? input.source : undefined;
    const keys = [...input.targets, ...(source ? [source] : [])].sort(
      compareCells,
    );
    const operation = input.operation;
    const normalized =
      operation.type === "set-value"
        ? normalizeValue(keys[0]!.kind, operation.value)
        : operation.type === "patch-cell" && operation.patch.value !== undefined
          ? normalizeValue(keys[0]!.kind, operation.patch.value)
          : undefined;
    return this.db.transaction(async (tx) => {
      await this.authorizer.authorizeMutation(tx, credential);
      const employees = await this.employment.lockEmployees(
        tx,
        employeeIds(keys),
      );
      const byId = new Map(employees.map((e) => [e.id, e]));
      if (employees.length !== input.expectedEmployees.length)
        attendanceError(
          422,
          "INVALID_TARGET_SCOPE",
          "Không tìm thấy nhân sự của ô được chọn.",
        );
      const stored = new Map(
        (await this.repository.readKeys(tx, keys)).map((c) => [cellId(c), c]),
      );
      const snapshots = keys.map((k) =>
        project(k, byId.get(k.employeeId)!, stored.get(cellId(k))),
      );
      const byKey = new Map(snapshots.map((c) => [cellId(c), c]));
      const employeeConflicts = input.expectedEmployees.filter(
        (e) => e.expectedRevision !== byId.get(e.employeeId)!.revision,
      );
      const conflicts = keys.filter(
        (k) =>
          (byKey.get(cellId(k))!.state === "editable" || k === source) &&
          k.expectedRevision !== byKey.get(cellId(k))!.revision,
      );
      if (employeeConflicts.length || conflicts.length)
        attendanceError(
          409,
          "ATTENDANCE_CONFLICT",
          "Dữ liệu đã thay đổi. Hãy đối chiếu trước khi lưu lại.",
          {
            cells: keys
              .filter(
                (k) =>
                  conflicts.includes(k) ||
                  employeeConflicts.some((e) => e.employeeId === k.employeeId),
              )
              .map((k) => byKey.get(cellId(k))!),
            employees: employeeConflicts
              .map((e) => byId.get(e.employeeId)!)
              .sort((a, b) => a.id.localeCompare(b.id)),
            sourceChanged:
              !!source &&
              (conflicts.includes(source) ||
                employeeConflicts.some(
                  (e) => e.employeeId === source.employeeId,
                )),
          },
        );
      if (source) {
        const current = byKey.get(cellId(source))!;
        if (
          current.state !== "editable" ||
          current.value === null ||
          normalized === undefined ||
          !sameValue(current.value, normalized)
        )
          attendanceError(
            422,
            "INVALID_TARGET_SCOPE",
            "Nguồn phải còn chỉnh sửa được và khớp giá trị cần điền.",
          );
      }
      const targets = [...input.targets]
        .sort(compareCells)
        .map((k) => byKey.get(cellId(k))!);
      const skipped = targets.filter((c) => c.state !== "editable").length;
      const eligible = targets.filter(
        (c) =>
          c.state === "editable" &&
          !(
            operation.type === "set-value" &&
            operation.mode === "fill-empty" &&
            c.value !== null
          ),
      );
      if (!eligible.length)
        attendanceError(
          422,
          "NO_ELIGIBLE_TARGETS",
          "Không có ô hợp lệ để lưu.",
        );
      let changed = 0;
      for (const current of eligible) {
        const value = normalized === undefined ? current.value : normalized;
        const reminder =
          operation.type === "set-reminder"
            ? operation.reminder
            : operation.type === "patch-cell"
              ? (operation.patch.reminder ?? current.reminder)
              : current.reminder;
        if (!sameValue(value, current.value) || reminder !== current.reminder)
          changed++;
        const next = { ...current, value, reminder, revision: randomUUID() };
        await this.repository.save(tx, next);
        byKey.set(cellId(next), next);
      }
      return {
        state: "saved",
        cells: targets.map((c) => byKey.get(cellId(c))!),
        employees,
        counts: {
          selected: targets.length,
          eligible: eligible.length,
          skipped,
          changed,
        },
        savedAt: new Date().toISOString(),
      };
    });
  }
}
