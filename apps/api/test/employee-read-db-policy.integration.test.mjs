// Fixed oracle validation, observation rejection, then SQL capability/lifecycle.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { employeeReadFixture as legacy } from "./employee-read-fixtures.mjs";
import { employeeReadDbPolicyFixture as fixture } from "./employee-read-db-policy-fixtures.mjs";
import { startAttendanceReadSandbox } from "./attendance-read-sandbox.mjs";
import { root, openAttendanceTarget } from "./attendance-sandbox.mjs";
import { withCleanup } from "../../../scripts/product/cleanup.mjs";

const id = (suffix) =>
  `aabbccdd-1111-4111-8111-${String(suffix).padStart(12, "0")}`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourceHash = async (file) =>
  sha256(await readFile(new URL(file, import.meta.url)));
function capabilityResult(error, phase) {
  const errors = [];
  const collect = (value) => {
    errors.push(value);
    if (value.cause) collect(value.cause);
    for (const nested of value.errors || []) collect(nested);
  };
  collect(error);
  // A cleanup error cannot hide the original mismatch or identity drift.
  if (
    errors.some(
      (value) =>
        value.name === "AssertionError" ||
        /identity mismatch|outside.*allowlist|outside.*authorized|requires task10/i.test(
          value.message,
        ),
    )
  )
    return "FAIL";
  if (
    phase === "acquire" ||
    phase === "cleanup" ||
    errors.some(
      (value) =>
        /^(BLOCKED:)|Owned process absent/.test(value.message) ||
        ["ENOENT", "ESRCH", "EACCES"].includes(value.code),
    )
  )
    return "BLOCKED";
  return "FAIL";
}
const legacyHashes = {
  "./employee-read-fixtures.mjs":
    "0820f23fb1f8b269ec456bb3491c6a173f8e58a6bb502565e4bcab4fc75d6742",
  "./employee-read-parity.integration.test.mjs":
    "a4feb9070be4db8bcf30193db45600f92058ff60dd68285cb05243d55482bb26",
};

function policyMismatches(actual) {
  const mismatches = [];
  const compare = (kind, value, expected, context = {}) => {
    try {
      assert.deepEqual(value, expected);
    } catch {
      mismatches.push({ kind, ...context, expected, actual: value });
    }
  };
  compare("order", actual.orderedIds, fixture.expectedOrderedIds);
  compare("canonical-equivalence", actual.canonicalEqual, true);
  compare("duplicate-equivalence", actual.duplicateEqual, true);
  compare(
    "lower-ids",
    Object.keys(actual.lowerById).sort(),
    Object.keys(fixture.expectedLowerById).sort(),
  );
  for (const [employeeId, expected] of Object.entries(
    fixture.expectedLowerById,
  ))
    compare("lower", actual.lowerById[employeeId], expected, {
      id: employeeId,
    });
  compare("query-count", actual.queries.length, 15);
  for (const [queryIndex, expected] of fixture.queries.entries()) {
    compare(
      "query-lower",
      actual.queries[queryIndex]?.lowered,
      expected.expectedLower,
      { queryIndex },
    );
    compare(
      "literal-search",
      actual.queries[queryIndex]?.ids,
      expected.expectedIds,
      { queryIndex },
    );
  }
  return mismatches;
}
function assertDbPolicyObservations(actual) {
  assert.deepEqual(
    policyMismatches(actual),
    [],
    "fixed DB policy observations must match every expectation",
  );
}
const fixedObservation = () => ({
  orderedIds: structuredClone(fixture.expectedOrderedIds),
  lowerById: structuredClone(fixture.expectedLowerById),
  canonicalEqual: true,
  duplicateEqual: true,
  queries: fixture.queries.map((query) => ({
    lowered: query.expectedLower,
    ids: [...query.expectedIds],
  })),
});

