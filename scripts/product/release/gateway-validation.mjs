import { createHash } from "node:crypto";
import { validateManifest } from "./validate-manifest.mjs";

const digest = /^sha256:[a-f0-9]{64}$/;
const sha = /^[a-f0-9]{40}$/;
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const unchangedDatabase = (a, b) =>
  a?.known === true &&
  b?.known === true &&
  a.schemaFingerprint === b.schemaFingerprint &&
  a.migrationFingerprint === b.migrationFingerprint &&
  a.postgresContainerId === b.postgresContainerId &&
  a.postgresImage === b.postgresImage &&
  a.postgresImageId === b.postgresImageId &&
  a.pending === false &&
  a.failed === false &&
  b.pending === false &&
  b.failed === false;
const keys = (v, allowed) =>
  v &&
  Object.keys(v).length === allowed.length &&
  Object.keys(v).every((k) => allowed.includes(k));
const fingerprint = (bytes) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const policyKeys = [
  "schemaVersion",
  "kind",
  "source",
  "scope",
  "operationId",
  "releaseSha",
  "sourceRepository",
  "apiImage",
  "webImage",
  "postgresImage",
  "apiSourceFingerprint",
  "apiSourceSha",
  "previousReleaseSha",
  "previousOwnership",
  "businessDataWrites",
];

