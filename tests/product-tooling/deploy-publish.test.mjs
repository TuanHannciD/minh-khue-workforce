import test from "node:test";
// Map: fixture owns complete trusted/staging trees and external Docker doubles;
// hashes/barrier own preservation and synchronization; tests execute full scripts
// under real fd9 flock. Linux-only tests are explicitly Not run on Windows.
import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import {
  chmod,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  stat,
  writeFile,
} from "node:fs/promises";
import { watch } from "node:fs";
import { createHash } from "node:crypto";
import { bashPath, runBash } from "./fixtures/deploy-account.mjs";
import * as verifier from "../../scripts/product/release/verify-release.mjs";
import { readOperationReceipt } from "../../scripts/product/release/operation-receipts.mjs";
import { writeBundleInventory } from "../../scripts/product/release/release-bundle.mjs";
import { resolveRollbackBackup } from "../../scripts/product/release/resolve-rollback-backup.mjs";

import {
  entrypointFixture as fixture,
  linuxOnly,
  flockProbe,
  SHA,
  images,
} from "./fixtures/deploy-entrypoint.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const ENTRY = bashPath(join(ROOT, "scripts/product/deploy-entrypoint.sh"));
async function canonicalSnapshot(stage) {
  const path = join(stage, "operation/backup-ready.json");
  const readiness = JSON.parse(await readFile(path, "utf8"));
  readiness.backupId = "mkw-10-2-release";
  readiness.releaseSha = "b".repeat(40);
  await writeFile(path, JSON.stringify(readiness));
  const artifact = {
    id: 101,
    name: "mkw-backup-10-2",
    workflow_run: { id: 10 },
    expired: false,
    digest: `sha256:${"d".repeat(64)}`,
  };
  const resolved = await resolveRollbackBackup(
    {
      repository: "org/repo",
      dispatchRef: "refs/heads/main",
      artifactId: "101",
      runId: "10",
      target: {
        host: "fixture-db",
        database: "mkw",
        targetIdentity: "fixture-target",
      },
      now: new Date().toISOString(),
      maxAgeSeconds: 86400,
    },
    {
      artifact: async () => artifact,
      run: async () => ({
        id: 10,
        run_attempt: 2,
        path: ".github/workflows/backup.yml",
        event: "workflow_dispatch",
        head_branch: "main",
        status: "completed",
        conclusion: "success",
      }),
      jsonFromArtifact: async () => readiness,
    },
  );
  await writeFile(
    join(stage, "operation/rollback-backup-resolved.json"),
    JSON.stringify(resolved),
  );
  await writeBundleInventory(join(stage, "operation"));
  return resolved;
}
for (const variant of ["missing", "changed", "stale"])
  test(
    `rollback canonical snapshot under-lock rejects ${variant} before publish/migration/apply`,
    { skip: linuxOnly },
    async (t) => {
      const f = await fixture(t),
        stage = await f.stage("rollback-gate");
      await canonicalSnapshot(stage);
      const prepare = `
flock(){
 command flock "$@" || return "$?"
 node --input-type=module - "$TAMPER_STAGE" "$TAMPER_VARIANT" <<'NODE'
import {readFile,writeFile,unlink} from 'node:fs/promises';
const [stage,variant]=process.argv.slice(2),p=stage+'/operation/rollback-backup-resolved.json',b=stage+'/operation/backup-ready.json';
if(variant==='missing')await unlink(p);else {
 const value=JSON.parse(await readFile(b,'utf8'));value.size++;
 if(variant==='stale')value.createdAt='2026-01-01T00:00:00Z';
 await writeFile(b,JSON.stringify(value));
}
const {writeBundleInventory}=await import(process.env.INVENTORY_MODULE);await writeBundleInventory(stage+'/operation');
NODE
}
export -f flock
bash "$FIXTURE_ENTRY" --release --staging "$TAMPER_STAGE"
`;
      // Wrapper delegates to real flock, mutates only after it owns fd9, then
      // refreshes inventory so metadata equality/freshness must catch substitution.
      const result = await runBash("-c", [prepare], {
        cwd: ROOT,
        env: {
          ...process.env,
          PATH: `${f.root}/bin:${process.env.PATH}`,
          MKW_DEPLOY_PATH: f.root,
          MKW_CONTROL_ROOT: join(f.root, "trusted"),
          MKW_CONTROL_SHA: "c".repeat(40),
          MKW_RELEASE_SHA: SHA,
          MKW_API_IMAGE: images.api,
          MKW_PROJECT_NAME: "fixture",
          MKW_OPERATION_ID: "rollback-gate",
          MKW_OPERATION_KIND: "application-rollback",
          MKW_SIMPLE_RELEASE: "false",
          MKW_BACKUP_MAX_AGE_SECONDS: "86400",
          MKW_BACKUP_EXPECTED_HOST: "fixture-db",
          MKW_BACKUP_EXPECTED_DATABASE: "mkw",
          MKW_BACKUP_EXPECTED_TARGET_IDENTITY: "fixture-target",
          TAMPER_STAGE: stage,
          TAMPER_VARIANT: variant,
          INVENTORY_MODULE: new URL(
            "../../scripts/product/release/release-bundle.mjs",
            import.meta.url,
          ).href,
          FIXTURE_ENTRY: join(
            f.root,
            "trusted/scripts/product/deploy-entrypoint.sh",
          ),
          FIXTURE_RESOLVED: join(f.root, "resolved.json"),
          MUTATIONS: join(f.root, "mutations"),
        },
      });
      assert.equal(result.code, 78, result.stderr);
      assert.equal(
        await readFile(join(f.root, "mutations")).catch(() => null),
        null,
      );
      assert.equal(
        await readFile(join(f.root, "shared/deploy-operation.json")).catch(
          () => null,
        ),
        null,
      );
      assert.deepEqual(await readdir(join(f.root, "releases")), []);
    },
  );
