import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

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
    databaseIdentity: {
      host: "fixture-db",
      name: "mkw",
      engine: "postgresql",
      targetIdentity: "fixture-db//home/deploy/mkw/mkw",
    },
    ...overrides,
  };
}
const rejectedBackups = [
  ...[undefined, "fixture-db//home/deploy/other/other"].map(
    (targetIdentity) => [
      targetIdentity === undefined
        ? "missing target identity"
        : "wrong target identity",
      {
        databaseIdentity: {
          host: "fixture-db",
          name: "mkw",
          engine: "postgresql",
          ...(targetIdentity === undefined ? {} : { targetIdentity }),
        },
      },
      /targetIdentity.*expected target/i,
    ],
  ),
  [
    "wrong host",
    {
      databaseIdentity: {
        host: "other-host",
        name: "mkw",
        engine: "postgresql",
      },
    },
    /host.*expected target/i,
  ],
  [
    "wrong database",
    {
      databaseIdentity: {
        host: "fixture-db",
        name: "other-database",
        engine: "postgresql",
      },
    },
    /name.*expected target/i,
  ],
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
      env: {
        ...process.env,
        MKW_AUTOMATIC_RELEASE: "true",
        RELEASE_RUN_ID: "10",
        RELEASE_RUN_ATTEMPT: "1",
        RELEASE_ARTIFACT_ID: "101",
        RELEASE_ARTIFACT_DIGEST: `sha256:${"d".repeat(64)}`,
        BACKUP_RUN_ID: "20",
        BACKUP_RUN_ATTEMPT: "1",
        BACKUP_ARTIFACT_ID: "201",
        BACKUP_ARTIFACT_DIGEST: `sha256:${"e".repeat(64)}`,
        GITHUB_OUTPUT: shellPath(join(cwd, "output")),
        MKW_SSH_HOST: "fixture-db",
        MKW_BACKUP_EXPECTED_HOST: "fixture-db",
        MKW_BACKUP_EXPECTED_DATABASE: "mkw",
        MKW_BACKUP_EXPECTED_TARGET_IDENTITY: "fixture-db//home/deploy/mkw/mkw",
        TARGET_DATABASE: "mkw",
        TARGET_IDENTITY: "fixture-db//home/deploy/mkw/mkw",
        MKW_DEPLOY_PATH: "/home/deploy/mkw",
        MKW_PROJECT_NAME: "mkw",
        ...env,
      },
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

for (const attestationMode of ["off", "best-effort"])
  test(`direct manual deploy rejects a valid archive with noncanonical producer before SSH (${attestationMode})`, async (t) => {
    const dir = await fixture(t);
    await copyTooling(join(dir, "policy"));
    await writeFile(
      join(dir, "backup-ready/backup-ready.json"),
      JSON.stringify(backup()),
    );
    // Fake only the GitHub API process boundary; execute the real resolver,
    // validators and workflow block. Rejection occurs before archive reads/SSH.
    const preload = join(dir, "github-boundary.mjs");
    await writeFile(
      preload,
      `
import child from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { promisify } from 'node:util';
const original = child.execFile;
const execute = async (command, args) => {
  if (command !== 'gh') throw new Error('unexpected external command');
  const route = args.at(-1);
  const value = route.endsWith('/artifacts/101') ? {id:101, name:'mkw-release-${SHA}', expired:false, digest:"sha256:${"d".repeat(64)}", workflow_run:{id:10}}
    : route.endsWith('/runs/10/attempts/1') ? {id:10, workflow_id:100, run_attempt:1, event:'workflow_run', head_branch:'main', status:'completed', conclusion:'success'}
    : route.endsWith('/runs/10') ? {id:10, workflow_id:100, event:'workflow_run', head_branch:'main', status:'completed', conclusion:'success'}
    : route.endsWith('/workflows/100') ? {id:100, path:'.github/workflows/noncanonical.yml'}
    : (() => { throw new Error('unexpected GitHub route'); })();
  return {stdout:JSON.stringify([value]), stderr:''};
};
child.execFile = function(command, args, options, callback) { if(command !== 'gh') return original(command,args,options,callback); execute(command,args).then(r=>callback(null,r.stdout,r.stderr),callback); };
child.execFile[promisify.custom] = (command,args,options) => command === 'gh' ? execute(command,args) : promisify(original)(command,args,options);
syncBuiltinESMExports();
`,
    );
    const result = await bash(
      dir,
      `date() { printf '%s\\n' '${NOW}'; }\n` +
        stepScript("Validate artifact and release manifest") +
        "\necho SSH_MUTATION_REACHED\n",
      {
        RELEASE_SHA: SHA,
        RELEASE_RUN_ID: "10",
        RELEASE_ARTIFACT_ID: "101",
        MKW_AUTOMATIC_RELEASE: "false",
        GITHUB_REF: "refs/heads/main",
        GITHUB_REPOSITORY: manifest.sourceRepository,
        GH_TOKEN: "fixture-only",
        NODE_OPTIONS: `--import=${pathToFileURL(preload).href}`,
        BACKUP_KIND: "BACKUP",
        BACKUP_MAX_AGE_SECONDS: "86400",
        MKW_ATTESTATION_MODE: attestationMode,
      },
    );
    assert.notEqual(result.code, 0, result.stdout + result.stderr);
    assert.match(result.stderr, /producer.*canonical|canonical.*producer/);
    assert.doesNotMatch(result.stdout, /SSH_MUTATION_REACHED/);
  });

test("old release artifacts cannot select an old permissive backup validator", async (t) => {
  const dir = await fixture(t);
  const checkout = workflow.match(
    /uses: actions\/checkout@[^\n]+\n([\s\S]*?)(?=\n {6}- )/,
  )[1];
  const ref = checkout.match(/ref: (.+)/)[1].trim();
  const path = checkout.match(/path: (.+)/)?.[1].trim() ?? ".";
  const tooling = join(dir, path);
  await copyTooling(tooling);
  await copyTooling(join(dir, "release-source"));
  await writeFile(
    join(
      dir,
      "release-source/scripts/product/release/validate-backup-ready.mjs",
    ),
    'console.log("OLD_VALIDATOR_BYPASS");\n',
  );
  if (ref === "${{ inputs.release_sha }}") {
    // Historical validators accepted unknown flags: reproduce that public CLI behavior.
    await writeFile(
      join(tooling, "scripts/product/release/validate-backup-ready.mjs"),
      'console.log("OLD_VALIDATOR_BYPASS");\n',
    );
  } else
    assert.equal(
      ref,
      "${{ inputs.control_sha || 'main' }}",
      "tooling must use trusted current policy or pinned push controls",
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
        RELEASE_RUN_ATTEMPT: "1",
        RELEASE_ARTIFACT_DIGEST: "1".repeat(64),
        BACKUP_MAX_AGE_SECONDS: "86400",
        BACKUP_KIND: "BACKUP",
        MKW_BACKUP_MAX_AGE_SECONDS: "86400",
        MKW_BACKUP_EXPECTED_KIND: "BACKUP",
        MKW_ATTESTATION_MODE: "off",
        MKW_ATTESTATION_STATUS: "not-configured",
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
      BACKUP_KIND: "BACKUP",
      GITHUB_ENV: join(dir, "github-env").replaceAll("\\", "/"),
    },
  );
  assert.equal(result.code, 0, result.stderr);
});

