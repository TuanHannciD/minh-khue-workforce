import test from "node:test";
import assert from "node:assert/strict";
import {
  decideAutomaticRollback,
  buildRollbackEvidence,
  rollbackPrecheck,
} from "../../scripts/product/release/auto-rollback.mjs";
import { fixture, sha } from "./fixtures/auto-rollback.mjs";
const d = (n) => "sha256:" + String(n).repeat(64);

test("healthy unchanged DB allows application recovery and keeps failed pipeline", () => {
  const input = fixture();
  assert.equal(rollbackPrecheck(input).action, "eligible");
  const decision = decideAutomaticRollback(input);
  assert.equal(decision.action, "rollback");
  assert.equal(decision.scope, "application-only");
  const receipt = buildRollbackEvidence({
    decision,
    attempted: true,
    verification: "passed",
    operationId: "new-op",
    releaseSha: sha,
  });
  assert.equal(receipt.result, "recovered-by-app-rollback");
  assert.equal(receipt.pipelineStatus, "failed");
  assert.equal(receipt.databaseMutation, false);
});
for (const [label, mutate] of [
  ["changed schema", (f) => (f.state.after.schemaFingerprint = d(9))],
  [
    "changed migration history",
    (f) => (f.state.after.migrationFingerprint = d(9)),
  ],
  ["failed migration", (f) => (f.state.migrationOutcome = "started")],
  ["unknown DB", (f) => (f.state.after = { known: false })],
  [
    "unknown schema equality",
    (f) => {
      delete f.state.before.schemaFingerprint;
      delete f.state.after.schemaFingerprint;
    },
  ],
  ["pending migration", (f) => (f.state.before.pending = true)],
  ["failed DB migration record", (f) => (f.state.after.failed = true)],
  ["separate data operation", (f) => (f.state.dataOperations = "unknown")],
  ["missing previous state", (f) => (f.state.previousState = null)],
  ["missing artifact", (f) => (f.artifactsVerified = false)],
  [
    "forged old manifest",
    (f) => (f.trustedManifest.apiImage = "ghcr.io/other/api@" + d(2)),
  ],
  [
    "unknown old ownership",
    (f) => delete f.state.previousState.ownership.artifactDigest,
  ],
  [
    "required attestation missing",
    (f) => (f.attestation = { mode: "required", status: "not-verified" }),
  ],
  [
    "PG mismatch",
    (f) => (f.runtime.database.postgresImage = "postgres@" + d(9)),
  ],
  [
    "PG replacement same digest",
    (f) => (f.runtime.database.postgresContainerId = "d".repeat(64)),
  ],
  ["interleaving release", (f) => (f.state.operationId = "other-op")],
  ["wrong runtime", (f) => (f.runtime.apiImage = "ghcr.io/other/api@" + d(9))],
  ["missing backup", (f) => (f.backup = null)],
  ["pre-release snapshot", (f) => (f.backup.backupId = "backup-before")],
  ["old snapshot", (f) => (f.backup.createdAt = "2026-11-12T01:59:59Z")],
  ["stale snapshot", (f) => (f.now = "2026-11-12T04:00:00Z")],
  ["future snapshot", (f) => (f.backup.createdAt = "2026-11-12T03:00:00Z")],
  ["expired retention", (f) => (f.backup.retentionUntil = f.now)],
  [
    "wrong target project",
    (f) => (f.backup.databaseIdentity.targetIdentity = "other-target"),
  ],
  ["wrong host", (f) => (f.backup.databaseIdentity.host = "other-host")],
  ["unverified restore", (f) => (f.backup.restoreVerified = false)],
  ["second attempt", (f) => (f.state.rollbackAttempted = true)],
])
  test(`incident required for ${label}`, () => {
    const input = fixture();
    mutate(input);
    assert.equal(decideAutomaticRollback(input).action, "incident-required");
  });
test("receipt uses fixed secret-free reason, failure remains non-success", () => {
  const receipt = buildRollbackEvidence({
    decision: { action: "rollback" },
    attempted: true,
    verification: "failed",
    operationId: "$(bad)secret",
    releaseSha: "token",
  });
  assert.equal(receipt.result, "incident-required");
  assert.equal(receipt.pipelineStatus, "failed");
  assert.doesNotMatch(JSON.stringify(receipt), /token|password|secret|\$\(/);
});
