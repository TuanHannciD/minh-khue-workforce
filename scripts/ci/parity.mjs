// Outer entrypoint: options/list, one retained capture and ordered profiles.
// worker.mjs owns Docker admission, private filesystem and public-only export.
import { mkdir, readFile, realpath, stat } from "node:fs/promises";
import { resolve, join, isAbsolute } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import { constants } from "node:os";
import { getCheckPlan } from "./check-plan.mjs";
import { readEnvironmentLock } from "./environment.mjs";
import { createSourceSnapshot } from "./source-snapshot.mjs";
import {
  projectPublicReport,
  validatePublicReport,
  admitParityTerminal,
  safeReportSummary,
  runIdPattern,
} from "./evidence.mjs";
import {
  runOwnedRehearsal,
  writeRehearsalEvidence,
} from "../product/local-rehearsal-engine.mjs";
import { createWorkerSession } from "./worker.mjs";

const repository = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const modes = new Set([
  "quality",
  "release-tooling",
  "release",
  "all",
  "tooling",
]);
const profilesFor = (mode) =>
  mode === "quality"
    ? ["quality"]
    : mode === "release" || mode === "release-tooling"
      ? ["release-tooling"]
      : ["quality", "release-tooling"];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (code) => {
  throw Object.assign(new Error(code), { code });
};
const exitFor = (p) =>
  p.exitCode || (p.signal ? 128 + (constants.signals[p.signal] ?? 0) : 1);

async function terminal(path, expected, processResult = {}) {
  const bytes = await readFile(path);
  if (bytes.length > 65536) fail("REPORT_INCOMPLETE");
  return admitParityTerminal(JSON.parse(bytes), expected, processResult);
}