const transport = `
install() { :; }
chmod() { :; }
ssh-keyscan() { echo KEYSCAN_REACHED; }
ssh-keygen() { echo '256 fixture-fingerprint fixture (ED25519)'; }
ssh() { echo SSH_MUTATION_REACHED; exit 91; }
scp() { echo SCP_MUTATION_REACHED; exit 91; }
`;
test("safe paths preserve remote command arguments, trusted tooling and backup policy", async (t) => {
  const dir = await fixture(t);
  await copyTooling(dir);
  await copyTooling(join(dir, "policy"));
  await copyTooling(join(dir, "release-source"));
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
        BACKUP_KIND: "BACKUP",
        MKW_BACKUP_MAX_AGE_SECONDS: "86400",
        MKW_BACKUP_EXPECTED_KIND: "BACKUP",
        MKW_ATTESTATION_MODE: "off",
        MKW_ATTESTATION_STATUS: "not-configured",

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
        result.stdout.includes(`REMOTE_POLICY [] [86400] [${SHA}]`),
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
  await copyTooling(join(dir, "policy"));
  await copyTooling(join(dir, "release-source"));
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
        BACKUP_KIND: "BACKUP",
        MKW_BACKUP_MAX_AGE_SECONDS: "86400",
        MKW_BACKUP_EXPECTED_KIND: "BACKUP",
        MKW_ATTESTATION_MODE: "off",
        MKW_ATTESTATION_STATUS: "not-configured",
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
date() { printf '%s\\n' "${NOW}"; }
docker() { if [[ "$*" == 'compose version' ]]; then return 0; fi; echo DOCKER_MUTATION_REACHED; exit 91; }
df() { printf 'Filesystem 1024-blocks Used Available Capacity Mounted\\nfixture 9999999 0 9999999 0%% /home\\n'; }
install() { echo FILESYSTEM_MUTATION_REACHED; exit 91; }
source ./scripts/product/deploy-entrypoint.sh --release --manifest release-artifact/release-manifest.json --compose deploy/compose.production.yml --backup-ready backup-ready/backup-ready.json
`;
test("remote release gate rejects wrong SHA, stale/future backup and expired retention before mutation", async (t) => {
  const dir = await fixture(t);
  await copyTooling(dir);
  await copyTooling(join(dir, "policy"));
  await copyTooling(join(dir, "release-source"));
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
  await copyTooling(join(dir, "policy"));
  await copyTooling(join(dir, "release-source"));
  await writeFile(
    join(dir, "backup-ready/backup-ready.json"),
    JSON.stringify(backup()),
  );
  for (const [age, now] of [
    ["", NOW],
    ["-1", NOW],
    ["9007199254740992", NOW],
    ["86400", "2026-02-30T00:00:00Z"],
  ]) {
    const result = await bash(
      dir,
      `date() { echo "${now}"; }\n` +
        entryPrelude.replace(/date\(\) \{[^\n]+\n/, ""),
      {
        MKW_DEPLOY_PATH: "/home/deploy/mkw",
        MKW_RELEASE_SHA: SHA,
        MKW_API_IMAGE: API,
        MKW_BACKUP_MAX_AGE_SECONDS: age,
        MKW_BACKUP_NOW: now,
      },
    );
    assert.equal(result.code, 78, result.stderr);
    assert.match(result.stderr, /backup.*policy|maximum age|validation time/i);
    assert.doesNotMatch(result.stdout, /MUTATION_REACHED/);
  }
});

const rollbackWorkflow = (
  await readFile(join(ROOT, ".github/workflows/rollback.yml"), "utf8")
).replaceAll("\r\n", "\n");
function rollbackStep(
  name = "Redeploy exact old digests through deploy-entrypoint.sh",
) {
  const section = rollbackWorkflow.split(`      - name: ${name}\n`)[1];
  return section
    .split("        run: |\n")[1]
    .split(/\n {6}- /)[0]
    .replace(/^ {10}/gm, "");
}
test("rollback rejects hostile paths before any SSH or secret handling", async (t) => {
  const dir = await fixture(t);
  await copyTooling(dir);
  await cp(join(dir, "release-artifact"), join(dir, "old-release-artifact"), {
    recursive: true,
  });
  for (const path of [
    "/home/deploy/mkw'; touch payload-executed; #",
    "/home/deploy/$(touch payload-executed)",
    "/home/deploy/mkw\nnext",
    "/home/deploy/../mkw",
  ]) {
    const result = await bash(dir, transport + rollbackStep(), {
      OLD_RELEASE_SHA: SHA,
      MKW_DEPLOY_PATH: path,
      MKW_PROJECT_NAME: "mkw",
      MKW_GATEWAY_PORT: "3200",
      MKW_SSH_HOST: "fixture.invalid",
      MKW_SSH_PORT: "22",
      MKW_SSH_HOST_FINGERPRINT: "fixture-fingerprint",
      MKW_SSH_PRIVATE_KEY: "fixture-key",
      RUNNER_TEMP: shellPath(dir),
    });
    assert.equal(result.code, 78, result.stderr);
    assert.match(result.stderr, /invalid deploy path/);
    assert.doesNotMatch(result.stdout, /KEYSCAN_REACHED|SSH_MUTATION_REACHED/);
  }
});
test("rollback accepts fresh current-state backup with another release SHA and rejects empty/stale snapshots", async (t) => {
  const dir = await fixture(t);
  await copyTooling(dir);
  for (const [overrides, accepted] of [
    [{ releaseSha: "b".repeat(40) }, true],
    [{ releaseSha: "b".repeat(40), createdAt: "2026-11-07T10:00:00Z" }, false],
    [
      {
        kind: "INITIAL_EMPTY_DEPLOYMENT",
        restoreVerified: false,
        dumpSha256: undefined,
        size: undefined,
        databaseVerifiedEmpty: true,
        emptyEvidence: {
          targetIdentity: "fixture",
          databaseIdentity: "mkw",
          checkedAt: NOW,
        },
      },
      false,
    ],
  ]) {
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
      MKW_OPERATION_KIND: "application-rollback",
    });
    assert.equal(
      result.code,
      accepted ? 91 : 78,
      result.stdout + result.stderr,
    );
    if (!accepted) assert.doesNotMatch(result.stdout, /MUTATION_REACHED/);
  }
});
test("remote clock refresh rejects a backup that ages out after runner validation despite frozen runner timestamp", async (t) => {
  const dir = await fixture(t);
  await copyTooling(dir);
  await writeFile(
    join(dir, "backup-ready/backup-ready.json"),
    JSON.stringify(backup()),
  );
  const script =
    `date() { echo 2026-11-10T10:00:01Z; }\n` +
    entryPrelude.replace(/date\(\) \{[^\n]+\n/, "");
  const result = await bash(dir, script, {
    MKW_DEPLOY_PATH: "/home/deploy/mkw",
    MKW_RELEASE_SHA: SHA,
    MKW_API_IMAGE: API,
    MKW_BACKUP_MAX_AGE_SECONDS: "86400",
    MKW_BACKUP_NOW: NOW,
  });
  assert.equal(result.code, 78, result.stdout + result.stderr);
  assert.match(result.stderr, /maximum age/);
  assert.doesNotMatch(result.stdout, /MUTATION_REACHED/);
});

test("rollback transports explicit current-snapshot policy and safely quoted current controls", async (t) => {
  const dir = await fixture(t);
  await copyTooling(dir);
  await writeFile(
    join(dir, "backup-ready/backup-ready.json"),
    JSON.stringify(backup({ releaseSha: "b".repeat(40) })),
  );
  await cp(join(dir, "release-artifact"), join(dir, "old-release-artifact"), {
    recursive: true,
  });
  const capture =
    transport +
    `
ssh() {
  local command_text="\${!#}"
  (
    mkdir() { :; }; tar() { :; }; rm() { :; }; cd() { :; }; sha256sum() { :; }
    test() { :; }
    bash() {
      printf 'ROLLBACK_POLICY [%s] [%s] [%s] [%s] [%s] [%s] [%s] [%s]\\n' "$MKW_BACKUP_MAX_AGE_SECONDS" "$MKW_BACKUP_EXPECTED_KIND" "$MKW_OPERATION_KIND" "\${MKW_BACKUP_NOW:-}" "$MKW_REGISTRY_HOST" "$MKW_REGISTRY_VISIBILITY" "$MKW_REGISTRY_PULL_USERNAME" "$MKW_REGISTRY_PULL_TOKEN_FILE"
      printf 'ROLLBACK_ARGS'; printf ' [%s]' "$@"; echo
    }
    unset MKW_REGISTRY_HOST MKW_REGISTRY_VISIBILITY MKW_REGISTRY_PULL_USERNAME MKW_REGISTRY_PULL_TOKEN_FILE
    eval "$command_text"
  )
}
scp() { :; }
`;
  const result = await bash(dir, capture + rollbackStep(), {
    OLD_RELEASE_SHA: SHA,
    MKW_DEPLOY_PATH: "/home/deploy/mkw-test_1.2",
    MKW_PROJECT_NAME: "mkw",
    MKW_GATEWAY_PORT: "3200",
    MKW_SSH_HOST: "fixture.invalid",
    MKW_SSH_PORT: "22",
    MKW_SSH_HOST_FINGERPRINT: "fixture-fingerprint",
    MKW_SSH_PRIVATE_KEY: "fixture'key\n$(echo SECRET_MUST_STAY_LITERAL)",
    RUNNER_TEMP: shellPath(dir),
    MKW_BACKUP_MAX_AGE_SECONDS: "86400",
    MKW_BACKUP_EXPECTED_KIND: "BACKUP",
    MKW_ATTESTATION_MODE: "off",
    MKW_ATTESTATION_STATUS: "not-configured",
    MKW_REGISTRY_HOST: "ghcr.io",
    MKW_REGISTRY_VISIBILITY: "private",
    MKW_REGISTRY_PULL_USERNAME: "mkw-pull",
    MKW_REGISTRY_PULL_TOKEN_FILE:
      "/home/deploy/mkw-test_1.2/shared/secrets/private-ghcr-token",
  });
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(
    result.stdout,
    /ROLLBACK_POLICY \[86400\] \[BACKUP\] \[application-rollback\] \[\] \[ghcr\.io\] \[private\] \[mkw-pull\] \[\/home\/deploy\/mkw-test_1\.2\/shared\/secrets\/private-ghcr-token\]/,
  );
  assert.ok(
    result.stdout.includes(
      `[/home/deploy/mkw-test_1.2/releases/${SHA}/scripts/product/deploy-entrypoint.sh]`,
    ),
    result.stdout,
  );
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /SECRET_MUST_STAY_LITERAL/,
  );
});

test("actual rollback preflight accepts current snapshot provenance and fails closed for stale, empty or unattested metadata", async (t) => {
  const dir = await fixture(t);
  await copyTooling(dir);
  await cp(join(dir, "release-artifact"), join(dir, "old-release-artifact"), {
    recursive: true,
  });
  for (const [overrides, attestationMode, accepted] of [
    [{ releaseSha: "b".repeat(40) }, "off", true],
    [
      {
        databaseIdentity: {
          host: "other-target",
          name: "mkw",
          engine: "postgresql",
        },
      },
      "off",
      false,
    ],
    [
      { releaseSha: "b".repeat(40), createdAt: "2026-11-07T10:00:00Z" },
      "off",
      false,
    ],
    [{ kind: "INITIAL_EMPTY_DEPLOYMENT" }, "off", false],
    [{ releaseSha: "b".repeat(40) }, "required", false],
  ]) {
    await writeFile(
      join(dir, "backup-ready/backup-ready.json"),
      JSON.stringify(backup(overrides)),
    );
    const result = await bash(
      dir,
      `date() { echo ${NOW}; }\ngh() { return 1; }\n` +
        rollbackStep("Verify old manifest and backup-ready gate"),
      {
        OLD_RELEASE_SHA: SHA,
        MKW_SSH_HOST: "fixture-db",
        ROLLBACK_REASON: "incident-approved-current-schema",
        ATTESTATION_MODE: attestationMode,
        GITHUB_OUTPUT: shellPath(join(dir, "output")),
        GITHUB_STEP_SUMMARY: shellPath(join(dir, "summary")),
        GITHUB_REPOSITORY: "fixture/repo",
      },
    );
    if (accepted) assert.equal(result.code, 0, result.stdout + result.stderr);
    else assert.notEqual(result.code, 0, result.stdout + result.stderr);
    if (attestationMode === "required")
      assert.match(
        result.stderr,
        /required attestation verification did not complete/,
      );
  }
});

test("I-03: runner and remote reject wrong initial-empty target/database before any mutation", async (t) => {
  const dir = await fixture(t);
  await copyTooling(dir);
  await copyTooling(join(dir, "policy"));
  const empty = backup({
    kind: "INITIAL_EMPTY_DEPLOYMENT",
    restoreVerified: false,
    databaseVerifiedEmpty: true,
    dumpSha256: undefined,
    size: undefined,
    emptyEvidence: {
      targetIdentity: "fixture-db//home/deploy/mkw/mkw",
      databaseIdentity: "mkw",
      checkedAt: NOW,
    },
  });
  for (const patch of [
    { targetIdentity: "wrong-host//home/deploy/mkw/mkw" },
    { databaseIdentity: "wrong-database" },
  ]) {
    await writeFile(
      join(dir, "backup-ready/backup-ready.json"),
      JSON.stringify({
        ...empty,
        emptyEvidence: { ...empty.emptyEvidence, ...patch },
      }),
    );
    for (const script of [
      entryPrelude,
      `date() { echo ${NOW}; }\n` +
        stepScript("Validate artifact and release manifest"),
    ]) {
      const result = await bash(dir, script, {
        RELEASE_SHA: SHA,
        MKW_RELEASE_SHA: SHA,
        MKW_API_IMAGE: API,
        BACKUP_KIND: "INITIAL_EMPTY_DEPLOYMENT",
        MKW_BACKUP_EXPECTED_KIND: "INITIAL_EMPTY_DEPLOYMENT",
        BACKUP_MAX_AGE_SECONDS: "86400",
        MKW_BACKUP_MAX_AGE_SECONDS: "86400",
      });
      assert.notEqual(result.code, 0, result.stdout + result.stderr);
      assert.match(result.stderr, /expected target/);
      assert.doesNotMatch(result.stdout, /MUTATION_REACHED/);
    }
  }
});

test("I-03: missing trusted remote target policy fails closed before mutation", async (t) => {
  const dir = await fixture(t);
  await copyTooling(dir);
  await writeFile(
    join(dir, "backup-ready/backup-ready.json"),
    JSON.stringify(backup()),
  );
  const result = await bash(dir, entryPrelude, {
    MKW_RELEASE_SHA: SHA,
    MKW_API_IMAGE: API,
    MKW_BACKUP_MAX_AGE_SECONDS: "86400",
    MKW_BACKUP_EXPECTED_HOST: "",
  });
  assert.equal(result.code, 78, result.stdout + result.stderr);
  assert.match(result.stderr, /target policy/);
  assert.doesNotMatch(result.stdout, /MUTATION_REACHED/);
});

test("automatic digest outputs and source repository are bound before deploy transport", async (t) => {
  const dir = await fixture(t);
  await copyTooling(join(dir, "policy"));
  await writeFile(
    join(dir, "backup-ready/backup-ready.json"),
    JSON.stringify(backup()),
  );
  const env = {
    RELEASE_SHA: SHA,
    BACKUP_MAX_AGE_SECONDS: "86400",
    BACKUP_KIND: "BACKUP",
    GITHUB_REPOSITORY: "minh-khue/workforce",
    EXPECTED_API_DIGEST: "sha256:" + "1".repeat(64),
    EXPECTED_WEB_DIGEST: "sha256:" + "2".repeat(64),
    EXPECTED_POSTGRES_IMAGE: "postgres@sha256:" + "3".repeat(64),
  };
  for (const [patch, error] of [
    [{}, null],
    [{ EXPECTED_API_DIGEST: "sha256:" + "9".repeat(64) }, /API digest/],
    [{ EXPECTED_WEB_DIGEST: "sha256:" + "9".repeat(64) }, /web digest/],
    [
      { EXPECTED_POSTGRES_IMAGE: "postgres@sha256:" + "9".repeat(64) },
      /PostgreSQL image/,
    ],
    [{ GITHUB_REPOSITORY: "other/repo" }, /sourceRepository/],
  ]) {
    const result = await bash(
      dir,
      `date() { printf '%s\\n' '${NOW}'; };\n` +
        stepScript("Validate artifact and release manifest"),
      { ...env, ...patch },
    );
    if (error) {
      assert.notEqual(result.code, 0, JSON.stringify(patch));
      assert.match(result.stderr, error);
    } else assert.equal(result.code, 0, result.stderr);
  }
});