test("db_policy_fixture_missing_capability_is_blocked_but_drift_and_original_mismatch_fail", () => {
  const mismatch = new assert.AssertionError({
    message: "fixed lower mismatch",
  });
  assert.equal(capabilityResult(mismatch, "observations"), "FAIL");
  assert.equal(
    capabilityResult(
      new Error("Sandbox database identity mismatch"),
      "acquire",
    ),
    "FAIL",
  );
  assert.equal(
    capabilityResult(
      Object.assign(new Error("missing binary"), { code: "ENOENT" }),
      "capability",
    ),
    "BLOCKED",
  );
  assert.equal(
    capabilityResult(new Error("Owned process absent"), "capability"),
    "BLOCKED",
  );
  assert.equal(
    capabilityResult(
      new Error("BLOCKED: ICU provider unavailable"),
      "capability",
    ),
    "BLOCKED",
  );
  assert.equal(
    capabilityResult(new Error("pool release failed"), "cleanup"),
    "BLOCKED",
  );
  assert.equal(
    capabilityResult(
      new AggregateError(
        [mismatch, new Error("pool release failed")],
        "Owned cleanup failed",
        { cause: mismatch },
      ),
      "cleanup",
    ),
    "FAIL",
  );
});

test("db_policy_fixture_is_complete_and_fixed", () => {
  assert.equal(fixture.policyId, "pg17.11-icu67.1-vi-db-authority-v1");
  assert.equal(fixture.employees.length, 28);
  assert.equal(
    fixture.queries.length,
    15,
    "all fifteen reviewed raw queries must be fixed",
  );
  assert.deepEqual(fixture.employees, legacy.employees);
  assert.deepEqual(
    fixture.queries.map((q) => q.q),
    legacy.queries.map((q) => q.q),
  );
  const ids = fixture.employees.map((e) => e.id).sort();
  assert.equal(new Set(ids).size, 28);
  assert.deepEqual(Object.keys(fixture.expectedLowerById).sort(), ids);
  assert.deepEqual([...fixture.expectedOrderedIds].sort(), ids);
  assert.deepEqual(
    fixture.expectedOrderedIds,
    [
      118,
      120,
      121,
      108,
      109,
      119,
      101,
      102,
      112,
      113,
      "cafe",
      125,
      111,
      110,
      123,
      122,
      104,
      103,
      114,
      115,
      124,
      106,
      107,
      105,
      116,
      117,
      126,
      127,
    ].map(id),
  );
  for (const q of fixture.queries) {
    assert.equal(typeof q.expectedLower, "string");
    assert(q.expectedIds.every((employeeId) => ids.includes(employeeId)));
    assert.deepEqual(
      q.expectedIds,
      fixture.expectedOrderedIds.filter((employeeId) =>
        q.expectedIds.includes(employeeId),
      ),
    );
  }
  assert.equal(fixture.expectedLowerById[id(101)], "\u00e1nh");
  assert.equal(fixture.expectedLowerById[id(102)], "a\u0301nh");
  assert.equal(fixture.expectedLowerById[id(108)], "an");
  assert.equal(fixture.expectedLowerById[id(109)], "an");
  assertDbPolicyObservations(fixedObservation());
});

test("accepted_policy_differences_preserve_js_oracle", async () => {
  for (const [file, expected] of Object.entries(legacyHashes))
    assert.equal(await sourceHash(file), expected);
  assert.deepEqual(legacy.expectedOrderedIds.slice(-2), [id(127), id(126)]);
  assert.deepEqual(
    fixture.expectedOrderedIds.slice(0, 26),
    legacy.expectedOrderedIds.slice(0, 26),
  );
  assert.deepEqual(fixture.expectedOrderedIds.slice(-2), [id(126), id(127)]);
  for (let index = 0; index < 13; index++)
    assert.deepEqual(
      fixture.queries[index]?.expectedIds,
      legacy.queries[index].expectedIds,
    );
  for (const index of [13, 14])
    assert.deepEqual(legacy.queries[index].expectedIds, [id(127), id(126)]);
  assert.deepEqual(fixture.queries[13]?.expectedIds, [id(126)]);
  assert.deepEqual(fixture.queries[14]?.expectedIds, [id(127)]);
  assert.equal(fixture.expectedLowerById[id(126)], "\u1c89");
  assert.equal(fixture.expectedLowerById[id(127)], "\u1c8a");
  assert.equal(fixture.queries[13]?.expectedLower, "\u1c89");
  assert.equal(fixture.queries[14]?.expectedLower, "\u1c8a");
});

