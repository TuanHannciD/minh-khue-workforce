// Public evidence is constructed, never redacted from arbitrary private data.
// Catalogs are shared by writers and validators; adding an ID is a code review.
import { constants } from "node:os";
export const runIdPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const scenarioIds = Object.freeze([
  "exact_snapshot_and_empty_daemon",
  "restore_waits_for_final_postgres_server",
  "bootstrap_owned_database",
  "artifact_archive_staging_deploy_verify",
  "compiled_esm_native_user_node_readonly",
  "list_empty_then_sorted_users",
  "add_duplicate_concurrent",
  "reset_commits_and_revokes",
  "reset_failure_rolls_back",
  "add_deferred_commit_failure",
  "reset_missing",
  "invalid_private_input_preserves_sql",
  ...[
    "project",
    "service",
    "image",
    "health",
    "config",
    "dependency",
    "schema",
  ].map((f) => `account_reject_${f}_without_sql_mutation`),
  "credential_scan_evidence_and_runtime",
  "same_sha_new_backup_preserves_release_inode_bytes",
  "publisher_lock_and_operation_no_clobber",
  "extra_release_file_rejected_without_overwrite",
  "compose_swap_zero_migration_apply",
  "compose_duplicate-yaml_zero_migration_apply",
  "exact_receipt_ignores_later_foreign_operation",
  "new_real_images_preserve_postgres_data",
  "manual_old_release_current_controls_app_only_rollback",
  "postgres_mismatch_rejects_before_config_apply",
  "config_publication_failure_is_uncertain_not_success",
  "migration_failure_stops_app_and_requires_recovery",
  "missing_terminal_blocks_forward_retry",
  "privileged_exdev_and_bind_publish_boundaries",
  "actual_sigkill_lifecycle_boundary_suite",
]);
const phases = [
  "prerequisite",
  "snapshot",
  "setup",
  "copy",
  "registry",
  "build",
  "backup",
  "account",
  "deploy",
  "recovery",
  "assertions",
  "export",
  "cleanup",
  "complete",
];
// Diagnostic vocabulary is shared with the bounded driver parser. No raw site
// or lifecycle message may become a public enum.
export const entrypointSites = Object.freeze([
  "admission",
  "validated",
  "published",
  "config-staged",
  "api-config-published",
  "compose-config-published",
  "db-prepared",
  "migration-complete",
  "app-applied",
  "smoke-complete",
]);
export const releaseInvariantSites = Object.freeze([
  "release-inode-mtime-bytes",
  "release-operation-backup",
  "release-shared-backup",
  "release-backup-absence",
]);
const steps = [
  "release-assemble",
  "release-extract",
  "release-verify",
  "entrypoint-unknown",
  ...entrypointSites.map((site) => `entrypoint-${site}`),
  ...releaseInvariantSites,
  "prerequisite",
  "source-snapshot",
  "engine-setup",
  "source-copy",
  "driver",
  "registry-setup",
  "postgres-setup",
  "backup",
  "account",
  "deploy",
  "recovery",
  "scenario",
  "export",
  "cleanup",
  "complete",
  "lint",
  "format",
  "typecheck",
  "build",
  "tooling-fast",
  "sandbox",
  "web",
  "api",
  "contract",
  "boundaries",
  "tooling-release",
  ...["a", "b"].flatMap((label) =>
    ["api", "web"].map((service) => `build-${service}-${label}`),
  ),
];
const codes = [
  "OK",
  "REPORT_INCOMPLETE",
  "REHEARSAL_TASK_ID",
  "REHEARSAL_PREREQUISITE",
  "REHEARSAL_STORAGE",
  "REHEARSAL_SOURCE",
  "REHEARSAL_OWNERSHIP",
  "REHEARSAL_COMMAND",
  "REHEARSAL_ASSERTION",
  "REHEARSAL_INTERNAL",
  "REHEARSAL_POSTGRES_READINESS",
  "REHEARSAL_CLEANUP",
  "PROCESS_SPAWN",
  "PROCESS_TIMEOUT",
  "PROCESS_SIGNAL",
  "PROCESS_STDIN",
  "PG_DATABASE_MISSING",
  "PG_CONNECTION",
  "PG_OBJECT_EXISTS",
  "BACKUP_DECRYPT",
  "UNCLASSIFIED",
  "ENVIRONMENT_LOCK",
  "ENVIRONMENT_PLATFORM",
  "ENVIRONMENT_UID",
  "ENVIRONMENT_VERSION",
  "ENVIRONMENT_IMAGE",
  "ENVIRONMENT_PACKAGE",
  "ENVIRONMENT_EXECUTABLE",
  "ENVIRONMENT_FETCH",
];
const secondaryCodes = [
  "PROCESS_CLEANUP_UNVERIFIED",
  "REHEARSAL_EVIDENCE_EXPORT",
  "REHEARSAL_CLEANUP",
  "REPORT_WRITE",
  "REPORT_INCOMPLETE",
  "ARTIFACT_UPLOAD",
];
const signals = [
  "SIGTERM",
  "SIGKILL",
  "SIGINT",
  "SIGABRT",
  "SIGSEGV",
  "SIGPIPE",
  "SIGHUP",
  "SIGQUIT",
  "SIGBUS",
  "SIGILL",
  "SIGFPE",
  "SIGTRAP",
  "SIGXCPU",
  "SIGXFSZ",
];
const results = ["Passed", "Failed", "Blocked", "Not run"];
const profiles = [
  "rehearsal",
  "quality",
  "release-tooling",
  "release",
  "all",
  "legacy",
];
export function reportInvalid() {
  return Object.assign(new Error("REPORT_INVALID"), { code: "REPORT_INVALID" });
}
const valid = (condition) => {
  if (!condition) throw reportInvalid();
};
function exact(value, keys) {
  valid(value !== null && typeof value === "object" && !Array.isArray(value));
  valid(
    Object.keys(value).length === keys.length &&
      keys.every((key) => Object.hasOwn(value, key)),
  );
}
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const nullable = (value, predicate) => value === null || predicate(value);
const digest = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const version = (value) =>
  typeof value === "string" &&
  /^v?\d{1,3}\.\d{1,3}\.\d{1,3}(?:-r\d{1,3})?$/.test(value);
