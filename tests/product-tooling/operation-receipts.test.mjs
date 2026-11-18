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
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { bashPath, runBash } from "./fixtures/deploy-account.mjs";

const modulePath = resolve("scripts/product/release/operation-receipts.mjs");
const shellPath = resolve("scripts/product/release/operation-receipts.sh");
const api = () =>
  import(
    new URL(
      "../../scripts/product/release/operation-receipts.mjs",
      import.meta.url,
    )
  );
const rejected = (e) => e.exitCode === 78;
const images = {
  api: `ghcr.io/fixture/api@sha256:${"1".repeat(64)}`,
  web: `ghcr.io/fixture/web@sha256:${"2".repeat(64)}`,
  postgres: `postgres@sha256:${"3".repeat(64)}`,
};
const expected = (id = "opA") => ({
  operationId: id,
  releaseSha: "a".repeat(40),
  imageDigests: { ...images },
});
const event = (overrides = {}) => ({
  schemaVersion: 1,
  operationId: "opA",
  eventId: randomUUID(),
  sequence: 1,
  operation: "release",
  releaseSha: "a".repeat(40),
  imageDigests: { ...images },
  status: "in-progress",
  phase: "validated",
  utc: "2026-11-15T01:02:03Z",
  mutationStarted: false,
  registry: { host: "ghcr.io", auth: "public", pull: "not-run" },
  attestationVerification: "verified",
  rollbackScope: "application-only",
  databaseRecovery: false,
  backupId: "fixture-backup",
  targetIdentity: "fixture//home/deploy/mkw/mkw",
  controlSha: "b".repeat(40),
  ...overrides,
});
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "mkw-task5-events-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, "operations", "opA");
  await mkdir(directory, { recursive: true });
  return { root, directory };
}
async function raw(
  directory,
  value,
  name = `${value.operationId}.${value.eventId}.json`,
) {
  await writeFile(join(directory, name), JSON.stringify(value));
}

test("same_second_events_never_overwrite and terminal success is selected by sequence", async (t) => {
  const { directory } = await fixture(t);
  const { writeOperationEvent, readOperationReceipt } = await api();
  const first = event(),
    last = event({
      sequence: 2,
      status: "ok",
      phase: "smoke-complete",
      mutationStarted: true,
    });
  const paths = [
    await writeOperationEvent(directory, first),
    await writeOperationEvent(directory, last),
  ];
  assert.equal(new Set(paths).size, 2);
  assert.equal(basename(paths[0]), `opA.${first.eventId}.json`);
  assert.deepEqual(JSON.parse(await readFile(paths[0], "utf8")), first);
  assert.deepEqual(await readOperationReceipt(directory, expected()), last);
  if (process.platform !== "win32")
    assert.equal((await stat(paths[0])).mode & 0o777, 0o640);
  const before = await readFile(paths[1]);
  await assert.rejects(writeOperationEvent(directory, last), rejected);
  await assert.rejects(
    writeOperationEvent(directory, event({ sequence: 3 })),
    rejected,
  );
  assert.deepEqual(await readFile(paths[1]), before);
  assert.equal((await readdir(directory)).length, 2);
});

test("select_exact_operation_not_global_latest even for prefix IDs and malformed foreign files", async (t) => {
  const { directory } = await fixture(t);
  const { readOperationReceipt } = await api();
  const good = event({ status: "ok", phase: "smoke-complete" });
  await raw(directory, good);
  await raw(
    directory,
    event({
      operationId: "opA.other",
      status: "failed",
      utc: "2026-11-15T02:00:00Z",
    }),
  );
  await writeFile(join(directory, "opB.broken.json"), "not JSON");
  assert.deepEqual(await readOperationReceipt(directory, expected()), good);
});

