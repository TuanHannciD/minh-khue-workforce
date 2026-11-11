import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const ROOT = join(import.meta.dirname, "../..");
const shellPath = (path) =>
  path
    .replaceAll("\\", "/")
    .replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
const BASH =
  process.env.MKW_TEST_BASH ??
  (process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash");
const workflow = (
  await readFile(join(ROOT, ".github/workflows/deploy.yml"), "utf8")
).replaceAll("\r\n", "\n");
const SHA = "9f899308d6fdf1508ab75421e56457cf20e1f9b2";
const NOW = "2026-11-09T12:00:00Z";
const API = "ghcr.io/minh-khue/api@sha256:" + "1".repeat(64);
const manifest = {
  schemaVersion: "1",
  releaseSha: SHA,
  sourceRepository: "minh-khue/workforce",
  createdAt: "2026-11-09T10:00:00Z",
  apiImage: API,
  webImage: "ghcr.io/minh-khue/web@sha256:" + "2".repeat(64),
  postgresImage: "postgres@sha256:" + "3".repeat(64),
  artifacts: {
    sbom: { sha256: "4".repeat(64), size: 120 },
    provenance: { sha256: "5".repeat(64), size: 220 },
  },
};
function backup(overrides = {}) {
  return {
    schemaVersion: "1",
    kind: "BACKUP",
    backupId: "fixture-backup",
    releaseSha: SHA,
    createdAt: "2026-11-09T10:00:00Z",
    retentionUntil: "2026-12-09T10:00:00Z",
    dumpSha256: "6".repeat(64),
    size: 4096,
    restoreVerified: true,
    storageLocation: "github-actions-artifact:fixture-backup",
    databaseIdentity: { host: "fixture-db", name: "mkw", engine: "postgresql" },
    ...overrides,
  };
}
const rejectedBackups = [
  ["wrong SHA", { releaseSha: "b".repeat(40) }, /releaseSha.*expected/i],
  ["stale", { createdAt: "2026-11-08T10:00:00Z" }, /createdAt.*maximum age/i],
  ["future", { createdAt: "2026-11-09T13:00:00Z" }, /createdAt.*future/i],
  ["expired retention", { retentionUntil: NOW }, /retentionUntil.*expired/i],
];

// Run the workflow's actual Bash block; only transport/external mutation is replaced.
function stepScript(name) {
  const section = workflow.split(`      - name: ${name}\n`)[1];
  assert.ok(section, `missing workflow step: ${name}`);
  const block = section.split("        run: |\n")[1]?.split(/\n {6}- /)[0];
  assert.ok(block, `missing Bash block: ${name}`);
  return block.replace(/^ {10}/gm, "");
}
function bash(cwd, script, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(BASH, ["--noprofile", "--norc", "-c", script], {
      cwd,
      env: { ...process.env, ...env },
    });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "mkw-deploy-gate-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "release-artifact"));
  await mkdir(join(dir, "backup-ready"));
  const text = JSON.stringify(manifest);
  await writeFile(join(dir, "release-artifact/release-manifest.json"), text);
  await writeFile(
    join(dir, "release-artifact/release-manifest.sha256"),
    `${createHash("sha256").update(text).digest("hex")}  release-manifest.json\n`,
  );
  return dir;
}
async function copyTooling(dir) {
  await cp(
    join(ROOT, "scripts/product/release"),
    join(dir, "scripts/product/release"),
    { recursive: true },
  );
  await mkdir(join(dir, "deploy"), { recursive: true });
  await cp(
    join(ROOT, "deploy/compose.production.yml"),
    join(dir, "deploy/compose.production.yml"),
  );
  await writeFile(
    join(dir, "scripts/product/deploy-entrypoint.sh"),
    (
      await readFile(join(ROOT, "scripts/product/deploy-entrypoint.sh"), "utf8")
    ).replaceAll("\r\n", "\n"),
  );
}

test("old release artifacts cannot select an old permissive backup validator", async (t) => {
  const dir = await fixture(t);
  const checkout = workflow.match(
    /uses: actions\/checkout@[^\n]+\n([\s\S]*?)(?=\n {6}- )/,
  )[1];
  const ref = checkout.match(/ref: (.+)/)[1].trim();
  const path = checkout.match(/path: (.+)/)?.[1].trim() ?? ".";
  const tooling = join(dir, path);
  await copyTooling(tooling);
  if (ref === "${{ inputs.release_sha }}") {
    // Historical validators accepted unknown flags: reproduce that public CLI behavior.
    await writeFile(
      join(tooling, "scripts/product/release/validate-backup-ready.mjs"),
      'console.log("OLD_VALIDATOR_BYPASS");\n',
    );
  } else
    assert.equal(
      ref,
      "${{ github.workflow_sha }}",
      "tooling must use the immutable orchestration revision",
    );
  for (const [label, overrides, error] of rejectedBackups) {
    await writeFile(
      join(dir, "backup-ready/backup-ready.json"),
      JSON.stringify(backup(overrides)),
    );
    const result = await bash(
      dir,
      `date() { printf '%s\\n' '${NOW}'; };\n` +
        stepScript("Validate artifact and release manifest"),
      {
        GITHUB_WORKSPACE: dir.replaceAll("\\", "/"),
        RELEASE_SHA: SHA,
        BACKUP_MAX_AGE_SECONDS: "86400",
        GITHUB_ENV: join(dir, "github-env").replaceAll("\\", "/"),
      },
    );
    assert.notEqual(
      result.code,
      0,
      `${label}: ${result.stdout} ${result.stderr}`,
    );
    assert.match(result.stderr, error, label);
    assert.doesNotMatch(result.stdout, /OLD_VALIDATOR_BYPASS/);
  }
  await writeFile(
    join(dir, "backup-ready/backup-ready.json"),
    JSON.stringify(backup()),
  );
  const result = await bash(
    dir,
    `date() { printf '%s\\n' '${NOW}'; };\n` +
      stepScript("Validate artifact and release manifest"),
    {
      GITHUB_WORKSPACE: dir.replaceAll("\\", "/"),
      RELEASE_SHA: SHA,
      BACKUP_MAX_AGE_SECONDS: "86400",
      GITHUB_ENV: join(dir, "github-env").replaceAll("\\", "/"),
    },
  );
  assert.equal(result.code, 0, result.stderr);
});

const transport = `
install() { :; }
chmod() { :; }
ssh-keyscan() { echo KEYSCAN_REACHED; }
ssh-keygen() { echo fixture-fingerprint; }
ssh() { echo SSH_MUTATION_REACHED; exit 91; }
scp() { echo SCP_MUTATION_REACHED; exit 91; }
`;
test("safe paths preserve remote command arguments, trusted tooling and backup policy", async (t) => {
  const dir = await fixture(t);
  await copyTooling(dir);
  await writeFile(
    join(dir, "backup-ready/backup-ready.json"),
    JSON.stringify(backup()),
  );
  const captureTransport =
    transport +
    `
ssh() {
  local command_text="\${!#}"
  (
    mkdir() { printf 'REMOTE_MKDIR'; printf ' [%s]' "$@"; echo; }
    tar() { printf 'REMOTE_TAR'; printf ' [%s]' "$@"; echo; }
    cd() { builtin cd "$GITHUB_WORKSPACE/backup-ready"; }
    install() { printf 'REMOTE_INSTALL'; printf ' [%s]' "$@"; echo; }
    rm() { printf 'REMOTE_REMOVE'; printf ' [%s]' "$@"; echo; }
    bash() {
      printf 'REMOTE_POLICY [%s] [%s] [%s]\\n' "\${MKW_BACKUP_NOW:-}" "\${MKW_BACKUP_MAX_AGE_SECONDS:-}" "\${MKW_RELEASE_SHA:-}"
      printf 'REMOTE_BASH'; printf ' [%s]' "$@"; echo
    }
    eval "$command_text"
  )
}
scp() { echo SCP_TRANSFER_REACHED; }
`;
  for (const mode of ["dry-run", "bootstrap", "release"]) {
    const result = await bash(
      dir,
      captureTransport +
        stepScript("Run remote deploy entrypoint with verified artifact"),
      {
        MODE: mode,
        RELEASE_SHA: SHA,
        BACKUP_MAX_AGE_SECONDS: "86400",
        BACKUP_NOW: NOW,
        GITHUB_WORKSPACE: shellPath(dir),
        RUNNER_TEMP: shellPath(dir),
        MKW_SSH_HOST: "fixture.invalid",
        MKW_SSH_PORT: "22",
        MKW_SSH_HOST_FINGERPRINT: "fixture-fingerprint",
        MKW_DEPLOY_PATH: "/home/deploy/mkw-test_1.2",
        MKW_PROJECT_NAME: "mkw",
        MKW_GATEWAY_PORT: "3200",
        MKW_SSH_PRIVATE_KEY: "fixture'key\n$(echo SECRET_MUST_STAY_LITERAL)",
      },
    );
    assert.equal(result.code, 0, result.stderr);
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /SECRET_MUST_STAY_LITERAL/,
    );
    if (mode === "release") {
      assert.ok(
        result.stdout.includes(
          `REMOTE_MKDIR [-p] [--] [/home/deploy/mkw-test_1.2/releases/${SHA}]`,
        ),
        result.stdout,
      );
      assert.ok(
        result.stdout.includes(`REMOTE_POLICY [${NOW}] [86400] [${SHA}]`),
        result.stdout,
      );
      assert.ok(
        result.stdout.includes(
          `REMOTE_BASH [/home/deploy/mkw-test_1.2/releases/${SHA}/scripts/product/deploy-entrypoint.sh] [--release] [--manifest] [/home/deploy/mkw-test_1.2/releases/${SHA}/release-artifact/release-manifest.json]`,
        ),
        result.stdout,
      );
      assert.match(result.stdout, /REMOTE_INSTALL \[-m\] \[640\]/);
      const archive = await bash(
        dir,
        'tar -tzf "$RUNNER_TEMP/mkw-release.tgz"',
        { RUNNER_TEMP: shellPath(dir) },
      );
      assert.equal(archive.code, 0, archive.stderr);
      assert.match(
        archive.stdout,
        /scripts\/product\/release\/validate-backup-ready\.mjs/,
      );
    } else
      assert.ok(
        result.stdout.includes(`REMOTE_BASH [-s] [--] [--${mode}]`),
        result.stdout,
      );
  }
});

