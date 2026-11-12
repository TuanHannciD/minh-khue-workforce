import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fixture } from "./fixtures/auto-rollback.mjs";
import {
  buildPolicy,
  bindPolicy,
  gatewayReceipt,
  validGatewayEvidence,
} from "../../scripts/product/release/gateway-policy.mjs";
import { beginOperation } from "../../scripts/product/release/operation-state.mjs";
import { decideAutomaticRollback } from "../../scripts/product/release/auto-rollback.mjs";

const hash = "sha256:" + "1".repeat(64);
function sample() {
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

test("real build policy and runtime producer allow bounded gateway recovery", () => {
  const { f } = sample();
  assert.equal(
    validGatewayEvidence(f.state.dataOperationEvidence, f.state),
    true,
  );
  assert.equal(
    decideAutomaticRollback(f).action,
    "rollback",
    JSON.stringify(decideAutomaticRollback(f)),
  );
  assert.equal(
    f.state.dataOperationEvidence.businessDataWrites,
    "not-assessed",
  );
});

test("production classification CLI executes normal and eligible branches without import deadlock", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mkw-classify-"));
  try {
    const { f, policy } = sample();
    const statePath = join(dir, "state.json"),
      policyPath = join(dir, "policy.json");
    await writeFile(policyPath, JSON.stringify(policy));
    for (const [state, expected] of [
      [fixture().state, "normal"],
      [f.state, "gateway-only"],
    ]) {
      await writeFile(statePath, JSON.stringify(state));
      const result = spawnSync(
        process.execPath,
        [
          "scripts/product/release/gateway-policy.mjs",
          "classify",
          statePath,
          policyPath,
        ],
        { encoding: "utf8", timeout: 10000, windowsHide: true },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), expected);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("gateway evidence refuses missing, forged, stale, extra or restarted runtime before recovery", () => {
  const mutations = [
    (x) => {
      delete x.state.dataOperationEvidence;
    },
    (x) => {
      x.state.dataOperationEvidence.policy.apiSourceFingerprint =
        "sha256:" + "2".repeat(64);
    },
    (x) => {
      x.state.dataOperationEvidence.operationId = "interleaved";
    },
    (x) => {
      x.state.dataOperationEvidence.recordedAt = "2026-11-12T01:59:00Z";
    },
    (x) => {
      x.state.dataOperationEvidence.after.api.restartCount = 1;
    },
    (x) => {
      x.state.dataOperationEvidence.after.db.containerId = "e".repeat(64);
    },
    (x) => {
      x.state.dataOperationEvidence.commands.push("api-start");
    },
    (x) => {
      x.state.dataOperationEvidence.unverifiedSideEffects = false;
    },
    (x) => {
      x.currentReleaseProof.dataOperationEvidence.apiImage = "forged";
    },
    (x) => {
      x.runtime.services.api.startedAt = "2026-11-12T02:02:00Z";
    },
    (x) => {
      x.state.after.known = false;
    },
    (x) => {
      x.state.after.schemaFingerprint = "sha256:" + "f".repeat(64);
    },
  ];
  for (const mutate of mutations) {
    const { f } = sample();
    const input = structuredClone(f);
    mutate(input);
    assert.equal(decideAutomaticRollback(input).action, "incident-required");
  }
});

test("producer rejects API/PG changes or missing verified previous state", () => {
  const { f, policy, runtime } = sample();
  for (const change of [
    (s) => {
      s.manifest.apiImage = "ghcr.io/owner/api@sha256:" + "e".repeat(64);
    },
    (s) => {
      s.previousState = null;
    },
    (s) => {
      s.ownership.runAttempt = "9";
    },
  ]) {
    const state = structuredClone(f.state);
    change(state);
    assert.throws(() =>
      gatewayReceipt({
        state,
        policy,
        before: runtime,
        after: runtime,
        recordedAt: f.now,
      }),
    );
  }
});
