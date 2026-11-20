// Cross-boundary regressions; the existing snapshot/evidence/parity suites own
// their detailed matrices. Only external process/daemon boundaries are injected.
// File map: collect scans actual public/upload bytes; admission loops exercise
// worker and early engine gates; actual-child loop joins executor/worker/outer;
// public faults and cleanup loops cover retention; final tests cover UUID claims,
// malicious collector input and interruption. Kept together for this integration
// lifecycle and shared public-artifact assertions, not a second unit matrix.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fixture, canary } from "./fixtures/parity-boundary.mjs";
import { runParity, parityMain } from "../../scripts/ci/parity.mjs";
import { runChecks } from "../../scripts/ci/run-checks.mjs";
import {
  assertEnvironment,
  readEnvironmentLock,
} from "../../scripts/ci/environment.mjs";
import {
  projectPublicReport,
  validatePublicReport,
} from "../../scripts/ci/evidence.mjs";
import { executeRehearsalProcess } from "../../scripts/product/local-rehearsal-engine.mjs";
import { findDockerClient } from "../../scripts/ci/worker.mjs";

const root = resolve(import.meta.dirname, "../..");
const bare = (args) =>
  ["--context", "--host"].includes(args[0]) ? args.slice(2) : args;
const reportPath = (f) =>
  join(f.evidenceRoot, f.runId, "public/check-report.json");