test("db_policy_fixture_rejects_every_lower_query_order_and_tie_mutation", () => {
  assert.equal(Object.keys(fixture.expectedLowerById).length, 28);
  assert.equal(fixture.queries.length, 15);
  const reject = (mutate, label) => {
    const actual = fixedObservation();
    mutate(actual);
    assert.throws(
      () => assertDbPolicyObservations(actual),
      { name: "AssertionError" },
      label,
    );
  };
  for (const employee of fixture.employees)
    reject((actual) => {
      actual.lowerById[employee.id] += "!";
    }, `lower ${employee.id}`);
  for (const index of fixture.queries.keys()) {
    reject((actual) => {
      actual.queries[index].lowered += "!";
    }, `query lower ${index}`);
    reject((actual) => {
      actual.queries[index].ids.push(id(117));
    }, `query IDs ${index}`);
  }
  for (let index = 0; index < 27; index++)
    reject((actual) => {
      [actual.orderedIds[index], actual.orderedIds[index + 1]] = [
        actual.orderedIds[index + 1],
        actual.orderedIds[index],
      ];
    }, `order boundary ${index}`);
  reject((actual) => {
    actual.canonicalEqual = false;
  }, "canonical gate");
  reject((actual) => {
    actual.duplicateEqual = false;
  }, "duplicate gate");
  reject((actual) => {
    delete actual.lowerById[id(101)];
  }, "missing lower");
  reject((actual) => {
    actual.lowerById[id(128)] = "extra";
  }, "extra lower");
  reject((actual) => {
    actual.queries.pop();
  }, "missing query");
});

const normalized = (path) => resolve(path).replaceAll("\\", "/").toLowerCase();
const codePoints = (value) =>
  Array.from(value, (c) => c.codePointAt(0).toString(16));
const writeExclusive = (path, data) =>
  writeFile(path, JSON.stringify(data, null, 2), { flag: "wx" });

async function loadedRuntime(target) {
  if (process.platform !== "win32")
    throw new Error("BLOCKED: existing Windows runtime inspection unavailable");
  const pid = Number(
    (
      await readFile(resolve(target.dataDirectory, "postmaster.pid"), "utf8")
    ).split(/\r?\n/)[0],
  );
  assert(Number.isSafeInteger(pid) && pid > 0, "owned postmaster PID");
  const { stdout } = await promisify(execFile)("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `$ErrorActionPreference='Stop'; $p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; if(!$p){throw 'Owned process absent'}; $m=@((Get-Process -Id ${pid}).Modules | Where-Object ModuleName -Like 'icu*.dll' | ForEach-Object { @{name=$_.ModuleName;version=$_.FileVersionInfo.FileVersion;file=$_.FileName} }); @{pid=$p.ProcessId;executable=$p.ExecutablePath;commandLine=$p.CommandLine;modules=$m}|ConvertTo-Json -Depth 5 -Compress`,
  ]);
  const runtime = JSON.parse(stdout);
  assert.equal(
    normalized(runtime.executable),
    normalized(resolve(target.binaryDirectory, "postgres.exe")),
  );
  assert(
    runtime.commandLine
      .replaceAll("\\", "/")
      .toLowerCase()
      .includes(normalized(target.dataDirectory)),
  );
  assert.match(runtime.commandLine, /-D/);
  assert.deepEqual(runtime.modules.map((m) => m.name).sort(), [
    "icudt67.dll",
    "icuin67.dll",
    "icuuc67.dll",
  ]);
  for (const module of runtime.modules) {
    assert.equal(module.version, "67, 1, 0, 0", "loaded ICU version drift");
    assert.equal(
      normalized(module.file),
      normalized(resolve(target.binaryDirectory, module.name)),
    );
  }
  return runtime;
}