test("reader rejects missing malformed ambiguous failed or incomplete exact operation", async (t) => {
  const { directory } = await fixture(t);
  const { readOperationReceipt } = await api();
  const cases = [
    [],
    [event()],
    [event({ status: "failed" })],
    [event({ status: "registry-pull-failed" })],
    [
      event({ status: "ok", phase: "smoke-complete" }),
      event({ sequence: 2, status: "failed" }),
    ],
    [event({ status: "ok", phase: "smoke-complete" }), event({ sequence: 2 })],
    [event(), event({ status: "ok", phase: "smoke-complete" })],
    [
      event({
        status: "ok",
        phase: "smoke-complete",
        releaseSha: "c".repeat(40),
      }),
    ],
    [
      event({
        status: "ok",
        phase: "smoke-complete",
        imageDigests: { ...images, api: images.web },
      }),
    ],
    [
      event(),
      event({
        sequence: 2,
        status: "ok",
        phase: "smoke-complete",
        controlSha: "c".repeat(40),
      }),
    ],
  ];
  for (const values of cases) {
    for (const name of await readdir(directory))
      await rm(join(directory, name));
    for (const value of values) await raw(directory, value);
    await assert.rejects(
      readOperationReceipt(directory, expected()),
      rejected,
      JSON.stringify(values),
    );
  }
  for (const text of [
    "{",
    '{"operationId":"opA","operationId":"opA"}',
    JSON.stringify(event({ password: "PRIVATE_MARKER" })),
  ]) {
    for (const name of await readdir(directory))
      await rm(join(directory, name));
    await writeFile(join(directory, `opA.${randomUUID()}.json`), text);
    await assert.rejects(readOperationReceipt(directory, expected()), rejected);
  }
});

test("strict schema rejects wrong types identity unknown metadata and premature ok before writing", async (t) => {
  const { directory } = await fixture(t);
  const { writeOperationEvent, readOperationReceipt } = await api();
  for (const patch of [
    { schemaVersion: "1" },
    { operationId: ".." },
    { eventId: "../x" },
    { sequence: 0 },
    { sequence: 1.5 },
    { operation: "restore" },
    { status: "success" },
    { phase: "unknown" },
    { status: "ok" },
    { utc: "2026-99-15T01:02:03Z" },
    { utc: "2026-02-30T01:02:03Z" },
    { utc: "2026-11-15T01:02:03Z\n" },
    { mutationStarted: "false" },
    { databaseRecovery: true },
    { rollbackScope: "database" },
    { releaseSha: "short" },
    { controlSha: "short" },
    { releaseSha: "a".repeat(40) + "\n" },
    { backupId: "" },
    { targetIdentity: "bad\nvalue" },
    { targetIdentity: "value\n" },
    { imageDigests: { ...images, api: "api:latest" } },
    { imageDigests: { ...images, api: images.api + "\n" } },
    {
      registry: {
        host: "ghcr.io",
        auth: "public",
        pull: "verified",
        token: "PRIVATE_MARKER",
      },
    },
    { password: "PRIVATE_MARKER" },
    { password: undefined },
  ]) {
    await assert.rejects(
      writeOperationEvent(directory, event(patch)),
      rejected,
      JSON.stringify(patch),
    );
  }
  assert.deepEqual(await readdir(directory), []);
  await assert.rejects(
    readOperationReceipt(directory, { ...expected(), operationId: ".." }),
    rejected,
  );
});

test("existing not-configured attestation and application rollback metadata remain representable", async (t) => {
  const { directory } = await fixture(t);
  const { writeOperationEvent, readOperationReceipt } = await api();
  const value = event({
    operation: "application-rollback",
    attestationVerification: "not-configured",
    status: "ok",
    phase: "smoke-complete",
  });
  await writeOperationEvent(directory, value);
  assert.deepEqual(await readOperationReceipt(directory, expected()), value);
});

