import { Injectable } from "@nestjs/common";
import type { ProductTransaction } from "../../infrastructure/db/database.js";
import type { CellKey, CellSnapshot, StoredCell } from "./attendance.types.js";

@Injectable()
export class AttendanceRepository {
  readKeys(tx: ProductTransaction, keys: CellKey[]): Promise<StoredCell[]> {
    if (!keys.length) return Promise.resolve([]);
    const json = JSON.stringify(
      keys.map(({ employeeId, date, kind }) => ({ employeeId, date, kind })),
    );
    return tx.$queryRaw<
      StoredCell[]
    >`SELECT c."employeeId", to_char(c.date, 'YYYY-MM-DD') AS date, c.kind, c."valueType", c."halfUnits", c.reminder, c.revision FROM "AttendanceCell" c JOIN jsonb_to_recordset(${json}::jsonb) AS k("employeeId" uuid, date date, kind text) ON c."employeeId" = k."employeeId" AND c.date = k.date AND c.kind::text = k.kind ORDER BY c."employeeId", c.date, c.kind::text`;
  }
  readMonth(tx: ProductTransaction, start: string, end: string) {
    return tx.$queryRaw<
      StoredCell[]
    >`SELECT "employeeId", to_char(date, 'YYYY-MM-DD') AS date, kind, "valueType", "halfUnits", reminder, revision FROM "AttendanceCell" WHERE date BETWEEN ${start}::date AND ${end}::date ORDER BY "employeeId", date, kind::text`;
  }
  async save(tx: ProductTransaction, cell: CellSnapshot) {
    const valueType = cell.value?.type ?? "empty";
    const halfUnits =
      cell.value?.type === "number" ? cell.value.value * 2 : null;
    await tx.$executeRaw`INSERT INTO "AttendanceCell" ("employeeId", date, kind, "valueType", "halfUnits", reminder, revision) VALUES (${cell.employeeId}::uuid, ${cell.date}::date, ${cell.kind}::"AttendanceKind", ${valueType}::"CellValueType", ${halfUnits}::smallint, ${cell.reminder}, ${cell.revision}::uuid) ON CONFLICT ("employeeId", date, kind) DO UPDATE SET "valueType" = EXCLUDED."valueType", "halfUnits" = EXCLUDED."halfUnits", reminder = EXCLUDED.reminder, revision = EXCLUDED.revision, "updatedAt" = clock_timestamp()`;
  }
}
