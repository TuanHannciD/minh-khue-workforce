// File map: CLI/workflow subprocess routes; R1 boundary failure regressions;
// alterWorker/renameFault provide Docker/report faults; mode matrix and
// release-tooling collector cases cover selection, aggregation and cleanup.
// Keep lifecycle matrices together to compare full/local and tooling-only modes.
import test from "node:test";
import assert from "node:assert/strict";
import {
  readFile,
  writeFile,
  mkdtemp,
  rm,
  mkdir,
  chmod,
} from "node:fs/promises";
import { join, resolve, isAbsolute, delimiter } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import * as parity from "../../scripts/ci/parity.mjs";
import { collectPublicReports } from "../../scripts/ci/collect-evidence.mjs";
import { fixture, canary } from "./fixtures/parity-boundary.mjs";
const root = resolve(import.meta.dirname, "../..");

test("Docker client discovery resolves actual PATH before fixture doubles and accepts usr/bin or usr/local/bin", async (t) => {
  const { findDockerClient } = await import("../../scripts/ci/worker.mjs");
  const actual = await findDockerClient();
  assert.ok(isAbsolute(actual));
  const directory = await mkdtemp(join(tmpdir(), "mkw client dấu "));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const suffix of ["usr/bin", "usr/local/bin"]) {
    const bin = join(directory, suffix);
    await mkdir(bin, { recursive: true });
    const executable = join(
      bin,
      process.platform === "win32" ? "docker.exe" : "docker",
    );
    await writeFile(executable, "fixture owned client");
    await chmod(executable, 0o755);
    assert.equal(
      await findDockerClient({
        path: [join(directory, "missing"), bin].join(delimiter),
      }),
      executable,
    );
  }
});

test("actual CLI validates bad flags before Docker and lists the no-flag tooling coverage", () => {
  const execute = (args) =>
    spawnSync(process.execPath, ["scripts/ci/parity.mjs", ...args], {
      cwd: root,
      encoding: "utf8",
    });
  assert.equal(execute(["--quality", "--release"]).status, 64);
  const listed = execute(["--list"]);
  assert.equal(listed.status, 0, listed.stderr);
  const plan = JSON.parse(listed.stdout);
  assert.deepEqual(
    plan.profiles.map((p) => p.profile),
    ["quality", "release-tooling"],
  );
  assert.equal(plan.rehearsal, "Not run");
  const separated = execute(["--", "--quality", "--list"]);
  assert.equal(separated.status, 0, separated.stderr);
  assert.equal(JSON.parse(separated.stdout).mode, "quality");
});

for (const [workflow, job, mode, want, engines] of [
  ["ci.yml", "checks", "--quality", ["quality"], 0],
  [
    "release-validation.yml",
    "release-validation",
    "--release-tooling",
    ["release-tooling"],
    0,
  ],
]) {
  for (const [fault, exit] of [
    ["none", 0],
    ["exit", 17],
    ["signal", 143],
  ]) {
    test(`workflow ${workflow} real entrypoint subprocess ${fault} routes mode, source and exit`, async (t) => {
      const require = createRequire(import.meta.url);
      const { load, JSON_SCHEMA } = createRequire(
        require.resolve("eslint/package.json"),
      )("js-yaml");
      const yaml = load(
        await readFile(join(root, ".github/workflows", workflow), "utf8"),
        { schema: JSON_SCHEMA },
      );
      const step = yaml.jobs[job].steps.find((s) => s.id === "rehearsal");
      const directory = await mkdtemp(join(tmpdir(), "mkw workflow dấu "));
      t.after(() => rm(directory, { recursive: true, force: true }));
      const path = join(directory, "result.json");
      const normalize = (p) => p.replaceAll("\\", "/");
      const result = spawnSync(
        process.platform === "win32"
          ? "C:/Program Files/Git/bin/bash.exe"
          : "bash",
        [
          "-ceu",
          'node() { "$PROBE_NODE" tests/product-tooling/fixtures/parity-entrypoint.mjs "$@"; }\n' +
            step.run,
        ],
        {
          cwd: root,
          encoding: "utf8",
          timeout: 15000,
          env: {
            ...process.env,
            PROBE_NODE: normalize(process.execPath),
            PARITY_PROBE_FAULT: fault,
            PARITY_PROBE_RESULT: path,
            MKW_PARITY_EVIDENCE_ROOT: normalize(join(directory, "evidence")),
            MKW_REHEARSAL_RUN_ID: "00112233-4455-4677-8899-aabbccddeeff",
          },
        },
      );
      assert.equal(result.error, undefined);
      assert.equal(result.status, exit, result.stdout + result.stderr);
      const observed = JSON.parse(await readFile(path, "utf8"));
      assert.equal(observed.args[0], mode);
      assert.deepEqual(
        observed.profiles.map((p) => p.profile),
        want,
      );
      assert.equal(observed.rehearsals, fault === "none" ? engines : 0);
      assert.equal(new Set(observed.profiles.map((p) => p.source)).size, 1);
      assert.ok(
        observed.calls
          .filter((c) => c.args[0] === "create")
          .every((c) => !c.args.includes("-v") && !c.args.includes("--mount")),
      );
    });
  }
}

