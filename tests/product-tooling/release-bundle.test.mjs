import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  readFile,
  writeFile,
  rm,
  link,
  access,
  readdir,
  lstat,
  mkdtemp,
  rename,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import {
  writeBundleInventory,
  verifyBundleInventory,
  compareReleaseDirectories,
  assembleDeploymentBundle,
} from "../../scripts/product/release/release-bundle.mjs";
import {
  makeBundleFixture,
  runBash,
  bashPath,
} from "./fixtures/deploy-account.mjs";
import { canonicalRollbackFixture } from "./fixtures/rollback-workflow.mjs";

// File map: inventory policy; compare/publish and rename failure preservation;
// opt-in real Linux EXDEV; real tar admission; assembly/legacy policy; execution
// of the workflow's actual packaging block.
// Each case uses task-owned roots from the shared fixture owner.
const ROOT = resolve(import.meta.dirname, "../..");
const helper = (name) => bashPath(join(ROOT, "scripts/product/release", name));
const hash = (b) => createHash("sha256").update(b).digest("hex");
const cli = (...args) =>
  spawnSync(
    process.execPath,
    [join(ROOT, "scripts/product/release/release-bundle.mjs"), ...args],
    { encoding: "utf8" },
  );

test("inventory_detects_metadata_and_helper_tamper", async (t) => {
  const f = await makeBundleFixture(t);
  for (const directory of [f.release, f.controls, f.operation]) {
    assert.deepEqual(await verifyBundleInventory(directory), {
      ok: true,
      errors: [],
    });
    const inventory = JSON.parse(
      await readFile(join(directory, "bundle-inventory.json")),
    );
    assert.deepEqual(
      inventory.files.map((v) => v.path),
      inventory.files.map((v) => v.path).sort(),
    );
    assert.equal(
      inventory.files.some((v) => v.path === "bundle-inventory.json"),
      false,
    );
    for (const item of inventory.files) {
      const path = join(directory, item.path),
        original = await readFile(path);
      assert.equal(item.sha256, hash(original));
      await writeFile(path, Buffer.concat([original, Buffer.from("tampered")]));
      assert.equal(cli("verify", directory).status, 78, item.path);
      await writeFile(path, original);
      await rm(path);
      assert.equal((await verifyBundleInventory(directory)).ok, false);
      await writeFile(path, original);
    }
    await writeFile(join(directory, "stale"), "extra");
    assert.equal((await verifyBundleInventory(directory)).ok, false);
    await rm(join(directory, "stale"));
    await mkdir(join(directory, "orphan"));
    assert.equal((await verifyBundleInventory(directory)).ok, false);
    await rm(join(directory, "orphan"), { recursive: true });
  }
});

test("inventory refuses duplicate/unsafe entries, symlink and hardlink", async (t) => {
  const f = await makeBundleFixture(t),
    p = join(f.release, "bundle-inventory.json"),
    original = await readFile(p);
  for (const mutate of [
    (v) => v.files.push(v.files[0]),
    (v) => {
      v.files[0].path = "../outside";
    },
    (v) => {
      v.files[0].size = -1;
    },
    (v) => {
      v.files.reverse();
    },
    (v) => {
      v.extra = true;
    },
  ]) {
    const v = JSON.parse(original);
    mutate(v);
    await writeFile(p, JSON.stringify(v));
    assert.equal((await verifyBundleInventory(f.release)).ok, false);
  }
  await writeFile(p, original);
  await writeFile(
    p,
    original
      .toString()
      .replace(
        '"schemaVersion": "1"',
        '"schemaVersion": "1", "schemaVersion": "1"',
      ),
  );
  assert.equal((await verifyBundleInventory(f.release)).ok, false);
  await writeFile(p, original);
  await link(join(f.release, "build-metadata.json"), join(f.release, "hard"));
  await assert.rejects(writeBundleInventory(f.release));
  await rm(join(f.release, "hard"));
  // GNU tar makes a real symlink without Windows symlink privilege requirements.
  const r = await runBash(
    "-c",
    ['ln -s build-metadata.json "$1/link"', "fixture", bashPath(f.release)],
    { cwd: f.root },
  );
  assert.equal(r.code, 0, r.stderr);
  assert.equal((await verifyBundleInventory(f.release)).ok, false);
});