test("malformed deploy paths are rejected before SSH in every mode", async (t) => {
  const dir = await fixture(t);
  await copyTooling(dir);
  await writeFile(
    join(dir, "backup-ready/backup-ready.json"),
    JSON.stringify(backup()),
  );
  const script =
    transport +
    stepScript("Run remote deploy entrypoint with verified artifact");
  for (const mode of ["dry-run", "bootstrap", "release"]) {
    for (const path of [
      "/home/deploy/mkw'; touch /tmp/mkw-injected; #",
      "/home/deploy/mkw space",
      "/home/deploy/mkw\nnext",
      "/home/deploy/$(id)",
      "/home/deploy/mkw;id",
      "/home/deploy/../../etc",
      "/home/deploy/./mkw",
      "/home/deploy//mkw",
      "/etc/mkw",
    ]) {
      const result = await bash(dir, script, {
        MODE: mode,
        RELEASE_SHA: SHA,
        BACKUP_MAX_AGE_SECONDS: "86400",
        GITHUB_WORKSPACE: dir.replaceAll("\\", "/"),
        RUNNER_TEMP: dir.replaceAll("\\", "/"),
        MKW_SSH_HOST: "fixture.invalid",
        MKW_SSH_PORT: "22",
        MKW_SSH_HOST_FINGERPRINT: "fixture-fingerprint",
        MKW_DEPLOY_PATH: path,
        MKW_PROJECT_NAME: "mkw",
        MKW_GATEWAY_PORT: "3200",
        MKW_SSH_PRIVATE_KEY: "fixture-key",
      });
      assert.notEqual(result.code, 0);
      assert.match(
        result.stderr,
        /invalid.*deploy path|deploy path.*invalid/i,
        `${mode}: ${result.stdout} ${result.stderr}`,
      );
      assert.doesNotMatch(
        result.stdout,
        /KEYSCAN_REACHED|SSH_MUTATION_REACHED|SCP_MUTATION_REACHED/,
      );
      assert.ok(
        !result.stderr.includes(path),
        "rejected input must not be echoed",
      );
    }
  }
});

