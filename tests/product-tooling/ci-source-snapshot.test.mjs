import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  chmod,
  lstat,
  symlink,
  link,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { snapshotTar } from "./fixtures/snapshot-tar.mjs";

const api = await import("../../scripts/ci/source-snapshot.mjs").catch(
  () => ({}),
);
const sha = (b) => createHash("sha256").update(b).digest("hex");
// Windows BSD tar cannot safely extract the required UTF-8 PAX members. The
// shared selector uses Git GNU tar by default and keeps the explicit override.
const { command: tarCommand, options: tarOptions } = snapshotTar;

test("snapshot extraction uses the supported deterministic tar selector", () => {
  const explicit = process.env.MKW_SNAPSHOT_TEST_TAR;
  if (explicit !== undefined) {
    assert.equal(tarCommand, explicit);
  } else if (process.platform === "win32") {
    assert.match(tarCommand, /(?:^|[\\/])tar\.exe$/i);
  } else {
    assert.equal(tarCommand, "tar");
  }
  assert.deepEqual(
    tarOptions,
    process.platform === "win32" ? ["--force-local"] : [],
  );
  const version = spawnSync(tarCommand, ["--version"], { encoding: "utf8" });
  assert.equal(version.status, 0, version.stderr);
  if (process.platform === "win32")
    assert.match(version.stdout, /^tar \(GNU tar\)/m);
});

function git(root, ...args) {
  const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}