test("same_sha_retry_reuses_exact_bytes and publish never overwrites", async (t) => {
  const f = await makeBundleFixture(t),
    candidate = join(f.root, "candidate"),
    destination = join(f.root, "published");
  await cp(f.release, candidate, { recursive: true });
  assert.equal(await compareReleaseDirectories(f.release, candidate), true);
  await writeFile(join(f.operation, "backup-ready.json"), "new backup");
  await writeBundleInventory(f.operation);
  assert.equal(await compareReleaseDirectories(f.release, candidate), true);
  const publish = () =>
    runBash(
      "-c",
      [
        'source "$1"; publish_release "$2" "$3"',
        "fixture",
        helper("publish-release.sh"),
        bashPath(candidate),
        bashPath(destination),
      ],
      { cwd: f.root },
    );
  assert.equal((await publish()).code, 0);
  await assert.rejects(access(candidate));
  await cp(f.release, candidate, { recursive: true });
  assert.equal((await publish()).code, 0);
  assert.equal(await compareReleaseDirectories(destination, candidate), true);
  const originalInventory = await readFile(
    join(candidate, "bundle-inventory.json"),
  );
  await writeFile(
    join(candidate, "bundle-inventory.json"),
    `${originalInventory.toString()}\n`,
  );
  assert.equal((await verifyBundleInventory(candidate)).ok, true);
  assert.equal(await compareReleaseDirectories(destination, candidate), false);
  assert.equal((await publish()).code, 78);
  await writeFile(join(candidate, "bundle-inventory.json"), originalInventory);
  const old = await readFile(join(destination, "build-metadata.json"));
  await writeFile(join(candidate, "build-metadata.json"), "different");
  await writeBundleInventory(candidate);
  assert.equal(await compareReleaseDirectories(destination, candidate), false);
  assert.equal((await publish()).code, 78);
  assert.deepEqual(
    await readFile(join(destination, "build-metadata.json")),
    old,
  );
  await writeFile(join(destination, "stale"), "existing extra");
  assert.equal((await publish()).code, 78);
});

async function treeBytes(root) {
  const files = {};
  async function walk(path) {
    for (const name of (await readdir(join(root, path))).sort()) {
      const child = join(path, name);
      if ((await lstat(join(root, child))).isDirectory()) await walk(child);
      else files[child] = (await readFile(join(root, child))).toString("hex");
    }
  }
  await walk("");
  return files;
}

// Catch a copy/delete fallback or a swallowed rename error. Only the OS rename
// boundary is injected; inventory, shell admission and before/after trees are real.
for (const code of ["EXDEV", "EACCES"]) {
  test(`publish preserves candidate and destination on rename ${code}`, async (t) => {
    const f = await makeBundleFixture(t),
      destination = join(f.root, "published"),
      preload = join(f.root, "rename-fault.mjs");
    await writeFile(
      preload,
      `import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
fs.rename = async () => { throw Object.assign(new Error("private OS detail"), { code: "${code}" }); };
syncBuiltinESMExports();\n`,
    );
    const before = await treeBytes(f.root);
    const result = await runBash(
      "-c",
      [
        'runtime=$4; preload=$5; source "$1"; run_node() { "$runtime" --import "$preload" "$@"; }; publish_release "$2" "$3"',
        "fixture",
        helper("publish-release.sh"),
        bashPath(f.release),
        bashPath(destination),
        bashPath(process.execPath),
        pathToFileURL(preload).href,
      ],
      { cwd: f.root },
    );
    assert.equal(result.code, 78, result.stderr);
    assert.deepEqual(await treeBytes(f.root), before);
    assert.equal((await verifyBundleInventory(f.release)).ok, true);
    await assert.rejects(access(destination));
    assert.doesNotMatch(result.stderr, /private OS detail/);
  });
}

