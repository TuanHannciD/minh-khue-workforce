import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
// File map: stepScript/bash/fixture cover normal deploy gates and transport;
// rollbackStep covers current controls and snapshot policy. canonicalRollbackFixture
// runs actual GitHub adapter/archive/resolver plus workflow blocks at the end.
import { canonicalRollbackFixture } from "./fixtures/rollback-workflow.mjs";
import { resolveRollbackBackup } from "../../scripts/product/release/resolve-rollback-backup.mjs";

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
async function canonicalBackup(dir, value) {
  value.backupId = "mkw-10-2-release";
  await writeFile(
    join(dir, "backup-ready/backup-ready.json"),
    JSON.stringify(value),
  );
  const result = await resolveRollbackBackup(
    {
      repository: "org/repo",
      dispatchRef: "refs/heads/main",
      runId: "10",
      artifactId: "101",
      target: {
        host: "fixture-db",
        database: "mkw",
        targetIdentity: "fixture-db//home/deploy/mkw/mkw",
      },
      now: NOW,
      maxAgeSeconds: 86400,
    },
    {
      artifact: async () => ({
        id: 101,
        name: "mkw-backup-10-2",
        workflow_run: { id: 10 },
        expired: false,
        digest: `sha256:${"d".repeat(64)}`,
      }),
      run: async () => ({
        id: 10,
        run_attempt: 2,
        path: ".github/workflows/backup.yml",
        event: "workflow_dispatch",
        head_branch: "main",
        status: "completed",
        conclusion: "success",
      }),
      jsonFromArtifact: async () => value,
    },
  );
  await writeFile(
    join(dir, "backup-ready/rollback-backup-resolved.json"),
    JSON.stringify(result),
  );
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
    const child = spawn(BASH, ["--noprofile", "--norc", "-s"], {
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
        MKW_OPERATION_ID: "backup-gate-fixture-1",
        GITHUB_REPOSITORY: manifest.sourceRepository,
        GITHUB_RUN_ID: "30",
        GITHUB_RUN_ATTEMPT: "1",
        MKW_CONTROL_SHA: "c".repeat(40),
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
    child.stdin.end(script);
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
  await writeFile(
    join(dir, "release-artifact/build-metadata.json"),
    JSON.stringify({
      sourceSha: SHA,
      producerRunId: "10",
      producerRunAttempt: "1",
    }),
  );
  const checks = [];
  for (const name of [
    "release-manifest.json",
    "release-manifest.sha256",
    "build-metadata.json",
  ]) {
    checks.push(
      `${createHash("sha256")
        .update(await readFile(join(dir, "release-artifact", name)))
        .digest("hex")}  ${name}\n`,
    );
  }
  await writeFile(
    join(dir, "release-artifact/release-checksums.sha256"),
    checks.join(""),
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
  await cp(
    join(ROOT, "scripts/product/post-deploy-verify.sh"),
    join(dir, "scripts/product/post-deploy-verify.sh"),
  );
  await cp(
    join(ROOT, "scripts/product/manage-production-account.sh"),
    join(dir, "scripts/product/manage-production-account.sh"),
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
  // Keep this argument-capture fixture offline. Runtime integrity/execution is
  // exercised with real checksums and Node in bootstrap-runtime.test.mjs.
  const runtime = join(dir, "runtime-source");
  await mkdir(join(runtime, "node-v24.22.1-linux-x64/bin"), {
    recursive: true,
  });
  await writeFile(join(runtime, "node-v24.22.1-linux-x64/bin/node"), "fixture");
  const packed = await bash(
    dir,
    'tar -cJf "$FIXTURE_BOOTSTRAP_DOWNLOAD/node-v24.22.1-linux-x64.tar.xz" -C "$FIXTURE_BOOTSTRAP_DOWNLOAD" node-v24.22.1-linux-x64',
    { FIXTURE_BOOTSTRAP_DOWNLOAD: shellPath(runtime) },
  );
  assert.equal(packed.code, 0, packed.stderr);
  await writeFile(
    join(runtime, "SHASUMS256.txt"),
    `${createHash("sha256")
      .update(await readFile(join(runtime, "node-v24.22.1-linux-x64.tar.xz")))
      .digest("hex")}  node-v24.22.1-linux-x64.tar.xz\n`,
  );
  const captureTransport =
    transport +
    `
ssh() {
  local command_text="\${!#}"
  if [[ "$command_text" == 'uname -m' ]]; then echo x86_64;return;fi
  if [[ "$command_text" == 'set -Eeuo pipefail;'* && "$command_text" != *' --bootstrap' ]]; then printf 'REMOTE_STAGE [%s]\\n' "$command_text";return;fi
  (
    mkdir() { printf 'REMOTE_MKDIR'; printf ' [%s]' "$@"; echo; }
    tar() { printf 'REMOTE_TAR'; printf ' [%s]' "$@"; echo; }
    cd() { builtin cd "$GITHUB_WORKSPACE/backup-ready"; }
    sha256sum() { :; }
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
curl() {
  local url out
  while (($#)); do case "$1" in --output) shift;out=$1 ;; https:*) url=$1 ;; esac;shift;done
  case "$url" in
    https://nodejs.org/dist/v24.22.1/SHASUMS256.txt|https://nodejs.org/dist/v24.22.1/node-v24.22.1-linux-x64.tar.xz) cp -- "$FIXTURE_BOOTSTRAP_DOWNLOAD/\${url##*/}" "$out" ;;
    *) return 99 ;;
  esac
}
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
        FIXTURE_BOOTSTRAP_DOWNLOAD: shellPath(runtime),
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
        result.stdout.includes(`/staging/backup-gate-fixture-1-`),
        result.stdout,
      );
      assert.ok(
        result.stdout.includes(`REMOTE_POLICY [] [86400] [${SHA}]`),
        result.stdout,
      );
      assert.ok(result.stdout.includes(`[--staging]`), result.stdout);
      assert.doesNotMatch(
        result.stdout,
        /REMOTE_INSTALL|REMOTE_TAR|\/releases\//,
      );
      const archive = await bash(
        dir,
        'tar -tf "$RUNNER_TEMP/mkw-release-bundle/deployment-bundle.tar"',
        { RUNNER_TEMP: shellPath(dir) },
      );
      assert.equal(archive.code, 0, archive.stderr);
      assert.match(
        archive.stdout,
        /scripts\/product\/release\/validate-backup-ready\.mjs/,
      );
    } else if (mode === "dry-run")
      assert.ok(
        result.stdout.includes(`REMOTE_BASH [-s] [--] [--${mode}]`),
        result.stdout,
      );
    else assert.match(result.stdout, /\[--bootstrap\]/);
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
test("manual verifier requires the deployment operation ID before SSH", async (t) => {
  const dir = await fixture(t);
  await copyTooling(join(dir, "policy"));
  const yaml = (
    await readFile(
      join(ROOT, ".github/workflows/post-deploy-verify.yml"),
      "utf8",
    )
  ).replaceAll("\r\n", "\n");
  const section = yaml.split(
    "      - name: Verify running image digests, migration status, health, and smoke\n",
  )[1];
  const script = section
    .split("        run: |\n")[1]
    .split(/\n {6}- /)[0]
    .replace(/^ {10}/gm, "");
  const result = await bash(dir, transport + script, {
    RELEASE_SHA: SHA,
    MKW_OPERATION_ID: "",
    RUNNER_TEMP: shellPath(dir),
  });
  assert.equal(result.code, 64, result.stdout + result.stderr);
  assert.doesNotMatch(result.stdout, /KEYSCAN_REACHED|SSH_MUTATION_REACHED/);
});
test("operation admission rejects hostile IDs before any SSH/key handling", async (t) => {
  const dir = await fixture(t);
  await copyTooling(join(dir, "policy"));
  await copyTooling(dir);
  for (const id of [".", "..", "bad/id", "$(touch payload)", "a\nb"]) {
    for (const script of [
      stepScript("Run remote deploy entrypoint with verified artifact"),
      rollbackStep(),
    ]) {
      const result = await bash(dir, transport + script, {
        MODE: "release",
        RELEASE_SHA: SHA,
        OLD_RELEASE_SHA: SHA,
        MKW_OPERATION_ID: id,
        MKW_SSH_PORT: "22",
        MKW_GATEWAY_PORT: "3200",
        MKW_SSH_HOST_FINGERPRINT: "fixture",
        MKW_BACKUP_MAX_AGE_SECONDS: "86400",
        RUNNER_TEMP: shellPath(dir),
      });
      assert.equal(result.code, 78, result.stdout + result.stderr);
      assert.doesNotMatch(
        result.stdout,
        /KEYSCAN_REACHED|SSH_MUTATION_REACHED/,
      );
    }
  }
});
function rollbackStep(
  name = "Redeploy exact old digests through deploy-entrypoint.sh",
) {
  const section = rollbackWorkflow.split(`      - name: ${name}\n`)[1];
  return section
    .split("        run: |\n")[1]
    .split(/\n {6}- /)[0]
    .replace(/^ {10}/gm, "");
}

// Recompute every self-owned integrity record: these must never substitute for
// the resolver's separately trusted canonical release record.
const refreshRollbackArtifact = `
node --input-type=module <<'NODE'
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {writeBundleInventory} from './scripts/product/release/release-bundle.mjs';
const root='old-release-artifact', hash=b=>createHash('sha256').update(b).digest('hex');
await writeFile(root+'/release-manifest.sha256',hash(await readFile(root+'/release-manifest.json'))+'  release-manifest.json\\n');
const paths=[];async function walk(p=''){for(const n of await readdir(root+(p?'/'+p:''))){const f=p?p+'/'+n:n;if(['release-checksums.sha256','bundle-inventory.json'].includes(f))continue;const {stat}=await import('node:fs/promises');if((await stat(root+'/'+f)).isDirectory())await walk(f);else paths.push(f);}}await walk();
await writeFile(root+'/release-checksums.sha256',(await Promise.all(paths.sort().map(async p=>hash(await readFile(root+'/'+p))+'  '+p+'\\n'))).join(''));
if(process.env.MODERN_ARTIFACT==='1')await writeBundleInventory(root);
NODE
`;

for (const modern of [false, true]) {
  for (const [label, mutation] of [
    ["valid", ""],
    [
      "api image",
      "m.apiImage='ghcr.io/org/substituted@sha256:'+'f'.repeat(64)",
    ],
    ["manifest metadata", "m.createdAt='2026-01-01T00:00:00Z'"],
    ["build metadata", "b.sourceSha='f'.repeat(40)"],
    ["metadata producer", "b.producerRunAttempt='2'"],
    ["run tuple", "export MKW_RELEASE_RUN_ID=21"],
    ["attempt tuple", "export MKW_RELEASE_RUN_ATTEMPT=2"],
    ["artifact tuple", "export MKW_RELEASE_ARTIFACT_ID=202"],
    [
      "digest tuple",
      `export MKW_RELEASE_ARTIFACT_DIGEST=sha256:${"e".repeat(64)}`,
    ],
  ]) {
    test(`rollback canonical binding rejects recalculated ${label} (${modern ? "modern" : "legacy"})`, async (t) => {
      const f = await canonicalRollbackFixture(t, ROOT);
      f.env.MODERN_ARTIFACT = modern ? "1" : "0";
      if (modern) {
        await cp(
          join(f.dir, "release-source/deploy"),
          join(f.dir, "old-release-artifact/deploy"),
          { recursive: true },
        );
        await mkdir(join(f.dir, "old-release-artifact/scripts/product"), {
          recursive: true,
        });
        await mkdir(join(f.dir, "release-source/scripts/product"), {
          recursive: true,
        });
        for (const base of ["old-release-artifact", "release-source"])
          await writeFile(
            join(f.dir, base, "scripts/product/manage-production-account.sh"),
            "# exact old operator\n",
          );
        for (const name of ["api-attestations.json", "web-attestations.json"])
          await writeFile(join(f.dir, "old-release-artifact", name), "{}");
      }
      const mutate = mutation.startsWith("export ")
        ? `${mutation}\n`
        : `node -e "const fs=require('fs');let m=JSON.parse(fs.readFileSync('old-release-artifact/release-manifest.json')),b=JSON.parse(fs.readFileSync('old-release-artifact/build-metadata.json'));${mutation};fs.writeFileSync('old-release-artifact/release-manifest.json',JSON.stringify(m));fs.writeFileSync('old-release-artifact/build-metadata.json',JSON.stringify(b))"\n`;
      const result = await bash(
        f.dir,
        f.prelude +
          `\nchmod(){ if [[ "$*" == *mkw_key* ]]; then echo KEYWRITE >> "$RUNNER_TEMP/transport.log"; fi; }\ndocker(){ echo MIGRATION_APPLY >> "$RUNNER_TEMP/transport.log"; return 91; }\n` +
          refreshRollbackArtifact +
          rollbackStep("Resolve canonical rollback snapshot") +
          "\n" +
          rollbackStep("Verify old manifest and backup-ready gate") +
          "\n" +
          mutate +
          refreshRollbackArtifact +
          rollbackStep(),
        f.env,
      );
      assert.equal(
        result.code,
        label === "valid" ? 0 : 78,
        `${label}: ${result.stdout}\n${result.stderr}`,
      );
      const counters = await readFile(
        join(f.temp, "transport.log"),
        "utf8",
      ).catch(() => "");
      if (label !== "valid") {
        assert.equal(
          counters,
          "",
          "zero keyscan/keywrite/SSH/SCP/migration/apply",
        );
        assert.equal(
          await readFile(join(f.temp, "mkw_key")).catch(() => null),
          null,
        );
      } else {
        assert.match(counters, /KEYWRITE/);
        const archive = await bash(
          f.dir,
          'tar -xOf "$RUNNER_TEMP/mkw-rollback-bundle/deployment-bundle.tar" release/release-manifest.json',
          f.env,
        );
        assert.equal(archive.code, 0, archive.stderr);
        const canonical = JSON.parse(
          await readFile(
            join(f.temp, "rollback-release-resolved.json"),
            "utf8",
          ),
        );
        assert.deepEqual(JSON.parse(archive.stdout), canonical.manifest);
        const metadata = await bash(
          f.dir,
          'tar -xOf "$RUNNER_TEMP/mkw-rollback-bundle/deployment-bundle.tar" release/build-metadata.json',
          f.env,
        );
        assert.equal(metadata.code, 0, metadata.stderr);
        assert.deepEqual(JSON.parse(metadata.stdout), canonical.metadata);
      }
    });
  }
}

test("rollback transport keeps canonical image after downloaded source changes following packing", async (t) => {
  const f = await canonicalRollbackFixture(t, ROOT);
  const afterPack = `
node(){
  command node "$@"; local status=$?
  if [[ "$1" == scripts/product/release/release-bundle.mjs && "$2" == pack ]]; then
    command node -e "const fs=require('fs'),p='old-release-artifact/release-manifest.json',m=JSON.parse(fs.readFileSync(p));m.apiImage='ghcr.io/org/substituted@sha256:'+'f'.repeat(64);m.postgresImage='postgres@sha256:'+'e'.repeat(64);fs.writeFileSync(p,JSON.stringify(m))"
  fi
  return "$status"
}
`;
  const result = await bash(
    f.dir,
    f.prelude +
      afterPack +
      rollbackStep("Resolve canonical rollback snapshot") +
      "\n" +
      rollbackStep("Verify old manifest and backup-ready gate") +
      "\n" +
      rollbackStep(),
    f.env,
  );
  assert.equal(result.code, 0, result.stdout + result.stderr);
  const counters = await readFile(join(f.temp, "transport.log"), "utf8");
  assert.match(counters, /KEYSCAN/);
  assert.ok(counters.includes(`ghcr.io/org/api@sha256:${"1".repeat(64)}`));
  assert.ok(counters.includes(`postgres@sha256:${"3".repeat(64)}`));
  assert.doesNotMatch(counters, /substituted/);
});

test("canonical rollback workflow executes real resolver/archive/gate/transport and rejects substitutions before SSH", async (t) => {
  for (const variant of [
    "happy",
    "workflow",
    "producer",
    "attempt",
    "backupId",
    "digest",
    "archive",
    "metadata",
    "transport-tamper",
    "old-transport-tamper",
    "stale",
    "future",
    "target",
    "empty",
    "required-attestation",
  ]) {
    const f = await canonicalRollbackFixture(t, ROOT, variant);
    const tamper =
      variant === "old-transport-tamper"
        ? "node -e \"const fs=require('fs');const p='old-release-artifact/build-metadata.json';const b=JSON.parse(fs.readFileSync(p));b.sourceSha='f'.repeat(40);fs.writeFileSync(p,JSON.stringify(b))\"\n"
        : variant === "transport-tamper"
          ? "node -e \"const fs=require('fs');const p='backup-ready/backup-ready.json';const b=JSON.parse(fs.readFileSync(p));b.size++;fs.writeFileSync(p,JSON.stringify(b))\"\n"
          : "";
    const result = await bash(
      f.dir,
      f.prelude +
        rollbackStep("Resolve canonical rollback snapshot") +
        "\n" +
        rollbackStep("Verify old manifest and backup-ready gate") +
        "\n" +
        tamper +
        rollbackStep(),
      f.env,
    );
    assert.equal(
      result.code,
      variant === "happy" ? 0 : 78,
      `${variant}: ${result.stdout}\n${result.stderr}`,
    );
    const counters = await readFile(
      join(f.temp, "transport.log"),
      "utf8",
    ).catch(() => "");
    if (variant === "happy") {
      assert.match(counters, /KEYSCAN/);
      assert.match(counters, /SCP/);
      assert.match(counters, /staging\/rollback-fixture-/);
      assert.doesNotMatch(
        counters,
        /\/releases\/|shared\/backup-ready|tar -x|install -m 640/,
      );
      const resolved = JSON.parse(
        await readFile(join(f.temp, "rollback-backup-resolved.json"), "utf8"),
      );
      assert.equal(resolved.snapshotSha, "b".repeat(40));
      assert.equal(resolved.runAttempt, "2");
      assert.equal(resolved.artifactId, "101");
      const bytes = await readFile(
        join(
          f.temp,
          "mkw-rollback-bundle/release/deploy/compose.production.yml",
        ),
        "utf8",
      );
      assert.match(bytes, /# OLD_RELEASE_COMPOSE_DATA/);
      const controls = await readFile(
        join(
          f.temp,
          "mkw-rollback-bundle/controls/scripts/product/release/validate-backup-ready.mjs",
        ),
        "utf8",
      );
      assert.doesNotMatch(controls, /OLD_VALIDATOR_BYPASS/);
    } else {
      assert.equal(counters, "");
      assert.equal(
        await readFile(join(f.temp, "mkw_key")).catch(() => null),
        null,
      );
    }
  }
});
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
  await canonicalBackup(dir, backup({ releaseSha: "b".repeat(40) }));
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
      JSON.stringify(backup({ ...overrides, backupId: "mkw-10-2-release" })),
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
  const f = await canonicalRollbackFixture(t, ROOT);
  const dir = f.dir;
  const resolved = await bash(
    dir,
    rollbackStep("Resolve canonical rollback snapshot"),
    f.env,
  );
  assert.equal(resolved.code, 0, resolved.stderr);
  const capture =
    transport +
    `
ssh() {
  local command_text="\${!#}"
  if [[ "$command_text" == 'set -Eeuo pipefail;'* ]];then return 0;fi
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
    ...f.env,
    MKW_DEPLOY_PATH: "/home/deploy/mkw-test_1.2",
    MKW_PROJECT_NAME: "mkw",
    MKW_GATEWAY_PORT: "3200",
    MKW_SSH_HOST: "fixture.invalid",
    MKW_SSH_PORT: "22",
    MKW_SSH_HOST_FINGERPRINT: "fixture-fingerprint",
    MKW_SSH_PRIVATE_KEY: "fixture'key\n$(echo SECRET_MUST_STAY_LITERAL)",
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
      `/staging/rollback-fixture-30-1-upload/bootstrap/scripts/product/deploy-entrypoint.sh`,
    ),
    result.stdout,
  );
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /SECRET_MUST_STAY_LITERAL/,
  );
});

test("actual rollback preflight accepts current snapshot provenance and fails closed for stale, empty or unattested metadata", async (t) => {
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
    const f = await canonicalRollbackFixture(t, ROOT);
    const dir = f.dir;
    const resolve = await bash(
      dir,
      rollbackStep("Resolve canonical rollback snapshot"),
      f.env,
    );
    assert.equal(resolve.code, 0, resolve.stderr);
    await writeFile(
      join(dir, "backup-ready/backup-ready.json"),
      JSON.stringify({ ...f.readiness, ...overrides }),
    );
    const result = await bash(
      dir,
      `date() { echo ${NOW}; }\ngh() { return 1; }\n` +
        rollbackStep("Verify old manifest and backup-ready gate"),
      {
        ...f.env,
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
