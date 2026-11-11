export const sha = "a".repeat(40),
  old = "b".repeat(40);
const d = (n) => "sha256:" + String(n).repeat(64);
const snapshot = () => ({
  known: true,
  schemaFingerprint: d(1),
  migrationFingerprint: d(2),
  pending: false,
  failed: false,
  postgresContainerId: "c".repeat(64),
  postgresImage: "postgres@" + d(3),
  postgresImageId: d(4),
});
const manifest = (releaseSha) => ({
  schemaVersion: "1",
  releaseSha,
  sourceRepository: "owner/repo",
  createdAt: "2026-11-12T01:00:00Z",
  apiImage: "ghcr.io/owner/api@" + d(releaseSha === sha ? 5 : 6),
  webImage: "ghcr.io/owner/web@" + d(releaseSha === sha ? 7 : 8),
  postgresImage: "postgres@" + d(3),
  artifacts: {
    sbom: { sha256: "9".repeat(64), size: 1 },
    provenance: { sha256: "0".repeat(64), size: 2 },
  },
});
const ownership = () => ({
  runId: "41",
  runAttempt: "1",
  artifactId: "42",
  artifactDigest: d(9),
  controlSha: old,
});
const attestation = { mode: "required", status: "verified" };
export function fixture() {
  const previousState = {
    schemaVersion: 2,
    status: "verified",
    releaseSha: old,
    operationId: "old-op",
    verifiedAt: "2026-11-12T01:00:00Z",
    manifest: manifest(old),
    ownership: ownership(),
    attestation,
    database: snapshot(),
  };
  const state = {
    schemaVersion: 2,
    status: "deploying",
    operationId: "new-op",
    releaseSha: sha,
    manifest: manifest(sha),
    ownership: ownership(),
    previousState,
    applicationAttempted: true,
    applicationStartedAt: "2026-11-12T02:00:00Z",
    dataOperations: "migration-only",
    migrationOutcome: "succeeded",
    before: snapshot(),
    after: snapshot(),
    preReleaseBackupId: "backup-before",
  };
  return {
    state,
    expectedOperationId: "new-op",
    expectedSha: sha,
    repository: "owner/repo",
    runtime: {
      apiImage: state.manifest.apiImage,
      webImage: state.manifest.webImage,
      imageIdsMatch: true,
      database: snapshot(),
    },
    backup: {
      schemaVersion: "1",
      kind: "BACKUP",
      backupId: "backup-recovery",
      releaseSha: sha,
      createdAt: "2026-11-12T02:05:00Z",
      retentionUntil: "2026-12-12T02:05:00Z",
      dumpSha256: "7".repeat(64),
      size: 4096,
      restoreVerified: true,
      storageLocation: "github-actions-artifact:mkw-backup",
      databaseIdentity: {
        host: "fixture",
        name: "mkw",
        engine: "postgresql",
        targetIdentity: "fixture//home/deploy/mkw/mkw",
      },
    },
    backupPolicy: {
      maxAgeSeconds: 3600,
      expectedTargetHost: "fixture",
      expectedDatabase: "mkw",
      expectedTargetIdentity: "fixture//home/deploy/mkw/mkw",
    },
    trustedManifest: manifest(old),
    artifactsVerified: true,
    attestation,
    now: "2026-11-12T02:06:00Z",
  };
}