async function hashes(
  root,
  parts = ["releases", "controls", "shared", "current"],
) {
  const result = {};
  async function walk(dir) {
    for (const p of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, p.name);
      if (p.isDirectory()) await walk(path);
      else
        result[path] = createHash("sha256")
          .update(await readFile(path))
          .digest("hex");
    }
  }
  for (const part of parts)
    await walk(join(root, part)).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  return result;
}

async function releaseSnapshot(root) {
  const files = await hashes(root, ["releases"]);
  const identity = {};
  // Detect replacement or rewriting even if a retry writes identical bytes.
  for (const path of [join(root, "releases", SHA), ...Object.keys(files)]) {
    const info = await stat(path, { bigint: true });
    identity[path] = { ino: info.ino, mtimeNs: info.mtimeNs };
  }
  return {
    files,
    identity,
    inventory: await readFile(
      join(root, "releases", SHA, "bundle-inventory.json"),
    ),
  };
}

function barrier(path) {
  return new Promise((ok, fail) => {
    const timer = setTimeout(() => {
      watcher.close();
      fail(new Error("fixture barrier timeout"));
    }, 15000);
    const check = () =>
      readFile(path)
        .then(() => {
          clearTimeout(timer);
          watcher.close();
          ok();
        })
        .catch((e) => {
          if (e.code !== "ENOENT") fail(e);
        });
    const watcher = watch(resolve(path, ".."), check);
    check();
  });
}

for (const id of ["", ".", "..", "../escape", "x/y", "x\\y", "%2e%2e"])
  test(`actual entrypoint rejects operation admission before prerequisite/mutation: ${JSON.stringify(id)}`, async () => {
    const result = await runBash(ENTRY, ["--release"], {
      cwd: ROOT,
      env: { MKW_OPERATION_ID: id },
    });
    assert.equal(result.code, 78, result.stderr);
  });

test("text verifier API has no remaining production fallback", () => {
  assert.equal(Object.hasOwn(verifier, "verifyRelease"), false);
});