// Optional boundary adapters exercise the same route in fixture subprocesses.
// The CLI cannot select another plan/runtime/snapshot or a test adapter.
export async function runParity(options, adapters = {}) {
  let repoRoot, evidenceRoot;
  const { mode, runId } = options;
  try {
    if (!modes.has(mode) || !runIdPattern.test(runId ?? "")) return 64;
    for (const path of [options.repoRoot, options.evidenceRoot])
      if (
        typeof path !== "string" ||
        !path.trim() ||
        path.includes(String.fromCharCode(0)) ||
        !isAbsolute(path)
      )
        return 64;
    repoRoot = await realpath(options.repoRoot);
    if (!(await stat(repoRoot)).isDirectory()) return 64;
    evidenceRoot = resolve(options.evidenceRoot);
    if (evidenceRoot === repoRoot) return 64;
  } catch {
    return 64;
  }
  const runRoot = join(evidenceRoot, runId),
    publicRoot = join(runRoot, "public"),
    started = Date.now();
  const output = adapters.output ?? console.log;
  const profile = mode === "tooling" ? "legacy" : mode;
  let facts = { runId, profile },
    session,
    primary,
    exit = 1,
    signal,
    hasFailure = false,
    signalRecorded = false;
  const secondaryErrors = [];
  const mergeReport = (value) => {
    const report = validatePublicReport(value);
    facts = {
      ...facts,
      runtime: report.runtime,
      innerReportUnavailable:
        !!facts.innerReportUnavailable || report.innerReportUnavailable,
      counts: {
        commands: (facts.counts?.commands ?? 0) + report.counts.commands,
        assertions: (facts.counts?.assertions ?? 0) + report.counts.assertions,
      },
    };
    secondaryErrors.push(...report.secondaryErrors);
  };
  const settleSignal = () => {
    if (!signal || signalRecorded) return false;
    signalRecorded = true;
    if (hasFailure) secondaryErrors.push("REPORT_INCOMPLETE");
    else {
      primary = {
        phase: primary?.phase ?? "prerequisite",
        stepId: primary?.stepId ?? "prerequisite",
        code: "PROCESS_SIGNAL",
        exitCode: null,
        signal,
      };
      exit = exitFor(primary);
      hasFailure = true;
    }
    return true;
  };
  const abort = new AbortController();
  const interrupted = (received) => {
    signal ??= received;
    abort.abort();
  };
  const onInt = () => interrupted("SIGINT"),
    onTerm = () => interrupted("SIGTERM");
  const publish = async (report) => {
    await writeRehearsalEvidence(join(publicRoot, "check-report.json"), report);
    if (report.result === "Passed" && signal) return;
    output(
      `${safeReportSummary(report)} rehearsal=${mode === "release" || mode === "all" ? "Required" : "Not run"} evidence=${runId}/public/check-report.json`,
    );
  };
  try {
    await mkdir(evidenceRoot, { recursive: true, mode: 0o700 });
    await mkdir(runRoot, { mode: 0o700 }); // exclusive UUID claim
    await mkdir(publicRoot, { mode: 0o700 });
    await publish(projectPublicReport(facts));
  } catch {
    return 1;
  }
  process.on("SIGINT", onInt);
  process.on("SIGTERM", onTerm);
  try {
    primary = {
      phase: "snapshot",
      stepId: "source-snapshot",
      code: "REPORT_INCOMPLETE",
      exitCode: 1,
    };
    const snapshotRoot = join(runRoot, "snapshot");
    await mkdir(snapshotRoot, { mode: 0o700 });
    const manifest = await createSourceSnapshot(repoRoot, snapshotRoot);
    facts = {
      ...facts,
      sourceSha256: manifest.sourceSha256,
      baseSha: manifest.base,
      environmentLockSha256: hash(
        await readFile(
          join(snapshotRoot, "source/scripts/ci/environment-lock.json"),
        ),
      ),
    };
    const lock = await readEnvironmentLock(
      join(snapshotRoot, "source/scripts/ci/environment-lock.json"),
    );
    primary = {
      phase: "prerequisite",
      stepId: "prerequisite",
      code: "REPORT_INCOMPLETE",
      exitCode: 1,
    };
    await publish(projectPublicReport({ ...facts, primary }));
    session = await createWorkerSession(
      {
        repoRoot,
        runRoot,
        runId,
        snapshotRoot,
        manifest,
        lock,
        environmentLockSha256: facts.environmentLockSha256,
        signal: abort.signal,
      },
      adapters,
    );
    await session.prepare();
    for (const workerProfile of profilesFor(mode)) {
      if (signal) fail("PROCESS_SIGNAL");
      primary = {
        phase: "setup",
        stepId: "source-copy",
        code: "REPORT_INCOMPLETE",
        exitCode: 1,
      };
      const report = await session.run(workerProfile);
      mergeReport(report);
      primary = report.primary;
      if (report.result !== "Passed") {
        hasFailure = true;
        exit = exitFor(primary);
        break;
      }
      exit = 0;
    }
    if (exit === 0 && (mode === "release" || mode === "all")) {
      if (signal) fail("PROCESS_SIGNAL");
      primary = {
        phase: "setup",
        stepId: "engine-setup",
        code: "REPORT_INCOMPLETE",
        exitCode: 1,
      };
      const evidencePath = join(runRoot, "rehearsal");
      let engineError;
      try {
        await (adapters.rehearse ?? runOwnedRehearsal)({
          taskId: runId,
          evidencePath,
          sourceSnapshot: { root: snapshotRoot, manifest },
          signal: abort.signal,
        });
      } catch (error) {
        engineError = error;
      }
      let report;
      try {
        report = await terminal(
          join(evidencePath, "public/check-report.json"),
          {
            runId,
            profile: "rehearsal",
            sourceSha256: manifest.sourceSha256,
            baseSha: manifest.base,
            environmentLockSha256: facts.environmentLockSha256,
            lock,
          },
          { status: engineError ? 1 : 0, engineCode: engineError?.code },
        );
      } catch {
        facts.innerReportUnavailable = true;
        secondaryErrors.push("REPORT_INCOMPLETE");
        fail("REPORT_INCOMPLETE");
      }
      mergeReport(report);
      primary = report.primary;
      exit = report.result === "Passed" && !engineError ? 0 : exitFor(primary);
      hasFailure = exit !== 0;
    }
  } catch (error) {
    if (error.report) mergeReport(error.report);
    primary = error.primary ?? {
      ...primary,
      code: error.code ?? "REHEARSAL_INTERNAL",
      exitCode: 1,
    };
    try {
      projectPublicReport({ ...facts, primary, result: "Failed" });
    } catch {
      primary = { ...primary, code: "REHEARSAL_INTERNAL", exitCode: 1 };
    }
    exit = exitFor(primary);
    if (error.code === "PROCESS_SIGNAL" && signal && !error.primary) {
      primary = { ...primary, exitCode: null, signal };
      exit = exitFor(primary);
      signalRecorded = true;
    }
    hasFailure = true;
  } finally {
    settleSignal();
    // Export the primary before teardown; secondary failures cannot erase it.
    try {
      await publish(
        projectPublicReport({
          ...facts,
          result: exit === 0 ? "Not run" : "Failed",
          primary:
            exit === 0
              ? {
                  phase: "cleanup",
                  stepId: "cleanup",
                  code: "REPORT_INCOMPLETE",
                  exitCode: null,
                }
              : primary,
          durationMs: Date.now() - started,
          secondaryErrors,
        }),
      );
    } catch {
      settleSignal();
      secondaryErrors.push("REPORT_WRITE");
      if (!exit) {
        exit = 1;
        primary = {
          phase: "export",
          stepId: "export",
          code: "REPORT_INCOMPLETE",
          exitCode: 1,
        };
        hasFailure = true;
      }
    }
    try {
      settleSignal();
      await session?.cleanup();
    } catch (error) {
      settleSignal();
      secondaryErrors.push("REHEARSAL_CLEANUP");
      if (!exit) {
        exit = 1;
        primary = {
          phase: "cleanup",
          stepId: "cleanup",
          code: error.code ?? "REHEARSAL_CLEANUP",
          exitCode: 1,
        };
        hasFailure = true;
      }
    }
    settleSignal();
    const finalReport = () =>
      projectPublicReport({
        ...facts,
        result: exit === 0 ? "Passed" : "Failed",
        primary,
        durationMs: Date.now() - started,
        secondaryErrors,
      });
    try {
      await publish(finalReport());
    } catch {
      settleSignal();
      secondaryErrors.push("REPORT_WRITE");
      exit ||= 1;
      output("CHECK_REPORT code=REPORT_INCOMPLETE");
    }
    // A signal can arrive while the final atomic publish is awaited. Reconcile
    // once using that latest state before releasing handlers and returning.
    if (
      settleSignal() ||
      (signal && secondaryErrors.includes("REPORT_WRITE"))
    ) {
      try {
        await publish(finalReport());
      } catch {
        exit ||= 1;
        output("CHECK_REPORT code=REPORT_INCOMPLETE");
      }
    }
    process.off("SIGINT", onInt);
    process.off("SIGTERM", onTerm);
  }
  return exit;
}