// R1 regressions exercise the actual outer/worker lifecycle; only Docker and
// filesystem failure boundaries are doubled. No production fault switches.
const bare = (args) =>
  ["--context", "--host"].includes(args[0]) ? args.slice(2) : args;
for (const variant of ["blocked", "unavailable", "wrong-error"]) {
  test(`R1 I1 rehearsal ${variant} failure binds classified engine error without requiring worker runtime`, async (t) => {
    const f = await fixture(t),
      rehearse = f.adapters.rehearse;
    f.adapters.rehearse = async (options) => {
      await rehearse(options);
      const path = join(options.evidencePath, "public/check-report.json"),
        r = JSON.parse(await readFile(path, "utf8"));
      Object.assign(r, {
        result: variant === "blocked" ? "Blocked" : "Failed",
        runtime: {
          ...r.runtime,
          node: "v24.12.0",
          pnpm: null,
          platform: "win32",
          uid: null,
          docker: null,
          compose: null,
        },
        innerReportUnavailable: variant !== "blocked",
        secondaryErrors: variant !== "blocked" ? ["REPORT_INCOMPLETE"] : [],
      });
      r.primary = {
        ...r.primary,
        phase: variant === "blocked" ? "prerequisite" : "assertions",
        stepId: variant === "blocked" ? "prerequisite" : "driver",
        code:
          variant === "blocked" ? "REHEARSAL_PREREQUISITE" : "PROCESS_SIGNAL",
        exitCode: null,
        signal: variant === "blocked" ? null : "SIGTERM",
      };
      await writeFile(path, JSON.stringify(r));
      throw Object.assign(new Error(canary), {
        code: variant === "wrong-error" ? "REHEARSAL_INTERNAL" : r.primary.code,
      });
    };
    const exit = await parity.runParity({ ...f, mode: "release" }, f.adapters),
      r = await f.report();
    assert.equal(exit, variant === "unavailable" ? 143 : 1);
    assert.equal(
      r.primary.code,
      variant === "wrong-error"
        ? "REPORT_INCOMPLETE"
        : variant === "blocked"
          ? "REHEARSAL_PREREQUISITE"
          : "PROCESS_SIGNAL",
    );
    if (variant === "unavailable") {
      assert.equal(r.innerReportUnavailable, true);
      assert.ok(r.secondaryErrors.includes("REPORT_INCOMPLETE"));
    }
    assert.equal(
      (JSON.stringify(r) + f.output.join("\n")).includes(canary),
      false,
    );
  });
}

