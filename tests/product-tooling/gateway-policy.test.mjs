import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fixture } from "./fixtures/auto-rollback.mjs";
import {
  gatewayReceipt,
  validGatewayEvidence,
} from "../../scripts/product/release/gateway-policy.mjs";
import { promoteOperation } from "../../scripts/product/release/operation-state.mjs";
import { validVerifiedState } from "../../scripts/product/release/verified-state.mjs";
import { decideAutomaticRollback } from "../../scripts/product/release/auto-rollback.mjs";

import { sample } from "./fixtures/gateway-operation.mjs";

test("gateway promotion rejects every missing or confused producer obligation", () => {
  const mutations = [
    (state) => delete state.dataOperationEvidence,
    (state) => (state.dataOperations = "unknown"),
    (state) => (state.migrationOutcome = "unknown"),
    (state) => delete state.operationClass,
    (state) => (state.operationClass = "normal"),
    (state) => (state.gatewayPolicy.apiImage = "forged"),
    (state) => (state.manifest.artifacts.releasePolicy.sha256 = "f".repeat(64)),
    (state) => (state.runtimeServices.api.restartCount = 1),
    (state) =>
      (state.dataOperationEvidence.after.db.containerId = "e".repeat(64)),
  ];
  for (const [index, mutate] of mutations.entries()) {
    const { f, runtime } = sample();
    const state = structuredClone(f.state);
    mutate(state);
    assert.throws(
      () =>
        promoteOperation(state, {
          operationId: state.operationId,
          releaseSha: state.releaseSha,
          database: state.after,
          verifiedAt: "2026-11-12T02:02:00Z",
          runtimeServices: runtime,
        }),
      /incident-required/,
      `mutation ${index}`,
    );
    assert.equal(validVerifiedState({ ...state, status: "verified" }), false);
  }
});

test("healthy gateway promotion requires receipt.after to equal promoted runtime services", () => {
  const { f, runtime } = sample();
  const changed = structuredClone(runtime);
  changed.api.containerId = "b".repeat(64);
  assert.throws(
    () =>
      promoteOperation(f.state, {
        operationId: f.expectedOperationId,
        releaseSha: f.state.releaseSha,
        database: f.state.after,
        verifiedAt: "2026-11-12T02:02:00Z",
        runtimeServices: changed,
      }),
    /incident-required/,
  );
  const promoted = promoteOperation(f.state, {
    operationId: f.expectedOperationId,
    releaseSha: f.state.releaseSha,
    database: f.state.after,
    verifiedAt: "2026-11-12T02:02:00Z",
    runtimeServices: runtime,
  });
  assert.equal(validVerifiedState(promoted), true);
});

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