export async function parityMain(args, adapters = {}) {
  // pnpm run forwards its optional argument separator to the script.
  if (args[0] === "--") args = args.slice(1);
  const values = {},
    allowed = new Set([
      "--quality",
      "--release-tooling",
      "--release",
      "--all",
      "--list",
      "--help",
      "--repo-root",
      "--evidence-root",
      "--run-id",
    ]);
  let mode;
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!allowed.has(key) || Object.hasOwn(values, key)) return 64;
    if (["--repo-root", "--evidence-root", "--run-id"].includes(key)) {
      if (!args[i + 1]?.trim() || args[i + 1].startsWith("--")) return 64;
      values[key] = args[++i];
    } else values[key] = true;
    if (
      ["--quality", "--release-tooling", "--release", "--all"].includes(key)
    ) {
      if (mode) return 64;
      mode = key.slice(2);
    }
  }
  mode ??= "tooling";
  if (values["--run-id"] && !runIdPattern.test(values["--run-id"])) return 64;
  const repoRoot = values["--repo-root"] ?? repository,
    evidenceRoot =
      values["--evidence-root"] ??
      join(repoRoot, ".agent-runs/MKW-CI-PARITY-001");
  if (!isAbsolute(repoRoot) || !isAbsolute(evidenceRoot)) return 64;
  const output = adapters.output ?? console.log;
  if (values["--help"]) {
    output(
      "Usage: node scripts/ci/parity.mjs [--quality | --release-tooling | --release | --all] [--list]\nNo flag: quality + release tooling (hook coverage), rehearsal=Not run.\n--all: quality + release tooling + real rehearsal; run before push for release.\n--release: release tooling + real rehearsal. --quality: quality worker only.\n--release-tooling: release tooling only; rehearsal=Not run.\nOptional: --repo-root ABSOLUTE --evidence-root ABSOLUTE --run-id UUIDv4",
    );
    return 0;
  }
  if (values["--list"]) {
    const lockPath = join(repoRoot, "scripts/ci/environment-lock.json"),
      lock = await readEnvironmentLock(lockPath);
    output(
      JSON.stringify({
        mode,
        profiles: profilesFor(mode).map((profile) => ({
          profile,
          steps: getCheckPlan(profile),
        })),
        rehearsal:
          mode === "release" || mode === "all" ? "Required" : "Not run",
        environment: {
          lock: lockPath,
          platform: lock.platform,
          node: lock.node,
          pnpm: lock.pnpm,
          worker: lock.images.worker.reference,
          cli: lock.images.cli.reference,
          dockerfile: join(repoRoot, "scripts/ci/Dockerfile"),
        },
      }),
    );
    return 0;
  }
  return runParity(
    { mode, repoRoot, evidenceRoot, runId: values["--run-id"] ?? randomUUID() },
    adapters,
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  parityMain(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch(() => {
      console.error("CHECK_REPORT code=REPORT_INCOMPLETE");
      process.exitCode = 1;
    });
}
