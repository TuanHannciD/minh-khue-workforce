import { Inject, Injectable } from "@nestjs/common";
import type { ProductTransaction } from "../../infrastructure/db/database.js";
import { EmployeesRepository } from "./employees.repository.js";

// Public transaction seam for attendance. Never import the repository cross-module.
@Injectable()
export class EmploymentConsistency {
  constructor(
    @Inject(EmployeesRepository)
    private readonly repository: EmployeesRepository,
  ) {}
  lockEmployees(tx: ProductTransaction, ids: string[]) {
    return this.repository.lockEmployees(tx, ids);
  }
  readByIds(tx: ProductTransaction, ids: string[]) {
    return this.repository.readByIds(tx, ids);
  }
  listForMonth(tx: ProductTransaction, start: string, end: string) {
    return this.repository.listForMonth(tx, start, end);
  }
  findExcludedCells(
    tx: ProductTransaction,
    employeeId: string,
    proposedStart: string,
    proposedEnd: string | null,
  ) {
    return this.repository.findExcludedCells(
      tx,
      employeeId,
      proposedStart,
      proposedEnd,
    );
  }
}