const entryPrelude = `
docker() { if [[ "$*" == 'compose version' ]]; then return 0; fi; echo DOCKER_MUTATION_REACHED; exit 91; }
df() { printf 'Filesystem 1024-blocks Used Available Capacity Mounted\\nfixture 9999999 0 9999999 0%% /home\\n'; }
install() { echo FILESYSTEM_MUTATION_REACHED; exit 91; }
source ./scripts/product/deploy-entrypoint.sh --release --manifest release-artifact/release-manifest.json --compose deploy/compose.production.yml --backup-ready backup-ready/backup-ready.json
`;
test("remote release gate rejects wrong SHA, stale/future backup and expired retention before mutation", async (t) => {
  const dir = await fixture(t);
  await copyTooling(dir);
  for (const [label, overrides, error] of rejectedBackups) {
    await writeFile(
      join(dir, "backup-ready/backup-ready.json"),
      JSON.stringify(backup(overrides)),
    );
    const result = await bash(dir, entryPrelude, {
      MKW_DEPLOY_PATH: "/home/deploy/mkw",
      MKW_RELEASE_SHA: SHA,
      MKW_API_IMAGE: API,
      MKW_BACKUP_MAX_AGE_SECONDS: "86400",
      MKW_BACKUP_NOW: NOW,
    });
    assert.equal(
      result.code,
      78,
      `${label}: ${result.stdout} ${result.stderr}`,
    );
    assert.match(result.stderr, error, label);
    assert.doesNotMatch(result.stdout, /MUTATION_REACHED/);
  }
  await writeFile(
    join(dir, "backup-ready/backup-ready.json"),
    JSON.stringify(backup()),
  );
  const valid = await bash(dir, entryPrelude, {
    MKW_DEPLOY_PATH: "/home/deploy/mkw",
    MKW_RELEASE_SHA: SHA,
    MKW_API_IMAGE: API,
    MKW_BACKUP_MAX_AGE_SECONDS: "86400",
    MKW_BACKUP_NOW: NOW,
  });
  assert.equal(valid.code, 91, valid.stderr);
  assert.match(valid.stdout, /FILESYSTEM_MUTATION_REACHED/);
});

test("remote gate fails closed for missing or malformed explicit freshness policy", async (t) => {
  const dir = await fixture(t);
  await copyTooling(dir);
  await writeFile(
    join(dir, "backup-ready/backup-ready.json"),
    JSON.stringify(backup()),
  );
  for (const [age, now] of [
    ["", NOW],
    ["86400", ""],
    ["-1", NOW],
    ["9007199254740992", NOW],
    ["86400", "2026-02-30T00:00:00Z"],
  ]) {
    const result = await bash(dir, entryPrelude, {
      MKW_DEPLOY_PATH: "/home/deploy/mkw",
      MKW_RELEASE_SHA: SHA,
      MKW_API_IMAGE: API,
      MKW_BACKUP_MAX_AGE_SECONDS: age,
      MKW_BACKUP_NOW: now,
    });
    assert.equal(result.code, 78, result.stderr);
    assert.match(result.stderr, /backup.*policy|maximum age|validation time/i);
    assert.doesNotMatch(result.stdout, /MUTATION_REACHED/);
  }
});