function alterWorker(f, change) {
  const execute = f.adapters.execute;
  f.adapters.execute = async (bin, args, options) => {
    const result = await execute(bin, args, options);
    if (args.includes("cat"))
      result.stdout = Buffer.from(
        JSON.stringify(change(JSON.parse(result.stdout))),
      );
    return result;
  };
}

for (const variant of ["inner-signal", "inner-timeout-zero"])
  test(`R1 I1 admits actual runChecks ${variant} exit contract`, async (t) => {
    const f = await fixture(t),
      execute = f.adapters.execute;
    f.adapters.execute = async (bin, args, options) => {
      const result = await execute(bin, args, options);
      if (args.includes("--profile"))
        result.status = variant === "inner-signal" ? 143 : 1;
      if (args.includes("cat")) {
        const r = JSON.parse(result.stdout);
        r.result = "Failed";
        r.primary = {
          ...r.primary,
          phase: "assertions",
          stepId: "tooling-release",
          code:
            variant === "inner-signal" ? "PROCESS_SIGNAL" : "PROCESS_TIMEOUT",
          exitCode: variant === "inner-signal" ? null : 0,
          signal: variant === "inner-signal" ? "SIGTERM" : null,
        };
        result.stdout = Buffer.from(JSON.stringify(r));
      }
      return result;
    };
    assert.equal(
      await parity.runParity({ ...f, mode: "quality" }, f.adapters),
      variant === "inner-signal" ? 143 : 1,
    );
    const r = await f.report();
    assert.equal(
      r.primary.code,
      variant === "inner-signal" ? "PROCESS_SIGNAL" : "PROCESS_TIMEOUT",
    );
    assert.equal(r.primary.exitCode, variant === "inner-signal" ? null : 0);
    assert.equal(r.primary.stepId, "tooling-release");
    assert.equal(r.innerReportUnavailable, false);
  });