export const publicRuntimeVersion = (value) => (version(value) ? value : null);
export function validatePublicReport(value) {
  exact(value, [
    "schemaVersion",
    "runId",
    "sourceSha256",
    "baseSha",
    "environmentLockSha256",
    "profile",
    "result",
    "primary",
    "durationMs",
    "counts",
    "runtime",
    "innerReportUnavailable",
    "secondaryErrors",
  ]);
  valid(
    value.schemaVersion === "1" &&
      typeof value.runId === "string" &&
      runIdPattern.test(value.runId),
  );
  valid(
    nullable(value.sourceSha256, digest) &&
      nullable(value.environmentLockSha256, digest),
  );
  valid(
    nullable(
      value.baseSha,
      (v) => typeof v === "string" && /^[a-f0-9]{40}$/.test(v),
    ),
  );
  valid(
    profiles.includes(value.profile) &&
      results.includes(value.result) &&
      integer(value.durationMs),
  );
  exact(value.primary, [
    "phase",
    "stepId",
    "scenarioId",
    "code",
    "exitCode",
    "signal",
  ]);
  const p = value.primary;
  valid(
    phases.includes(p.phase) &&
      steps.includes(p.stepId) &&
      nullable(p.scenarioId, (v) => scenarioIds.includes(v)) &&
      codes.includes(p.code),
  );
  valid(
    nullable(p.exitCode, (v) => integer(v) && v <= 255) &&
      nullable(p.signal, (v) => signals.includes(v)),
  );
  valid(
    value.result !== "Passed" ||
      (p.code === "OK" &&
        p.exitCode === 0 &&
        p.signal === null &&
        p.phase === "complete"),
  );
  valid(value.result === "Passed" || p.code !== "OK");
  exact(value.counts, ["assertions", "commands"]);
  valid(integer(value.counts.assertions) && integer(value.counts.commands));
  exact(value.runtime, [
    "node",
    "pnpm",
    "docker",
    "compose",
    "platform",
    "arch",
    "uid",
  ]);
  for (const key of ["node", "pnpm", "docker", "compose"])
    valid(nullable(value.runtime[key], version));
  valid(
    nullable(value.runtime.platform, (v) =>
      ["linux", "win32", "darwin"].includes(v),
    ),
  );
  valid(nullable(value.runtime.arch, (v) => ["x64", "arm64"].includes(v)));
  valid(nullable(value.runtime.uid, integer));
  valid(typeof value.innerReportUnavailable === "boolean");
  valid(
    Array.isArray(value.secondaryErrors) &&
      value.secondaryErrors.length <= secondaryCodes.length &&
      new Set(value.secondaryErrors).size === value.secondaryErrors.length &&
      value.secondaryErrors.every((c) => secondaryCodes.includes(c)),
  );
  return value;
}
export function projectPublicReport(facts) {
  const p = facts.primary ?? {},
    r = facts.runtime ?? {},
    c = facts.counts ?? {};
  return validatePublicReport({
    schemaVersion: "1",
    runId: facts.runId,
    sourceSha256: facts.sourceSha256 ?? null,
    baseSha: facts.baseSha ?? null,
    environmentLockSha256: facts.environmentLockSha256 ?? null,
    profile: facts.profile ?? "rehearsal",
    result: facts.result ?? "Not run",
    primary: {
      phase: p.phase ?? "prerequisite",
      stepId: p.stepId ?? "prerequisite",
      scenarioId: p.scenarioId ?? null,
      code: p.code ?? "REPORT_INCOMPLETE",
      exitCode: p.exitCode ?? null,
      signal: p.signal ?? null,
    },
    durationMs: facts.durationMs ?? 0,
    counts: { assertions: c.assertions ?? 0, commands: c.commands ?? 0 },
    runtime: {
      node: r.node ?? null,
      pnpm: r.pnpm ?? null,
      docker: r.docker ?? null,
      compose: r.compose ?? null,
      platform: r.platform ?? null,
      arch: r.arch ?? null,
      uid: r.uid ?? null,
    },
    innerReportUnavailable: facts.innerReportUnavailable ?? false,
    secondaryErrors: [...new Set(facts.secondaryErrors ?? [])],
  });
}
export function safeReportSummary(report) {
  const r = validatePublicReport(report),
    p = r.primary;
  return `CHECK_REPORT result=${r.result} phase=${p.phase} step=${p.stepId} scenario=${p.scenarioId ?? "none"} code=${p.code} exit=${p.exitCode ?? "none"} signal=${p.signal ?? "none"} secondary=${r.secondaryErrors.join(",") || "none"}`;
}

