import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { snapshotTar } from "./fixtures/snapshot-tar.mjs";

// Default discovery is safe: no Docker acquisition or acceptance workload.
if (process.argv.includes("--rehearsal")) {
  const taskId = randomUUID();
  const evidencePath = resolve(`.agent-runs/MKW-DEPLOY-ACCOUNT-001/${taskId}`);
  if (process.platform === "win32") {
    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-File",
        "scripts/product/local-release-rehearsal.ps1",
        "-EvidencePath",
        evidencePath,
        "-TaskId",
        taskId,
      ],
      { stdio: "inherit" },
    );
    process.exitCode = result.status ?? 1;
  } else {
    const { runOwnedRehearsal } =
      await import("../../scripts/product/local-rehearsal-engine.mjs");
    await runOwnedRehearsal({ taskId, evidencePath });
  }
} else {
  const { test } = await import("node:test");
  const engine =
    await import("../../scripts/product/local-rehearsal-engine.mjs").catch(
      () => ({}),
    );
  test("rehearsal requires a Linux Docker daemon and reports a nonzero prerequisite", () => {
    assert.equal(typeof engine.assertLinuxEngine, "function");
    for (const info of [null, {}, { OSType: "windows" }])
      assert.throws(() => engine.assertLinuxEngine(info), {
        code: "REHEARSAL_PREREQUISITE",
      });
    engine.assertLinuxEngine({ OSType: "linux" });
  });
  test("rehearsal refuses insufficient host storage before resource acquisition", () => {
    assert.equal(typeof engine.assertRehearsalStorage, "function");
    for (const info of [
      null,
      {},
      { bavail: 0, bsize: 4096 },
      { bavail: 256, bsize: 4096 },
    ])
      assert.throws(() => engine.assertRehearsalStorage(info), {
        code: "REHEARSAL_STORAGE",
      });
    engine.assertRehearsalStorage({ bavail: 8388608, bsize: 4096 });
  });
  test("failed restore diagnostics identify the boundary without retaining dependency output", () => {
    const secret = "fixture-private-canary";
    for (const [stderr, expected] of [
      [
        `pg_restore: error: connection to server failed: FATAL: database "${secret}" does not exist`,
        "PG_DATABASE_MISSING",
      ],
      [
        `pg_restore: error: connection to server failed: ${secret}`,
        "PG_CONNECTION",
      ],
      [
        `pg_restore: error: could not execute query: ERROR: schema "${secret}" already exists`,
        "PG_OBJECT_EXISTS",
      ],
      [`bad decrypt ${secret}`, "BACKUP_DECRYPT"],
      [secret, "UNCLASSIFIED"],
    ]) {
      const result = engine.classifyRehearsalFailure(stderr);
      assert.equal(result, expected);
      assert.equal(JSON.stringify(result).includes(secret), false);
    }
  });
  test("restore readiness waits past a temporary socket server and refuses exhaustion", async () => {
    let tcpProbes = 0;
    await engine.waitForRehearsalPostgres(
      async (_bin, args) => {
        // Official PostgreSQL init accepts sockets while final TCP remains closed.
        const status = args.includes("127.0.0.1")
          ? ++tcpProbes < 3
            ? 2
            : 0
          : 0;
        return { status };
      },
      "owned-container",
      { attempts: 3, intervalMs: 0 },
    );
    assert.equal(tcpProbes, 3);
    await assert.rejects(
      engine.waitForRehearsalPostgres(
        async () => ({ status: 2 }),
        "owned-container",
        { attempts: 2, intervalMs: 0 },
      ),
      { code: "REHEARSAL_POSTGRES_READINESS" },
    );
  });
  test("rehearsal refuses wrong name, ID, labels, mounts, marker and actual daemon", () => {
    assert.equal(typeof engine.validateEngineOwnership, "function");
    const taskId = "00112233-4455-4677-8899-aabbccddeeff";
    const name = `mkw-deploy-account-${taskId}`;
    const id = "a".repeat(64);
    const expected = { taskId, name, id };
    const inspection = {
      Id: id,
      Name: `/${name}`,
      Mounts: [],
      Config: {
        Hostname: name,
        Labels: {
          "com.mkw.owner": "MKW-DEPLOY-ACCOUNT-001",
          "com.mkw.task": taskId,
        },
      },
    };
    const marker = { owner: "MKW-DEPLOY-ACCOUNT-001", taskId, name, id };
    const daemon = name;
    engine.validateEngineOwnership({ expected, inspection, marker, daemon });
    const invalid = [
      {
        inspection: {
          ...inspection,
          Name: "/mkw-cd-completion-engine-8849e8d4",
        },
      },
      { inspection: { ...inspection, Id: "b".repeat(64) } },
      {
        inspection: {
          ...inspection,
          Config: { ...inspection.Config, Labels: {} },
        },
      },
      {
        inspection: {
          ...inspection,
          Mounts: [{ Type: "bind", Source: "/", Destination: "/host" }],
        },
      },
      { marker: { ...marker, taskId: randomUUID() } },
      { marker: null },
      { daemon: "docker-desktop" },
    ];
    for (const fault of invalid)
      assert.throws(
        () =>
          engine.validateEngineOwnership({
            expected,
            inspection,
            marker,
            daemon,
            ...fault,
          }),
        { code: "REHEARSAL_OWNERSHIP" },
      );
  });
  test("rehearsal refuses existing evidence without overwriting it or acquiring Docker", async (t) => {
    assert.equal(typeof engine.runOwnedRehearsal, "function");
    const directory = await mkdtemp(join(tmpdir(), "mkw-task9-evidence-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await writeFile(join(directory, "sentinel"), "preserve");
    await assert.rejects(
      engine.runOwnedRehearsal({
        evidencePath: directory,
        taskId: randomUUID(),
      }),
      { code: "REHEARSAL_EVIDENCE_EXISTS" },
    );
    assert.equal(
      await readFile(join(directory, "sentinel"), "utf8"),
      "preserve",
    );
  });
  test("snapshot inventory captures current untracked bytes, excludes ignored secrets/dist and retains exact tar", async (t) => {
    assert.equal(typeof engine.createSourceSnapshot, "function");
    const directory = await mkdtemp(join(tmpdir(), "mkw-task9-source-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const source = join(directory, "source"),
      output = join(directory, "evidence");
    await mkdir(source);
    await mkdir(output);
    assert.equal(spawnSync("git", ["init", "--quiet", source]).status, 0);
    await writeFile(join(source, ".gitignore"), "secret.env\ndist/\n");
    await writeFile(join(source, "current.txt"), "dirty Unicode: Khuê\n");
    await writeFile(join(source, "secret.env"), "private-canary-not-in-tar");
    await mkdir(join(source, "dist"));
    await writeFile(join(source, "dist/output.js"), "generated");
    const snapshot = await engine.createSourceSnapshot(source, output);
    assert.deepEqual(
      snapshot.files.map((f) => f.path),
      [".gitignore", "current.txt"],
    );
    assert.equal(
      snapshot.files[1].sha256,
      createHash("sha256").update("dirty Unicode: Khuê\n").digest("hex"),
    );
    assert.equal(snapshot.base, null); // fixture intentionally has no commit/index mutations
    assert.equal(
      snapshot.archiveSha256,
      createHash("sha256")
        .update(await readFile(join(output, "source.tar")))
        .digest("hex"),
    );
    await writeFile(join(source, "current.txt"), "later change");
    assert.equal(
      await readFile(join(output, "source/current.txt"), "utf8"),
      "dirty Unicode: Khuê\n",
    );
    const listing = spawnSync(
      snapshotTar.command,
      [...snapshotTar.options, "-tf", join(output, "source.tar")],
      { encoding: "utf8" },
    );
    assert.equal(listing.status, 0);
    assert.doesNotMatch(listing.stdout, /secret|dist|\.git\//);
  });
  test("inner driver refuses a host call before any Docker command or cleanup", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/product/local-rehearsal-driver.mjs"],
      { encoding: "utf8" },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /owned Linux engine required/);
    assert.doesNotMatch(result.stderr, /password|DATABASE_URL|passwordHash/);
  });
  test(
    "PowerShell caller accepts an absolute evidence path and preserves no-clobber admission",
    { skip: process.platform !== "win32" },
    async (t) => {
      const directory = resolve(
        `.agent-runs/MKW-DEPLOY-ACCOUNT-001/unit-${randomUUID()}`,
      );
      await mkdir(directory, { recursive: true });
      t.after(() => rm(directory, { recursive: true, force: true }));
      const result = spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-File",
          "scripts/product/local-release-rehearsal.ps1",
          "-EvidencePath",
          directory,
          "-TaskId",
          randomUUID(),
        ],
        { encoding: "utf8" },
      );
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /REHEARSAL_EVIDENCE_EXISTS/);
    },
  );
}