test("rename helper refuses existing empty directory, file and dangling symlink", async (t) => {
  const f = await makeBundleFixture(t),
    destination = join(f.root, "published"),
    before = await treeBytes(f.release);
  await mkdir(destination);
  assert.equal(cli("rename", f.release, destination).status, 78);
  assert.deepEqual(await readdir(destination), []);
  await rm(destination, { recursive: true });
  await writeFile(destination, "preserve destination");
  assert.equal(cli("rename", f.release, destination).status, 78);
  assert.equal(await readFile(destination, "utf8"), "preserve destination");
  await rm(destination);
  const link = await runBash(
    "-c",
    ['ln -s missing "$1"', "fixture", bashPath(destination)],
    {
      cwd: f.root,
      env:
        process.platform === "win32"
          ? { MSYS: "winsymlinks:nativestrict" }
          : {},
    },
  );
  assert.equal(link.code, 0, link.stderr);
  assert.equal(cli("rename", f.release, destination).status, 78);
  assert.equal((await lstat(destination)).isSymbolicLink(), true);
  assert.deepEqual(await treeBytes(f.release), before);
});

test("publisher uses caller runtime without host node, stat or mv", async (t) => {
  const f = await makeBundleFixture(t),
    destination = join(f.root, "published"),
    before = await treeBytes(f.release);
  const result = await runBash(
    "-c",
    [
      'runtime=$4; source "$1"; node() { return 69; }; stat() { return 1; }; mv() { return 1; }; run_node() { "$runtime" "$@"; }; publish_release "$2" "$3"',
      "fixture",
      helper("publish-release.sh"),
      bashPath(f.release),
      bashPath(destination),
      bashPath(process.execPath),
    ],
    { cwd: f.root },
  );
  assert.equal(result.code, 0, result.stderr);
  await assert.rejects(access(f.release));
  assert.deepEqual(await treeBytes(destination), before);
});

// Task9 owns this real Linux filesystem gate. Opt-in requires a disposable
// mount namespace with CAP_SYS_ADMIN, /dev/shm on another device, and real flock.
// Prerequisite failure after opt-in is a failure, never a passing/skipped gate.
test(
  "real Linux EXDEV preserves trees across devices and same-device bind mounts",
  {
    skip:
      process.env.MKW_TEST_REAL_RENAME !== "1" &&
      "Not run: Task9 needs disposable Linux mount namespace, CAP_SYS_ADMIN and flock",
  },
  async (t) => {
    assert.equal(process.platform, "linux", "real rename gate requires Linux");
    const f = await makeBundleFixture(t),
      other = await mkdtemp("/dev/shm/mkw-task4-rename-"),
      mountSource = join(f.root, "mount-source"),
      mountView = join(f.root, "mount-view");
    t.after(() => rm(other, { recursive: true, force: true }));
    assert.notEqual((await lstat(f.root)).dev, (await lstat(other)).dev);
    await mkdir(mountSource);
    await mkdir(mountView);
    const mount = spawnSync("mount", ["--bind", mountSource, mountView], {
      encoding: "utf8",
    });
    assert.equal(mount.status, 0, mount.stderr);
    try {
      assert.equal((await lstat(f.root)).dev, (await lstat(mountView)).dev);
      for (const parent of [other, mountView]) {
        const destination = join(parent, "published"),
          before = await treeBytes(f.release),
          parentBefore = await treeBytes(parent);
        const result = await runBash(
          "-c",
          [
            'source "$1"; exec 9>"$4"; flock -n 9 || exit 75; publish_release "$2" "$3"',
            "fixture",
            helper("publish-release.sh"),
            bashPath(f.release),
            bashPath(destination),
            bashPath(join(f.root, "publish.lock")),
          ],
          { cwd: f.root },
        );
        assert.equal(result.code, 78, result.stderr);
        assert.deepEqual(await treeBytes(f.release), before);
        assert.deepEqual(await treeBytes(parent), parentBefore);
        await assert.rejects(access(destination));
        await assert.rejects(rename(f.release, destination), { code: "EXDEV" });
      }
    } finally {
      const unmount = spawnSync("umount", [mountView], { encoding: "utf8" });
      assert.equal(unmount.status, 0, unmount.stderr);
    }
  },
);

