import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const bash =
  process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const posix = (p) =>
  p
    .replaceAll("\\", "/")
    .replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`);
const source = async (name) =>
  (
    await readFile(join(root, `.github/workflows/${name}.yml`), "utf8")
  ).replaceAll("\r\n", "\n");
function block(yaml, name) {
  const section = yaml
    .split(`      - name: ${name}\n`)[1]
    ?.split(/\n {6}- /)[0];
  assert.ok(section, `missing step ${name}`);
  return section.split("        run: |\n")[1].replace(/^ {10}/gm, "");
}
function run(script, cwd, env = {}) {
  return spawnSync(bash, ["-Eeuo", "pipefail", "-c", script], {
    cwd,
    encoding: "utf8",
    timeout: 20000,
    windowsHide: true,
    env: { ...process.env, ...env },
  });
}
const sha = "a".repeat(40);
const manifest = {
  schemaVersion: "1",
  releaseSha: sha,
  sourceRepository: "org/repo",
  createdAt: "2026-11-11T10:00:00Z",
  apiImage: `x@sha256:${"1".repeat(64)}`,
  webImage: `x@sha256:${"2".repeat(64)}`,
  postgresImage: `postgres@sha256:${"3".repeat(64)}`,
  artifacts: {
    sbom: { sha256: "a".repeat(64), size: 1 },
    provenance: { sha256: "b".repeat(64), size: 1 },
  },
};
const hostPins = new Map();
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "mkw-final-boundary-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  t.after(() => hostPins.delete(dir));
  for (const p of [
    "release-artifact",
    "backup-ready",
    "old-release-artifact",
    "release-source/scripts/product",
    "home",
    "current",
  ])
    await mkdir(join(dir, p), { recursive: true });
  await cp(join(root, "scripts"), join(dir, "policy/scripts"), {
    recursive: true,
  });
  await cp(join(root, "scripts"), join(dir, "scripts"), { recursive: true });
  await cp(join(root, "deploy"), join(dir, "deploy"), { recursive: true });
  await cp(join(root, "deploy"), join(dir, "release-source/deploy"), {
    recursive: true,
  });
  for (const p of ["release-artifact", "old-release-artifact"]) {
    const text = JSON.stringify(manifest);
    await writeFile(join(dir, p, "release-manifest.json"), text);
    await writeFile(
      join(dir, p, "release-manifest.sha256"),
      `${createHash("sha256").update(text).digest("hex")}  release-manifest.json\n`,
    );
  }
  await writeFile(join(dir, "current/compose.rendered.yml"), "fixture-compose");
  await writeFile(
    join(dir, "release-source/scripts/product/post-deploy-verify.sh"),
    "echo HISTORICAL_BYPASS; touch historical-sentinel; exit 0\n",
  );
  await writeFile(join(dir, "backup-ready/backup-ready.json"), "{}");
  const keys = run(
    'ssh-keygen -q -t ed25519 -N "" -f trusted-key && ssh-keygen -q -t ed25519 -N "" -f hostile-key',
    dir,
  );
  assert.equal(keys.status, 0, keys.stderr);
  const trustedLine = `host ${(await readFile(join(dir, "trusted-key.pub"), "utf8")).trim()}`;
  const hostileLine = `host ${(await readFile(join(dir, "hostile-key.pub"), "utf8")).trim()}`;
  await writeFile(join(dir, "host-scan"), `${trustedLine}\n${hostileLine}\n`);
  await writeFile(join(dir, "expected-pinned"), `${trustedLine}\n`);
  const fingerprints = run("ssh-keygen -lf trusted-key.pub -E sha256", dir);
  assert.equal(fingerprints.status, 0, fingerprints.stderr);
  hostPins.set(dir, {
    fingerprint: fingerprints.stdout.trim().split(/\s+/)[1],
    trustedLine,
  });
  return dir;
}
const envFor = (dir) => ({
  RELEASE_SHA: sha,
  OLD_RELEASE_SHA: sha,
  MODE: "release",
  MKW_SSH_HOST: "fixture.invalid",
  MKW_SSH_PORT: "22",
  MKW_SSH_HOST_FINGERPRINT: hostPins.get(dir).fingerprint,
  HOST_SCAN_FIXTURE: posix(join(dir, "host-scan")),
  MKW_SSH_PRIVATE_KEY: "fixture-key",
  MKW_DEPLOY_PATH: "/home/deploy/mkw",
  MKW_PROJECT_NAME: "mkw",
  MKW_GATEWAY_PORT: "3200",
  MKW_ATTESTATION_MODE: "off",
  MKW_ATTESTATION_STATUS: "not-configured",
  MKW_BACKUP_MAX_AGE_SECONDS: "86400",
  MKW_BACKUP_EXPECTED_KIND: "BACKUP",
  MKW_BACKUP_EXPECTED_HOST: "fixture.invalid",
  MKW_BACKUP_EXPECTED_DATABASE: "mkw",
  MKW_BACKUP_EXPECTED_TARGET_IDENTITY: "fixture.invalid//home/deploy/mkw/mkw",
  HOME: posix(join(dir, "home")),
  RUNNER_TEMP: posix(dir),
  GITHUB_WORKSPACE: posix(dir),
});
const scan = `
install() { if [[ "$*" == *' -d '* ]]; then mkdir -p "\${!#}"; else cp "\${@: -2:1}" "\${!#}"; fi; }
chmod() { :; }
ssh-keyscan() { cat "$HOST_SCAN_FIXTURE"; }
`;

test("I-02: historical bypass verifier stays data and trusted verifier rejects failing runtime", async (t) => {
  const dir = await fixture(t);
  const result = run(
    scan +
      `
