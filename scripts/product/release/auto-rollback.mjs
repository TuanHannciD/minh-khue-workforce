import { validateManifest } from "./validate-manifest.mjs";
import { validateBackupReady } from "./validate-backup-ready.mjs";

const sha = /^[a-f0-9]{40}$/;
const digest = /^sha256:[a-f0-9]{64}$/;
const id = /^[1-9][0-9]*$/;
const operation = /^[A-Za-z0-9._-]{1,160}$/;
const image = /^[^@\s]+@sha256:[a-f0-9]{64}$/;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const incident = (reason) => ({
  action: "incident-required",
  reason,
  pipelineStatus: "failed",
});

export function validSnapshot(s) {
  return (
    s?.known === true &&
    digest.test(s.schemaFingerprint ?? "") &&
    digest.test(s.migrationFingerprint ?? "") &&
    s.pending === false &&
    s.failed === false &&
    /^[a-f0-9]{12,64}$/.test(s.postgresContainerId ?? "") &&
    image.test(s.postgresImage ?? "") &&
    digest.test(s.postgresImageId ?? "")
  );
}
export function unchangedDatabase(a, b) {
  return (
    validSnapshot(a) &&
    validSnapshot(b) &&
    [
      "schemaFingerprint",
      "migrationFingerprint",
      "postgresContainerId",
      "postgresImage",
      "postgresImageId",
    ].every((k) => a[k] === b[k])
  );
}
export function validOwnership(o) {
  return (
    o &&
    id.test(o.runId ?? "") &&
    id.test(o.runAttempt ?? "") &&
    id.test(o.artifactId ?? "") &&
    digest.test(o.artifactDigest ?? "") &&
    sha.test(o.controlSha ?? "")
  );
}
export function validAttestation(a) {
  return (
    a &&
    ["not-configured", "off", "best-effort", "required"].includes(a.mode) &&
    ["not-configured", "not-verified", "verified"].includes(a.status) &&
    (a.mode !== "required" || a.status === "verified")
  );
}

export function validDataOperationEvidence(e, state) {
  return (
    e?.kind === "migration-only" &&
    e?.source === "independent-data-operation-audit" &&
    e?.status === "verified" &&
    e?.scope === "release-and-application-startup" &&
    e?.operationId === state?.operationId &&
    e?.releaseSha === state?.releaseSha &&
    e?.apiImage === state?.manifest?.apiImage &&
    e?.webImage === state?.manifest?.webImage &&
    e?.unverifiedSideEffects === false &&
    Object.keys(e).every((key) =>
      [
        "kind",
        "source",
        "status",
        "scope",
        "operationId",
        "releaseSha",
        "apiImage",
        "webImage",
        "unverifiedSideEffects",
      ].includes(key),
    )
  );
}

export function validVerifiedState(state) {
  const v = state?.runtimeVerification;
  return (
    state?.schemaVersion === 2 &&
    state?.status === "verified" &&
    operation.test(state.operationId ?? "") &&
    sha.test(state.releaseSha ?? "") &&
    Number.isFinite(Date.parse(state.verifiedAt ?? "")) &&
    validateManifest(state.manifest).ok &&
    state.manifest.releaseSha === state.releaseSha &&
    validOwnership(state.ownership) &&
    validAttestation(state.attestation) &&
    validSnapshot(state.database) &&
    state.database.postgresImage === state.manifest.postgresImage &&
    v?.status === "verified" &&
    v?.operationId === state.operationId &&
    v?.releaseSha === state.releaseSha &&
    v?.verifiedAt === state.verifiedAt &&
    ["apiImage", "webImage", "postgresImage"].every(
      (key) => v[key] === state.manifest[key],
    )
  );
}