test("archive_refuses_escape_and_links_before_extract", async (t) => {
  const f = await makeBundleFixture(t),
    staging = join(f.root, "stage");
  await mkdir(staging);
  const good = await runBash(
    helper("extract-release-bundle.sh"),
    [bashPath(f.archive), bashPath(staging)],
    { cwd: f.root },
  );
  assert.equal(good.code, 0, good.stderr);
  assert.deepEqual(
    await readFile(join(staging, "release", "bundle-inventory.json")),
    await readFile(join(f.release, "bundle-inventory.json")),
  );
  // Write ustar headers directly, then use real GNU tar for admission/extraction.
  function entry(name, type = "0", target = "") {
    const b = Buffer.alloc(512);
    b.write(name, 0, 100);
    b.write("0000644\0", 100);
    b.write("0000000\0", 108);
    b.write("0000000\0", 116);
    b.write("00000000000\0", 124);
    b.write("00000000000\0", 136);
    b.fill(32, 148, 156);
    b.write(type, 156);
    b.write(target, 157, 100);
    b.write("ustar\0", 257);
    b.write("00", 263);
    const sum = b
      .reduce((a, v) => a + v, 0)
      .toString(8)
      .padStart(6, "0");
    b.write(`${sum}\0 `, 148);
    return b;
  }
  for (const [label, entries] of [
    ["traversal", [entry("../outside")]],
    ["absolute", [entry(`${bashPath(f.root)}/outside`)]],
    ["dot", [entry("release/./file")]],
    ["empty-component", [entry("release//file")]],
    [
      "symlink",
      [entry("release/link", "2", "../../outside"), entry("release/link/file")],
    ],
    ["hardlink", [entry("release/link", "1", "../outside")]],
    ["duplicate", [entry("release/file"), entry("release/file")]],
    ["control", [entry("release/file\nname")]],
    ["escaped", [entry("release/file\\name")]],
    ["fifo", [entry("release/fifo", "6")]],
    ["foreign", [entry("foreign/file")]],
  ]) {
    const archive = join(f.root, `${label}.tar`),
      stage = join(f.root, `stage-${label}`);
    await writeFile(archive, Buffer.concat([...entries, Buffer.alloc(1024)]));
    await mkdir(stage);
    const r = await runBash(
      helper("extract-release-bundle.sh"),
      [bashPath(archive), bashPath(stage)],
      { cwd: f.root },
    );
    assert.equal(r.code, 78, `${label}: ${r.stderr}`);
    assert.deepEqual(
      await import("node:fs/promises").then((fs) => fs.readdir(stage)),
      [],
      label,
    );
    await assert.rejects(access(join(f.root, "outside")));
  }
});

test("extract rejects nonempty or symlink staging and missing/tampered inventory", async (t) => {
  const f = await makeBundleFixture(t),
    stage = join(f.root, "stage");
  await mkdir(stage);
  await writeFile(join(stage, "owned"), "preserve");
  assert.equal(
    (
      await runBash(
        helper("extract-release-bundle.sh"),
        [bashPath(f.archive), bashPath(stage)],
        { cwd: f.root },
      )
    ).code,
    78,
  );
  assert.equal(await readFile(join(stage, "owned"), "utf8"), "preserve");
  await runBash(
    "-c",
    [
      'ln -s "$1" "$2"',
      "fixture",
      bashPath(stage),
      bashPath(join(f.root, "alias")),
    ],
    { cwd: f.root },
  );
  assert.equal(
    (
      await runBash(
        helper("extract-release-bundle.sh"),
        [bashPath(f.archive), bashPath(join(f.root, "alias"))],
        { cwd: f.root },
      )
    ).code,
    78,
  );
  await writeFile(join(f.release, "build-metadata.json"), "tampered");
  const r = await runBash(
    "-c",
    [
      'tar -cf "$1" -C "$2" release controls operation; mkdir "$3"; bash "$4" "$1" "$3"',
      "fixture",
      bashPath(f.archive),
      bashPath(f.root),
      bashPath(join(f.root, "bad-stage")),
      helper("extract-release-bundle.sh"),
    ],
    { cwd: f.root },
  );
  assert.equal(r.code, 78, r.stderr);
});

