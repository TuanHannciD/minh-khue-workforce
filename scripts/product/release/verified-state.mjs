import { validateManifest } from "./validate-manifest.mjs";

const sha = /^[a-f0-9]{40}$/;
const digest = /^sha256:[a-f0-9]{64}$/;
const id = /^[1-9][0-9]*$/;
const operation = /^[A-Za-z0-9._-]{1,160}$/;

function validSnapshot(snapshot) {
  return (
    snapshot?.known === true &&
    digest.test(snapshot.schemaFingerprint ?? "") &&
    digest.test(snapshot.migrationFingerprint ?? "") &&
    snapshot.pending === false &&
    snapshot.failed === false &&
    /^[a-f0-9]{12,64}$/.test(snapshot.postgresContainerId ?? "") &&
    /^[^@\s]+@sha256:[a-f0-9]{64}$/.test(snapshot.postgresImage ?? "") &&
    digest.test(snapshot.postgresImageId ?? "")
  );
}

function validOwnership(value) {
  return (
    value &&
    id.test(value.runId ?? "") &&
    id.test(value.runAttempt ?? "") &&
    id.test(value.artifactId ?? "") &&
    digest.test(value.artifactDigest ?? "") &&
    sha.test(value.controlSha ?? "")
  );
}

function validAttestation(value) {
  return (
    value &&
    ["not-configured", "off", "best-effort", "required"].includes(value.mode) &&
    ["not-configured", "not-verified", "verified"].includes(value.status) &&
    (value.mode !== "required" || value.status === "verified")
  );
}

export function validVerifiedState(state) {
  const verification = state?.runtimeVerification;
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
    verification?.status === "verified" &&
    verification?.operationId === state.operationId &&
    verification?.releaseSha === state.releaseSha &&
    verification?.verifiedAt === state.verifiedAt &&
    ["apiImage", "webImage", "postgresImage"].every(
      (key) => verification[key] === state.manifest[key],
    )
  );
}