async function fixture(t) {
  assert.equal(typeof api.createSourceSnapshot, "function");
  assert.equal(typeof api.verifySourceSnapshot, "function");
  const dir = await mkdtemp(join(tmpdir(), "mkw-snapshot-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = join(dir, "repo"),
    evidence = join(dir, "evidence");
  await mkdir(root);
  await mkdir(evidence);
  git(root, "init", "--quiet");
  git(root, "config", "core.autocrlf", "false");
  await writeFile(join(root, ".gitignore"), "ignored.txt\n");
  await writeFile(join(root, "Khuê script.sh"), "#!/bin/sh\nprintf 'Khuê'\n");
  await writeFile(join(root, "deleted.txt"), "delete me");
  await writeFile(join(root, "dirty.txt"), "original\n");
  git(root, "add", ".");
  git(root, "update-index", "--chmod=+x", "Khuê script.sh");
  await chmod(join(root, "Khuê script.sh"), 0o644); // host mode deliberately disagrees with index
  await rm(join(root, "deleted.txt"));
  await writeFile(join(root, "dirty.txt"), "dirty Khuê\r\n");
  await writeFile(join(root, "new space tên.txt"), "untracked\n");
  await chmod(join(root, "new space tên.txt"), 0o755); // untracked is always 0644
  for (const p of [
    "ignored.txt",
    ".env",
    ".env.local",
    "deploy/shared/key",
    "node_modules/pkg/x",
    "dist/x",
    ".agent-runs/x",
    ".superpowers/x",
    ".pnpm-store/x",
  ]) {
    await mkdir(join(root, p, ".."), { recursive: true });
    await writeFile(join(root, p), "private/generated");
  }
  await writeFile(join(root, ".env.example"), "EXAMPLE=public\n");
  return { dir, root, evidence };
}
async function captured(t) {
  const f = await fixture(t);
  return { ...f, manifest: await api.createSourceSnapshot(f.root, f.evidence) };
}
async function rewriteArchive(f, bytes) {
  await writeFile(join(f.evidence, "source.tar"), bytes);
  const manifest = JSON.parse(
    await readFile(join(f.evidence, "source-snapshot.json"), "utf8"),
  );
  manifest.archiveSha256 = sha(bytes);
  await writeFile(
    join(f.evidence, "source-snapshot.json"),
    JSON.stringify(manifest),
  );
}
function checksum(header) {
  header.fill(32, 148, 156);
  const sum = header.reduce((a, b) => a + b, 0);
  header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, "ascii");
}
test("v2 captures dirty bytes, Unicode/spaces/deletion/exclusions and Git-index portable executable modes", async (t) => {
  const f = await fixture(t);
  const indexBefore = await readFile(join(f.root, ".git/index"));
  const modes = await Promise.all([
    lstat(join(f.root, "Khuê script.sh")),
    lstat(join(f.root, "new space tên.txt")),
  ]);
  const m = await api.createSourceSnapshot(f.root, f.evidence);
  assert.equal(m.schemaVersion, "2");
  assert.equal(m.base, null);
  assert.deepEqual(
    m.files.map((f) => [f.path, f.mode]),
    [
      [".env.example", 0o644],
      [".gitignore", 0o644],
      ["Khuê script.sh", 0o755],
      ["dirty.txt", 0o644],
      ["new space tên.txt", 0o644],
    ],
  );
  assert.equal(m.sourceSha256, sha(JSON.stringify(m.files)));
  assert.equal(
    m.files.find((f) => f.path === "dirty.txt").sha256,
    sha("dirty Khuê\r\n"),
  );
  assert.deepEqual(await api.verifySourceSnapshot(f.evidence), m);
  assert.deepEqual(await readFile(join(f.root, ".git/index")), indexBefore);
  for (const [i, p] of ["Khuê script.sh", "new space tên.txt"].entries())
    assert.equal((await lstat(join(f.root, p))).mode, modes[i].mode);
  const extracted = join(f.dir, "extracted");
  await mkdir(extracted);
  const tar = spawnSync(tarCommand, [
    ...tarOptions,
    "-xf",
    join(f.evidence, "source.tar"),
    "-C",
    extracted,
  ]);
  assert.equal(tar.status, 0, tar.stderr?.toString());
  for (const entry of m.files) {
    assert.equal(
      sha(await readFile(join(extracted, entry.path))),
      entry.sha256,
    );
    if (process.platform !== "win32")
      assert.equal(
        (await lstat(join(extracted, entry.path))).mode & 0o777,
        entry.mode,
      );
  }
});
test("retained copy/archive are immutable after live changes and source hash includes mode and LF/CRLF", async (t) => {
  const f = await captured(t),
    tar = await readFile(join(f.evidence, "source.tar"));
  await writeFile(join(f.root, "dirty.txt"), "later\n");
  assert.deepEqual(await api.verifySourceSnapshot(f.evidence), f.manifest);
  assert.deepEqual(await readFile(join(f.evidence, "source.tar")), tar);
  const capture = async (name) => {
    const out = join(f.dir, name);
    await mkdir(out);
    return api.createSourceSnapshot(f.root, out);
  };
  await writeFile(join(f.root, "dirty.txt"), "dirty Khuê\n");
  const lf = await capture("lf");
  assert.notEqual(lf.sourceSha256, f.manifest.sourceSha256);
  git(f.root, "update-index", "--chmod=-x", "Khuê script.sh");
  const mode = await capture("mode");
  assert.notEqual(mode.sourceSha256, lf.sourceSha256);
  assert.equal(
    mode.files.find((f) => f.path === "Khuê script.sh").sha256,
    lf.files.find((f) => f.path === "Khuê script.sh").sha256,
  );
});
test("no-clobber preserves all existing artifacts, including historical v1 bytes", async (t) => {
  const f = await fixture(t);
  const historical = '{"schemaVersion":"1","files":[]}\r\n';
  await writeFile(join(f.evidence, "source-snapshot.json"), historical);
  await assert.rejects(api.createSourceSnapshot(f.root, f.evidence));
  await assert.rejects(api.verifySourceSnapshot(f.evidence));
  assert.equal(
    await readFile(join(f.evidence, "source-snapshot.json"), "utf8"),
    historical,
  );
  await assert.rejects(lstat(join(f.evidence, "source")), { code: "ENOENT" });
});
test("retained bytes, type, mode, extras, sorted inventory and manifest source hash are verified", async (t) => {
  for (const mutation of [
    "bytes",
    "directory",
    "mode",
    "extra",
    "sort",
    "hash",
    "size",
    "path",
  ]) {
    const f = await captured(t),
      p = join(f.evidence, "source/dirty.txt");
    if (mutation === "bytes") await writeFile(p, "tampered");
    if (mutation === "directory") {
      await rm(p);
      await mkdir(p);
    }
    if (mutation === "mode") {
      if (process.platform !== "win32") await chmod(p, 0o755);
      else {
        const m = structuredClone(f.manifest);
        m.files[0].mode = 0o600;
        await writeFile(
          join(f.evidence, "source-snapshot.json"),
          JSON.stringify(m),
        );
      }
    }
    if (mutation === "extra")
      await writeFile(join(f.evidence, "source/extra"), "extra");
    if (["sort", "hash", "size", "path"].includes(mutation)) {
      const m = structuredClone(f.manifest);
      if (mutation === "sort") m.files.reverse();
      if (mutation === "hash") m.sourceSha256 = "0".repeat(64);
      if (mutation === "size") m.files[0].size++;
      if (mutation === "path") m.files[0].path = "../escape";
      await writeFile(
        join(f.evidence, "source-snapshot.json"),
        JSON.stringify(m),
      );
    }
    await assert.rejects(
      api.verifySourceSnapshot(f.evidence),
      undefined,
      mutation,
    );
  }
});
for (const attack of [
  "traversal",
  "absolute",
  "backslash",
  "drive",
  "duplicate",
  "symlink",
  "hardlink",
  "mode",
  "bytes",
  "owner",
  "checksum",
  "trailing",
  "truncated",
]) {
  test(`archive rejects ${attack} even after attacker recomputes archive hash`, async (t) => {
    const f = await captured(t),
      tar = await readFile(join(f.evidence, "source.tar"));
    let malicious = Buffer.from(tar);
    const h = malicious.subarray(0, 512);
    if (["traversal", "absolute", "backslash", "drive"].includes(attack)) {
      h.fill(0, 0, 100);
      h.write(
        {
          traversal: "../escape",
          absolute: "/escape",
          backslash: "a\\b",
          drive: "C:/escape",
        }[attack],
        0,
      );
    }
    if (attack === "symlink" || attack === "hardlink") {
      h[156] = attack === "symlink" ? 50 : 49;
      h.write("../outside", 157);
    }
    if (attack === "mode") h.write("0000755\0", 100, "ascii");
    if (attack === "owner") h.write("0001234\0", 108, "ascii");
    checksum(h);
    if (attack === "bytes") malicious[512] ^= 1;
    if (attack === "checksum") malicious[148] ^= 1;
    if (attack === "duplicate")
      malicious = Buffer.concat([malicious.subarray(0, 1024), malicious]);
    if (attack === "trailing")
      malicious = Buffer.concat([malicious, Buffer.from("hostile")]);
    if (attack === "truncated") malicious = malicious.subarray(0, 513);
    await rewriteArchive(f, malicious);
    await assert.rejects(api.verifySourceSnapshot(f.evidence));
  });
}
test("long Unicode path round trips through real tar extraction", async (t) => {
  const f = await fixture(t),
    path = "thư mục/" + "Khuê ".repeat(22) + ".txt";
  await mkdir(join(f.root, "thư mục"));
  await writeFile(join(f.root, path), "UTF-8 no normalization: e\u0301 é\n");
  const m = await api.createSourceSnapshot(f.root, f.evidence);
  assert.deepEqual(await api.verifySourceSnapshot(f.evidence), m);
  const out = join(f.dir, "long-extracted");
  await mkdir(out);
  const extracted = spawnSync(tarCommand, [
    ...tarOptions,
    "-xf",
    join(f.evidence, "source.tar"),
    "-C",
    out,
  ]);
  assert.equal(extracted.status, 0, extracted.stderr?.toString());
  assert.deepEqual(
    await readFile(join(out, path)),
    await readFile(join(f.root, path)),
  );
});
test("hardlinks and symlink ancestry in source, retained tree and artifacts are rejected", async (t) => {
  const f = await fixture(t);
  await link(join(f.root, "dirty.txt"), join(f.root, "linked.txt"));
  await assert.rejects(api.createSourceSnapshot(f.root, f.evidence));
  const g = await captured(t),
    outside = join(g.dir, "outside");
  await mkdir(outside);
  const p = join(g.evidence, "source/dirty.txt");
  await rm(p);
  // Junctions are available without Windows symlink privileges.
  await symlink(outside, p, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(api.verifySourceSnapshot(g.evidence));
  const h = await fixture(t);
  await mkdir(join(h.dir, "external"));
  await symlink(
    join(h.dir, "external"),
    join(h.root, "linked-dir"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await writeFile(join(h.root, "linked-dir/escape.txt"), "escape");
  await assert.rejects(api.createSourceSnapshot(h.root, h.evidence));
});
test("engine retains old createSourceSnapshot export and rejects arbitrary handoff without Docker", async (t) => {
  const f = await captured(t);
  const engine =
    await import("../../scripts/product/local-rehearsal-engine.mjs");
  assert.equal(engine.createSourceSnapshot, api.createSourceSnapshot);
  const forged = { ...f.manifest, sourceSha256: "a".repeat(64) };
  await assert.rejects(
    engine.runOwnedRehearsal({
      evidencePath: join(f.dir, "rehearsal"),
      sourceSnapshot: { root: f.evidence, manifest: forged },
    }),
    { code: "REHEARSAL_SOURCE" },
  );
});