async function packagingInput(t) {
  const f = await makeBundleFixture(t);
  const source = join(f.root, "source"),
    current = join(f.root, "current");
  await cp(f.release, source, { recursive: true });
  await cp(f.controls, current, { recursive: true });
  await writeFile(
    join(source, "scripts/product/manage-production-account.sh"),
    "exact old operator\n",
  );
  await writeFile(
    join(f.release, "scripts/product/manage-production-account.sh"),
    "exact old operator\n",
  );
  await writeFile(
    join(source, "scripts/product/deploy-entrypoint.sh"),
    "untrusted old controls\n",
  );
  const paths = [
    "release-manifest.json",
    "release-manifest.sha256",
    "build-metadata.json",
    "api-attestations.json",
    "web-attestations.json",
    "deploy/compose.production.yml",
    "scripts/product/manage-production-account.sh",
  ];
  await writeFile(
    join(f.release, "release-manifest.sha256"),
    `${hash(await readFile(join(f.release, "release-manifest.json")))}  release-manifest.json\n`,
  );
  await writeFile(
    join(f.release, "release-checksums.sha256"),
    (
      await Promise.all(
        paths.map(
          async (p) => `${hash(await readFile(join(f.release, p)))}  ${p}\n`,
        ),
      )
    ).join(""),
  );
  await writeBundleInventory(f.release);
  return {
    ...f,
    source,
    current,
    input: {
      releaseArtifact: f.release,
      releaseSource: source,
      controlSource: current,
      operationDirectory: f.operation,
      outputDirectory: join(f.root, "output"),
      legacy: false,
    },
  };
}

async function rollbackPackagingInput(t) {
  const f = await canonicalRollbackFixture(t, ROOT);
  const canonicalPath = join(f.temp, "rollback-release-resolved.json");
  const operation = join(f.dir, "operation");
  await mkdir(operation);
  await writeFile(join(operation, "backup-ready.json"), "{}");
  await writeFile(join(operation, "backup-ready.sha256"), "fixture");
  await cp(canonicalPath, join(operation, "rollback-release-resolved.json"));
  await writeFile(
    join(operation, "rollback-operation.json"),
    JSON.stringify({
      reason: "fixture",
      releaseSha: "a".repeat(40),
      releaseRunId: "20",
      releaseRunAttempt: "1",
      releaseArtifactId: "201",
      releaseArtifactDigest: `sha256:${"d".repeat(64)}`,
    }),
  );
  return {
    ...f,
    input: {
      releaseArtifact: join(f.dir, "old-release-artifact"),
      releaseSource: join(f.dir, "release-source"),
      controlSource: f.dir,
      operationDirectory: operation,
      outputDirectory: join(f.temp, "output"),
      legacy: true,
      rollbackResolvedRelease: canonicalPath,
    },
  };
}