// Scan actual emitted stdout and the exact collector upload file list, rather
// than just calling the projector with an artificial object.
async function collect(f, want) {
  const privateRoot = join(f.evidenceRoot, f.runId, "private-canaries");
  await mkdir(privateRoot);
  for (const name of [
    "source.tar",
    "build.log",
    "inspect.json",
    "database.sql",
    "tls.key",
    ".env",
  ])
    await writeFile(join(privateRoot, name), canary);
  const upload = join(f.evidenceRoot, `upload-${randomUUID()}`);
  const r = spawnSync(
    process.execPath,
    ["scripts/ci/collect-evidence.mjs", f.runId, f.evidenceRoot, upload],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(r.error, undefined);
  assert.equal(r.status, want === "Passed" ? 0 : 1, r.stderr);
  assert.deepEqual(await readdir(upload), ["check-report.json"]);
  const bytes = await readFile(join(upload, "check-report.json"), "utf8");
  const report = validatePublicReport(JSON.parse(bytes));
  assert.equal(report.result, want);
  assert.equal(report.runId, f.runId);
  assert.equal(
    (bytes + r.stdout + r.stderr + f.output.join("\n")).includes(canary),
    false,
  );
  return report;
}

// Break caught: trusting a superficially Passed report that explicitly says
// its inner evidence is unavailable/incomplete at the final upload boundary.
for (const field of ["innerReportUnavailable", "secondaryErrors"])
  test(`collector refuses incomplete Passed ${field} instead of publishing success`, async (t) => {
    const f = await fixture(t);
    assert.equal(await runParity({ ...f, mode: "quality" }, f.adapters), 0);
    const r = await f.report();
    r[field] =
      field === "innerReportUnavailable" ? true : ["REPORT_INCOMPLETE"];
    await writeFile(reportPath(f), JSON.stringify(r));
    const uploaded = await collect(f, "Failed");
    assert.equal(uploaded.primary.code, "REPORT_INCOMPLETE");
    assert.equal(uploaded.innerReportUnavailable, true);
  });

// Break caught: admission exceptions leaking raw details or allowing any
// catalog command after an environment mismatch.
for (const [fault, code] of [
  ["platform", "ENVIRONMENT_PLATFORM"],
  ["runtime", "ENVIRONMENT_VERSION"],
  ["compose", "ENVIRONMENT_VERSION"],
])
  test(`worker ${fault} admission prevents every later command and collects safely`, async (t) => {
    const f = await fixture(t);
    const lock = await readEnvironmentLock(
      join(f.repoRoot, "scripts/ci/environment-lock.json"),
    );
    let executions = 0;
    const exit = await runChecks(
      {
        profile: "quality",
        workspace: f.repoRoot,
        reportRoot: f.evidenceRoot,
        runId: f.runId,
      },
      {
        admit: async () => {
          const actual = {
            platform: "linux/amd64",
            uid: 1000,
            executables: {
              node: "v24.22.1",
              pnpm: "12.15.0",
              compose: "v5.7.1",
            },
          };
          if (fault === "platform") actual.platform = "win32/arm64";
          if (fault === "runtime") actual.executables.node = "v24.12.0";
          if (fault === "compose") delete actual.executables.compose;
          assertEnvironment(actual, lock, {
            executableKeys: ["node", "pnpm", "compose"],
            imageKeys: [],
            packageKeys: [],
          });
          throw Error("fault was not rejected");
        },
        execute: async () => {
          executions++;
          throw Error(canary);
        },
        output: (line) => f.output.push(line),
      },
    );
    assert.equal(exit, 1);
    assert.equal(executions, 0);
    const r = await collect(f, "Failed");
    assert.deepEqual(r.primary, {
      phase: "prerequisite",
      stepId: "prerequisite",
      scenarioId: null,
      code,
      exitCode: 1,
      signal: null,
    });
    assert.deepEqual(r.counts, { commands: 0, assertions: 0 });
  });

for (const [fault, code] of [
  ["disk", "REHEARSAL_STORAGE"],
  ["docker", "PROCESS_SPAWN"],
])
  test(`actual engine ${fault} prerequisite is nonzero before acquisition`, async (t) => {
    const f = await fixture(t);
    await mkdir(f.evidenceRoot);
    const evidencePath = join(f.evidenceRoot, f.runId);
    const r = spawnSync(
      process.execPath,
      [
        "tests/product-tooling/fixtures/parity-prerequisite.mjs",
        fault,
        evidencePath,
        f.runId,
      ],
      { cwd: root, encoding: "utf8", timeout: 4000 },
    );
    assert.equal(
      r.error,
      undefined,
      JSON.stringify({
        code: r.error?.code,
        errno: r.error?.errno,
        status: r.status,
        signal: r.signal,
      }),
    );
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const report = await f.report();
    assert.equal(report.primary.code, code);
    assert.equal(report.primary.phase, "prerequisite");
    assert.equal(report.primary.stepId, "prerequisite");
    assert.notEqual(report.result, "Passed");
    const result = JSON.parse(
      await readFile(join(evidencePath, "result.json")),
    );
    assert.equal(result.engine, null);
    assert.equal(result.cleanup, "no engine acquired");
    const commands =
      fault === "disk"
        ? []
        : JSON.parse(await readFile(join(evidencePath, "outer-commands.json")));
    assert.equal(commands.length, fault === "disk" ? 0 : 1);
    if (fault === "docker")
      assert.deepEqual(commands[0].command, [
        "docker",
        "info",
        "--format",
        "{{json .OSType}}",
      ]);
    f.output.push(r.stdout, r.stderr);
    await collect(f, "Blocked");
  });

test("missing Docker client fails before context, build, or container mutation", async (t) => {
  const f = await fixture(t);
  f.adapters.findDocker = () => findDockerClient({ path: "" });
  assert.equal(await runParity({ ...f, mode: "all" }, f.adapters), 1);
  assert.deepEqual(f.calls, []);
  const r = await collect(f, "Failed");
  assert.equal(r.primary.code, "ENVIRONMENT_EXECUTABLE");
  assert.equal(r.primary.phase, "prerequisite");
  assert.equal(r.primary.stepId, "prerequisite");
});

// Break caught: actual child exit/timeout/AbortSignal losing its code/step when
// translated through runChecks -> worker export -> parity -> upload collector.
for (const behavior of ["exit", "timeout", "signal"])
  test(`actual ${behavior} child retains primary across worker, aggregate and collector`, async (t) => {
    const f = await fixture(t),
      execute = f.adapters.execute;
    let childReport,
      observed,
      commands = 0;
    f.adapters.execute = async (bin, args, options) => {
      const a = bare(args);
      if (a.includes("--profile")) {
        await execute(bin, args, options); // keep fixture container/report identity
        const manifest = JSON.parse(
          await readFile(
            join(f.evidenceRoot, f.runId, "snapshot/source-snapshot.json"),
          ),
        );
        const labels = f.calls.find((c) => c.args[0] === "build").args;
        const lockHash = labels
          .find((s) => s.startsWith("com.mkw.lock="))
          .split("=")[1];
        const childRoot = join(f.evidenceRoot, "child-reports");
        const status = await runChecks(
          {
            profile: "quality",
            workspace: f.repoRoot,
            reportRoot: childRoot,
            runId: f.runId,
          },
          {
            admit: async () => ({
              sourceSha256: manifest.sourceSha256,
              baseSha: manifest.base,
              environmentLockSha256: lockHash,
              runtime: {
                node: "v24.22.1",
                pnpm: "12.15.0",
                platform: "linux",
                arch: "x64",
                uid: 1000,
              },
            }),
            output: (line) => f.output.push(line),
            execute: async () => {
              commands++;
              const controller = new AbortController();
              const child =
                behavior === "exit"
                  ? "process.exit(17)"
                  : "setInterval(()=>{},1000)";
              const pending = executeRehearsalProcess(
                process.execPath,
                ["-e", child],
                {
                  cwd: f.repoRoot,
                  timeout: behavior === "timeout" ? 150 : 4000,
                  ...(behavior === "signal"
                    ? { signal: controller.signal }
                    : {}),
                },
              );
              if (behavior === "signal")
                setTimeout(() => controller.abort(), 150);
              observed = await pending;
              return observed;
            },
          },
        );
        childReport = JSON.parse(
          await readFile(join(childRoot, f.runId, "public/check-report.json")),
        );
        return {
          status,
          signal: null,
          processCode: null,
          stdout: Buffer.alloc(0),
          stderr: Buffer.alloc(0),
          closeObserved: true,
          cleanupUnverified: false,
        };
      }
      const result = await execute(bin, args, options);
      if (a.includes("cat"))
        result.stdout = Buffer.from(JSON.stringify(childReport));
      return result;
    };
    const exit = await runParity({ ...f, mode: "all" }, f.adapters);
    assert.equal(exit, behavior === "exit" ? 17 : 143);
    assert.equal(commands, 1);
    assert.equal(observed.closeObserved, true);
    assert.equal(observed.cleanupUnverified, false);
    assert.equal(f.rehearsals.length, 0);
    assert.equal(f.calls.filter((c) => c.args[0] === "create").length, 1);
    const r = await collect(f, "Failed");
    assert.deepEqual(r.primary, childReport.primary);
    assert.equal(r.primary.phase, "assertions");
    assert.equal(r.primary.stepId, "lint");
    assert.equal(r.primary.scenarioId, null);
    assert.equal(
      r.primary.code,
      behavior === "exit"
        ? "REHEARSAL_COMMAND"
        : behavior === "timeout"
          ? "PROCESS_TIMEOUT"
          : "PROCESS_SIGNAL",
    );
  });

// Break caught: public export accepting private bytes, or aggregate progressing
// to a second profile/engine after any of these failures.
for (const fault of [
  "none",
  "fetch",
  "exit",
  "missing",
  "corrupt",
  "malicious",
  "cleanup",
])
  test(`whole public projection and upload path excludes private canaries on ${fault}`, async (t) => {
    const f = await fixture(
      t,
      ["corrupt", "malicious"].includes(fault) ? "exit" : fault,
    );
    if (["corrupt", "malicious"].includes(fault)) {
      const execute = f.adapters.execute;
      f.adapters.execute = async (bin, args, options) => {
        const result = await execute(bin, args, options);
        if (bare(args).includes("cat"))
          result.stdout = Buffer.from(
            fault === "corrupt"
              ? "{"
              : JSON.stringify({
                  ...JSON.parse(result.stdout),
                  env: canary,
                  argv: [canary],
                  secret: canary,
                }),
          );
        return result;
      };
    }
    const exit = await runParity({ ...f, mode: "all" }, f.adapters);
    assert.equal(
      exit,
      fault === "none"
        ? 0
        : ["exit", "corrupt", "malicious"].includes(fault)
          ? 17
          : 1,
    );
    const r = await collect(f, fault === "none" ? "Passed" : "Failed");
    if (fault !== "none") {
      assert.equal(f.rehearsals.length, 0);
      assert.ok(f.profiles.length <= 1);
    }
    if (["corrupt", "malicious"].includes(fault)) {
      assert.equal(r.primary.code, "REHEARSAL_COMMAND");
      assert.equal(r.primary.exitCode, 17);
      assert.equal(r.primary.phase, "assertions");
      assert.equal(r.primary.stepId, "driver");
      assert.ok(r.secondaryErrors.includes("REPORT_INCOMPLETE"));
      assert.ok(r.secondaryErrors.includes("REHEARSAL_EVIDENCE_EXPORT"));
    }
    if (fault === "fetch") {
      assert.equal(r.primary.code, "ENVIRONMENT_FETCH");
      assert.equal(r.primary.phase, "setup");
      assert.equal(r.primary.stepId, "engine-setup");
      assert.equal(
        f.calls.some((c) => c.args[0] === "create"),
        false,
      );
    }
  });

// Break caught: trusting a resource that changes identity/ownership/mounts
// between execution and cleanup, deleting it on a foreign daemon boundary.
for (const field of ["owner", "id", "session", "mount", "image"])
  test(`cleanup refuses changed container ${field} and keeps original child17`, async (t) => {
    const f = await fixture(t, "exit"),
      execute = f.adapters.execute;
    let finished = false;
    f.adapters.execute = async (bin, args, options) => {
      const a = bare(args),
        result = await execute(bin, args, options);
      if (a.includes("--profile")) finished = true;
      if (finished && a[0] === "inspect") {
        const [inspection] = JSON.parse(result.stdout);
        if (field === "owner")
          inspection.Config.Labels["com.mkw.owner"] = "foreign";
        if (field === "id") inspection.Id = "c".repeat(64);
        if (field === "session")
          inspection.Config.Labels["com.mkw.session"] = randomUUID();
        if (field === "mount")
          inspection.Mounts = [
            {
              Type: "bind",
              Source: "/foreign",
              Destination: "/workspace",
              RW: true,
            },
          ];
        if (field === "image") inspection.Image = "sha256:" + "c".repeat(64);
        result.stdout = Buffer.from(JSON.stringify([inspection]));
      }
      return result;
    };
    assert.equal(await runParity({ ...f, mode: "all" }, f.adapters), 17);
    const r = await collect(f, "Failed");
    assert.equal(r.primary.code, "REHEARSAL_COMMAND");
    assert.equal(r.primary.exitCode, 17);
    assert.equal(r.primary.phase, "assertions");
    assert.equal(r.primary.stepId, "driver");
    assert.ok(r.secondaryErrors.includes("REHEARSAL_CLEANUP"));
    assert.equal(
      f.calls.some(
        (c) =>
          c.args[0] === "rm" || (c.args[0] === "image" && c.args[1] === "rm"),
      ),
      false,
    );
    assert.equal(f.rehearsals.length, 0);
  });

test("concurrent default UUID claims isolate sessions and existing output cannot be overwritten", async (t) => {
  const a = await fixture(t),
    b = await fixture(t);
  const run = (f) =>
    parityMain(
      [
        "--quality",
        "--repo-root",
        f.repoRoot,
        "--evidence-root",
        f.evidenceRoot,
      ],
      f.adapters,
    );
  assert.deepEqual(await Promise.all([run(a), run(b)]), [0, 0]);
  const ids = await Promise.all(
    [a, b].map(async (f) => {
      const [id] = await readdir(f.evidenceRoot);
      const bytes = await readFile(
        join(f.evidenceRoot, id, "public/check-report.json"),
      );
      assert.equal(
        await runParity({ ...f, runId: id, mode: "quality" }, f.adapters),
        1,
      );
      assert.deepEqual(
        await readFile(join(f.evidenceRoot, id, "public/check-report.json")),
        bytes,
      );
      return id;
    }),
  );
  assert.notEqual(ids[0], ids[1]);
  const sessions = [a, b].map((f) =>
    f.calls
      .find((c) => c.args[0] === "build")
      .args.find((s) => s.startsWith("com.mkw.session=")),
  );
  assert.notEqual(sessions[0], sessions[1]);
});

test("malicious collector input never passes arbitrary environment or argv fields", async (t) => {
  const f = await fixture(t);
  await mkdir(join(f.evidenceRoot, f.runId, "public"), { recursive: true });
  await writeFile(
    reportPath(f),
    JSON.stringify({
      ...projectPublicReport({
        runId: f.runId,
        result: "Failed",
        primary: { code: "REHEARSAL_COMMAND", exitCode: 17 },
      }),
      env: canary,
      argv: [canary],
      secret: canary,
    }),
  );
  const r = await collect(f, "Failed");
  assert.equal(r.primary.code, "REPORT_INCOMPLETE");
  assert.equal(r.innerReportUnavailable, true);
});

test("interrupted runner forwards abort, exits143 and never starts the next profile", async (t) => {
  const f = await fixture(t),
    resultFile = join(f.repoRoot, "interruption.json");
  const child = spawnSync(
    process.execPath,
    ["tests/product-tooling/fixtures/parity-interruption.mjs", resultFile],
    { cwd: root, encoding: "utf8", timeout: 4000 },
  );
  assert.equal(
    child.error,
    undefined,
    JSON.stringify({
      code: child.error?.code,
      errno: child.error?.errno,
      status: child.status,
      signal: child.signal,
    }),
  );
  assert.equal(child.status, 143, child.stdout + child.stderr);
  const r = JSON.parse(await readFile(resultFile));
  assert.equal(r.delivered, true);
  assert.equal(r.exit, 143);
  assert.equal(r.report.result, "Failed");
  assert.equal(r.report.primary.code, "PROCESS_SIGNAL");
  assert.equal(r.report.primary.exitCode, null);
  assert.equal(r.report.primary.signal, "SIGTERM");
  assert.equal(r.profiles.length, 1);
  assert.equal(r.rehearsals, 0);
  assert.equal(
    r.calls.some((c) => c.args[0] === "rm"),
    true,
  );
  assert.equal(
    (
      JSON.stringify(r.report) +
      r.output.join("\n") +
      child.stdout +
      child.stderr
    ).includes(canary),
    false,
  );
});