async function observeCandidate(pool, name) {
  // Names are static test-only identifiers, never supplied by a request.
  assert(
    ["mkw_read_vi_equivalent", "mkw_read_vi_deterministic"].includes(name),
  );
  const lowerName = `lower("name" COLLATE "${name}") COLLATE "C"`;
  const lowerQuery = `lower($1::text COLLATE "${name}") COLLATE "C"`;
  const literal = `strpos(${lowerName}, ${lowerQuery}) > 0 OR strpos("id"::text COLLATE "C", $1::text COLLATE "C") > 0`;
  const order = `"name" COLLATE "${name}" ASC, "id" ASC`;
  const locale = `COALESCE(to_jsonb(c)->>'colllocale', to_jsonb(c)->>'colliculocale')`;
  const catalog = (
    await pool.query(
      `SELECT collname, collprovider AS provider, ${locale} AS locale,
    collisdeterministic AS deterministic, collversion, pg_collation_actual_version(oid) AS "actualVersion"
    FROM pg_collation c WHERE collname=$1`,
      [name],
    )
  ).rows[0];
  const orderedIds = (
    await pool.query(`SELECT id FROM "Employee" ORDER BY ${order}`)
  ).rows.map((row) => row.id);
  const lowers = (
    await pool.query(
      `SELECT id, ${lowerName} AS lowered FROM "Employee" ORDER BY id`,
    )
  ).rows;
  const equal = async (a, b) =>
    (
      await pool.query(
        `SELECT ($1::text COLLATE "${name}") = ($2::text COLLATE "${name}") AS equal`,
        [a, b],
      )
    ).rows[0].equal;
  const observations = {
    orderedIds,
    lowerById: Object.fromEntries(lowers.map((row) => [row.id, row.lowered])),
    canonicalEqual: await equal(
      fixture.employees[0].name,
      fixture.employees[1].name,
    ),
    duplicateEqual: await equal("An", "An"),
    queries: [],
  };
  for (const { q } of fixture.queries) {
    const lowered = (
      await pool.query(`SELECT ${lowerQuery} AS lowered`, [q.trim()])
    ).rows[0].lowered;
    const ids = (
      await pool.query(
        `SELECT id FROM "Employee" WHERE ${literal} ORDER BY ${order}`,
        [q.trim()],
      )
    ).rows.map((row) => row.id);
    observations.queries.push({
      lowered,
      ids,
      rawCodePoints: codePoints(q),
      loweredCodePoints: codePoints(lowered),
    });
  }
  return {
    ...catalog,
    expressions: {
      trim: "ECMAScript String.prototype.trim() before binding $1",
      lowerName,
      lowerQuery,
      literal,
      order,
    },
    observations,
    lowerCodePoints: lowers.map((row) => ({
      id: row.id,
      codePoints: codePoints(row.lowered),
    })),
    mismatches: policyMismatches(observations),
  };
}