// Inject only OS copy/tar boundaries; actual assembly/checksums/inventory/tar
// still execute. A valid checksum rewrite must not erase canonical identity.
for (const phase of ["copy manifest", "copy metadata", "archive"]) {
  test(`rollback assembler rejects substitution during ${phase}`, async (t) => {
    const f = await rollbackPackagingInput(t),
      preload = join(f.temp, "race.mjs"),
      runner = join(f.temp, "run.mjs");
    await writeFile(
      preload,
      `
import fs from 'node:fs/promises';import child from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';import {createHash} from 'node:crypto';import {join} from 'node:path';
const input=JSON.parse(process.env.BUNDLE_INPUT),phase=${JSON.stringify(phase)},originalCopy=fs.copyFile,originalExec=child.execFile;
let fired=false;
async function tamper(){fired=true;const root=join(input.outputDirectory,'release'),name=phase==='copy metadata'?'build-metadata.json':'release-manifest.json';const value=JSON.parse(await fs.readFile(join(root,name),'utf8'));if(name==='build-metadata.json')value.producerRunAttempt='2';else value.apiImage='ghcr.io/org/substituted@sha256:'+'f'.repeat(64);await fs.writeFile(join(root,name),JSON.stringify(value));const hash=b=>createHash('sha256').update(b).digest('hex');await fs.writeFile(join(root,'release-manifest.sha256'),hash(await fs.readFile(join(root,'release-manifest.json')))+'  release-manifest.json\\n');const names=['build-metadata.json','release-manifest.json','release-manifest.sha256'];await fs.writeFile(join(root,'release-checksums.sha256'),(await Promise.all(names.map(async n=>hash(await fs.readFile(join(root,n)))+'  '+n+'\\n'))).join(''));}
fs.copyFile=async(...args)=>{await originalCopy(...args);if(!fired&&phase.startsWith('copy')&&String(args[0]).endsWith('release-manifest.sha256'))await tamper();};
child.execFile=function(command,args,options,callback){const packing=args.includes('-cf')||args.some(v=>typeof v==='string'&&v.includes('tar -cf'));if(phase!=='archive'||fired||!packing)return originalExec(command,args,options,callback);return originalExec(command,args,options,(error,stdout,stderr)=>{if(error)return callback(error,stdout,stderr);tamper().then(()=>originalExec(command,args,options,callback),callback);});};syncBuiltinESMExports();
`,
    );
    await writeFile(
      runner,
      `import {assembleDeploymentBundle} from ${JSON.stringify(pathToFileURL(join(ROOT, "scripts/product/release/release-bundle.mjs")).href)};try{await assembleDeploymentBundle(JSON.parse(process.env.BUNDLE_INPUT));}catch{process.exitCode=78;}`,
    );
    const result = spawnSync(
      process.execPath,
      ["--import", pathToFileURL(preload).href, runner],
      {
        env: { ...process.env, BUNDLE_INPUT: JSON.stringify(f.input) },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 78, result.stdout + result.stderr);
  });
}

test("assembler separates exact release bytes, current trusted controls and operation", async (t) => {
  const f = await packagingInput(t),
    before = await readFile(join(f.release, "bundle-inventory.json"));
  const { archivePath } = await assembleDeploymentBundle(f.input);
  const stage = join(f.root, "assembled");
  await mkdir(stage);
  const r = await runBash(
    helper("extract-release-bundle.sh"),
    [bashPath(archivePath), bashPath(stage)],
    { cwd: f.root },
  );
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(
    await readFile(join(stage, "release/bundle-inventory.json")),
    before,
  );
  assert.equal(
    await readFile(
      join(stage, "controls/scripts/product/deploy-entrypoint.sh"),
      "utf8",
    ),
    "trusted entrypoint\n",
  );
  assert.equal(
    await readFile(
      join(stage, "release/scripts/product/manage-production-account.sh"),
      "utf8",
    ),
    "exact old operator\n",
  );
  await assert.rejects(assembleDeploymentBundle(f.input));
  assert.equal(cli("pack", "--unknown", "value").status, 64);
});

test("modern invalid inventory cannot downgrade; legacy adapter requires explicit missing inventory", async (t) => {
  const f = await packagingInput(t);
  await writeFile(join(f.release, "bundle-inventory.json"), "{}");
  await assert.rejects(assembleDeploymentBundle(f.input));
  await assert.rejects(assembleDeploymentBundle({ ...f.input, legacy: true }));
  await rm(join(f.release, "bundle-inventory.json"));
  await assert.rejects(assembleDeploymentBundle(f.input));
  await rm(join(f.release, "deploy"), { recursive: true });
  await rm(join(f.release, "scripts"), { recursive: true });
  await rm(join(f.release, "api-attestations.json"));
  await rm(join(f.release, "web-attestations.json"));
  await writeFile(
    join(f.release, "release-checksums.sha256"),
    `${hash(await readFile(join(f.release, "release-manifest.json")))}  release-manifest.json\n`,
  );
  const { archivePath } = await assembleDeploymentBundle({
    ...f.input,
    legacy: true,
  });
  const stage = join(f.root, "legacy-stage");
  await mkdir(stage);
  const r = await runBash(
    helper("extract-release-bundle.sh"),
    [bashPath(archivePath), bashPath(stage)],
    { cwd: f.root },
  );
  assert.equal(r.code, 0, r.stderr);
  await assert.rejects(access(join(stage, "release/api-attestations.json")));
  await assert.rejects(
    access(join(stage, "release/scripts/product/manage-production-account.sh")),
  );
  assert.equal(
    await readFile(
      join(stage, "release/deploy/compose.production.yml"),
      "utf8",
    ),
    "services: {}\n",
  );
});

test("assembler rejects metadata checksum gaps, tamper, release source mismatch and input overlap", async (t) => {
  const f = await packagingInput(t);
  await writeFile(
    join(f.source, "deploy/compose.production.yml"),
    "wrong source",
  );
  await assert.rejects(
    assembleDeploymentBundle(f.input),
    /release source differs/,
  );
  await cp(
    join(f.release, "deploy/compose.production.yml"),
    join(f.source, "deploy/compose.production.yml"),
  );
  const original = await readFile(join(f.release, "build-metadata.json"));
  await writeFile(join(f.release, "build-metadata.json"), "tampered metadata");
  await writeBundleInventory(f.release);
  await assert.rejects(assembleDeploymentBundle(f.input), /checksum mismatch/);
  await writeFile(join(f.release, "build-metadata.json"), original);
  await writeFile(
    join(f.release, "release-checksums.sha256"),
    `${hash(await readFile(join(f.release, "release-manifest.json")))}  release-manifest.json\n`,
  );
  await writeBundleInventory(f.release);
  await assert.rejects(assembleDeploymentBundle(f.input));
  await assert.rejects(
    assembleDeploymentBundle({
      ...f.input,
      outputDirectory: join(f.release, "nested"),
    }),
  );
});

test("build packaging executes checksums/inventory after provenance without changing root metadata", async (t) => {
  const f = await packagingInput(t),
    workflow = await readFile(
      join(ROOT, ".github/workflows/build-release.yml"),
      "utf8",
    );
  const start = workflow.indexOf(
    "      - name: Package inventoried release artifact",
  );
  assert.ok(
    start >
      workflow.indexOf("      - name: Attest release manifest provenance"),
  );
  const block = workflow
    .slice(start)
    .split("        run: |\n")[1]
    .split("\n      - name:")[0]
    .split("\n")
    .map((l) => (l.startsWith("          ") ? l.slice(10) : l))
    .join("\n");
  for (const path of [
    "release-manifest.json",
    "release-manifest.sha256",
    "build-metadata.json",
    "api-attestations.json",
    "web-attestations.json",
  ])
    await cp(join(f.release, path), join(f.source, path));
  await mkdir(join(f.source, "scripts/product/release"), { recursive: true });
  await cp(
    join(ROOT, "scripts/product/release/release-bundle.mjs"),
    join(f.source, "scripts/product/release/release-bundle.mjs"),
  );
  await cp(
    join(ROOT, "scripts/product/release/validate-manifest.mjs"),
    join(f.source, "scripts/product/release/validate-manifest.mjs"),
  );
  const r = await runBash("-c", [block], { cwd: f.source });
  assert.equal(r.code, 0, r.stderr);
  const artifact = join(f.source, "release-artifact");
  assert.equal((await verifyBundleInventory(artifact)).ok, true);
  const checksums = await readFile(
    join(artifact, "release-checksums.sha256"),
    "utf8",
  );
  assert.match(checksums, /build-metadata.json/);
  assert.match(checksums, /release-manifest.sha256/);
  assert.match(checksums, /deploy\/compose.production.yml/);
  assert.match(checksums, /manage-production-account.sh/);
  assert.doesNotMatch(
    checksums,
    /bundle-inventory.json|release-checksums.sha256/,
  );
  assert.deepEqual(
    await readFile(join(artifact, "release-manifest.json")),
    await readFile(join(f.release, "release-manifest.json")),
  );
});