test("verified registry pull survives writer/reader roundtrip and failed receipt after pull", async (t) => {
  const { root, directory } = await fixture(t);
  const { writeOperationEvent, readOperationReceipt } = await api();
  const registry = { host: "ghcr.io", auth: "public", pull: "verified" };
  await writeOperationEvent(directory, event());
  await writeOperationEvent(
    directory,
    event({ sequence: 2, phase: "published", registry }),
  );
  const success = event({
    sequence: 3,
    status: "ok",
    phase: "smoke-complete",
    mutationStarted: true,
    registry,
  });
  await writeOperationEvent(directory, success);
  assert.deepEqual(await readOperationReceipt(directory, expected()), success);

  const failedDir = join(root, "failed-attempt", "operations", "opA");
  await mkdir(failedDir, { recursive: true });
  const failure = event({
    status: "failed",
    phase: "db-prepared",
    mutationStarted: true,
    registry,
  });
  const path = await writeOperationEvent(failedDir, failure);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), failure);
  await assert.rejects(readOperationReceipt(failedDir, expected()), rejected);
});

test("receipt metadata preserves existing manifest and backup identity formats without normalization", async (t) => {
  const { directory } = await fixture(t);
  const { writeOperationEvent, readOperationReceipt } = await api();
  const value = event({
    releaseSha: "A".repeat(64),
    targetIdentity: "máy-thử/[::1]/mkw",
    backupId: "bản sao 01",
    status: "ok",
    phase: "smoke-complete",
  });
  await writeOperationEvent(directory, value);
  assert.deepEqual(
    await readOperationReceipt(directory, {
      ...expected(),
      releaseSha: "A".repeat(64),
    }),
    value,
  );
  await assert.rejects(
    readOperationReceipt(directory, {
      ...expected(),
      releaseSha: "a".repeat(64),
    }),
    rejected,
  );
});

test("expected identity must match every image and selected filenames must match JSON IDs", async (t) => {
  const { directory } = await fixture(t);
  const { readOperationReceipt } = await api();
  const value = event({ status: "ok", phase: "smoke-complete" });
  await raw(directory, value);
  for (const key of ["api", "web", "postgres"]) {
    await assert.rejects(
      readOperationReceipt(directory, {
        ...expected(),
        imageDigests: { ...images, [key]: `fixture@sha256:${"9".repeat(64)}` },
      }),
      rejected,
    );
  }
  await raw(directory, value, `opA.${randomUUID()}.json`);
  await assert.rejects(readOperationReceipt(directory, expected()), rejected);
  for (const name of await readdir(directory)) await rm(join(directory, name));
  await writeFile(join(directory, "opA.malformed.json"), "{}");
  await assert.rejects(readOperationReceipt(directory, expected()), rejected);
});

test("writer refuses collisions duplicate sequences and identity changes preserving existing evidence", async (t) => {
  const { directory } = await fixture(t);
  const { writeOperationEvent } = await api();
  const first = event();
  const path = await writeOperationEvent(directory, first);
  for (const next of [
    event(),
    event({ sequence: 2, eventId: first.eventId }),
    event({ sequence: 2, releaseSha: "c".repeat(40) }),
    event({ sequence: 2, backupId: "other" }),
  ]) {
    await assert.rejects(writeOperationEvent(directory, next), rejected);
  }
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), first);
  assert.deepEqual(await readdir(directory), [basename(path)]);
});