/** A precheck excludes backup/runtime, which are freshly acquired only after eligibility. */
export function rollbackPrecheck({
  state,
  expectedOperationId,
  expectedSha,
  expectedControlSha = expectedSha,
  expectedOwnership,
  repository,
} = {}) {
  if (
    !operation.test(expectedOperationId ?? "") ||
    !sha.test(expectedSha ?? "") ||
    !state ||
    state.operationId !== expectedOperationId ||
    state.releaseSha !== expectedSha ||
    !["deploying", "failed"].includes(state.status) ||
    state.schemaVersion !== 2 ||
    state.applicationAttempted !== true
  )
    return incident("failed-operation-mismatch-or-application-not-applied");
  if (
    !Number.isFinite(Date.parse(state.applicationStartedAt ?? "")) ||
    state.dataOperations !== "migration-only" ||
    !validDataOperationEvidence(state.dataOperationEvidence, state)
  )
    return incident("unknown-data-operations");
  if (state.rollbackAttempted === true)
    return incident("attempt-already-recorded");
  const previous = state.previousState;
  if (
    !previous ||
    previous.status !== "verified" ||
    !operation.test(previous.operationId ?? "") ||
    !sha.test(previous.releaseSha ?? "") ||
    !Number.isFinite(Date.parse(previous.verifiedAt ?? "")) ||
    !validOwnership(previous.ownership) ||
    !validAttestation(previous.attestation) ||
    !validateManifest(previous.manifest).ok ||
    previous.manifest.releaseSha !== previous.releaseSha ||
    previous.manifest.sourceRepository !== repository ||
    !validSnapshot(previous.database) ||
    !validVerifiedState(previous)
  )
    return incident("missing-or-incomplete-last-known-good");
  if (
    !validateManifest(state.manifest).ok ||
    state.manifest.releaseSha !== expectedSha ||
    state.manifest.sourceRepository !== repository ||
    !validOwnership(state.ownership) ||
    !validAttestation(state.attestation) ||
    !validOwnership(expectedOwnership) ||
    !same(state.ownership, expectedOwnership) ||
    state.ownership.controlSha !== expectedControlSha
  )
    return incident("current-manifest-ownership-invalid");
  if (
    state.migrationOutcome !== "succeeded" ||
    !unchangedDatabase(state.before, state.after) ||
    !unchangedDatabase(previous.database, state.before) ||
    state.manifest.postgresImage !== previous.manifest.postgresImage ||
    state.after.postgresImage !== state.manifest.postgresImage
  )
    return incident("migration-schema-or-postgres-changed-failed-or-unknown");
  return { action: "eligible", pipelineStatus: "failed" };
}

export function decideAutomaticRollback(input = {}) {
  const {
    state,
    runtime,
    backup,
    backupPolicy,
    trustedManifest,
    currentReleaseProof,
    artifactsVerified,
    attestation,
    now,
  } = input;
  const pre = rollbackPrecheck(input);
  if (pre.action !== "eligible") return pre;
  if (
    !currentReleaseProof ||
    !same(currentReleaseProof.ownership, state.ownership) ||
    !same(currentReleaseProof.manifest, state.manifest) ||
    !validDataOperationEvidence(
      currentReleaseProof.dataOperationEvidence,
      state,
    ) ||
    !same(
      currentReleaseProof.dataOperationEvidence,
      state.dataOperationEvidence,
    )
  )
    return incident("current-canonical-release-evidence-unverified");
  if (
    artifactsVerified !== true ||
    !same(trustedManifest, state.previousState.manifest) ||
    !validAttestation(attestation)
  )
    return incident("canonical-artifact-or-attestation-unverified");
  if (
    !runtime ||
    runtime.apiImage !== state.manifest.apiImage ||
    runtime.webImage !== state.manifest.webImage ||
    runtime.imageIdsMatch !== true ||
    !unchangedDatabase(state.after, runtime.database)
  )
    return incident("interleaved-runtime-or-database-mismatch");
  if (
    !backupPolicy ||
    !Number.isSafeInteger(backupPolicy.maxAgeSeconds) ||
    !Number.isFinite(Date.parse(now ?? "")) ||
    !backupPolicy.expectedTargetIdentity ||
    backup?.databaseIdentity?.targetIdentity !==
      backupPolicy.expectedTargetIdentity
  )
    return incident("backup-policy-or-target-invalid");
  const gate = validateBackupReady(backup, {
    ...backupPolicy,
    now,
    expectedKind: "BACKUP",
    expectedReleaseSha: state.releaseSha,
  });
  if (!gate.ok)
    return { ...incident("invalid-current-backup"), errors: gate.errors };
  if (
    backup.backupId === state.preReleaseBackupId ||
    Date.parse(backup.createdAt) < Date.parse(state.applicationStartedAt)
  )
    return incident("missing-stale-or-pre-release-backup");
  return {
    action: "rollback",
    pipelineStatus: "failed",
    scope: "application-only",
    releaseSha: state.previousState.releaseSha,
  };
}

export function buildRollbackEvidence({
  decision,
  attempted = false,
  verification = "not-run",
  operationId,
  releaseSha,
} = {}) {
  return {
    result:
      decision?.action === "rollback" && attempted && verification === "passed"
        ? "recovered-by-app-rollback"
        : "incident-required",
    pipelineStatus: "failed",
    rollbackScope: "application-only",
    databaseRecovery: false,
    databaseMutation: false,
    restoreOrDownMigration: false,
    attemptCount: attempted ? 1 : 0,
    verification,
    operationId: operation.test(operationId ?? "") ? operationId : "unknown",
    releaseSha: sha.test(releaseSha ?? "") ? releaseSha : "unknown",
    reason:
      decision?.reason ??
      "schema-evidence-does-not-prove-business-compatibility",
  };
}