test(
  "two publishers contend on real flock; released operation ID remains no-clobber",
  { skip: linuxOnly },
  async (t) => {
    const f = await fixture(t),
      stage = await f.stage("op-a");
    const fifo = join(f.root, "barrier.fifo"),
      reached = join(f.root, "reached");
    assert.equal(
      (await runBash("-c", ['mkfifo "$1"', "fixture", fifo])).code,
      0,
    );
    const ready = barrier(reached),
      a = f.start("op-a", stage, {
        BARRIER_FIFO: fifo,
        BARRIER_REACHED: reached,
      });
    await ready;
    const before = await hashes(f.root),
      bStage = await f.stage("op-b");
    const b = await f.start("op-b", bStage).result;
    assert.equal(b.code, 75, b.stderr);
    assert.deepEqual(await hashes(f.root), before);
    await writeFile(fifo, "release\n");
    const aResult = await a.result;
    assert.equal(aResult.code, 0, aResult.stderr);
    const retry = await f.start("op-a", await f.stage("op-a")).result;
    assert.equal(retry.code, 78, retry.stderr);
  },
);

test(
  "same SHA retry with new backup preserves immutable release and operation metadata",
  { skip: linuxOnly },
  async (t) => {
    const f = await fixture(t);
    let afterA;
    for (const id of ["op-a", "op-b"]) {
      const r = await f.start(id, await f.stage(id, `backup-${id}`)).result;
      assert.equal(r.code, 0, r.stderr);
      assert.equal(
        JSON.parse(
          await readFile(join(f.root, "operations", id, "backup-ready.json")),
        ).backupId,
        `backup-${id}`,
      );
      if (id === "op-a") afterA = await releaseSnapshot(f.root);
    }
    assert.ok(Object.keys(afterA.files).length > 0);
    assert.deepEqual(await releaseSnapshot(f.root), afterA);
    assert.equal(
      JSON.parse(await readFile(join(f.root, "shared/backup-ready.json")))
        .backupId,
      "backup-op-b",
    );
    for (const path of Object.keys(afterA.files)) {
      assert.doesNotMatch(path, /backup-ready/);
      assert.doesNotMatch(await readFile(path, "utf8"), /backup-op-b/);
    }
    const stage = await f.stage("op-c");
    await writeFile(join(f.root, "releases", SHA, "extra"), "stale\n");
    const withExtra = await hashes(f.root);
    const r = await f.start("op-c", stage).result;
    assert.equal(r.code, 78, r.stderr);
    assert.deepEqual(await hashes(f.root), withExtra);
  },
);

test(
  "entrypoint can execute trusted staged controls without renaming its runtime mount",
  { skip: linuxOnly },
  async (t) => {
    const f = await fixture(t),
      stage = await f.stage("op-a"),
      controls = join(stage, "controls");
    const r = await f.start(
      "op-a",
      stage,
      { MKW_CONTROL_ROOT: controls },
      join(controls, "scripts/product/deploy-entrypoint.sh"),
    ).result;
    assert.equal(r.code, 0, r.stderr);
    assert.equal(
      (await f.events("op-a")).filter((e) => e.status === "ok").length,
      1,
    );
    assert.match(
      await readFile(
        join(controls, "scripts/product/deploy-entrypoint.sh"),
        "utf8",
      ),
      /stage_deploy_config/,
    );
  },
);

for (const state of ["complete", "failed", "incomplete", "file", "symlink"])
  test(
    `existing ${state} operation fails78 without touching runtime or evidence`,
    { skip: linuxOnly },
    async (t) => {
      const f = await fixture(t),
        stage = await f.stage("op-a"),
        path = join(f.root, "operations/op-a");
      await mkdir(join(f.root, "operations"));
      if (state === "file") await writeFile(path, "old");
      else if (state === "symlink")
        await symlink(join(f.root, "shared"), path, "dir");
      else {
        await mkdir(path);
        await writeFile(join(path, "old-receipt"), state);
      }
      const before = await hashes(f.root),
        r = await f.start("op-a", stage).result;
      assert.equal(r.code, 78, r.stderr);
      assert.deepEqual(await hashes(f.root), before);
      assert.equal(
        await readFile(join(f.root, "mutations")).catch(() => null),
        null,
      );
    },
  );

