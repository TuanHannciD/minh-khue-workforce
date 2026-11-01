import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { employeeReadFixture as fixture } from "./employee-read-fixtures.mjs";
import { startAttendanceReadSandbox } from "./attendance-read-sandbox.mjs";
import { root } from "./attendance-sandbox.mjs";
import { withCleanup } from "../../../scripts/product/cleanup.mjs";

const collator = new Intl.Collator("vi");
const ordered = [...fixture.employees].sort(
  (a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id),
);
test("literal_unicode_search_has_pinned_expected_ids", () => {
  for (const { q, expectedIds } of fixture.queries) {
    const trimmed = q.trim();
    assert.deepEqual(
      ordered
        .filter(
          (e) =>
            e.name
              .toLocaleLowerCase("vi")
              .includes(trimmed.toLocaleLowerCase("vi")) ||
            e.id.includes(trimmed),
        )
        .map((e) => e.id),
      expectedIds,
      JSON.stringify(q),
    );
  }
  assert.deepEqual(
    ordered.map((e) => e.id),
    fixture.expectedOrderedIds,
  );
});
test("canonical_equivalent_order_uses_id_tie", () => {
  const [a, b] = fixture.employees;
  assert.equal(collator.compare(a.name, b.name), 0);
  assert(a.name > b.name, "IDs deliberately reverse binary text order");
  assert.deepEqual(
    ordered.filter((e) => [a.id, b.id].includes(e.id)).map((e) => e.id),
    [
      "aabbccdd-1111-4111-8111-000000000101",
      "aabbccdd-1111-4111-8111-000000000102",
    ],
  );
});
test("sql_capability_and_literal_order_match_fixed_oracle", async () => {
  const evidence = resolve(
    root,
    ".agent-runs/MKW-PRODUCT-001/server-pagination",
    `parity-${randomUUID()}`,
  );
  const report = {
    result: "BLOCKED",
    node: {
      version: process.version,
      icu: process.versions.icu,
      unicode: process.versions.unicode,
      cldr: process.versions.cldr,
      resolvedOptions: collator.resolvedOptions(),
    },
    fixture: {
      path: "apps/api/test/employee-read-fixtures.mjs",
      sha256: createHash("sha256")
        .update(
          await readFile(
            new URL("./employee-read-fixtures.mjs", import.meta.url),
          ),
        )
        .digest("hex"),
      employees: fixture.employees.length,
      queries: fixture.queries.length,
      expectedOrderedIds: fixture.expectedOrderedIds,
    },
    candidates: [],
    mismatches: [],
  };
  await mkdir(evidence, { recursive: true });
  const reportPath = resolve(evidence, "collation-parity.json");
  let sandbox, failure;
  try {
    assert.deepEqual(
      ordered.map((e) => e.id),
      fixture.expectedOrderedIds,
    );
    for (const { q, expectedIds } of fixture.queries) {
      const trimmed = q.trim();
      assert.deepEqual(
        ordered
          .filter(
            (e) =>
              e.name
                .toLocaleLowerCase("vi")
                .includes(trimmed.toLocaleLowerCase("vi")) ||
              e.id.includes(trimmed),
          )
          .map((e) => e.id),
        expectedIds,
      );
    }
    report.jsOracle = "PASS";
    sandbox = await startAttendanceReadSandbox({ mode: "sql" });
    await withCleanup(
      async () => {
        report.targetFile = sandbox.targetFile;
        report.cleanupEvidence = sandbox.evidence;
        const pool = sandbox.pool;
        report.identity = (
          await pool.query(`SELECT current_database() AS database, current_user AS username,
        host(inet_server_addr()) AS host, inet_server_port() AS port,
        current_setting('data_directory') AS directory, current_setting('server_version') AS version`)
        ).rows[0];
        report.database = (
          await pool.query(`SELECT pg_encoding_to_char(encoding) AS encoding, datlocprovider AS provider,
        datcollate, datctype, datlocale, datcollversion FROM pg_database WHERE datname=current_database()`)
        ).rows[0];
        report.postgresBuild = (
          await pool.query("SELECT version() AS version")
        ).rows[0].version;
        const localeExpression = `COALESCE(to_jsonb(c)->>'colllocale', to_jsonb(c)->>'colliculocale')`;
        report.catalog = (
          await pool.query(`SELECT collname, collprovider AS provider, ${localeExpression} AS locale,
        collisdeterministic AS deterministic, collversion, pg_collation_actual_version(oid) AS "actualVersion"
        FROM pg_collation c WHERE collprovider='i' AND (${localeExpression} LIKE 'vi%' OR collname LIKE 'vi%') ORDER BY collname`)
        ).rows;
        if (!report.catalog.length)
          throw new Error("BLOCKED: Vietnamese ICU provider unavailable");
        for (const employee of fixture.employees)
          await pool.query(
            `INSERT INTO "Employee" (id,name,"startDate",revision,"updatedAt") VALUES ($1::uuid,$2,'2024-01-01',$1::uuid,clock_timestamp())`,
            [employee.id, employee.name],
          );
        // Static, test-only candidates. Deterministic ICU's binary tie is diagnostic;
        // the equivalence candidate must preserve the approved Intl canonical tie.
        // Literal matching explicitly uses C after locale lower, never normalization.
        for (const [name, deterministic] of [
          ["mkw_read_vi_deterministic", true],
          ["mkw_read_vi_equivalent", false],
        ]) {
          await pool.query(
            `CREATE COLLATION "${name}" (provider=icu, locale='vi', deterministic=${deterministic})`,
          );
          const candidate = (
            await pool.query(
              `SELECT collname, collprovider AS provider, ${localeExpression} AS locale,
          collisdeterministic AS deterministic, collversion, pg_collation_actual_version(oid) AS "actualVersion"
          FROM pg_collation c WHERE collname=$1`,
              [name],
            )
          ).rows[0];
          const lowerName = `lower("name" COLLATE "${name}") COLLATE "C"`;
          const lowerQuery = `lower($1::text COLLATE "${name}") COLLATE "C"`;
          const predicate = `strpos(${lowerName}, ${lowerQuery}) > 0 OR strpos("id"::text COLLATE "C", $1::text COLLATE "C") > 0`;
          const order = `"name" COLLATE "${name}" ASC, "id" ASC`;
          candidate.expressions = {
            trim: "ECMAScript String.prototype.trim() before binding $1",
            lowerName,
            lowerQuery,
            literal: predicate,
            order,
          };
          candidate.mismatches = [];
          const compare = (kind, actual, expected, context = {}) => {
            if (JSON.stringify(actual) !== JSON.stringify(expected))
              candidate.mismatches.push({ kind, ...context, expected, actual });
          };
          const sqlOrder = (
            await pool.query(`SELECT id FROM "Employee" ORDER BY ${order}`)
          ).rows.map((e) => e.id);
          compare("order", sqlOrder, fixture.expectedOrderedIds);
          const equality = (
            await pool.query(
              `SELECT ($1::text COLLATE "${name}") = ($2::text COLLATE "${name}") AS equal`,
              [fixture.employees[0].name, fixture.employees[1].name],
            )
          ).rows[0].equal;
          compare("canonical-equivalence", equality, true, {
            codePoints: fixture.employees
              .slice(0, 2)
              .map((e) =>
                Array.from(e.name, (c) => c.codePointAt(0).toString(16)),
              ),
          });
          const lowered = (
            await pool.query(
              `SELECT id, ${lowerName} AS lowered FROM "Employee" ORDER BY id`,
            )
          ).rows;
          for (const row of lowered)
            compare(
              "lower",
              row.lowered,
              fixture.employees
                .find((e) => e.id === row.id)
                .name.toLocaleLowerCase("vi"),
              { id: row.id },
            );
          for (const [
            queryIndex,
            { q, expectedIds },
          ] of fixture.queries.entries()) {
            const rows = (
              await pool.query(
                `SELECT id FROM "Employee" WHERE ${predicate} ORDER BY ${order}`,
                [q.trim()],
              )
            ).rows;
            compare(
              "literal-search",
              rows.map((e) => e.id),
              expectedIds,
              {
                queryIndex,
                codePoints: Array.from(q, (c) => c.codePointAt(0).toString(16)),
              },
            );
          }
          candidate.result = candidate.mismatches.length ? "FAIL" : "PASS";
          report.candidates.push(candidate);
        }
        const equivalent = report.candidates.find(
          (c) => c.collname === "mkw_read_vi_equivalent",
        );
        report.policy = {
          candidate: equivalent.collname,
          canonicalTie:
            "Intl-equivalent names compare equal; UUID ASC resolves ties",
          literal:
            "locale lower then binary literal substring, with original-case ID text",
        };
        report.postgresIcuCollationVersion = equivalent.actualVersion;
        report.mismatches = equivalent.mismatches;
        report.result = equivalent.result;
        assert.equal(
          report.result,
          "PASS",
          `Parity FAIL: ${report.mismatches.length} fixed-oracle mismatches; ${reportPath}`,
        );
      },
      () => sandbox.stop(),
    );
  } catch (error) {
    report.error = { name: error.name, message: error.message };
    if (report.result === "PASS") report.result = "BLOCKED"; // cleanup failure cannot pass the prerequisite
    failure = error;
  }
  await withCleanup(
    async () => {
      if (failure) throw failure;
    },
    () => writeFile(reportPath, JSON.stringify(report, null, 2)),
  );
  console.log(
    JSON.stringify({
      parity: report.result,
      candidates: report.candidates.map((c) => ({
        name: c.collname,
        result: c.result,
        mismatches: c.mismatches.length,
      })),
      employees: fixture.employees.length,
      queries: fixture.queries.length,
      report: reportPath,
    }),
  );
});