test("db_capability_and_literal_order_match_fixed_policy", async (t) => {
  const evidence =
    process.env.MKW_DB_POLICY_EVIDENCE ||
    resolve(
      root,
      ".agent-runs/MKW-PRODUCT-001/server-pagination",
      `db-policy-${randomUUID()}`,
    );
  await mkdir(evidence, { recursive: true });
  const reportPath = resolve(evidence, "db-policy-consistency.json");
  const report = {
    policyId: fixture.policyId,
    result: "BLOCKED",
    phase: "provenance",
    node: {
      version: process.version,
      icu: process.versions.icu,
      authority: false,
    },
    expected: fixture,
    candidates: [],
    mismatches: [],
  };
  let sandbox, failure;
  try {
    const files = [
      "./employee-read-db-policy-fixtures.mjs",
      "./employee-read-db-policy.integration.test.mjs",
      ...Object.keys(legacyHashes),
    ];
    report.sources = Object.fromEntries(
      await Promise.all(
        files.map(async (file) => [file, await sourceHash(file)]),
      ),
    );
    for (const [file, expected] of Object.entries(legacyHashes))
      assert.equal(report.sources[file], expected);
    report.provenance = {
      at: new Date().toISOString(),
      authority:
        "User option1+Continue02/11/2026; reviewed fixed Task1 tables at BASE47f26cfb3aea58e24486e48b15aa8ed18a922d2f",
      sources: report.sources,
      expected: fixture,
    };
    await writeExclusive(
      resolve(evidence, "checker-provenance-before-sql.json"),
      report.provenance,
    );
    report.phase = "acquire";
    sandbox = await startAttendanceReadSandbox({ mode: "sql" });
    await withCleanup(
      async () => {
        report.targetFile = sandbox.targetFile;
        report.cleanupEvidence = sandbox.evidence;
        report.identity = (
          await sandbox.pool
            .query(`SELECT current_database() AS database, current_user AS username,
        host(inet_server_addr()) AS host, inet_server_port() AS port,
        current_setting('data_directory') AS directory, current_setting('server_version') AS version`)
        ).rows[0];
        assert.equal(report.identity.version, "17.11");
        assert.equal(report.identity.database, sandbox.target.database);
        assert.match(report.identity.database, /^mkw_acceptance_[a-f0-9_]+$/);
        assert.equal(sandbox.target.owner, "MKW-PRODUCT-001/Task10");
        assert.equal(sandbox.target.alias, "task10-acceptance");
        assert.equal(report.identity.username, "mkw_task10");
        assert.equal(report.identity.host, "127.0.0.1");
        assert.equal(report.identity.port, 63771);
        assert.equal(
          normalized(report.identity.directory),
          normalized(sandbox.target.dataDirectory),
        );
        report.phase = "capability";
        report.loadedRuntime = await loadedRuntime(sandbox.target);
        report.database = (
          await sandbox.pool.query(
            `SELECT pg_encoding_to_char(encoding) AS encoding, datlocprovider AS provider, datcollate, datctype, datlocale, datcollversion FROM pg_database WHERE datname=current_database()`,
          )
        ).rows[0];
        report.postgresBuild = (
          await sandbox.pool.query("SELECT version() AS version")
        ).rows[0].version;
        assert.equal(report.database.encoding, "UTF8");
        report.catalog = (
          await sandbox.pool
            .query(`SELECT collname, collprovider, collisdeterministic, collversion,
        pg_collation_actual_version(oid) AS "actualVersion", COALESCE(to_jsonb(c)->>'colllocale',to_jsonb(c)->>'colliculocale') AS locale
        FROM pg_collation c WHERE collprovider='i' AND collname LIKE 'vi%' ORDER BY collname`)
        ).rows;
        if (!report.catalog.length)
          throw new Error("BLOCKED: Vietnamese ICU provider unavailable");
        for (const employee of fixture.employees)
          await sandbox.pool.query(
            `INSERT INTO "Employee" (id,name,"startDate",revision,"updatedAt") VALUES ($1::uuid,$2,'2024-01-01',$1::uuid,clock_timestamp())`,
            [employee.id, employee.name],
          );
        for (const [name, deterministic] of [
          ["mkw_read_vi_equivalent", false],
          ["mkw_read_vi_deterministic", true],
        ]) {
          await sandbox.pool.query(
            `CREATE COLLATION "${name}" (provider=icu, locale='vi', deterministic=${deterministic})`,
          );
          const candidate = await observeCandidate(sandbox.pool, name);
          report.candidates.push(candidate);
          assert.equal(candidate.provider, "i");
          assert.equal(candidate.locale, "vi");
          assert.equal(candidate.deterministic, deterministic);
          assert.equal(candidate.collversion, "153.14.37");
          assert.equal(candidate.actualVersion, "153.14.37");
        }
        report.phase = "observations";
        const [equivalent, deterministic] = report.candidates;
        report.mismatches = equivalent.mismatches;
        assertDbPolicyObservations(equivalent.observations);
        await t.test(
          "deterministic_candidate_is_rejected_for_canonical_ties",
          () => {
            assert.equal(deterministic.observations.canonicalEqual, false);
            assert.deepEqual(
              deterministic.observations.orderedIds.filter((value) =>
                [id(101), id(102)].includes(value),
              ),
              [id(102), id(101)],
            );
            assert(
              deterministic.mismatches.some(
                (m) => m.kind === "canonical-equivalence",
              ),
            );
            assert(deterministic.mismatches.some((m) => m.kind === "order"));
            assert.throws(
              () => assertDbPolicyObservations(deterministic.observations),
              { name: "AssertionError" },
            );
            report.deterministicRejected = true;
          },
        );
        assert.equal(report.deterministicRejected, true);
        report.counts = (
          await sandbox.pool
            .query(`SELECT (SELECT count(*)::int FROM "User") AS users,
        (SELECT count(*)::int FROM "Session") AS sessions, (SELECT count(*)::int FROM "Employee") AS employees`)
        ).rows[0];
        assert.deepEqual(report.counts, {
          users: 0,
          sessions: 0,
          employees: 28,
        });
        assert.equal(sandbox.database, null);
        assert.equal(sandbox.apps.length, 0);
        assert.equal(sandbox.cookies.length, 0);
        report.phase = "cleanup";
      },
      () => sandbox.stop(),
    );
    assert.equal(sandbox.pool.ended, true, "run SQL pool ended");
    report.release = JSON.parse(
      await readFile(resolve(sandbox.evidence, "http-released.json"), "utf8"),
    );
    assert.deepEqual(report.release, {
      mode: "sql",
      state: "released",
      resources: { "run-pool": "released", "cluster-pool": "released" },
    });
    report.invalidation = JSON.parse(
      await readFile(
        resolve(sandbox.evidence, "fixture-invalidated.json"),
        "utf8",
      ),
    );
    assert.deepEqual(report.invalidation, {
      state: "not-provisioned",
      passwordsRotated: 0,
      provisionedAccounts: 0,
      unrevokedSessions: null,
    });
    const cluster = await openAttendanceTarget(
      process.env.MKW_ATTENDANCE_CLUSTER_OWNER,
    );
    await withCleanup(
      async () => {
        report.remainingRunConnections = (
          await cluster.pool.query(
            `SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1`,
            [sandbox.target.database],
          )
        ).rows[0].count;
        assert.equal(report.remainingRunConnections, 0);
      },
      () => cluster.pool.end(),
    );
    assert.equal(cluster.pool.ended, true, "verification pool ended");
    report.result = "PASS";
    report.phase = "released";
  } catch (error) {
    report.result = capabilityResult(error, report.phase);
    const describe = (value) => ({
      name: value.name,
      message: value.message,
      ...(value.cause ? { cause: describe(value.cause) } : {}),
      ...(value.errors ? { errors: value.errors.map(describe) } : {}),
    });
    report.error = describe(error);
    failure = error;
  }
  await withCleanup(
    async () => {
      if (failure) throw failure;
    },
    () => writeExclusive(reportPath, report),
  );
  console.log(
    JSON.stringify({
      policy: report.result,
      employees: 28,
      queries: 15,
      mismatches: report.mismatches.length,
      deterministicRejected: report.deterministicRejected,
      report: reportPath,
    }),
  );
});