for (const kind of ["operations", "stage"])
  test(
    `${kind} symlink escape rejected by actual entrypoint`,
    { skip: linuxOnly },
    async (t) => {
      const f = await fixture(t),
        stage = await f.stage("op-a");
      await mkdir(join(f.root, "outside"));
      let input = stage;
      if (kind === "operations")
        await symlink(join(f.root, "outside"), join(f.root, "operations"));
      else {
        input = join(f.root, "staging/op-a-escape");
        await symlink(stage, input);
      }
      const before = await hashes(f.root),
        r = await f.start("op-a", input).result;
      assert.equal(r.code, 78, r.stderr);
      assert.deepEqual(await hashes(f.root), before);
      assert.deepEqual(await readdir(join(f.root, "outside")), []);
    },
  );

test(
  "migration failure retains primary97, stops application apply and records db-prepared",
  { skip: linuxOnly },
  async (t) => {
    const f = await fixture(t),
      r = await f.start("op-a", await f.stage("op-a"), {
        FAIL_MIGRATION: "true",
      }).result;
    assert.equal(r.code, 97, r.stderr);
    const calls = await readFile(join(f.root, "mutations"), "utf8");
    assert.match(calls, /migrate deploy/);
    assert.doesNotMatch(calls, /--remove-orphans|--no-deps api gateway/);
    const terminal = (await f.events("op-a")).filter(
      (e) => e.status !== "in-progress",
    );
    assert.equal(terminal.length, 1);
    assert.equal(terminal[0].phase, "db-prepared");
    assert.equal(terminal[0].status, "failed");
    assert.equal(terminal[0].mutationStarted, true);
  },
);

for (const kind of ["swap", "missing", "extra", "mutable"])
  test(
    `actual entrypoint ${kind} mapping fails at config-staged with zero runtime mutation`,
    { skip: linuxOnly },
    async (t) => {
      const f = await fixture(t),
        stage = await f.stage("op-a");
      const config = JSON.parse(await readFile(join(f.root, "resolved.json")));
      if (kind === "swap")
        [config.services.api.image, config.services.gateway.image] = [
          config.services.gateway.image,
          config.services.api.image,
        ];
      if (kind === "missing") delete config.services.api;
      if (kind === "extra") config.services.worker = { image: images.api };
      if (kind === "mutable") config.services.api.image = "api:latest";
      await writeFile(join(f.root, "resolved.json"), JSON.stringify(config));
      const r = await f.start("op-a", stage).result;
      assert.equal(r.code, 78, r.stderr);
      assert.equal(
        await readFile(join(f.root, "current/compose.rendered.yml"), "utf8"),
        "old-config\n",
      );
      assert.match(
        await readFile(join(f.root, "shared/api.env"), "utf8"),
        /https:\/\/old.test/,
      );
      assert.equal(
        await readFile(join(f.root, "mutations")).catch(() => null),
        null,
      );
      const terminal = (await f.events("op-a")).filter(
        (e) => e.status !== "in-progress",
      );
      assert.equal(terminal.length, 1);
      assert.equal(terminal[0].phase, "config-staged");
      assert.equal(terminal[0].status, "failed");
    },
  );

for (const kind of ["manifest", "target", "stale", "controls"])
  test(
    `locked recheck rejects changed ${kind} before config or migration`,
    { skip: linuxOnly },
    async (t) => {
      const f = await fixture(t),
        stage = await f.stage("op-a"),
        before = await hashes(f.root);
      // Mutate data at lock acquisition, then acquire the real inherited fd9 lock.
      // This is an external boundary fixture, never a substitute flock.
      await writeFile(
        join(f.root, "bin/flock"),
        `#!/usr/bin/env bash
"$MKW_TASK6_NODE" --input-type=module - "$CHANGE_KIND" "$CHANGE_STAGE" <<'NODE'
import { readFile, writeFile } from 'node:fs/promises';
const [kind,stage]=process.argv.slice(2);
const file=kind==='manifest'?stage+'/release/release-manifest.json':kind==='controls'?stage+'/controls/scripts/product/deploy-entrypoint.sh':stage+'/operation/backup-ready.json';
if(kind==='controls') await writeFile(file,'changed controls');
else {
 const value=JSON.parse(await readFile(file,'utf8'));
 if(kind==='manifest') value.releaseSha='b'.repeat(40);
 if(kind==='target') value.databaseIdentity.targetIdentity='other-target';
 if(kind==='stale') value.createdAt='2000-01-01T00:00:00Z';
 await writeFile(file,JSON.stringify(value));
}
NODE
exec "$REAL_FLOCK" "$@"
`,
      );
      await chmod(join(f.root, "bin/flock"), 0o755);
      const r = await f.start("op-a", stage, {
        MKW_TASK6_NODE: process.execPath,
        REAL_FLOCK: flockProbe.stdout.trim(),
        CHANGE_STAGE: stage,
        CHANGE_KIND: kind,
      }).result;
      assert.equal(r.code, 78, r.stderr);
      assert.deepEqual(await hashes(f.root), before);
      assert.equal(
        await readFile(join(f.root, "mutations")).catch(() => null),
        null,
      );
    },
  );

