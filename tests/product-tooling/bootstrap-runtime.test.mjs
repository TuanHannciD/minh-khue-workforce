// Exercise the workflow's bootstrap transport and real entrypoint/admission.
// Only HTTPS/SSH/SCP/Docker are doubles; tar/checksums/Node/flock are real.
import test from "node:test";
import assert from "node:assert/strict";
import {
  chmod,
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { makeDeployFixtureRoot } from "./fixtures/deploy-root.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const linux =
  process.platform === "linux"
    ? false
    : "Not run: requires Linux /home, GNU tar and real flock";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const workflow = await readFile(
  join(ROOT, ".github/workflows/deploy.yml"),
  "utf8",
);
const block = workflow
  .slice(
    workflow.indexOf('          if [[ "$MODE" == bootstrap ]]; then'),
    workflow.indexOf('          if [[ "$MODE" != release ]]; then'),
  )
  .replace(/^ {10}/gm, "");

async function fixture(t) {
  const root = await makeDeployFixtureRoot("mkw-bootstrap-");
  t.after(() => rm(root, { recursive: true, force: true }));
  const runner = join(root, "runner"),
    remoteBin = join(root, "remote-bin");
  for (const p of [
    "runner/policy/scripts/product",
    "runner/temp",
    "runner/bin",
    "remote-bin",
    "archive/node-v24.22.1-linux-x64/bin",
  ])
    await mkdir(join(root, p), { recursive: true });
  await cp(
    join(ROOT, "scripts/product/release"),
    join(runner, "policy/scripts/product/release"),
    { recursive: true },
  );
  for (const p of ["deploy-entrypoint.sh", "post-deploy-verify.sh"])
    await cp(
      join(ROOT, "scripts/product", p),
      join(runner, "policy/scripts/product", p),
    );
  // The host command path deliberately contains no Node, even on Debian hosts.
  for (const name of [
    "bash",
    "dirname",
    "realpath",
    "df",
    "awk",
    "install",
    "flock",
    "chmod",
    "openssl",
    "mktemp",
    "mv",
    "rm",
    "id",
    "sha256sum",
    "uname",
    "mkdir",
  ]) {
    const found = spawnSync("sh", ["-c", `command -v ${name}`], {
      encoding: "utf8",
    });
    assert.equal(found.status, 0, `Linux prerequisite ${name}`);
    await symlink(found.stdout.trim(), join(remoteBin, name));
  }
  const script = async (path, text) => {
    await writeFile(path, text);
    await chmod(path, 0o755);
  };
  await script(
    join(remoteBin, "docker"),
    '#!/bin/bash\n[[ "$*" == "compose version" ]]\n',
  );
  const noNode = spawnSync("/bin/bash", ["-c", "command -v node"], {
    env: { ...process.env, PATH: remoteBin },
  });
  assert.equal(noNode.status, 1, "remote host must have no Node");
  await cp(
    process.execPath,
    join(root, "archive/node-v24.22.1-linux-x64/bin/node"),
  );
  const archive = join(root, "node-v24.22.1-linux-x64.tar.xz");
  const packed = spawnSync(
    "tar",
    [
      "-I",
      "xz -0",
      "-cf",
      archive,
      "-C",
      join(root, "archive"),
      "node-v24.22.1-linux-x64",
    ],
    { encoding: "utf8" },
  );
  assert.equal(packed.status, 0, packed.stderr);
  await writeFile(
    join(root, "SHASUMS256.txt"),
    `${hash(await readFile(archive))}  node-v24.22.1-linux-x64.tar.xz\n`,
  );
  await script(
    join(runner, "bin/curl"),
    `#!/bin/bash
set -Eeuo pipefail
while (($#)); do case "$1" in --output|-o) shift; out=$1 ;; https:*) url=$1 ;; esac; shift; done
case "$url" in
 https://nodejs.org/dist/v24.22.1/SHASUMS256.txt) cp "$FIXTURE_ROOT/SHASUMS256.txt" "$out" ;;
 https://nodejs.org/dist/v24.22.1/node-v24.22.1-linux-x64.tar.xz) cp "$FIXTURE_ROOT/node-v24.22.1-linux-x64.tar.xz" "$out" ;;
 *) exit 99 ;;
esac
`,
  );
  await script(
    join(runner, "bin/ssh"),
    `#!/bin/bash
set -Eeuo pipefail
command_text="\${@: -1}"
if [[ "$command_text" == 'uname -m' ]]; then echo x86_64; exit; fi
export PATH="$REMOTE_BIN"
exec /bin/bash -c "$command_text"
`,
  );
  await script(
    join(runner, "bin/scp"),
    `#!/bin/bash
set -Eeuo pipefail
source_path="\${@: -2:1}"; destination="\${@: -1}"
cp -R -- "$source_path" "\${destination#*:}"
if [[ "\${TAMPER_RUNTIME:-false}" == true && -f "\${destination#*:}/bin/node" ]]; then
 printf tampered > "\${destination#*:}/bin/node"
fi
`,
  );
  const env = {
    ...process.env,
    PATH: `${runner}/bin:${process.env.PATH}`,
    RUNNER_TEMP: join(runner, "temp"),
    FIXTURE_ROOT: root,
    REMOTE_BIN: remoteBin,
    MKW_DEPLOY_PATH: join(root, "deploy"),
    MKW_PROJECT_NAME: "fixture",
    MKW_GATEWAY_PORT: "3200",
    MKW_OPERATION_ID: "bootstrap-1",
    MKW_SSH_HOST: "fixture.invalid",
    MKW_SSH_PORT: "22",
    GITHUB_RUN_ID: "10",
    GITHUB_RUN_ATTEMPT: "1",
    MODE: "bootstrap",
    MKW_API_IMAGE: "",
    MKW_VALIDATOR_RUNTIME: "auto",
  };
  const run = (extra = {}) =>
    spawnSync("/bin/bash", ["-c", `set -Eeuo pipefail\n${block}`], {
      cwd: runner,
      env: { ...env, ...extra },
      encoding: "utf8",
      timeout: 30000,
    });
  return { root, env, run, remoteBin };
}

test(
  "workflow bootstrap supplies a verified runtime without host Node and preserves admission/no-clobber",
  { skip: linux },
  async (t) => {
    const f = await fixture(t);
    const first = f.run();
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /BOOTSTRAP_OK/);
    const deploy = f.env.MKW_DEPLOY_PATH;
    const operation = join(deploy, "operations/bootstrap-1");
    assert.equal(
      await readFile(join(operation, "bootstrap-complete"), "utf8"),
      "ok\n",
    );
    const before = {};
    for (const name of ["db.env", "api.env"]) {
      const path = join(deploy, "shared", name);
      before[name] = {
        bytes: await readFile(path),
        inode: (await stat(path)).ino,
      };
      assert.equal((await stat(path)).mode & 0o777, 0o600);
    }
    // Use the exact command produced by the workflow's remote runtime contract.
    const upload = join(deploy, "staging/bootstrap-1-10-1-bootstrap");
    const invoke = (id) =>
      spawnSync(
        "/bin/bash",
        [
          join(upload, "controls/scripts/product/deploy-entrypoint.sh"),
          "--bootstrap",
        ],
        {
          env: {
            ...f.env,
            PATH: `${upload}/runtime/bin:${f.remoteBin}`,
            MKW_CONTROL_ROOT: join(upload, "controls"),
            MKW_OPERATION_ID: id,
          },
          encoding: "utf8",
        },
      );
    for (const id of [
      "..",
      "../escape",
      "bad\n",
      "x".repeat(161),
      "bootstrap-1",
    ]) {
      const rejected = invoke(id);
      assert.equal(
        rejected.status,
        78,
        `${JSON.stringify(id)}: ${rejected.stderr}`,
      );
      assert.doesNotMatch(rejected.stdout, /BOOTSTRAP_OK/);
    }
    assert.deepEqual(await readdir(join(deploy, "operations")), [
      "bootstrap-1",
    ]);
    assert.deepEqual(await readdir(operation), ["bootstrap-complete"]);
    const next = invoke("bootstrap-2");
    assert.equal(next.status, 0, next.stderr);
    for (const name of Object.keys(before)) {
      const path = join(deploy, "shared", name);
      assert.deepEqual(await readFile(path), before[name].bytes);
      assert.equal((await stat(path)).ino, before[name].inode);
    }
  },
);

test(
  "bootstrap rejects a downloaded archive with a wrong checksum before admission",
  { skip: linux },
  async (t) => {
    const f = await fixture(t);
    await writeFile(
      join(f.root, "SHASUMS256.txt"),
      `${"0".repeat(64)}  node-v24.22.1-linux-x64.tar.xz\n`,
    );
    const result = f.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /FAILED/);
    await assert.rejects(stat(join(f.env.MKW_DEPLOY_PATH, "operations")), {
      code: "ENOENT",
    });
  },
);

test(
  "bootstrap rejects runtime transport tampering before admission",
  { skip: linux },
  async (t) => {
    const f = await fixture(t);
    const result = f.run({ TAMPER_RUNTIME: "true" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /checksum did NOT match/);
    await assert.rejects(stat(join(f.env.MKW_DEPLOY_PATH, "operations")), {
      code: "ENOENT",
    });
  },
);
