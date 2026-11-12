import { fixture } from "./auto-rollback.mjs";
import {
  buildPolicy,
  bindPolicy,
  gatewayReceipt,
} from "../../../scripts/product/release/gateway-policy.mjs";
import { beginOperation } from "../../../scripts/product/release/operation-state.mjs";

const hash = "sha256:" + "1".repeat(64);
export function sample() {
  const f = fixture();
  f.state.previousState.manifest.buildInputs = {
    apiSourceFingerprint: hash,
    apiSourceSha: f.state.previousState.releaseSha,
  };
  f.trustedManifest = structuredClone(f.state.previousState.manifest);
  f.state.manifest.apiImage = f.state.previousState.manifest.apiImage;
  f.state.manifest.buildInputs = {
    ...f.state.previousState.manifest.buildInputs,
  };
  const policy = buildPolicy({
    manifest: f.state.manifest,
    operationId: f.expectedOperationId,
    apiSourceFingerprint: hash,
    apiSourceSha: f.state.previousState.releaseSha,
    previous: f.state.previousState,
  });
  f.state.manifest = bindPolicy(f.state.manifest, policy);
  const service = {
    containerId: "a".repeat(64),
    image: f.state.manifest.apiImage,
    imageId: hash,
    startedAt: "2026-11-12T01:00:00.000Z",
    restartCount: 0,
  };
  const runtime = {
    api: service,
    db: {
      ...service,
      containerId: "c".repeat(64),
      image: f.state.manifest.postgresImage,
    },
  };
  f.state.previousState.runtimeServices = structuredClone(runtime);
  const state = beginOperation({
    manifest: f.state.manifest,
    previousState: f.state.previousState,
    operationId: f.expectedOperationId,
    ownership: f.state.ownership,
    attestation: f.attestation,
    backup: { ...f.backup, backupId: "pre-release" },
  });
  Object.assign(state, {
    before: f.state.before,
    after: f.state.after,
    migrationOutcome: "not-executed",
    applicationAttempted: true,
    applicationStartedAt: "2026-11-12T02:00:00Z",
  });
  state.dataOperationEvidence = gatewayReceipt({
    state,
    policy,
    before: runtime,
    after: runtime,
    recordedAt: "2026-11-12T02:01:00Z",
  });
  state.dataOperations = "gateway-only";
  state.gatewayPolicy = structuredClone(policy);
  state.runtimeServices = structuredClone(runtime);
  state.operationClass = "gateway-only";
  f.state = state;
  f.runtime.services = runtime;
  f.runtime.apiImage = state.manifest.apiImage;
  f.currentReleaseProof = {
    ownership: state.ownership,
    manifest: state.manifest,
    dataOperationEvidence: policy,
  };
  return { f, policy, runtime };
}
