import { randomUUID } from "node:crypto";
import { HttpException, Inject, Injectable } from "@nestjs/common";
import { Database } from "../../infrastructure/db/database.js";
import { SessionAuthorizer } from "../auth/index.js";
import type { MutationCredential } from "../auth/index.js";
import { EmployeesRepository } from "./employees.repository.js";
import { EmploymentConsistency } from "./employment-consistency.js";
import { calendarMonth, isCalendarDate } from "./employment-date.js";
import type {
  CreateEmployeeDto,
  UpdateEmploymentDto,
} from "./employees.dto.js";
import type { LockedEmployee } from "./employees.types.js";

const fail = (
  status: number,
  code: string,
  message: string,
  details?: unknown,
): never => {
  throw new HttpException(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    status,
  );
};
function validate(employee: {
  name: string;
  startDate: string;
  endDate: string | null;
}) {
  const fields = [];
  if (!employee.name || Array.from(employee.name).length > 200)
    fields.push({
      path: "name",
      code: "INVALID_NAME",
      message: "Nhập tên từ 1 đến 200 ký tự.",
    });
  if (!isCalendarDate(employee.startDate))
    fields.push({
      path: "startDate",
      code: "INVALID_DATE",
      message: "Ngày bắt đầu không hợp lệ.",
    });
  if (
    employee.endDate !== null &&
    (!isCalendarDate(employee.endDate) || employee.endDate < employee.startDate)
  )
    fields.push({
      path: "endDate",
      code: "INVALID_DATE",
      message: "Ngày kết thúc phải hợp lệ và từ ngày bắt đầu trở đi.",
    });
  if (fields.length)
    fail(422, "INVALID_EMPLOYMENT", "Vui lòng kiểm tra tên và mốc làm việc.", {
      fields,
    });
}
@Injectable()
export class EmployeesService {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(SessionAuthorizer) private readonly authorizer: SessionAuthorizer,
    @Inject(EmployeesRepository)
    private readonly repository: EmployeesRepository,
    @Inject(EmploymentConsistency)
    private readonly consistency: EmploymentConsistency,
  ) {}
  async listForMonth(month: string): Promise<LockedEmployee[]> {
    const interval = calendarMonth(month);
    const employees = await this.db.client.$transaction(
      (tx) => this.repository.listForMonth(tx, interval.start, interval.end),
      { isolationLevel: "RepeatableRead" },
    );
    const collator = new Intl.Collator("vi");
    return employees.sort(
      (a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id),
    );
  }
  async create(input: CreateEmployeeDto, credential: MutationCredential) {
    const employee = {
      id: randomUUID(),
      name: input.name.trim(),
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      revision: randomUUID(),
    };
    validate(employee);
    return this.db.transaction(async (tx) => {
      await this.authorizer.authorizeMutation(tx, credential);
      return this.repository.create(tx, employee);
    });
  }
  async updateEmployment(
    id: string,
    input: UpdateEmploymentDto,
    credential: MutationCredential,
  ): Promise<LockedEmployee> {
    if (
      input.name === undefined &&
      input.startDate === undefined &&
      input.endDate === undefined
    )
      fail(400, "EMPTY_PATCH", "Chọn ít nhất một thông tin cần lưu.");
    return this.db.transaction(async (tx) => {
      await this.authorizer.authorizeMutation(tx, credential);
      const [current] = await this.consistency.lockEmployees(tx, [id]);
      if (!current)
        return fail(404, "EMPLOYEE_NOT_FOUND", "Không tìm thấy nhân sự.");
      if (current.revision !== input.expectedRevision)
        fail(
          409,
          "EMPLOYEE_CONFLICT",
          "Thông tin nhân sự đã thay đổi. Hãy kiểm tra trước khi lưu lại.",
          { current },
        );
      const proposed = {
        ...current,
        name: input.name === undefined ? current.name : input.name.trim(),
        startDate: input.startDate ?? current.startDate,
        endDate: input.endDate === undefined ? current.endDate : input.endDate,
      };
      validate(proposed);
      const cells = await this.consistency.findExcludedCells(
        tx,
        id,
        proposed.startDate,
        proposed.endDate,
      );
      if (cells.length)
        fail(
          422,
          "EMPLOYMENT_DATA_OUTSIDE_INTERVAL",
          "Mốc mới nằm ngoài các ô đã có dữ liệu hoặc nhắc kiểm tra. Hãy xử lý các ô này trước.",
          { cells },
        );
      return this.repository.update(tx, {
        ...proposed,
        revision: randomUUID(),
      });
    });
  }
}
