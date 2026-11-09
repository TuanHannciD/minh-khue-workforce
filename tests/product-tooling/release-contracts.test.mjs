import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import { validateManifest } from '../../scripts/product/release/validate-manifest.mjs';
import { validateBackupReady } from '../../scripts/product/release/validate-backup-ready.mjs';
import { verifyRelease } from '../../scripts/product/release/verify-release.mjs';
import { createBackupReady } from '../../scripts/product/operations/create-backup-ready.mjs';
import { verifyRestore } from '../../scripts/product/operations/verify-restore.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SHA = 'a'.repeat(40);
const API = 'ghcr.io/minh-khue/api@sha256:' + '1'.repeat(64);
const WEB = 'ghcr.io/minh-khue/web@sha256:' + '2'.repeat(64);
const PG = 'postgres@sha256:' + '3'.repeat(64);

function manifest(overrides = {}) {
  return {
    schemaVersion: '1',
    releaseSha: SHA,
    sourceRepository: 'minh-khue/workforce',
    createdAt: '2026-11-09T10:00:00Z',
    apiImage: API,
    webImage: WEB,
    postgresImage: PG,
    artifacts: {
      sbom: { sha256: '4'.repeat(64), size: 120 },
      provenance: { sha256: '5'.repeat(64), size: 220 },
    },
    ...overrides,
  };
}

function backup(overrides = {}) {
  return {
    schemaVersion: '1',
    kind: 'BACKUP',
    backupId: 'backup-20261109-100000',
    releaseSha: SHA,
    createdAt: '2026-11-09T10:00:00Z',
    dumpSha256: '6'.repeat(64),
    size: 4096,
    restoreVerified: true,
    retentionUntil: '2026-12-09T10:00:00Z',
    storageLocation: 's3://configured-backup-bucket/mkw/backup-20261109.dump.enc',
    databaseIdentity: { host: 'production-db', name: 'mkw', engine: 'postgresql' },
    ...overrides,
  };
}

test('accepts a complete immutable release manifest', () => {
  assert.deepEqual(validateManifest(manifest()), { ok: true, errors: [] });
});

test('rejects mutable image tags, wrong SHA, and unknown fields', () => {
  const result = validateManifest(manifest({ releaseSha: 'bad', apiImage: 'ghcr.io/minh-khue/api:latest', extra: true }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /releaseSha|apiImage|unknown|extra/i);
});

test('rejects backup manifests with invalid kind-specific invariants or secret-like location', () => {
  const unverified = validateBackupReady(backup({ restoreVerified: false }));
  assert.equal(unverified.ok, false);
  assert.match(unverified.errors.join('\n'), /restoreVerified/i);
  const secret = validateBackupReady(backup({ storageLocation: 'postgres://user:password@example/db?token=secret' }));
  assert.equal(secret.ok, false);
  assert.match(secret.errors.join('\n'), /storageLocation|secret/i);
});

test('rejects backup identity fields that violate the strict nested contract', () => {
  const result = validateBackupReady(backup({
    databaseIdentity: { host: '', name: '', engine: 'postgresql', extra: true },
  }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /databaseIdentity/i);
});

test('accepts initial empty deployment only with identity and empty evidence', () => {
  const initial = backup({
    kind: 'INITIAL_EMPTY_DEPLOYMENT',
    restoreVerified: false,
    databaseVerifiedEmpty: true,
    emptyEvidence: { targetIdentity: 'prod-vps-1', databaseIdentity: 'mkw', checkedAt: '2026-11-09T10:00:00Z' },
  });
  delete initial.dumpSha256;
  delete initial.size;
  const result = validateBackupReady(initial);
  assert.equal(result.ok, true, result.errors.join('; '));
});

test('rejects initial empty evidence with unknown fields or invalid timestamp', () => {
  const initial = backup({
    kind: 'INITIAL_EMPTY_DEPLOYMENT',
    restoreVerified: false,
    databaseVerifiedEmpty: true,
    emptyEvidence: { targetIdentity: '', databaseIdentity: '', checkedAt: '2026-99-99T99:99:99Z', extra: true },
  });
  delete initial.dumpSha256;
  delete initial.size;
  const result = validateBackupReady(initial);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /emptyEvidence/i);
});

test('verifies exact release SHA and image digests in rendered compose', () => {
  const ok = verifyRelease({
    manifest: manifest(),
    expectedSha: SHA,
    composeText: `services:\n  api:\n    image: ${API}\n  web:\n    image: ${WEB}\n  db:\n    image: ${PG}\n`,
  });
  assert.deepEqual(ok, { ok: true, errors: [] });
  const bad = verifyRelease({ manifest: manifest(), expectedSha: 'b'.repeat(40), composeText: 'image: ghcr.io/minh-khue/api:latest' });
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join('\n'), /SHA|digest|mutable/i);
});

test('creates backup-ready atomically only after validation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mkw-contract-'));
  try {
    const output = join(dir, 'backup-ready.json');
    const value = await createBackupReady({ ...backup(), outputPath: output });
    assert.equal(value.kind, 'BACKUP');
    assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), value);
    await assert.rejects(() => createBackupReady({ ...backup({ restoreVerified: false }), outputPath: output }), /restoreVerified/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('restore verification requires identity, schema, migrations, counts, relations, and required data', () => {
  const verified = verifyRestore({
    targetIdentity: 'temporary-restore-db',
    schema: { expected: '1', actual: '1' },
    migrations: { expected: '20261109100000_init', actual: '20261109100000_init' },
    counts: { employees: 2, attendance: 4 },
    relations: { valid: true },
    requiredData: { valid: true },
  });
  assert.equal(verified.verified, true);
  const failed = verifyRestore({ targetIdentity: 'temporary-restore-db', schema: { expected: '1', actual: '0' } });
  assert.equal(failed.verified, false);
  assert.ok(failed.checks.some((check) => check.name === 'schema' && check.ok === false));
});

test('CLI rejects duplicate object fields instead of silently accepting JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mkw-cli-'));
  try {
    const path = join(dir, 'duplicate.json');
    await writeFile(path, `{"schemaVersion":"1","schemaVersion":"1","releaseSha":"${SHA}"}`);
    const result = await new Promise((resolve) => {
      const child = spawn(process.execPath, ['scripts/product/release/validate-manifest.mjs', path], { cwd: ROOT });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('close', (code) => resolve({ code, stderr }));
    });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /duplicate/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
