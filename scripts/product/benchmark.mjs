/** Current server-pagination acceptance. Dataset owner: fresh DB -> reviewed
 * policy/runtime -> same-density seed -> SQL/export diagnostics -> four browser
 * configurations -> rotation/revocation/release. No retained timing reuse. */
import assert from "node:assert/strict";
import { cpus, totalmem, release, platform } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";
import { startSandbox } from "../../tests/product-e2e/sandbox.mjs";
import {
  measurePaginatedAttendance,
  validatePaginatedMeasurements,
} from "./benchmark-pagination.mjs";
import { retainedMetrics } from "./benchmark-metrics.mjs";
import { withCleanup } from "./cleanup.mjs";
import { Prisma } from "../../apps/api/dist/infrastructure/db/generated/client.js";
import { buildEmployeeMonthRead } from "../../apps/api/dist/modules/employees/employee-month-read.js";
import { AttendanceRepository } from "../../apps/api/dist/modules/attendance/attendance.repository.js";
import { AttendanceService } from "../../apps/api/dist/modules/attendance/attendance.service.js";
import { Database } from "../../apps/api/dist/infrastructure/db/database.js";

const exec = promisify(execFile),
  hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const root = resolve(
  process.env.MKW_PRODUCT_EVIDENCE_ROOT ??
    ".agent-runs/MKW-PRODUCT-001/task10-acceptance",
);
await mkdir(root, { recursive: true });
const reportFile = resolve(root, `benchmark-run-${randomUUID()}.json`);
const requested = process.argv.find((arg) => arg.startsWith("--sizes="));
const sizes = requested
  ? requested.slice(8).split(",").map(Number)
  : [20, 200, 1000];
const report = {
  mode: "server-pagination",
  machine: {
    platform: platform(),
    os: release(),
    cpu: cpus()[0].model,
    logicalCPUs: cpus().length,
    ramBytes: totalmem(),
    node: process.version,
  },
  profile:
    "production build; fresh headless project-local Chromium; 1280x800; loopback; no throttling; warm DB; no timing reuse",
  sizes: [],
  measurements: [],
  result: "RUNNING",
  reportFile,
};
let browser,
  failed = false;