test("receipt directory must be canonical exact operation and existing; symlinks never read or mutate outside", async (t) => {
  const { root, directory } = await fixture(t);
  const { writeOperationEvent, readOperationReceipt } = await api();
  for (const path of [
    root,
    join(root, "operations", "missing"),
    join(root, "other", "opA"),
  ]) {
    await assert.rejects(writeOperationEvent(path, event()), rejected);
    await assert.rejects(readOperationReceipt(path, expected()), rejected);
  }
  await assert.rejects(
    writeOperationEvent(directory, event({ operationId: "opB" })),
    rejected,
  );
  const outside = join(root, "outside");
  await mkdir(outside);
  await rm(directory, { recursive: true });
  await symlink(
    outside,
    directory,
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(writeOperationEvent(directory, event()), rejected);
  await assert.rejects(readOperationReceipt(directory, expected()), rejected);
  assert.deepEqual(await readdir(outside), []);
});

test("atomic rename failure removes only owned temp and retains existing evidence", async (t) => {
  const { directory } = await fixture(t);
  const { writeOperationEvent } = await api();
  const first = event();
  const path = await writeOperationEvent(directory, first);
  // OS-boundary injection, no production test flag or filesystem permission assumption.
  const code = `import * as fs from 'node:fs/promises';
    import {syncBuiltinESMExports} from 'node:module';
    import {createRequire} from 'node:module';
    const require=createRequire(import.meta.url); const native=require('node:fs/promises');
    const original=native.rename; native.rename=async()=>{throw Object.assign(new Error('PRIVATE_MARKER'),{code:'EACCES'});};
    syncBuiltinESMExports();
    const {writeOperationEvent}=await import(${JSON.stringify(pathToFileURL(modulePath).href)});
    try {await writeOperationEvent(process.argv[1],JSON.parse(process.argv[2])); process.exitCode=99;}
    catch(e){process.exitCode=e.exitCode ?? 98;} finally {native.rename=original; syncBuiltinESMExports();}
    void fs;`;
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      code,
      directory,
      JSON.stringify(event({ sequence: 2 })),
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 78, result.stderr);
  assert.equal(result.stdout + result.stderr, "");
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), first);
  assert.deepEqual(await readdir(directory), [basename(path)]);
});

test("CLI write/read validates expected identity and sanitizes raw errors", async (t) => {
  const { root, directory } = await fixture(t);
  const json = join(root, "input.json"),
    exp = join(root, "expected.json");
  const value = event({ status: "ok", phase: "smoke-complete" });
  await writeFile(json, JSON.stringify(value));
  await writeFile(exp, JSON.stringify(expected()));
  const write = spawnSync(
    process.execPath,
    [modulePath, "write", directory, json],
    { encoding: "utf8" },
  );
  assert.equal(write.status, 0, write.stderr);
  assert.equal(
    write.stdout.trim(),
    join(directory, `opA.${value.eventId}.json`),
  );
  const read = spawnSync(
    process.execPath,
    [modulePath, "read", directory, exp],
    { encoding: "utf8" },
  );
  assert.equal(read.status, 0, read.stderr);
  assert.deepEqual(JSON.parse(read.stdout), value);
  await writeFile(exp, '{"operationId":"PRIVATE_MARKER"}');
  const bad = spawnSync(
    process.execPath,
    [modulePath, "read", directory, exp],
    { encoding: "utf8" },
  );
  assert.equal(bad.status, 78);
  assert.equal(bad.stdout, "");
  assert.doesNotMatch(bad.stderr, /PRIVATE_MARKER|Error:| at |node:internal/);
});