export function policyDescriptor(policy) {
  const bytes = Buffer.from(JSON.stringify(policy));
  return { sha256: fingerprint(bytes).slice(7), size: bytes.length };
}
export function validOwner(o) {
  return (
    keys(o, [
      "runId",
      "runAttempt",
      "artifactId",
      "artifactDigest",
      "controlSha",
    ]) &&
    ["runId", "runAttempt", "artifactId"].every((k) =>
      /^[1-9][0-9]*$/.test(o[k] ?? ""),
    ) &&
    digest.test(o.artifactDigest ?? "") &&
    sha.test(o.controlSha ?? "")
  );
}
export function validGatewayPolicy(p, s) {
  return Boolean(
    keys(p, policyKeys) &&
    p.schemaVersion === "1" &&
    p.kind === "gateway-only" &&
    p.source === "canonical-build-policy" &&
    p.scope === "bounded-release-operation" &&
    p.businessDataWrites === "not-assessed" &&
    p.operationId === s?.operationId &&
    p.operationId ===
      `${s?.ownership?.runId}-${s?.ownership?.runAttempt}-${s?.releaseSha}` &&
    p.releaseSha === s?.releaseSha &&
    p.sourceRepository === s?.manifest?.sourceRepository &&
    ["apiImage", "webImage", "postgresImage"].every(
      (k) => p[k] === s?.manifest?.[k],
    ) &&
    p.apiImage === s?.previousState?.manifest?.apiImage &&
    p.postgresImage === s?.previousState?.manifest?.postgresImage &&
    digest.test(p.apiSourceFingerprint ?? "") &&
    p.apiSourceFingerprint === s?.manifest?.buildInputs?.apiSourceFingerprint &&
    p.apiSourceFingerprint ===
      s?.previousState?.manifest?.buildInputs?.apiSourceFingerprint &&
    sha.test(p.apiSourceSha ?? "") &&
    p.apiSourceSha === s?.manifest?.buildInputs?.apiSourceSha &&
    p.apiSourceSha === s?.previousState?.manifest?.buildInputs?.apiSourceSha &&
    p.previousReleaseSha === s?.previousState?.releaseSha &&
    validOwner(p.previousOwnership) &&
    same(p.previousOwnership, s?.previousState?.ownership) &&
    same(policyDescriptor(p), s?.manifest?.artifacts?.releasePolicy),
  );
}
export function validService(s) {
  return (
    keys(s, ["containerId", "image", "imageId", "startedAt", "restartCount"]) &&
    /^[a-f0-9]{12,64}$/.test(s.containerId ?? "") &&
    /^[^@\s]+@sha256:[a-f0-9]{64}$/.test(s.image ?? "") &&
    digest.test(s.imageId ?? "") &&
    Number.isFinite(Date.parse(s.startedAt ?? "")) &&
    Number.isSafeInteger(s.restartCount) &&
    s.restartCount >= 0
  );
}
export function validServices(s, manifest) {
  return (
    keys(s, ["api", "db"]) &&
    validService(s.api) &&
    validService(s.db) &&
    s.api.image === manifest?.apiImage &&
    s.db.image === manifest?.postgresImage
  );
}
export function validGatewayEvidence(e, s) {
  return Boolean(
    keys(e, [
      "kind",
      "source",
      "scope",
      "operationId",
      "releaseSha",
      "ownership",
      "policy",
      "before",
      "after",
      "commands",
      "businessDataWrites",
      "recordedAt",
    ]) &&
    e.kind === "gateway-only" &&
    e.source === "remote-operation-runtime-receipt" &&
    e.scope === "bounded-release-operation" &&
    e.operationId === s?.operationId &&
    e.releaseSha === s?.releaseSha &&
    validOwner(e.ownership) &&
    same(e.ownership, s.ownership) &&
    validGatewayPolicy(e.policy, s) &&
    validServices(e.before, s.manifest) &&
    validServices(e.after, s.manifest) &&
    same(e.before, e.after) &&
    same(e.before, s.previousState?.runtimeServices) &&
    s.migrationOutcome === "not-executed" &&
    s.before?.known === true &&
    s.after?.known === true &&
    s.before.schemaFingerprint === s.after.schemaFingerprint &&
    s.before.migrationFingerprint === s.after.migrationFingerprint &&
    same(e.commands, ["gateway-up-no-deps"]) &&
    e.businessDataWrites === "not-assessed" &&
    Number.isFinite(Date.parse(e.recordedAt ?? "")) &&
    Date.parse(e.recordedAt) >= Date.parse(s.applicationStartedAt ?? "") &&
    Date.parse(e.recordedAt) >= Date.parse(s.previousState?.verifiedAt ?? ""),
  );
}
export function canonicalDataEvidenceMatches(policy, state) {
  return (
    state?.dataOperations === "gateway-only" &&
    validGatewayEvidence(state.dataOperationEvidence, state) &&
    same(policy, state.dataOperationEvidence.policy)
  );
}
// A canonical policy descriptor cannot be bypassed by changing local class markers.
export function requiresGatewayPromotion(state) {
  return (
    state?.manifest?.artifacts?.releasePolicy !== undefined ||
    state?.dataOperations === "gateway-only" ||
    state?.operationClass === "gateway-only" ||
    state?.gatewayPolicy !== undefined ||
    state?.dataOperationEvidence?.kind === "gateway-only"
  );
}
export function validGatewayPromotionState(
  state,
  runtimeServices,
  database = state?.database ?? state?.after,
) {
  return (
    state?.dataOperations === "gateway-only" &&
    state.operationClass === "gateway-only" &&
    state.applicationAttempted === true &&
    state.migrationOutcome === "not-executed" &&
    validGatewayEvidence(state.dataOperationEvidence, state) &&
    validGatewayPolicy(state.gatewayPolicy, state) &&
    same(state.gatewayPolicy, state.dataOperationEvidence.policy) &&
    validServices(state.runtimeServices, state.manifest) &&
    validServices(runtimeServices, state.manifest) &&
    same(state.runtimeServices, state.dataOperationEvidence.after) &&
    same(runtimeServices, state.dataOperationEvidence.after) &&
    unchangedDatabase(state.before, state.after) &&
    unchangedDatabase(state.after, database) &&
    (state.status !== "verified" ||
      Date.parse(state.verifiedAt) >=
        Date.parse(state.dataOperationEvidence.recordedAt)) &&
    validateManifest(state.previousState?.manifest).ok &&
    sha.test(state.previousState.releaseSha ?? "")
  );
}