// Parity boundary admission is stricter than the public failure schema. The
// rehearsal driver runs as root in dind; its public runtime has no pnpm fact.
export function admitParityTerminal(value, expected, processResult) {
  const report = validatePublicReport(value),
    p = report.primary;
  const worker = ["quality", "release-tooling"].includes(expected.profile);
  const processFailed =
    processResult.status !== 0 ||
    !!processResult.signal ||
    !!processResult.processCode;
  valid(report.runId === expected.runId && report.profile === expected.profile);
  valid(["Passed", "Failed", "Blocked"].includes(report.result));
  const admissionFailure =
    worker &&
    report.result !== "Passed" &&
    processFailed &&
    p.phase === "prerequisite" &&
    p.stepId === "prerequisite" &&
    [
      "ENVIRONMENT_LOCK",
      "ENVIRONMENT_PLATFORM",
      "ENVIRONMENT_UID",
      "ENVIRONMENT_VERSION",
      "ENVIRONMENT_EXECUTABLE",
      "REHEARSAL_SOURCE",
    ].includes(p.code) &&
    report.sourceSha256 === null &&
    report.baseSha === null &&
    report.environmentLockSha256 === null;
  valid(
    admissionFailure ||
      (report.sourceSha256 === expected.sourceSha256 &&
        report.baseSha === expected.baseSha &&
        report.environmentLockSha256 === expected.environmentLockSha256),
  );
  if ((worker && !admissionFailure) || report.result === "Passed") {
    const r = report.runtime,
      lock = expected.lock;
    valid(
      r.node === `v${lock.node}` &&
        r.platform === "linux" &&
        r.arch === "x64" &&
        r.uid === (worker ? lock.uid : 0),
    );
    if (worker) valid(r.pnpm === lock.pnpm);
    else
      valid(
        r.pnpm === null &&
          r.docker === lock.executables.docker &&
          r.compose?.replace(/^v/, "") ===
            lock.executables.compose.replace(/^v/, ""),
      );
  }
  if (report.result === "Passed")
    valid(
      !processFailed &&
        !report.innerReportUnavailable &&
        !report.secondaryErrors.includes("REPORT_INCOMPLETE"),
    );
  else {
    valid(processFailed);
    // Engine throws a classified Error rather than returning the driver exit;
    // the worker boundary has an actual process outcome to bind exactly.
    if (worker) {
      if (processResult.signal || processResult.processCode)
        valid(
          p.exitCode === processResult.status &&
            p.signal === (processResult.signal ?? null) &&
            (!processResult.processCode ||
              p.code === processResult.processCode),
        );
      else
        valid(
          processResult.status ===
            (p.exitCode || (p.signal ? 128 + constants.signals[p.signal] : 1)),
        );
    } else valid(p.code === processResult.engineCode);
  }
  valid(
    p.code !== "REPORT_INCOMPLETE" ||
      (report.result !== "Passed" && report.innerReportUnavailable),
  );
  return report;
}

// Strictly admit a terminal driver report; process failure cannot become Passed.
export function admitInnerReport(
  value,
  { runId, sourceSha256, baseSha, status, signal, processCode },
) {
  const report = validatePublicReport(value);
  valid(
    report.runId === runId &&
      report.profile === "rehearsal" &&
      report.sourceSha256 === sourceSha256 &&
      report.baseSha === baseSha,
  );
  valid(
    ["Passed", "Failed", "Blocked"].includes(report.result) &&
      report.primary.code !== "REPORT_INCOMPLETE",
  );
  valid(
    report.result !== "Passed" || (status === 0 && !signal && !processCode),
  );
  return report;
}