test("shell record builds nonsecret metadata via run_node and preserves primary mutation error on reporting failure", async (t) => {
  const { root, directory } = await fixture(t);
  const args = [
    "fixture",
    bashPath(shellPath),
    bashPath(directory),
    images.api,
    images.web,
    images.postgres,
  ];
  const setup =
    'source "$1"; operation_dir=$2; MKW_OPERATION_ID=opA; release_sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; MKW_API_IMAGE=$3; MKW_WEB_IMAGE=$4; MKW_POSTGRES_IMAGE=$5; MKW_CONTROL_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; backup_id=fixture-backup; backup_expected_target_identity=fixture-target; MKW_OPERATION_KIND=release; MKW_REGISTRY_HOST=ghcr.io; registry_auth_status=public; registry_pull_status=verified; mutation_started=false; MKW_ATTESTATION_STATUS=verified; run_node() { node "$@"; }; ';
  const result = await runBash("-c", [
    "set -Eeuo pipefail; " +
      setup +
      "record_operation_event in-progress validated; mutation_started=true; record_operation_event ok smoke-complete",
    ...args,
  ]);
  assert.equal(result.code, 0, result.stderr);
  const values = await Promise.all(
    (await readdir(directory)).map(async (n) =>
      JSON.parse(await readFile(join(directory, n), "utf8")),
    ),
  );
  assert.deepEqual(values.map((v) => v.sequence).sort(), [1, 2]);
  assert.equal(values.find((v) => v.status === "ok").phase, "smoke-complete");
  for (const value of values) assert.equal(value.registry.pull, "verified");
  const { readOperationReceipt } = await api();
  assert.deepEqual(
    await readOperationReceipt(directory, expected()),
    values.find((v) => v.status === "ok"),
  );
  const afterPullDir = join(root, "after-pull-failure", "operations", "opA");
  await mkdir(afterPullDir, { recursive: true });
  const afterPullArgs = [...args];
  afterPullArgs[2] = bashPath(afterPullDir);
  const afterPull = await runBash("-c", [
    "set -Eeuo pipefail; " +
      setup +
      'mutation_started=true; on_error() { local code=$?; trap - ERR; record_operation_event failed db-prepared || true; exit "$code"; }; trap on_error ERR; (exit 97)',
    ...afterPullArgs,
  ]);
  assert.equal(afterPull.code, 97, afterPull.stderr);
  assert.equal(afterPull.stderr, "");
  const [failedName] = await readdir(afterPullDir);
  const failedValue = JSON.parse(
    await readFile(join(afterPullDir, failedName), "utf8"),
  );
  assert.equal(failedValue.status, "failed");
  assert.equal(failedValue.phase, "db-prepared");
  assert.equal(failedValue.registry.pull, "verified");
  await assert.rejects(
    readOperationReceipt(afterPullDir, expected()),
    rejected,
  );
  const sentinel = join(root, "not-a-directory");
  await writeFile(sentinel, "must remain");
  args[2] = bashPath(sentinel);
  const failed = await runBash("-c", [
    "set -Eeuo pipefail; " +
      setup +
      'on_error() { local code=$?; trap - ERR; record_operation_event failed db-prepared || true; exit "$code"; }; trap on_error ERR; (exit 97)',
    ...args,
  ]);
  assert.equal(failed.code, 97, failed.stderr);
  assert.equal(await readFile(sentinel, "utf8"), "must remain");
  assert.doesNotMatch(
    failed.stderr,
    /PRIVATE_MARKER|Error:| at |node:internal/,
  );

  // Real helper + real temp write, fault only at the OS rename boundary.
  const failedDir = join(root, "failed-attempt", "operations", "opA");
  await mkdir(failedDir, { recursive: true });
  const injector = join(root, "deny-rename.mjs"),
    reached = join(root, "rename-reached");
  await writeFile(
    injector,
    `import {createRequire,syncBuiltinESMExports} from 'node:module';
    const fs=createRequire(import.meta.url)('node:fs/promises'); const write=fs.writeFile;
    fs.rename=async()=>{await write(${JSON.stringify(reached)},'injected EACCES'); throw Object.assign(new Error('PRIVATE_MARKER'),{code:'EACCES'});}; syncBuiltinESMExports();`,
  );
  const denied = await runBash("-c", [
    "set -Eeuo pipefail; " +
      setup +
      'injector=$6; run_node() { node --import "$injector" "$@"; }; on_error() { local code=$?; trap - ERR; record_operation_event failed db-prepared || true; exit "$code"; }; trap on_error ERR; (exit 97)',
    "fixture",
    bashPath(shellPath),
    bashPath(failedDir),
    images.api,
    images.web,
    images.postgres,
    pathToFileURL(injector).href,
  ]);
  assert.equal(denied.code, 97, denied.stderr);
  assert.match(denied.stderr, /^operation receipt rejected\r?\n$/u);
  assert.equal(await readFile(reached, "utf8"), "injected EACCES");
  assert.deepEqual(await readdir(failedDir), []);
  assert.doesNotMatch(
    denied.stderr,
    /PRIVATE_MARKER|Error:| at |node:internal/,
  );
});
