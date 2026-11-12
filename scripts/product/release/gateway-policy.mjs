import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { validVerifiedState } from "./verified-state.mjs";
import { parseJsonStrict, validateManifest } from "./validate-manifest.mjs";

const digest = /^sha256:[a-f0-9]{64}$/;
const sha = /^[a-f0-9]{40}$/;
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const unchangedDatabase = (a, b) =>
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

// Conservative committed-tree allowlist. Unknown future inputs force rebuild.
export function apiSourceFingerprint(root, ref = "HEAD") {
  if (ref !== "HEAD" && !sha.test(ref)) throw new Error("invalid source ref");
  const tree = execFileSync("git", ["ls-tree", "-rz", "--full-tree", ref], {
    cwd: root,
    encoding: "utf8",
  });
  const records = tree
    .split("\0")
    .filter(Boolean)
    .filter((record) => {
      const path = record.slice(record.indexOf("\t") + 1);
      return (
        !path.startsWith("apps/web/") &&
        !path.startsWith("docs/") &&
        path !== "deploy/nginx.conf"
      );
    })
    .sort();
  if (
    !records.some((r) => r.endsWith("\tdeploy/Dockerfile.api")) ||
    !records.some((r) => r.includes("\tapps/api/"))
  )
    throw new Error("API source tree incomplete");
  return fingerprint(records.join("\0"));
}
export function policyDescriptor(policy) {
  const bytes = Buffer.from(JSON.stringify(policy));
  return { sha256: fingerprint(bytes).slice(7), size: bytes.length };
}
export function bindPolicy(manifest, policy) {
  return {
    ...structuredClone(manifest),
    artifacts: {
      ...structuredClone(manifest.artifacts),
      releasePolicy: policyDescriptor(policy),
    },
  };
}
export function buildPolicy({
  manifest,
  operationId,
  apiSourceFingerprint: sourceFingerprint,
  apiSourceSha,
  previous,
}) {
  if (
    !validateManifest(manifest).ok ||
    !validateManifest(previous?.manifest).ok ||
    previous?.status !== "verified" ||
    !validOwner(previous?.ownership)
  )
    throw new Error("verified previous release required");
  if (
    !digest.test(sourceFingerprint ?? "") ||
    !sha.test(apiSourceSha ?? "") ||
    !/^[A-Za-z0-9._-]{1,160}$/.test(operationId ?? "")
  )
    throw new Error("invalid build policy source");
  if (
    manifest.apiImage !== previous.manifest.apiImage ||
    manifest.postgresImage !== previous.manifest.postgresImage ||
    sourceFingerprint !== previous.manifest.buildInputs?.apiSourceFingerprint ||
    apiSourceSha !== previous.manifest.buildInputs?.apiSourceSha ||
    sourceFingerprint !== manifest.buildInputs?.apiSourceFingerprint ||
    apiSourceSha !== manifest.buildInputs?.apiSourceSha
  )
    throw new Error("API/PG build identity changed");
  return {
    schemaVersion: "1",
    kind: "gateway-only",
    source: "canonical-build-policy",
    scope: "bounded-release-operation",
    operationId,
    releaseSha: manifest.releaseSha,
    sourceRepository: manifest.sourceRepository,
    apiImage: manifest.apiImage,
    webImage: manifest.webImage,
    postgresImage: manifest.postgresImage,
    apiSourceFingerprint: sourceFingerprint,
    apiSourceSha,
    previousReleaseSha: previous.releaseSha,
    previousOwnership: structuredClone(previous.ownership),
    businessDataWrites: "not-assessed",
  };
}
function validOwner(o) {
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
export function gatewayReceipt({ state, policy, before, after, recordedAt }) {
  const result = {
    kind: "gateway-only",
    source: "remote-operation-runtime-receipt",
    scope: "bounded-release-operation",
    operationId: state.operationId,
    releaseSha: state.releaseSha,
    ownership: structuredClone(state.ownership),
    policy: structuredClone(policy),
    before: structuredClone(before),
    after: structuredClone(after),
    commands: ["gateway-up-no-deps"],
    businessDataWrites: "not-assessed",
    recordedAt,
  };
  if (!validGatewayEvidence(result, state))
    throw new Error("invalid gateway policy or runtime receipt");
  return result;
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
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  const read = async (p) => parseJsonStrict(await readFile(p, "utf8"));
  if (command === "fingerprint")
    console.log(
      apiSourceFingerprint(args[0] ?? process.cwd(), args[1] ?? "HEAD"),
    );
  else if (command === "classify") {
    const state = await read(args[0]);
    if (!state.manifest?.artifacts?.releasePolicy) console.log("normal");
    else {
      const policy = await read(args[1]);
      if (
        !validGatewayPolicy(policy, state) ||
        !validVerifiedState(state.previousState) ||
        state.attestation?.status !== "verified" ||
        !validServices(state.previousState.runtimeServices, state.manifest)
      )
        throw new Error("incident-required: invalid gateway release policy");
      console.log("gateway-only");
    }
  } else if (command === "precheck") {
    const state = await read(args[0]),
      services = await read(args[1]),
      database = await read(args[2]);
    if (
      !same(services, state.previousState?.runtimeServices) ||
      !unchangedDatabase(database, state.previousState?.database)
    )
      throw new Error(
        "incident-required: gateway previous runtime/database changed",
      );
  } else if (command === "runtime-mode") {
    const state = await read(args[0]);
    console.log(
      state.dataOperations === "gateway-only" ||
        state.operationClass === "gateway-only"
        ? "read-only-history"
        : "with-api-status",
    );
  } else if (command === "receipt") {
    const [statePath, policyPath, beforePath, afterPath, now] = args;
    const state = await read(statePath);
    const evidence = gatewayReceipt({
      state,
      policy: await read(policyPath),
      before: await read(beforePath),
      after: await read(afterPath),
      recordedAt: now,
    });
    console.log(
      JSON.stringify({
        ...state,
        dataOperations: "gateway-only",
        dataOperationEvidence: evidence,
      }),
    );
  } else throw new Error("invalid gateway policy command");
}
