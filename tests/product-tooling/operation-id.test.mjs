import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  symlink,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { bashPath, runBash } from "./fixtures/deploy-account.mjs";

const modulePath = resolve("scripts/product/release/operation-id.mjs");
const api = () =>
  import(
    new URL("../../scripts/product/release/operation-id.mjs", import.meta.url)
  );
const rejected = (e) => e.exitCode === 78;
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "mkw-task5-id-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const deploy = join(root, "deploy");
  await mkdir(deploy);
  return { root, deploy };
}

// Removing admission must allow traversal or silently normalize an identity.
test("operation_id_rejects_path_inputs without trimming or decoding", async () => {
  const { validateOperationId } = await api();
  for (const value of [
    undefined,
    null,
    12,
    {},
    [],
    "",
    ".",
    "..",
    "../x",
    "x/y",
    "x\\y",
    "/tmp/x",
    "C:\\x",
    "C:x",
    "%2e%2e",
    "x%252fy",
    "x\0y",
    "x\ny",
    "x\ry",
    "x\ty",
    "x\n",
    "x\r",
    "x\u2028",
    " run-1",
    "run-1 ",
    "ế",
    "x".repeat(161),
  ]) {
    assert.throws(() => validateOperationId(value), rejected, String(value));
  }
  for (const value of ["run-1.2_sha", ".run", "a..b", "x".repeat(160)]) {
    assert.equal(validateOperationId(value), value);
  }
});

test("CLI validates exact argument count and reports sanitized admission code 78", () => {
  for (const args of [
    ["validate", ".."],
    ["validate", "x", "extra"],
    ["unknown", "x"],
    ["resolve", "x"],
    ["reserve"],
  ]) {
    const result = spawnSync(process.execPath, [modulePath, ...args], {
      encoding: "utf8",
    });
    assert.equal(result.status, 78, result.stderr);
    assert.equal(result.stdout, "");
    assert.doesNotMatch(result.stderr, /Error:| at |node:internal/);
  }
  const valid = spawnSync(
    process.execPath,
    [modulePath, "validate", "run-1.2_sha"],
    { encoding: "utf8" },
  );
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(valid.stdout, "run-1.2_sha\n");
});

test("resolve computes direct canonical child without creating directories", async (t) => {
  const { deploy } = await fixture(t);
  const { resolveOperationDirectory, reserveOperationDirectory } = await api();
  assert.equal(
    await resolveOperationDirectory(deploy, "run-1"),
    join(await realpath(deploy), "operations", "run-1"),
  );
  assert.deepEqual(await readdir(deploy), []);
  const path = await reserveOperationDirectory(deploy, "run-1");
  assert.equal(await resolveOperationDirectory(deploy, "run-1"), path);
  assert.deepEqual(await readdir(path), []);
});

// This single-holder unit test checks filesystem no-clobber, not flock behavior.
test("reservation_is_no_clobber for completed failed incomplete directory and file", async (t) => {
  const { deploy } = await fixture(t);
  const { reserveOperationDirectory } = await api();
  const directory = await reserveOperationDirectory(deploy, "run-1");
  for (const status of ["ok", "failed", "in-progress"]) {
    await writeFile(join(directory, "evidence.json"), status);
    await assert.rejects(reserveOperationDirectory(deploy, "run-1"), rejected);
    assert.equal(
      await readFile(join(directory, "evidence.json"), "utf8"),
      status,
    );
  }
  const file = join(deploy, "operations", "file-id");
  await writeFile(file, "owned bytes");
  await assert.rejects(reserveOperationDirectory(deploy, "file-id"), rejected);
  assert.equal(await readFile(file, "utf8"), "owned bytes");
  assert.deepEqual((await readdir(join(deploy, "operations"))).sort(), [
    "file-id",
    "run-1",
  ]);
});

test("operation_path_rejects_symlink_escape including sibling prefix and junction parents", async (t) => {
  const { root, deploy } = await fixture(t);
  const { resolveOperationDirectory, reserveOperationDirectory } = await api();
  const outside = join(root, "deploy-other");
  await mkdir(outside);
  await writeFile(join(outside, "sentinel"), "unchanged");
  const link = join(deploy, "operations");
  await symlink(
    outside,
    link,
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(resolveOperationDirectory(deploy, "run-1"), rejected);
  await assert.rejects(reserveOperationDirectory(deploy, "run-1"), rejected);
  await rm(link);
  await mkdir(link);
  await symlink(
    outside,
    join(link, "run-1"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(resolveOperationDirectory(deploy, "run-1"), rejected);
  await assert.rejects(reserveOperationDirectory(deploy, "run-1"), rejected);
  const alias = join(root, "alias");
  await symlink(
    deploy,
    alias,
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(resolveOperationDirectory(alias, "another"), rejected);
  assert.equal(await readFile(join(outside, "sentinel"), "utf8"), "unchanged");
  assert.deepEqual(await readdir(outside), ["sentinel"]);
});

test("reservation_is_no_clobber under real caller flock", async (t) => {
  const probe = await runBash("-c", ["command -v flock"]);
  if (probe.code !== 0)
    return t.skip(
      "Not run / Blocked: Git Bash lacks real flock; Linux gate Task6/9 remains open",
    );
  const { deploy } = await fixture(t);
  const result = await runBash("-c", [
    'exec 9>"$1/.deploy.lock"; flock -n 9 || exit 75; node "$2" reserve "$1" locked-id || exit $?; node "$2" reserve "$1" locked-id; code=$?; [[ $code == 78 ]]',
    "fixture",
    bashPath(deploy),
    bashPath(modulePath),
  ]);
  assert.equal(result.code, 0, result.stderr);
});
