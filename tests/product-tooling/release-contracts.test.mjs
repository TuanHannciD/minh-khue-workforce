import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { validateManifest } from "../../scripts/product/release/validate-manifest.mjs";
import { validateBackupReady } from "../../scripts/product/release/validate-backup-ready.mjs";
import { verifyRelease } from "../../scripts/product/release/verify-release.mjs";
import { createBackupReady } from "../../scripts/product/operations/create-backup-ready.mjs";
import { verifyRestore } from "../../scripts/product/operations/verify-restore.mjs";
import { validateBackupReadyFreshness } from "../../scripts/product/release/orchestration-policy.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const BACKUP_SCHEMA = JSON.parse(
  await readFile(join(ROOT, "deploy/backup-ready.schema.json"), "utf8"),
);
const SHA = "a".repeat(40);
const API = "ghcr.io/minh-khue/api@sha256:" + "1".repeat(64);
const WEB = "ghcr.io/minh-khue/web@sha256:" + "2".repeat(64);
const PG = "postgres@sha256:" + "3".repeat(64);
const BACKUP_POLICY = {
  expectedReleaseSha: SHA,
  now: "2026-11-09T12:00:00Z",
  maxAgeSeconds: 86400,
};

function manifest(overrides = {}) {
  return {
    schemaVersion: "1",
    releaseSha: SHA,
    sourceRepository: "minh-khue/workforce",
    createdAt: "2026-11-09T10:00:00Z",
    apiImage: API,
    webImage: WEB,
    postgresImage: PG,
    artifacts: {
      sbom: { sha256: "4".repeat(64), size: 120 },
      provenance: { sha256: "5".repeat(64), size: 220 },
    },
    ...overrides,
  };
}

function backup(overrides = {}) {
  return {
    schemaVersion: "1",
    kind: "BACKUP",
    backupId: "backup-20261109-100000",
    releaseSha: SHA,
    createdAt: "2026-11-09T10:00:00Z",
    dumpSha256: "6".repeat(64),
    size: 4096,
    restoreVerified: true,
    retentionUntil: "2026-12-09T10:00:00Z",
    storageLocation:
      "s3://configured-backup-bucket/mkw/backup-20261109.dump.enc",
    databaseIdentity: {
      host: "production-db",
      name: "mkw",
      engine: "postgresql",
    },
    ...overrides,
  };
}

function runBackupCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/product/release/validate-backup-ready.mjs", ...args],
      { cwd: ROOT },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

test("accepts a complete immutable release manifest", () => {
  assert.deepEqual(validateManifest(manifest()), { ok: true, errors: [] });
});

test("rejects mutable image tags, wrong SHA, and unknown fields", () => {
  const result = validateManifest(
    manifest({
      releaseSha: "bad",
      apiImage: "ghcr.io/minh-khue/api:latest",
      extra: true,
    }),
  );
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /releaseSha|apiImage|unknown|extra/i);
});

test("rejects backup manifests with invalid kind-specific invariants or secret-like location", () => {
  const unverified = validateBackupReady(backup({ restoreVerified: false }));
  assert.equal(unverified.ok, false);
  assert.match(unverified.errors.join("\n"), /restoreVerified/i);
  const secret = validateBackupReady(
    backup({
      storageLocation: "postgres://user:password@example/db?token=secret",
    }),
  );
  assert.equal(secret.ok, false);
  assert.match(secret.errors.join("\n"), /storageLocation|secret/i);
});

