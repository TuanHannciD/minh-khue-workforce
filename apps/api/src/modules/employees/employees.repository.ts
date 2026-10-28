import { Injectable } from "@nestjs/common";
import type { ProductTransaction } from "../../infrastructure/db/database.js";
import type { LockedEmployee, EmploymentCellKey } from "./employees.types.js";

@Injectable()
export class EmployeesRepository {
  readByIds(tx: ProductTransaction, ids: string[]) {
    if (ids.length === 0) return Promise.resolve([] as LockedEmployee[]);
    return tx.$queryRaw<
      LockedEmployee[]
    >`SELECT id, name, to_char("startDate", 'YYYY-MM-DD') AS "startDate", to_char("endDate", 'YYYY-MM-DD') AS "endDate", revision FROM "Employee" WHERE id = ANY(${ids}::uuid[]) ORDER BY id`;
  }
  async lockEmployees(tx: ProductTransaction, ids: string[]) {
    for (const id of [...new Set(ids)].sort())
      await tx.$queryRaw`SELECT id FROM "Employee" WHERE id = ${id}::uuid FOR UPDATE`;
    return this.readByIds(tx, ids);
  }
  listForMonth(tx: ProductTransaction, start: string, end: string) {
    return tx.$queryRaw<
      LockedEmployee[]
    >`SELECT id, name, to_char("startDate", 'YYYY-MM-DD') AS "startDate", to_char("endDate", 'YYYY-MM-DD') AS "endDate", revision FROM "Employee" WHERE "startDate" <= ${end}::date AND ("endDate" IS NULL OR "endDate" >= ${start}::date)`;
  }
  findExcludedCells(
    tx: ProductTransaction,
    employeeId: string,
    start: string,
    end: string | null,
  ) {
    return tx.$queryRaw<
      EmploymentCellKey[]
    >`SELECT "employeeId", to_char(date, 'YYYY-MM-DD') AS date, kind FROM "AttendanceCell" WHERE "employeeId" = ${employeeId}::uuid AND ("valueType" != 'empty' OR reminder = true) AND (date < ${start}::date OR (${end}::date IS NOT NULL AND date > ${end}::date)) ORDER BY date, kind`;
  }
  async create(tx: ProductTransaction, employee: LockedEmployee) {
    await tx.$executeRaw`INSERT INTO "Employee" (id, name, "startDate", "endDate", revision) VALUES (${employee.id}::uuid, ${employee.name}, ${employee.startDate}::date, ${employee.endDate}::date, ${employee.revision}::uuid)`;
    return employee;
  }
  async update(tx: ProductTransaction, employee: LockedEmployee) {
    await tx.$executeRaw`UPDATE "Employee" SET name = ${employee.name}, "startDate" = ${employee.startDate}::date, "endDate" = ${employee.endDate}::date, revision = ${employee.revision}::uuid, "updatedAt" = clock_timestamp() WHERE id = ${employee.id}::uuid`;
    return employee;
  }
}