function observeApiSql(s) {
  const client = s.app.get(Database).client,
    original = client.$transaction;
  s.benchmarkSqlEvents = [];
  client.$transaction = function (operation, options) {
    if (typeof operation !== "function")
      return original.call(this, operation, options);
    const record = { queries: [] },
      start = performance.now();
    return original
      .call(
        this,
        (tx) =>
          operation(
            new Proxy(tx, {
              get(target, key) {
                if (key !== "$queryRaw")
                  return typeof target[key] === "function"
                    ? target[key].bind(target)
                    : target[key];
                return async (...args) => {
                  const text = (args[0]?.strings ?? args[0]).join(" ");
                  const name = text.includes("AS corrupt")
                    ? "invariant"
                    : text.includes('AS "monthEmployeeCount"')
                      ? "count"
                      : text.includes("GROUP BY c.kind")
                        ? "aggregate"
                        : text.includes("LIMIT")
                          ? "offset"
                          : text.includes('FROM "AttendanceCell"')
                            ? "pageCells"
                            : "clock";
                  const at = performance.now();
                  try {
                    return await target.$queryRaw(...args);
                  } finally {
                    record.queries.push({ name, ms: performance.now() - at });
                  }
                };
              },
            }),
          ),
        options,
      )
      .finally(() => {
        record.ms = performance.now() - start;
        s.benchmarkSqlEvents.push(record);
      });
  };
  return () => {
    client.$transaction = original;
  };
}
async function verifyPolicy(s) {
  const reviewedTip = "321d488f041e6d5386adea9f86ca8749ef896144",
    fixture = "apps/api/test/employee-read-db-policy-fixtures.mjs";
  const pin = await readFile(
    ".superpowers/sdd/server-pagination-implementation-plan/task-1-db-policy-pin-report.md",
    "utf8",
  );
  assert(
    pin.includes(reviewedTip) &&
      pin.includes("READY TO PIN") &&
      pin.includes("COMPLETE"),
    "reviewed Task1 DB policy PASS missing",
  );
  const source = await readFile(fixture),
    reviewed = (
      await exec("git", ["show", `${reviewedTip}:${fixture}`], {
        encoding: "buffer",
      })
    ).stdout;
  assert.equal(
    hash(source),
    hash(reviewed),
    "reviewed fixed DB fixture hash drift",
  );
  const identity = (
    await s.pool.query(
      `SELECT current_database() AS database,current_user AS username,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('data_directory') AS directory,current_setting('server_version') AS version`,
    )
  ).rows[0];
  const target = JSON.parse(await readFile(s.targetFile, "utf8")),
    norm = (p) => resolve(p).replaceAll("\\", "/").toLowerCase();
  assert.equal(identity.version, "17.11");
  assert.equal(identity.database, target.database);
  assert.equal(identity.username, "mkw_task10");
  assert.equal(identity.host, "127.0.0.1");
  assert.equal(identity.port, 63771);
  assert.equal(norm(identity.directory), norm(target.dataDirectory));
  const pid = Number(
    (
      await readFile(resolve(target.dataDirectory, "postmaster.pid"), "utf8")
    ).split(/\r?\n/)[0],
  );
  assert(Number.isSafeInteger(pid) && pid > 0);
  const runtime = JSON.parse(
    (
      await exec("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `$ErrorActionPreference='Stop'; $p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; if(!$p){throw 'Owned process absent'}; $m=@((Get-Process -Id ${pid}).Modules | Where-Object ModuleName -Like 'icu*.dll' | ForEach-Object { @{name=$_.ModuleName;version=$_.FileVersionInfo.FileVersion;file=$_.FileName} }); @{pid=$p.ProcessId;executable=$p.ExecutablePath;commandLine=$p.CommandLine;modules=$m}|ConvertTo-Json -Depth 5 -Compress`,
      ])
    ).stdout,
  );
  assert.equal(
    norm(runtime.executable),
    norm(resolve(target.binaryDirectory, "postgres.exe")),
  );
  assert(
    runtime.commandLine
      .replaceAll("\\", "/")
      .toLowerCase()
      .includes(norm(target.dataDirectory)),
  );
  assert.deepEqual(runtime.modules.map((m) => m.name).sort(), [
    "icudt67.dll",
    "icuin67.dll",
    "icuuc67.dll",
  ]);
  for (const m of runtime.modules) {
    assert.equal(m.version, "67, 1, 0, 0");
    assert.equal(norm(m.file), norm(resolve(target.binaryDirectory, m.name)));
  }
  const catalog = (
    await s.pool.query(
      `SELECT collprovider AS provider,collisdeterministic AS deterministic,collversion,pg_collation_actual_version(oid) AS "actualVersion",COALESCE(to_jsonb(c)->>'colllocale',to_jsonb(c)->>'colliculocale') AS locale FROM pg_collation c WHERE collname='mkw_read_vi_equivalent'`,
    )
  ).rows[0];
  assert.deepEqual(catalog, {
    provider: "i",
    deterministic: false,
    collversion: "153.14.37",
    actualVersion: "153.14.37",
    locale: "vi",
  });
  return {
    result: "PASS",
    policyId: "pg17.11-icu67.1-vi-db-authority-v1",
    reviewedTip,
    fixtureHash: hash(source),
    pg: identity.version,
    icu: runtime.modules[0].version,
    actualVersion: catalog.actualVersion,
    identity,
    catalog,
    loadedRuntime: runtime,
  };
}
async function seed(s, size) {
  await s.pool.query(
    `INSERT INTO "Employee" (id,name,"startDate","endDate",revision,"createdAt","updatedAt") SELECT gen_random_uuid(),'Nhân sự benchmark giả '||lpad(i::text,4,'0'),'2024-01-01',NULL,gen_random_uuid(),now(),now() FROM generate_series(1,$1::int) i`,
    [size],
  );
  await s.pool.query(
    `WITH e AS (SELECT id,row_number() OVER(ORDER BY name) n FROM "Employee"), c AS (SELECT id,d,k,(n+extract(day from d)::int)%10 idx FROM e CROSS JOIN generate_series('2026-10-01'::date,'2026-10-31'::date,'1 day') d CROSS JOIN unnest(ARRAY['work','overtime']::"AttendanceKind"[]) k) INSERT INTO "AttendanceCell" ("employeeId",date,kind,"valueType","halfUnits",reminder,revision,"updatedAt") SELECT id,d,k,(CASE WHEN idx<5 THEN 'number' WHEN idx=5 AND k='work' THEN 'absence' ELSE 'empty' END)::"CellValueType",CASE WHEN idx<5 THEN 3 ELSE NULL END,idx%7=0,gen_random_uuid(),now() FROM c`,
  );
  s.benchmarkHit = (
    await s.pool.query(
      'SELECT id FROM "Employee" ORDER BY name COLLATE "mkw_read_vi_equivalent" DESC,id DESC LIMIT 1',
    )
  ).rows[0].id;
  s.benchmarkOffpage = (
    await s.pool.query(
      `SELECT c."employeeId" AS id FROM "AttendanceCell" c JOIN "Employee" e ON e.id=c."employeeId" WHERE c.date='2026-10-01' AND kind='work' AND "valueType"='number' ORDER BY e.name COLLATE "mkw_read_vi_equivalent" DESC,e.id DESC LIMIT 1`,
    )
  ).rows[0].id;
  s.benchmarkTotals = await s.database.client.$transaction(async (tx) => {
    const rows = await new AttendanceRepository().aggregateMonth(
      tx,
      "2026-10-01",
      "2026-10-31",
    );
    return Object.fromEntries(
      ["work", "overtime"].map((kind) => {
        const byDate = rows
          .filter((r) => r.kind === kind)
          .map((r) => ({ date: r.date, value: Number(r.halfUnits) / 2 }));
        return [
          kind,
          { byDate, grandTotal: byDate.reduce((n, r) => n + r.value, 0) },
        ];
      }),
    );
  });
}
async function globalCosts(s, size, pageSize) {
  const costs = {
    count: [],
    aggregate: [],
    invariant: [],
    offset: [],
    explain: [],
    scope:
      "independent actual repository SQL diagnostics; excluded from HTTP payload/render budgets",
  };
  await s.database.client.$transaction(async (tx) => {
    const repo = new AttendanceRepository(),
      sql = buildEmployeeMonthRead({
        start: "2026-10-01",
        end: "2026-10-31",
        q: "",
      });
    const statements = {
      count: Prisma.sql`SELECT count(*) AS "monthEmployeeCount",count(*) FILTER (WHERE ${sql.match}) AS "totalResults" FROM "Employee" WHERE ${sql.membership}`,
      offset: Prisma.sql`SELECT id,name,to_char("startDate",'YYYY-MM-DD') AS "startDate",to_char("endDate",'YYYY-MM-DD') AS "endDate",revision FROM "Employee" WHERE ${sql.membership} AND ${sql.match} ORDER BY ${sql.order} LIMIT ${pageSize} OFFSET ${Math.max(0, (Math.ceil(size / pageSize) - 1) * pageSize)}`,
    };
    const observedTx = new Proxy(tx, {
      get(target, key) {
        if (key !== "$queryRaw")
          return typeof target[key] === "function"
            ? target[key].bind(target)
            : target[key];
        return (...args) => {
          const statement = args[0]?.strings
            ? args[0]
            : Prisma.sql(args[0], ...args.slice(1));
          const text = statement.strings.join(" ");
          statements[
            text.includes("GROUP BY c.kind") ? "aggregate" : "invariant"
          ] = statement;
          return target.$queryRaw(...args);
        };
      },
    });
    for (let i = 0; i < 5; i++)
      for (const name of ["count", "aggregate", "invariant", "offset"]) {
        const start = performance.now();
        if (name === "aggregate")
          await repo.aggregateMonth(observedTx, "2026-10-01", "2026-10-31");
        else if (name === "invariant")
          await repo.assertMonthInvariant(
            observedTx,
            "2026-10-01",
            "2026-10-31",
          );
        else await tx.$queryRaw(statements[name]);
        costs[name].push(performance.now() - start);
      }
    for (const [name, statement] of Object.entries(statements))
      costs.explain.push({
        name,
        plan: await tx.$queryRaw(
          Prisma.sql`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${statement}`,
        ),
      });
  });
  return costs;
}
async function fullmonthCosts(s, browser, size) {
  const context = await browser.newContext();
  return withCleanup(
    async () => {
      const login = await context.request.post(
        `${s.webOrigin}/api/v1/auth/login`,
        { headers: { origin: s.webOrigin }, data: s.accounts[1] },
      );
      assert.equal(login.status(), 200);
      const result = {
        scope: "explicit fullmonth/export oracle; excluded from page budgets",
        snapshotMs: [],
        serializationMs: [],
        fullGetMs: [],
        fullGetBytes: [],
        exportDownloadMs: [],
        exportBytes: [],
        peakHeapBytes: [],
        logicalEmployees: size,
      };
      // Actual production fullmonth producer uses these public dependencies.
      const { EmploymentConsistency } =
        await import("../../apps/api/dist/modules/employees/employment-consistency.js");
      const { EmployeesRepository } =
        await import("../../apps/api/dist/modules/employees/employees.repository.js");
      const fullService = new AttendanceService(
        s.database,
        null,
        new EmploymentConsistency(new EmployeesRepository()),
        new AttendanceRepository(),
      );
      for (let i = 0; i < 5; i++) {
        let peak = process.memoryUsage().heapUsed;
        const sampler = setInterval(() => {
          peak = Math.max(peak, process.memoryUsage().heapUsed);
        }, 5);
        try {
          let start = performance.now();
          const snapshot = await fullService.readMonth("2026-10");
          result.snapshotMs.push(performance.now() - start);
          start = performance.now();
          JSON.stringify(snapshot);
          result.serializationMs.push(performance.now() - start);
          start = performance.now();
          const r = await context.request.get(
            `${s.webOrigin}/api/v1/attendance/month?month=2026-10`,
          );
          assert.equal(r.status(), 200);
          const text = await r.text();
          result.fullGetMs.push(performance.now() - start);
          result.fullGetBytes.push(Buffer.byteLength(text));
          const data = JSON.parse(text);
          assert.equal(data.employees.length, size);
          assert.equal(data.cells.length, size * 62);
          start = performance.now();
          const exportResponse = await context.request.get(
            `${s.webOrigin}/api/v1/attendance/export?month=2026-10`,
          );
          assert.equal(exportResponse.status(), 200);
          result.exportBytes.push((await exportResponse.body()).length);
          result.exportDownloadMs.push(performance.now() - start);
        } finally {
          clearInterval(sampler);
          result.peakHeapBytes.push(
            Math.max(peak, process.memoryUsage().heapUsed),
          );
        }
      }
      return result;
    },
    () => context.close(),
  );
}
try {
  assert(
    sizes.length &&
      new Set(sizes).size === sizes.length &&
      sizes.every((n) => [20, 200, 1000].includes(n)),
    "Only unique approved sizes20/200/1000 supported",
  );
  if (process.argv.includes("--profile")) {
    const prior = JSON.parse(
      await readFile(
        process.env.MKW_BENCHMARK_PRIOR ??
          resolve(root, "benchmark-measured.json"),
        "utf8",
      ),
    );
    prior.sizes.forEach(retainedMetrics);
    throw new Error(
      "Legacy/profile reuse prohibited for fresh server-pagination acceptance",
    );
  }
  browser = await chromium.launch({ headless: true });
  report.browser = browser.version();
  for (const size of sizes) {
    const s = await startSandbox({ acceptance: true });
    const dataset = {
      size,
      days: 31,
      kinds: 2,
      cells: size * 62,
      runDir: s.runDir,
      density:
        "same modulo10 number0..4/work absence5/otherwise empty; reminder modulo7",
      result: "RUNNING",
    };
    report.sizes.push(dataset);
    try {
      await withCleanup(
        async () => {
          s.benchmarkPolicy = await verifyPolicy(s);
          dataset.policy = s.benchmarkPolicy;
          await seed(s, size);
          s.benchmarkGlobalCosts = {
            25: await globalCosts(s, size, 25),
            50: await globalCosts(s, size, 50),
          };
          dataset.globalCosts = s.benchmarkGlobalCosts;
          dataset.fullmonth = await fullmonthCosts(s, browser, size);
          const restore = observeApiSql(s);
          const rows = await withCleanup(
            () => measurePaginatedAttendance(s, browser, size),
            restore,
          );
          report.measurements.push(...rows);
          dataset.result = rows.some((r) => r.result !== "PASS")
            ? "FAILED"
            : "PASS";
        },
        () => s.stop(),
      );
    } catch (error) {
      dataset.result = "FAILED";
      dataset.error = (error.cause ?? error).message;
      if (error instanceof AggregateError)
        dataset.cleanupError = error.errors
          .filter((e) => e !== error.cause)
          .map((e) => e.message)
          .join("; ");
      failed = true;
    }
    await writeFile(reportFile, JSON.stringify(report, null, 2));
  }
} catch (error) {
  failed = true;
  report.error = error.message;
} finally {
  try {
    await browser?.close();
  } catch (error) {
    failed = true;
    report.cleanupError = error.message;
  }
  report.acceptance = validatePaginatedMeasurements(report.measurements);
  if (report.acceptance.result !== "PASS") failed = true;
  report.result = failed ? "FAILED" : "PASS";
  await writeFile(reportFile, JSON.stringify(report, null, 2));
}
console.log(`Benchmark evidence ${reportFile}`);
console.log(JSON.stringify(report.acceptance));
process.exitCode = failed ? 1 : 0;