test("rejects backup identity fields that violate the strict nested contract", () => {
  const result = validateBackupReady(
    backup({
      databaseIdentity: {
        host: "",
        name: "",
        engine: "postgresql",
        extra: true,
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /databaseIdentity/i);
});

test("rejects backup metadata linked to a different release SHA", () => {
  const result = validateBackupReady(backup({ releaseSha: "b".repeat(40) }), {
    expectedReleaseSha: SHA,
    now: "2026-11-09T12:00:00Z",
    maxAgeSeconds: 86400,
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /releaseSha.*expected/i);
});
for (const targetIdentity of [
  undefined,
  "production-db//home/deploy/other/other",
])
  test(`BACKUP target binding rejects ${targetIdentity ?? "missing identity"} in shared and coordinator gates`, () => {
    const value = backup();
    if (targetIdentity === undefined)
      delete value.databaseIdentity.targetIdentity;
    else value.databaseIdentity.targetIdentity = targetIdentity;
    const policy = {
      expectedTargetHost: "production-db",
      expectedDatabase: "mkw",
      expectedTargetIdentity: "production-db//home/deploy/mkw/mkw",
    };
    for (const result of [
      validateBackupReady(value, { ...BACKUP_POLICY, ...policy }),
      validateBackupReadyFreshness(value, {
        ...policy,
        expectedSha: SHA,
        expectedKind: "BACKUP",
        now: Date.parse(BACKUP_POLICY.now),
      }),
    ]) {
      assert.equal(result.ok, false);
      assert.match(result.errors.join("\n"), /targetIdentity.*expected target/);
    }
    value.databaseIdentity.targetIdentity = policy.expectedTargetIdentity;
    assert.equal(
      validateBackupReady(value, { ...BACKUP_POLICY, ...policy }).ok,
      true,
    );
  });

test("rejects backup metadata with a future creation timestamp", () => {
  const result = validateBackupReady(
    backup({ createdAt: "2026-11-09T13:00:00Z" }),
    {
      expectedReleaseSha: SHA,
      now: "2026-11-09T12:00:00Z",
      maxAgeSeconds: 86400,
    },
  );
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /createdAt.*future/i);
});

test("rejects backup metadata whose retention has expired", () => {
  const result = validateBackupReady(
    backup({ retentionUntil: "2026-11-09T11:59:59Z" }),
    {
      expectedReleaseSha: SHA,
      now: "2026-11-09T12:00:00Z",
      maxAgeSeconds: 86400,
    },
  );
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /retentionUntil.*expired/i);
});

test("rejects backup metadata older than the configured freshness window", () => {
  const result = validateBackupReady(backup(), {
    expectedReleaseSha: SHA,
    now: "2026-11-10T12:00:01Z",
    maxAgeSeconds: 86400,
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /createdAt.*maximum age/i);
});

test("backup freshness includes the exact age boundary but excludes expired retention", () => {
  const policy = { ...BACKUP_POLICY, now: "2026-11-10T10:00:00Z" };
  assert.equal(validateBackupReady(backup(), policy).ok, true);
  const expired = validateBackupReady(
    backup({ retentionUntil: "2026-11-10T10:00:00Z" }),
    policy,
  );
  assert.equal(expired.ok, false);
  assert.match(expired.errors.join("\n"), /retentionUntil.*expired/i);
});

test("rejects invalid freshness policy instead of bypassing time checks", () => {
  for (const maxAgeSeconds of [
    -1,
    NaN,
    Infinity,
    1.5,
    "86400",
    9007199254740992,
  ]) {
    const result = validateBackupReady(backup(), {
      ...BACKUP_POLICY,
      maxAgeSeconds,
    });
    assert.equal(result.ok, false, String(maxAgeSeconds));
    assert.match(result.errors.join("\n"), /maximum age/i);
  }
  for (const now of ["bad", "2026-11-09T12:00:00+00:00", undefined]) {
    const result = validateBackupReady(backup(), { ...BACKUP_POLICY, now });
    assert.equal(result.ok, false, String(now));
    assert.match(result.errors.join("\n"), /validation time/i);
  }
  const invalidSha = validateBackupReady(backup(), {
    ...BACKUP_POLICY,
    expectedReleaseSha: "invalid-sha",
  });
  assert.equal(invalidSha.ok, false);
  assert.match(invalidSha.errors.join("\n"), /expected release SHA/i);
});

test("rejects normalized calendar dates", () => {
  for (const field of ["createdAt", "retentionUntil"]) {
    const result = validateBackupReady(
      backup({ [field]: "2026-02-30T10:00:00Z" }),
      BACKUP_POLICY,
    );
    assert.equal(result.ok, false);
    assert.match(
      result.errors.join("\n"),
      new RegExp(`${field}.*UTC timestamp`),
    );
  }
});

test("CLI enforces backup release linkage and the supplied freshness policy", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mkw-backup-cli-"));
  try {
    const path = join(dir, "backup-ready.json");
    const policy = [
      "--expected-release-sha",
      SHA,
      "--max-age-seconds",
      "86400",
      "--now",
      "2026-11-09T12:00:00Z",
    ];
    for (const [overrides, expectedCode] of [
      [{}, 0],
      [{ releaseSha: "b".repeat(40) }, 1],
      [{ createdAt: "2026-11-09T13:00:00Z" }, 1],
      [{ createdAt: "2026-11-08T10:00:00Z" }, 1],
      [{ retentionUntil: "2026-11-09T12:00:00Z" }, 1],
    ]) {
      await writeFile(path, JSON.stringify(backup(overrides)));
      const result = await runBackupCli([path, ...policy]);
      assert.equal(result.code, expectedCode, result.stderr);
    }
    await writeFile(
      path,
      JSON.stringify(
        backup({
          createdAt: "2000-01-01T00:00:00Z",
          retentionUntil: "2999-01-01T00:00:00Z",
        }),
      ),
    );
    assert.equal((await runBackupCli([path])).code, 0);
    for (const args of [
      ["--expected-release-sha"],
      ["--max-age-seconds"],
      ["--max-age-seconds", ""],
      ["--max-age-seconds", "1e9"],
      ["--max-age-seconds", "9007199254740992"],
      ["--max-age-seconds", "86400", "--max-age-seconds", "99999999"],
      ["--max-age-second", "86400"],
    ]) {
      const result = await runBackupCli([path, ...args]);
      assert.notEqual(result.code, 0, JSON.stringify(args));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("backup CLI errors do not echo malformed JSON or unknown secret-like fields", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mkw-backup-errors-"));
  try {
    const path = join(dir, "backup-ready.json");
    const marker = "fixture-sensitive-value";
    for (const content of [
      '{"broken":' + marker,
      JSON.stringify(backup({ extraMetadata: marker })),
      '{"' + marker + '":1,"' + marker + '":2}',
    ]) {
      await writeFile(path, content);
      const result = await runBackupCli([path]);
      assert.notEqual(result.code, 0);
      assert.doesNotMatch(result.stderr, new RegExp(marker));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("accepts initial empty deployment only with identity and empty evidence", () => {
  const initial = backup({
    kind: "INITIAL_EMPTY_DEPLOYMENT",
    restoreVerified: false,
    databaseVerifiedEmpty: true,
    emptyEvidence: {
      targetIdentity: "prod-vps-1",
      databaseIdentity: "mkw",
      checkedAt: "2026-11-09T10:00:00Z",
    },
  });
  delete initial.dumpSha256;
  delete initial.size;
  const result = validateBackupReady(initial);
  assert.equal(result.ok, true, result.errors.join("; "));
});

test("accepts a fresh initial empty deployment with release and freshness checks", () => {
  const initial = backup({
    kind: "INITIAL_EMPTY_DEPLOYMENT",
    restoreVerified: false,
    databaseVerifiedEmpty: true,
    emptyEvidence: {
      targetIdentity: "prod-vps-1",
      databaseIdentity: "mkw",
      checkedAt: "2026-11-09T10:00:00Z",
    },
    createdAt: "2026-11-09T10:00:00Z",
    retentionUntil: "2026-12-09T10:00:00Z",
  });
  delete initial.dumpSha256;
  delete initial.size;
  const result = validateBackupReady(initial, {
    expectedReleaseSha: SHA,
    now: "2026-11-09T12:00:00Z",
    maxAgeSeconds: 86400,
  });
  assert.equal(result.ok, true, result.errors.join("; "));
});

test("initial-empty freshness covers the empty evidence timestamp", () => {
  for (const checkedAt of ["2026-11-09T13:00:00Z", "2026-11-08T10:00:00Z"]) {
    const initial = backup({
      kind: "INITIAL_EMPTY_DEPLOYMENT",
      restoreVerified: false,
      databaseVerifiedEmpty: true,
      emptyEvidence: {
        targetIdentity: "prod-vps-1",
        databaseIdentity: "mkw",
        checkedAt,
      },
    });
    delete initial.dumpSha256;
    delete initial.size;
    const result = validateBackupReady(initial, BACKUP_POLICY);
    assert.equal(result.ok, false, checkedAt);
    assert.match(result.errors.join("\n"), /emptyEvidence\.checkedAt/);
  }
});

test("rejects initial empty evidence with unknown fields or invalid timestamp", () => {
  const initial = backup({
    kind: "INITIAL_EMPTY_DEPLOYMENT",
    restoreVerified: false,
    databaseVerifiedEmpty: true,
    emptyEvidence: {
      targetIdentity: "",
      databaseIdentity: "",
      checkedAt: "2026-99-99T99:99:99Z",
      extra: true,
    },
  });
  delete initial.dumpSha256;
  delete initial.size;
  const result = validateBackupReady(initial);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /emptyEvidence/i);
});

test("backup schema declares kind-specific conditional invariants", () => {
  assert.ok(Array.isArray(BACKUP_SCHEMA.allOf));
  const backupRule = BACKUP_SCHEMA.allOf.find(
    (rule) => rule.if?.properties?.kind?.const === "BACKUP",
  );
  const initialRule = BACKUP_SCHEMA.allOf.find(
    (rule) => rule.if?.properties?.kind?.const === "INITIAL_EMPTY_DEPLOYMENT",
  );
  assert.deepEqual(backupRule.then.required.sort(), [
    "databaseIdentity",
    "dumpSha256",
    "size",
  ]);
  assert.equal(backupRule.then.properties.restoreVerified.const, true);
  assert.deepEqual(initialRule.then.required.sort(), [
    "databaseVerifiedEmpty",
    "emptyEvidence",
  ]);
  assert.equal(initialRule.then.properties.restoreVerified.const, false);
  assert.deepEqual(
    initialRule.then.not.anyOf.map((entry) => entry.required[0]).sort(),
    ["dumpSha256", "size"],
  );
});

test("verifies exact release SHA and image digests in rendered compose", () => {
  const ok = verifyRelease({
    manifest: manifest(),
    expectedSha: SHA,
    composeText: `services:\n  api:\n    image: ${API}\n  web:\n    image: ${WEB}\n  db:\n    image: ${PG}\n`,
  });
  assert.deepEqual(ok, { ok: true, errors: [] });
  const bad = verifyRelease({
    manifest: manifest(),
    expectedSha: "b".repeat(40),
    composeText: "image: ghcr.io/minh-khue/api:latest",
  });
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join("\n"), /SHA|digest|mutable/i);
});

test("creates backup-ready atomically only after validation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mkw-contract-"));
  try {
    const output = join(dir, "backup-ready.json");
    const value = await createBackupReady({ ...backup(), outputPath: output });
    assert.equal(value.kind, "BACKUP");
    assert.deepEqual(JSON.parse(await readFile(output, "utf8")), value);
    await assert.rejects(
      () =>
        createBackupReady({
          ...backup({ restoreVerified: false }),
          outputPath: output,
        }),
      /restoreVerified/i,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("restore verification requires identity, schema, migrations, counts, relations, and required data", () => {
  const verified = verifyRestore({
    targetIdentity: "temporary-restore-db",
    schema: { expected: "1", actual: "1" },
    migrations: {
      expected: "20261109100000_init",
      actual: "20261109100000_init",
    },
    counts: { employees: 2, attendance: 4 },
    relations: { valid: true },
    requiredData: { valid: true },
  });
  assert.equal(verified.verified, true);
  const failed = verifyRestore({
    targetIdentity: "temporary-restore-db",
    schema: { expected: "1", actual: "0" },
  });
  assert.equal(failed.verified, false);
  assert.ok(
    failed.checks.some(
      (check) => check.name === "schema" && check.ok === false,
    ),
  );
});

test("CLI rejects duplicate object fields instead of silently accepting JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mkw-cli-"));
  try {
    const path = join(dir, "duplicate.json");
    await writeFile(
      path,
      `{"schemaVersion":"1","schemaVersion":"1","releaseSha":"${SHA}"}`,
    );
    const result = await new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        ["scripts/product/release/validate-manifest.mjs", path],
        { cwd: ROOT },
      );
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("close", (code) => resolve({ code, stderr }));
    });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /duplicate/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