test(
  "actual verifier requires exact operation terminal/pointer in addition to runtime gates",
  { skip: linuxOnly },
  async (t) => {
    const f = await fixture(t),
      r = await f.start("op-a", await f.stage("op-a")).result;
    assert.equal(r.code, 0, r.stderr);
    const ok = await f.verify("op-a");
    assert.equal(ok.code, 0, ok.stderr);
    const wrong = await f.verify("other");
    assert.equal(wrong.code, 78, wrong.stderr);
    const dir = join(f.root, "operations/op-a"),
      events = await f.events("op-a");
    const terminal = events.find((e) => e.status === "ok");
    await rm(join(dir, `op-a.${terminal.eventId}.json`));
    const interrupted = await f.verify("op-a");
    assert.equal(interrupted.code, 78, interrupted.stderr);
    assert.match(interrupted.stderr, /runtime inspection required/);
  },
);

for (const mismatch of [true, false])
  test(
    `protected application rollback ${mismatch ? "rejects live PG mismatch" : "applies only API/gateway without migration or DB up"}`,
    { skip: linuxOnly },
    async (t) => {
      const f = await fixture(t),
        stage = await f.stage("rollback-1");
      await canonicalSnapshot(stage);
      const r = await f.start("rollback-1", stage, {
        MKW_OPERATION_KIND: "application-rollback",
        MKW_SIMPLE_RELEASE: "false",
        CURRENT_PG: mismatch
          ? `postgres@sha256:${"8".repeat(64)}`
          : images.postgres,
      }).result;
      assert.equal(r.code, mismatch ? 78 : 0, r.stderr);
      if (mismatch) {
        assert.equal(
          await readFile(join(f.root, "mutations")).catch(() => null),
          null,
        );
        assert.match(r.stderr, /PostgreSQL runtime digest mismatch/);
      } else {
        const calls = await readFile(join(f.root, "mutations"), "utf8");
        assert.match(calls, /up -d --wait --no-deps api gateway/);
        assert.doesNotMatch(
          calls,
          /migrate deploy|--no-deps db|--remove-orphans/,
        );
      }
    },
  );

test(
  "interruption without terminal is never success and blocks forward retry after runtime inspection",
  { skip: linuxOnly },
  async (t) => {
    const f = await fixture(t),
      fifo = join(f.root, "barrier.fifo"),
      reached = join(f.root, "reached");
    assert.equal(
      (await runBash("-c", ['mkfifo "$1"', "fixture", fifo])).code,
      0,
    );
    const ready = barrier(reached),
      a = f.start("op-a", await f.stage("op-a"), {
        BARRIER_FIFO: fifo,
        BARRIER_REACHED: reached,
      });
    await ready;
    process.kill(-a.child.pid, "SIGKILL");
    await a.result;
    await assert.rejects(
      readOperationReceipt(join(f.root, "operations/op-a"), {
        operationId: "op-a",
        releaseSha: SHA,
        imageDigests: images,
      }),
    );
    const r = await f.start("op-b", await f.stage("op-b")).result;
    assert.equal(r.code, 78, r.stderr);
    assert.match(r.stderr, /previous operation uncertain.*runtime inspected/);
    assert.equal(
      JSON.parse(await readFile(join(f.root, "shared/deploy-operation.json")))
        .operationId,
      "op-a",
    );
  },
);