function renameFault(t, action) {
  const rename = fsPromises.rename;
  t.mock.method(fsPromises, "rename", async (from, to) => {
    await action(from, to);
    return rename(from, to);
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
}
for (const variant of [
  "null",
  "wrong-lock",
  "wrong-runtime",
  "unavailable",
  "incomplete",
  "unknown",
]) {
  test(`R1 I1 rehearsal rejects ${variant} terminal without publishing private fields`, async (t) => {
    const f = await fixture(t),
      rehearse = f.adapters.rehearse;
    f.adapters.rehearse = async (options) => {
      await rehearse(options);
      const path = join(options.evidencePath, "public/check-report.json"),
        report = JSON.parse(await readFile(path, "utf8"));
      if (variant === "null") {
        report.environmentLockSha256 = null;
        for (const key of Object.keys(report.runtime))
          report.runtime[key] = null;
      }
      if (variant === "wrong-lock")
        report.environmentLockSha256 = "f".repeat(64);
      if (variant === "wrong-runtime")
        Object.assign(report.runtime, {
          node: "v20.1.0",
          pnpm: "1.0.0",
          platform: "win32",
          arch: "arm64",
        });
      if (variant === "unavailable") report.innerReportUnavailable = true;
      if (variant === "incomplete")
        report.secondaryErrors = ["REPORT_INCOMPLETE"];
      if (variant === "unknown") report.private = canary;
      await writeFile(path, JSON.stringify(report));
    };
    assert.notEqual(
      await parity.runParity({ ...f, mode: "release" }, f.adapters),
      0,
    );
    const report = await f.report();
    assert.equal(report.result, "Failed");
    assert.equal(report.primary.code, "REPORT_INCOMPLETE");
    assert.equal(report.innerReportUnavailable, true);
    assert.equal(
      (JSON.stringify(report) + f.output.join("\n")).includes(canary),
      false,
    );
  });
}
for (const variant of [
  "unavailable",
  "incomplete",
  "unknown",
  "failed-zero",
  "exit-mismatch",
]) {
  test(`R1 I1 worker rejects ${variant} process/report inconsistency`, async (t) => {
    const f = await fixture(t, variant === "exit-mismatch" ? "exit" : "none");
    alterWorker(f, (report) => {
      if (variant === "unavailable") report.innerReportUnavailable = true;
      if (variant === "incomplete")
        report.secondaryErrors = ["REPORT_INCOMPLETE"];
      if (variant === "unknown") report.private = canary;
      if (variant === "failed-zero") {
        report.result = "Failed";
        report.primary = {
          ...report.primary,
          code: "REHEARSAL_COMMAND",
          phase: "assertions",
          exitCode: 17,
        };
      }
      if (variant === "exit-mismatch") report.primary.exitCode = 19;
      return report;
    });
    const exit = await parity.runParity({ ...f, mode: "quality" }, f.adapters);
    assert.equal(exit, variant === "exit-mismatch" ? 17 : 1);
    assert.equal((await f.report()).result, "Failed");
    assert.equal(
      (await f.report()).primary.code,
      variant === "exit-mismatch" ? "REHEARSAL_COMMAND" : "REPORT_INCOMPLETE",
    );
    assert.equal(
      (JSON.stringify(await f.report()) + f.output.join("\n")).includes(canary),
      false,
    );
  });
}
for (const boundary of ["publish", "final-publish", "cleanup"])
  for (const fault of ["none", "exit", "secondary-failure"]) {
    test(`R1 I2 signal during pending ${boundary} with ${fault} settles nonzero and attempts owned cleanup`, async (t) => {
      const f = await fixture(t, fault === "exit" ? "exit" : "none");
      let fired = false,
        publicWrites = 0;
      if (boundary.includes("publish"))
        renameFault(t, async (_from, to) => {
          if (
            !to.endsWith("public\\check-report.json") &&
            !to.endsWith("public/check-report.json")
          )
            return;
          publicWrites++;
          if (publicWrites !== (boundary === "publish" ? 3 : 4)) return;
          await new Promise((done) => setImmediate(done));
          fired = true;
          process.emit("SIGTERM");
          if (fault === "secondary-failure") throw new Error(canary);
        });
      else {
        const execute = f.adapters.execute;
        f.adapters.execute = async (bin, args, options) => {
          const a = bare(args);
          if (a[0] === "image" && a[1] === "rm") {
            await new Promise((done) => setImmediate(done));
            fired = true;
            process.emit("SIGTERM");
            if (fault === "secondary-failure")
              return {
                status: 5,
                stdout: Buffer.alloc(0),
                stderr: Buffer.alloc(0),
              };
          }
          return execute(bin, args, options);
        };
      }
      const exit = await parity.runParity(
          { ...f, mode: "quality" },
          f.adapters,
        ),
        report = await f.report();
      assert.equal(fired, true);
      assert.notEqual(exit, 0);
      assert.notEqual(report.result, "Passed");
      if (fault === "exit") {
        assert.equal(exit, 17);
        assert.equal(report.primary.exitCode, 17);
        assert.ok(report.secondaryErrors.includes("REPORT_INCOMPLETE"));
      } else assert.equal(report.primary.code, "PROCESS_SIGNAL");
      assert.equal(
        f.output.some((line) => line.includes("result=Passed")),
        false,
      );
      assert.ok(f.calls.some((c) => c.args[0] === "rm"));
    });
  }
for (const observed of ["exit", "signal", "timeout"])
  for (const boundary of ["inspect", "export", "write"]) {
    test(`R1 I4 observed ${observed} survives ${boundary} failure without guessing a step`, async (t) => {
      const f = await fixture(t, observed === "timeout" ? "exit" : observed),
        execute = f.adapters.execute;
      let finished = false;
      f.adapters.execute = async (bin, args, options) => {
        const a = bare(args),
          result = await execute(bin, args, options);
        if (args.includes("--profile")) {
          finished = true;
          if (observed === "timeout")
            Object.assign(result, {
              status: null,
              signal: "SIGTERM",
              processCode: "PROCESS_TIMEOUT",
            });
        } else if (
          finished &&
          ((boundary === "inspect" && a[0] === "inspect") ||
            (boundary === "export" && a.includes("cat")))
        )
          return { ...result, status: 5, stdout: Buffer.from(canary) };
        if (observed === "timeout" && a.includes("cat")) {
          const r = JSON.parse(result.stdout);
          Object.assign(r.primary, {
            code: "PROCESS_TIMEOUT",
            exitCode: null,
            signal: "SIGTERM",
          });
          result.stdout = Buffer.from(JSON.stringify(r));
        }
        return result;
      };
      if (boundary === "write")
        renameFault(t, async (_from, to) => {
          if (to.endsWith("quality-report.json")) throw new Error(canary);
        });
      const exit = await parity.runParity(
          { ...f, mode: "quality" },
          f.adapters,
        ),
        report = await f.report();
      assert.equal(exit, observed === "exit" ? 17 : 143);
      assert.equal(
        report.primary.code,
        observed === "exit"
          ? "REHEARSAL_COMMAND"
          : observed === "signal"
            ? "PROCESS_SIGNAL"
            : "PROCESS_TIMEOUT",
      );
      assert.equal(report.primary.exitCode, observed === "exit" ? 17 : null);
      assert.equal(
        report.primary.signal,
        observed === "exit" ? null : "SIGTERM",
      );
      assert.ok(
        report.secondaryErrors.includes(
          boundary === "write" ? "REPORT_WRITE" : "REHEARSAL_EVIDENCE_EXPORT",
        ),
      );
      if (boundary !== "write") {
        assert.equal(report.primary.stepId, "driver");
        assert.equal(report.innerReportUnavailable, true);
        assert.ok(report.secondaryErrors.includes("REPORT_INCOMPLETE"));
      }
      assert.equal(
        (JSON.stringify(report) + f.output.join("\n")).includes(canary),
        false,
      );
    });
  }
for (const route of ["normal", "error-report", "successive"])
  test(`R1 I5 aggregate preserves and deduplicates worker secondary state via ${route}`, async (t) => {
    const f = await fixture(
      t,
      route === "normal"
        ? "exit"
        : route === "error-report"
          ? "cleanup"
          : "none",
    );
    alterWorker(f, (r) => ({
      ...r,
      counts: { commands: 2, assertions: 3 },
      secondaryErrors: ["PROCESS_CLEANUP_UNVERIFIED", "REPORT_WRITE"],
      innerReportUnavailable: route === "normal",
    }));
    await parity.runParity(
      { ...f, mode: route === "successive" ? "tooling" : "quality" },
      f.adapters,
    );
    const r = await f.report();
    assert.ok(r.secondaryErrors.includes("PROCESS_CLEANUP_UNVERIFIED"));
    assert.ok(r.secondaryErrors.includes("REPORT_WRITE"));
    assert.equal(new Set(r.secondaryErrors).size, r.secondaryErrors.length);
    assert.deepEqual(r.counts, {
      commands: route === "successive" ? 4 : 2,
      assertions: route === "successive" ? 6 : 3,
    });
    assert.equal(r.innerReportUnavailable, route === "normal");
    assert.match(f.output.at(-1), /PROCESS_CLEANUP_UNVERIFIED/);
  });
for (const collision of [
  "foreign-tag",
  "same-owner-tag",
  "container",
  "transport",
])
  test(`R1 I6 ${collision} is rejected before build and preserves all preexisting resources`, async (t) => {
    const f = await fixture(t),
      execute = f.adapters.execute;
    f.adapters.execute = async (bin, args, options) => {
      const a = bare(args);
      if (
        (a[0] === "image" && a[1] === "ls") ||
        (a[0] === "image" &&
          a[1] === "inspect" &&
          a[2] === `mkw-ci-parity:${f.runId}`)
      ) {
        if (collision === "transport")
          return {
            status: 5,
            stdout: Buffer.from(canary),
            stderr: Buffer.alloc(0),
          };
        if (collision.includes("tag"))
          return {
            status: 0,
            stdout: Buffer.from(
              a[1] === "ls"
                ? "sha256:" + "c".repeat(64)
                : JSON.stringify([
                    {
                      Id: "sha256:" + "c".repeat(64),
                      Config: {
                        Labels: {
                          "com.mkw.owner":
                            collision === "same-owner-tag"
                              ? "MKW-CI-PARITY-001"
                              : "foreign",
                        },
                      },
                    },
                  ]),
            ),
            stderr: Buffer.alloc(0),
          };
      }
      if (collision === "container" && a[0] === "ps")
        return {
          status: 0,
          stdout: Buffer.from("c".repeat(64)),
          stderr: Buffer.alloc(0),
        };
      return execute(bin, args, options);
    };
    assert.notEqual(
      await parity.runParity({ ...f, mode: "quality" }, f.adapters),
      0,
    );
    assert.equal(
      f.calls.some(
        (c) =>
          ["build", "create", "rm"].includes(c.args[0]) ||
          (c.args[0] === "image" && ["rm", "tag"].includes(c.args[1])),
      ),
      false,
    );
  });

test("R1 I6 duplicate UUID in concurrent distinct evidence roots uses isolated untagged sessions", async (t) => {
  const first = await fixture(t),
    second = await fixture(t);
  second.runId = first.runId;
  const results = await Promise.all(
    [first, second].map((f) =>
      parity.runParity({ ...f, mode: "quality" }, f.adapters),
    ),
  );
  assert.deepEqual(results, [0, 0]);
  const builds = [first, second].map(
    (f) => f.calls.find((c) => c.args[0] === "build").args,
  );
  for (const args of builds) {
    assert.equal(args.includes("--tag"), false);
    assert.equal(args.includes("-t"), false);
  }
  const sessions = builds.map((args) =>
    args.find((a) => a.startsWith("com.mkw.session=")),
  );
  assert.equal(new Set(sessions).size, 2);
  const names = [first, second].map((f) => {
    const args = f.calls.find((c) => c.args[0] === "create").args;
    return args[args.indexOf("--name") + 1];
  });
  assert.equal(new Set(names).size, 2);
});

test("R1 I6 atomic create collision never deletes the existing container", async (t) => {
  const f = await fixture(t),
    execute = f.adapters.execute;
  f.adapters.execute = async (bin, args, options) =>
    bare(args)[0] === "create"
      ? { status: 1, stdout: Buffer.from(canary), stderr: Buffer.alloc(0) }
      : execute(bin, args, options);
  assert.notEqual(
    await parity.runParity({ ...f, mode: "quality" }, f.adapters),
    0,
  );
  assert.equal(
    f.calls.some((c) => c.args[0] === "rm"),
    false,
  );
  assert.equal(
    (JSON.stringify(await f.report()) + f.output.join("\n")).includes(canary),
    false,
  );
});

test("parity exposes the shared runner and parser without acquiring Docker on import", () => {
  assert.equal(typeof parity.runParity, "function");
  assert.equal(typeof parity.parityMain, "function");
});

test("OCI containerd image-store manifest IDs are admitted only with pinned repo digest and actual platform", async (t) => {
  const f = await fixture(t, "manifest-id");
  assert.equal(
    await parity.runParity({ ...f, mode: "quality" }, f.adapters),
    0,
    f.output.join("\n"),
  );
});
test("outer success stays incomplete until owned image cleanup settles", async (t) => {
  const f = await fixture(t);
  assert.equal(
    await parity.runParity({ ...f, mode: "quality" }, f.adapters),
    0,
  );
  assert.equal(f.beforeImageCleanup.length, 1);
  assert.equal(f.beforeImageCleanup[0].result, "Not run");
  assert.equal(f.beforeImageCleanup[0].primary.code, "REPORT_INCOMPLETE");
  assert.equal((await f.report()).result, "Passed");
});

test("invalid mutually exclusive/unknown options and invalid API mode fail64 before Docker", async (t) => {
  const f = await fixture(t);
  for (const args of [
    ["--wat"],
    ["--quality", "--release"],
    ["--release-tooling", "--quality"],
    ["--release-tooling", "--release"],
    ["--all", "--release-tooling"],
    ["--release-tooling", "--release-tooling"],
    ["--all", "--all"],
    ["--run-id", "bad"],
    ["--evidence-root", ""],
  ]) {
    assert.equal(await parity.parityMain(args, f.adapters), 64);
  }
  assert.equal(
    await parity.runParity({ ...f, mode: "unknown" }, f.adapters),
    64,
  );
  assert.equal(f.calls.length, 0);
});
test("list resolves catalog/environment inputs; help distinguishes hook tooling and pre-push all without acquisition", async (t) => {
  const f = await fixture(t);
  assert.equal(await parity.parityMain(["--all", "--list"], f.adapters), 0);
  const plan = JSON.parse(f.output.pop());
  assert.deepEqual(
    plan.profiles.map((x) => x.profile),
    ["quality", "release-tooling"],
  );
  assert.equal(plan.rehearsal, "Required");
  assert.match(plan.environment.lock, /environment-lock.json$/);
  assert.equal(await parity.parityMain(["--help"], f.adapters), 0);
  assert.match(f.output.pop(), /--all[\s\S]*before push/);
  assert.equal(
    await parity.parityMain(["--release-tooling", "--list"], f.adapters),
    0,
  );
  const tooling = JSON.parse(f.output.pop());
  assert.equal(tooling.mode, "release-tooling");
  assert.deepEqual(tooling.profiles, [
    {
      profile: "release-tooling",
      steps: [
        {
          id: "tooling-release",
          executable: "pnpm",
          args: ["run", "product:test:tooling:release"],
        },
      ],
    },
  ]);
  assert.equal(tooling.rehearsal, "Not run");
  assert.equal(await parity.parityMain(["--help"], f.adapters), 0);
  assert.match(
    f.output.pop(),
    /--release-tooling: release tooling only; rehearsal=Not run/,
  );
  assert.equal(f.calls.length, 0);
});
for (const [mode, want, engine] of [
  ["quality", ["quality"], 0],
  ["release-tooling", ["release-tooling"], 0],
  ["release", ["release-tooling"], 1],
  ["all", ["quality", "release-tooling"], 1],
  ["tooling", ["quality", "release-tooling"], 0],
]) {
  test(`${mode} preserves ordered coverage and a single retained source on Unicode/space paths`, async (t) => {
    const f = await fixture(t);
    assert.equal(
      await parity.runParity({ ...f, mode }, f.adapters),
      0,
      f.output.join("\n"),
    );
    assert.deepEqual(
      f.profiles.map((x) => x.profile),
      want,
    );
    assert.equal(new Set(f.profiles.map((x) => x.source)).size, 1);
    assert.equal(f.rehearsals.length, engine);
    if (engine)
      assert.equal(f.rehearsals[0].manifest.sourceSha256, f.profiles[0].source);
    assert.equal((await f.report()).result, "Passed");
    for (const call of f.calls.filter((c) => c.args[0] === "create"))
      assert.ok(
        call.args.includes("npm_config_store_dir=/home/node/.pnpm-store"),
        "all worker descendants inherit the private store, including pnpm run auto-install/config setup",
      );
    assert.ok(
      f.calls
        .filter((x) => x.args[0] === "create")
        .every((x) => !x.args.includes("-v") && !x.args.includes("--mount")),
    );
    for (const call of f.calls.filter(
      (c) => c.args.includes("pnpm") && c.args.includes("install"),
    )) {
      assert.equal(call.args[call.args.indexOf("--user") + 1], "1000:1000");
      assert.equal(
        call.args[call.args.indexOf("--store-dir") + 1],
        "/home/node/.pnpm-store",
      );
      assert.ok(call.args.includes("--frozen-lockfile"));
    }
    assert.equal(f.calls.filter((x) => x.args[0] === "rm").length, want.length);
    if (!engine) assert.match(f.output.join("\n"), /rehearsal=Not run/);
  });
}
for (const fault of ["none", "exit", "cleanup"]) {
  test(`release-tooling ${fault} exports only tooling facts and cleans up without calling rehearsal`, async (t) => {
    const f = await fixture(t, fault);
    let rehearsed = false;
    f.adapters.rehearse = async () => {
      rehearsed = true;
      throw new Error("release-tooling must never invoke rehearsal");
    };
    alterWorker(f, (r) => ({ ...r, counts: { commands: 2, assertions: 3 } }));
    const exit = await parity.parityMain(
      [
        "--release-tooling",
        "--repo-root",
        f.repoRoot,
        "--evidence-root",
        f.evidenceRoot,
        "--run-id",
        f.runId,
      ],
      f.adapters,
    );
    assert.equal(exit, fault === "none" ? 0 : fault === "exit" ? 17 : 1);
    assert.equal(rehearsed, false);
    assert.deepEqual(
      f.profiles.map((p) => p.profile),
      ["release-tooling"],
    );
    const report = await f.report();
    assert.equal(report.profile, "release-tooling");
    assert.equal(report.result, fault === "none" ? "Passed" : "Failed");
    assert.deepEqual(report.counts, { commands: 2, assertions: 3 });
    assert.equal(
      report.primary.code,
      fault === "none" ? "OK" : "REHEARSAL_COMMAND",
    );
    if (fault === "exit")
      assert.equal(report.primary.stepId, "tooling-release");
    if (fault === "cleanup")
      assert.ok(report.secondaryErrors.includes("REHEARSAL_CLEANUP"));
    assert.ok(f.calls.some((c) => c.args[0] === "rm"));
    if (fault === "cleanup") assert.equal(f.beforeImageCleanup.length, 0);
    else
      assert.equal(
        f.beforeImageCleanup[0].result,
        fault === "none" ? "Not run" : "Failed",
      );
    assert.match(f.output.at(-1), /rehearsal=Not run/);
    const collected = await collectPublicReports({
      runId: f.runId,
      evidenceRoot: f.evidenceRoot,
      outputRoot: join(f.evidenceRoot, "collected"),
    });
    assert.equal(collected.status, report.result);
    assert.equal(collected.files.length, 1);
    assert.deepEqual(
      JSON.parse(await readFile(collected.files[0], "utf8")),
      report,
    );
  });
}
for (const [fault, code, want] of [
  ["daemon", "ENVIRONMENT_PLATFORM", 1],
  ["image-platform", "ENVIRONMENT_PLATFORM", 1],
  ["provenance", "ENVIRONMENT_IMAGE", 1],
  ["mount", "REHEARSAL_OWNERSHIP", 1],
  ["fetch", "ENVIRONMENT_FETCH", 1],
  ["exit", "REHEARSAL_COMMAND", 17],
  ["signal", "PROCESS_SIGNAL", 143],
  ["missing", "REPORT_INCOMPLETE", 1],
  ["foreign", "REPORT_INCOMPLETE", 1],
  ["admission", "REHEARSAL_SOURCE", 1],
  ["cleanup", "REHEARSAL_COMMAND", 1],
]) {
  test(`${fault} fails closed, skips rehearsal and preserves safe primary/report`, async (t) => {
    const f = await fixture(t, fault);
    assert.equal(
      await parity.runParity({ ...f, mode: "release" }, f.adapters),
      want,
      f.output.join("\n"),
    );
    const report = await f.report();
    assert.equal(report.primary.code, code);
    assert.equal(report.result, "Failed");
    assert.equal(f.rehearsals.length, 0);
    assert.equal(
      (JSON.stringify(report) + f.output.join("\n")).includes(canary),
      false,
    );
  });
}
