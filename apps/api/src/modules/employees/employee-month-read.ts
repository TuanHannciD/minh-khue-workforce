import { Prisma } from "../../infrastructure/db/generated/client.js";
import type { MonthEmployeeQuery } from "./employees.types.js";

// pg17.11-icu67.1-vi-db-authority-v1. Static identifiers only; request text
// remains bound data. C compares literal substrings after DB-owned lowering.
// Page and full-month readers share membership/order; consumers preserve it.
export function buildEmployeeMonthRead(
  query: Pick<MonthEmployeeQuery, "start" | "end" | "q">,
): { membership: Prisma.Sql; match: Prisma.Sql; order: Prisma.Sql } {
  return {
    membership: Prisma.sql`"startDate" <= ${query.end}::date AND ("endDate" IS NULL OR "endDate" >= ${query.start}::date)`,
    match: Prisma.sql`(strpos(lower("name" COLLATE "mkw_read_vi_equivalent") COLLATE "C", lower(${query.q}::text COLLATE "mkw_read_vi_equivalent") COLLATE "C") > 0 OR strpos("id"::text COLLATE "C", ${query.q}::text COLLATE "C") > 0)`,
    order: Prisma.sql`"name" COLLATE "mkw_read_vi_equivalent" ASC, "id" ASC`,
  };
}
