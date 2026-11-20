// Worker only: outer adapters own image admission/copy/install and pass the
// verified snapshot context via MKW_CI_SNAPSHOT_ROOT/MKW_CI_SOURCE_SHA256.
import { mkdir, readFile, realpath, lstat, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { constants } from "node:os";
import {
  resolve,
  join,
  relative,
  isAbsolute,
  dirname,
  basename,
  sep,
  parse,
} from "node:path";
import { pathToFileURL } from "node:url";
import { getCheckPlan } from "./check-plan.mjs";
import { readEnvironmentLock, assertEnvironment } from "./environment.mjs";
import { verifySourceSnapshot } from "./source-snapshot.mjs";
import {
  projectPublicReport,
  safeReportSummary,
  runIdPattern,
} from "./evidence.mjs";
import {
  executeRehearsalProcess,
  writeRehearsalEvidence,
} from "../product/local-rehearsal-engine.mjs";

const fail = (code) => {
  throw Object.assign(new Error(code), { code });
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const profiles = new Set(["quality", "release-tooling"]);
const admissionCodes = new Set([
  "ENVIRONMENT_LOCK",
  "ENVIRONMENT_PLATFORM",
  "ENVIRONMENT_UID",
  "ENVIRONMENT_VERSION",
  "ENVIRONMENT_EXECUTABLE",
  "REHEARSAL_SOURCE",
]);

function checkedPlan(profile, getPlan) {
  if (!profiles.has(profile)) fail("CHECK_PLAN_INVALID");
  const plan = getPlan(profile),
    seen = new Set();
  if (!Array.isArray(plan) || !plan.length) fail("CHECK_PLAN_INVALID");
  for (const step of plan) {
    if (
      !step ||
      typeof step.id !== "string" ||
      !step.id ||
      seen.has(step.id) ||
      typeof step.executable !== "string" ||
      !step.executable ||
      !Array.isArray(step.args) ||
      step.args.some((a) => typeof a !== "string")
    )
      fail("CHECK_PLAN_INVALID");
    // Reuse the public schema's reviewed step vocabulary before any spawn.
    projectPublicReport({
      runId: "00000000-0000-4000-8000-000000000000",
      profile,
      primary: { stepId: step.id },
    });
    seen.add(step.id);
  }
  return plan;
}

function contextPath(value) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0"))
    fail("CHECK_PLAN_INVALID");
  const path = resolve(value);
  if (
    process.platform === "win32" &&
    [...path.slice(parse(path).root.length)].some(
      (character) =>
        character.charCodeAt(0) < 32 || /[<>:"|?*]/.test(character),
    )
  )
    fail("CHECK_PLAN_INVALID");
  return path;
}

const contains = (parent, child) => {
  const path = relative(parent, child);
  return (
    !path ||
    (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`))
  );
};

// Resolve existing ancestry without creating a missing report tail. lstat first
// makes a dangling link an invalid context rather than an absent directory.
async function canonicalDirectory(path, allowMissing = false) {
  const tail = [];
  let ancestor = path;
  for (;;) {
    try {
      await lstat(ancestor);
      break;
    } catch (error) {
      if (
        !allowMissing ||
        error.code !== "ENOENT" ||
        dirname(ancestor) === ancestor
      )
        throw error;
      tail.unshift(basename(ancestor));
      ancestor = dirname(ancestor);
    }
  }
  const canonical = await realpath(ancestor);
  if (!(await stat(canonical)).isDirectory()) fail("CHECK_PLAN_INVALID");
  return join(canonical, ...tail);
}

async function checkedContext(options, list = false) {
  if (!list || Object.hasOwn(options, "runId")) {
    if (typeof options.runId !== "string" || !runIdPattern.test(options.runId))
      fail("CHECK_PLAN_INVALID");
  }
  if (
    list &&
    !Object.hasOwn(options, "workspace") &&
    !Object.hasOwn(options, "reportRoot")
  )
    return {};
  const workspace = contextPath(
    list && !Object.hasOwn(options, "workspace")
      ? process.cwd()
      : options.workspace,
  );
  const canonicalWorkspace = await canonicalDirectory(workspace);
  if (list && !Object.hasOwn(options, "reportRoot")) return { workspace };
  const reportRoot = contextPath(options.reportRoot);
  const canonicalReportRoot = await canonicalDirectory(reportRoot, true);
  if (
    contains(workspace, reportRoot) ||
    contains(canonicalWorkspace, canonicalReportRoot)
  )
    fail("CHECK_PLAN_INVALID");
  return { workspace, reportRoot };
}

async function admitWorker({ workspace }) {
  const lockPath = join(workspace, "scripts/ci/environment-lock.json");
  const lock = await readEnvironmentLock(lockPath);
  if (process.platform !== "linux" || process.arch !== "x64")
    fail("ENVIRONMENT_PLATFORM");
  if (process.getuid() !== lock.uid || process.getgid() !== 1000)
    fail("ENVIRONMENT_UID");
  if (
    workspace !== resolve(process.cwd()) ||
    (await realpath(workspace)) !== workspace
  )
    fail("REHEARSAL_SOURCE");
  const snapshotRoot = process.env.MKW_CI_SNAPSHOT_ROOT;
  const expected = process.env.MKW_CI_SOURCE_SHA256;
  if (!snapshotRoot || !/^[a-f0-9]{64}$/.test(expected ?? ""))
    fail("REHEARSAL_SOURCE");
  const manifest = await verifySourceSnapshot(snapshotRoot, {
    sourceRoot: workspace,
    allowBuildOutputs: true,
  });
  if (manifest.sourceSha256 !== expected) fail("REHEARSAL_SOURCE");
  const pnpm = await executeRehearsalProcess("pnpm", ["--version"], {
    cwd: workspace,
    timeout: 30000,
  });
  if (pnpm.status !== 0 || pnpm.processCode || pnpm.signal)
    fail("ENVIRONMENT_EXECUTABLE");
  const actual = {
    platform: `${process.platform}/amd64`,
    uid: process.getuid(),
    executables: { node: process.version, pnpm: pnpm.stdout.toString().trim() },
  };
  assertEnvironment(actual, lock, {
    executableKeys: ["node", "pnpm"],
    imageKeys: [],
    packageKeys: [],
  });
  return {
    sourceSha256: manifest.sourceSha256,
    baseSha: manifest.base,
    environmentLockSha256: hash(await readFile(lockPath)),
    runtime: {
      node: process.version,
      pnpm: actual.executables.pnpm,
      platform: process.platform,
      arch: process.arch,
      uid: process.getuid(),
    },
  };
}

// Optional adapters exercise this same route with real fixture child processes;
// the CLI never accepts adapters or an alternate plan/admission implementation.
export async function runChecks(options, adapters = {}) {
  let plan, context;
  try {
    plan = checkedPlan(options.profile, adapters.getPlan ?? getCheckPlan);
    context = await checkedContext(options);
  } catch {
    return 64;
  }
  const { profile, runId } = options;
  const { workspace, reportRoot } = context;
  const started = Date.now();
  let facts = {
    runId,
    profile,
    counts: { commands: 0, assertions: 0 },
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      uid: process.getuid?.() ?? null,
    },
  };
  const publicRoot = join(reportRoot, runId, "public");
  const publish = async (report) => {
    await writeRehearsalEvidence(join(publicRoot, "check-report.json"), report);
    (adapters.output ?? console.log)(safeReportSummary(report));
  };
  try {
    await mkdir(reportRoot, { recursive: true, mode: 0o700 });
    await mkdir(join(reportRoot, runId), { mode: 0o700 }); // UUID claim; no stale overwrite.
    await mkdir(publicRoot, { mode: 0o700 });
    await publish(projectPublicReport(facts));
  } catch {
    return 1;
  }
  let primary = {
    phase: "prerequisite",
    stepId: "prerequisite",
    code: "REPORT_INCOMPLETE",
    exitCode: 1,
  };
  let exit = 1;
  const secondaryErrors = [];
  try {
    facts = {
      ...facts,
      ...(await (adapters.admit ?? admitWorker)({ workspace })),
    };
    for (const step of plan) {
      primary = {
        phase: "assertions",
        stepId: step.id,
        code: "REPORT_INCOMPLETE",
        exitCode: 1,
      };
      await publish(projectPublicReport({ ...facts, primary }));
      facts.counts.commands++;
      const result = await (adapters.execute ?? executeRehearsalProcess)(
        step.executable,
        step.args,
        { cwd: workspace },
      );
      if (result.stdout?.length) process.stdout.write(result.stdout);
      if (result.stderr?.length) process.stderr.write(result.stderr);
      if (result.cleanupUnverified)
        secondaryErrors.push("PROCESS_CLEANUP_UNVERIFIED");
      if (result.status !== 0 || result.processCode || result.signal) {
        primary = {
          phase: "assertions",
          stepId: step.id,
          code:
            result.processCode ??
            (result.signal ? "PROCESS_SIGNAL" : "REHEARSAL_COMMAND"),
          exitCode: result.status,
          signal: result.signal,
        };
        exit =
          result.status ||
          (result.signal ? 128 + (constants.signals[result.signal] ?? 0) : 1);
        break;
      }
      primary = {
        phase: "complete",
        stepId: "complete",
        code: "OK",
        exitCode: 0,
      };
      exit = 0;
    }
  } catch (error) {
    primary = {
      ...primary,
      code: admissionCodes.has(error.code) ? error.code : "REHEARSAL_INTERNAL",
      exitCode: 1,
    };
    exit = 1;
  }
  const terminal = projectPublicReport({
    ...facts,
    result: exit === 0 ? "Passed" : "Failed",
    primary,
    durationMs: Date.now() - started,
    secondaryErrors,
  });
  try {
    await publish(terminal);
  } catch {
    (adapters.output ?? console.error)(
      safeReportSummary(
        projectPublicReport({
          ...terminal,
          result: "Failed",
          primary: exit
            ? primary
            : {
                phase: "export",
                stepId: "export",
                code: "REPORT_INCOMPLETE",
                exitCode: 1,
              },
          secondaryErrors: [...secondaryErrors, "REPORT_WRITE"],
        }),
      ),
    );
    return exit || 1;
  }
  return exit;
}

export async function checksMain(args, adapters = {}) {
  const values = {},
    allowed = new Set([
      "--profile",
      "--workspace",
      "--report-root",
      "--run-id",
      "--list",
    ]);
  try {
    for (let i = 0; i < args.length; i++) {
      const key = args[i];
      if (!allowed.has(key) || Object.hasOwn(values, key)) return 64;
      if (key === "--list") values[key] = true;
      else {
        if (!args[i + 1] || args[i + 1].startsWith("--")) return 64;
        values[key] = args[++i];
      }
    }
    const plan = checkedPlan(
      values["--profile"],
      adapters.getPlan ?? getCheckPlan,
    );
    if (values["--list"]) {
      const context = {};
      for (const [flag, key] of [
        ["--workspace", "workspace"],
        ["--report-root", "reportRoot"],
        ["--run-id", "runId"],
      ])
        if (Object.hasOwn(values, flag)) context[key] = values[flag];
      await checkedContext(context, true);
      (adapters.output ?? console.log)(JSON.stringify(plan));
      return 0;
    }
  } catch {
    return 64;
  }
  return runChecks(
    {
      profile: values["--profile"],
      workspace: values["--workspace"] ?? process.cwd(),
      reportRoot: values["--report-root"],
      runId: values["--run-id"],
    },
    adapters,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  checksMain(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch(() => {
      console.error("CHECK_REPORT code=REPORT_INCOMPLETE");
      process.exitCode = 1;
    });
}