docker() { echo TRUSTED_RUNTIME_FAILED >&2; return 77; }; export -f docker
ssh() { eval "\${!#}"; }
` +
      block(
        await source("post-deploy-verify"),
        "Verify running digests, schema, gateway, and startup health",
      ),
    dir,
    { ...envFor(dir), MKW_DEPLOY_PATH: posix(dir) },
  );
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /TRUSTED_RUNTIME_FAILED/);
  assert.doesNotMatch(result.stdout, /HISTORICAL_BYPASS/);
  assert.equal(
    await readFile(join(dir, "historical-sentinel")).catch(() => null),
    null,
  );
});

for (const [workflow, name] of [
  ["deploy", "Run remote deploy entrypoint with verified artifact"],
  [
    "post-deploy-verify",
    "Verify running digests, schema, gateway, and startup health",
  ],
  ["rollback", "Redeploy exact old digests through deploy-entrypoint.sh"],
]) {
  test(`I-05: ${workflow} filters mixed host keys and uses pinned file for every transport`, async (t) => {
    const dir = await fixture(t);
    const result = run(
      scan +
        `
check_transport() {
  local found=0 arg
  for arg in "$@"; do
    if [[ "$arg" == UserKnownHostsFile=* ]]; then
      local file="\${arg#UserKnownHostsFile=}"
      [[ -s "$file" ]] && cmp -s "$file" expected-pinned || return 81
      found=1
    fi
  done
  ((found == 1)) || { echo UNPINNED_TRANSPORT >&2; return 82; }
  echo PINNED_TRANSPORT
}
ssh() { check_transport "$@"; }
scp() { check_transport "$@"; }
` +
        block(await source(workflow), name),
      dir,
      envFor(dir),
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /PINNED_TRANSPORT/);
    const pinned = await readFile(join(dir, "home/.ssh/known_hosts"), "utf8");
    assert.equal(pinned, await readFile(join(dir, "expected-pinned"), "utf8"));
  });
}

for (const workflow of ["deploy", "post-deploy-verify"]) {
  test(`I-04: ${workflow} accepts old preflight payloads and requires exact IDs in release`, async (t) => {
    const dir = await fixture(t);
    const yaml = await source(workflow);
    const inputs = yaml.split("    inputs:\n")[1].split(/\n[^ ]/)[0];
    const required = [
      ...inputs.matchAll(
        /^ {6}([a-z_]+):\n(?:(?!^ {6}[a-z_]+:)[\s\S])*?^ {8}required: true/gm,
      ),
    ].map((m) => m[1]);
    const old =
      workflow === "deploy"
        ? [
            "mode",
            "release_sha",
            "release_run_id",
            "backup_run_id",
            "backup_artifact_name",
          ]
        : ["mode", "release_sha", "release_run_id", "rollback_on_failure"];
    for (const name of required)
      assert.ok(
        old.includes(name),
        `old preflight payload missing newly required ${name}`,
      );
    const gate = block(yaml, "Validate mode-specific artifact inputs");
    const baseEnv = {
      RELEASE_RUN_ID: "10",
      BACKUP_RUN_ID: "20",
      BACKUP_ARTIFACT_NAME: "mkw-backup-20-1",
    };
    for (const mode of ["dry-run", "bootstrap"]) {
      const result = run(gate, dir, {
        ...baseEnv,
        MODE: mode,
        RELEASE_ARTIFACT_ID: "",
        BACKUP_ARTIFACT_ID: "",
        BACKUP_KIND: "",
      });
      assert.equal(result.status, 0, result.stderr);
    }
    for (const ids of ["", "1,2", "0", "garbage"]) {
      const result = run(gate, dir, {
        ...baseEnv,
        MODE: "release",
        RELEASE_ARTIFACT_ID: ids,
        BACKUP_ARTIFACT_ID: ids,
        BACKUP_ARTIFACT_NAME: "mkw-backup-20-1",
        BACKUP_KIND: "BACKUP",
      });
      assert.notEqual(result.status, 0);
    }
    const result = run(gate, dir, {
      ...baseEnv,
      MODE: "release",
      RELEASE_RUN_ID: "10",
      BACKUP_RUN_ID: "20",
      RELEASE_ARTIFACT_ID: "101",
      BACKUP_ARTIFACT_ID: "201",
      BACKUP_ARTIFACT_NAME: "mkw-backup-20-1",
      BACKUP_KIND: "BACKUP",
    });
    assert.equal(result.status, 0, result.stderr);
  });
}

test("I-01: rollback rejects non-main dispatch before checking out or resolving old payload", async (t) => {
  const dir = await fixture(t);
  const script = block(
    await source("rollback"),
    "Require canonical rollback dispatch",
  );
  for (const ref of [
    "refs/heads/feature",
    "refs/tags/main",
    "",
    "refs/heads/main",
  ]) {
    const result = run(script, dir, { GITHUB_REF: ref });
    assert.equal(result.status === 0, ref === "refs/heads/main", result.stderr);
  }
});
