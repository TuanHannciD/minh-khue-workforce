// One snapshot route: Git inventory -> retained bytes -> POSIX tar -> verification.
// createSourceSnapshot owns capture; verifySourceSnapshot admits disk/tree/archive;
// verifySourceSnapshotHandoff additionally requires a capture owned by this process.
// Tar codec is deliberately narrow: regular files and a single PAX path record.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  lstat,
  realpath,
  readdir,
  chmod,
} from "node:fs/promises";
import { resolve, join, dirname, relative, isAbsolute, parse } from "node:path";

const exec = promisify(execFile);
const hash = (b) => createHash("sha256").update(b).digest("hex");
const digest = /^[a-f0-9]{64}$/;
const captures = new Map();
const fail = () => {
  throw Object.assign(new Error("REHEARSAL_SOURCE"), {
    code: "REHEARSAL_SOURCE",
  });
};
const excluded = (p) =>
  /(^|\/)(node_modules|dist|\.git|\.agent-runs|\.superpowers|\.pnpm-store)(\/|$)/.test(
    p,
  ) ||
  (/(^|\/)\.env(?:\.|$)/.test(p) && !p.endsWith(".example")) ||
  p.startsWith("deploy/shared/");

function safePath(p) {
  if (
    typeof p !== "string" ||
    !p ||
    [...p].some(
      (c) =>
        c === "\\" ||
        c === ":" ||
        c.charCodeAt(0) < 0x20 ||
        c.charCodeAt(0) === 0x7f,
    ) ||
    p
      .split("/")
      .some((s) => !s || s === "." || s === ".." || /[. ]$/.test(s)) ||
    excluded(p)
  )
    fail();
  return p;
}
async function safeDirectory(path) {
  const full = resolve(path);
  // Check every ancestor, including junctions; realpath alone misses in-tree links.
  let current = parse(full).root;
  for (const component of relative(current, full)
    .split(/[\\/]/)
    .filter(Boolean)) {
    current = join(current, component);
    const s = await lstat(current);
    if (!s.isDirectory() || s.isSymbolicLink()) fail();
  }
  if (resolve(await realpath(full)) !== full) fail();
  return full;
}
async function regular(root, path) {
  safePath(path);
  const full = resolve(root, path),
    rel = relative(root, full);
  if (
    isAbsolute(rel) ||
    rel === ".." ||
    rel.startsWith(`..${parse(full).root === "/" ? "/" : "\\"}`)
  )
    fail();
  await safeDirectory(dirname(full));
  const s = await lstat(full);
  if (
    !s.isFile() ||
    s.isSymbolicLink() ||
    s.nlink !== 1 ||
    resolve(await realpath(full)) !== full
  )
    fail();
  return s;
}
async function git(root, args, allowFailure = false) {
  try {
    return (
      await exec("git", args, {
        cwd: root,
        encoding: "buffer",
        maxBuffer: 64 * 1024 ** 2,
        timeout: 30000,
      })
    ).stdout;
  } catch (e) {
    if (allowFailure && e.code === 128) return null;
    fail();
  }
}
function admitManifest(m) {
  if (
    m?.schemaVersion !== "2" ||
    !(m.base === null || /^[a-f0-9]{40}$/.test(m.base)) ||
    !Array.isArray(m.files) ||
    !digest.test(m.sourceSha256) ||
    !digest.test(m.archiveSha256)
  )
    fail();
  let previous;
  const seen = new Set();
  for (const f of m.files) {
    safePath(f.path);
    if (
      Object.keys(f).join(",") !== "path,size,sha256,mode" ||
      !Number.isSafeInteger(f.size) ||
      f.size < 0 ||
      !digest.test(f.sha256) ||
      ![0o644, 0o755].includes(f.mode) ||
      (previous !== undefined && previous >= f.path)
    )
      fail();
    const key = process.platform === "win32" ? f.path.toLowerCase() : f.path;
    if (seen.has(key)) fail();
    seen.add(key);
    previous = f.path;
  }
  if (hash(JSON.stringify(m.files)) !== m.sourceSha256) fail();
  return m;
}

// USTAR headers carry canonical permissions/ownership, independent of host modes.
function header(path, size, mode, type = "0") {
  const b = Buffer.alloc(512);
  b.write(path, 0, 100, "utf8");
  for (const [offset, length, value] of [
    [100, 8, mode],
    [108, 8, 0],
    [116, 8, 0],
    [124, 12, size],
    [136, 12, 0],
  ]) {
    const text = value.toString(8).padStart(length - 1, "0");
    if (text.length >= length) fail();
    b.write(text, offset, length - 1, "ascii");
  }
  b.fill(32, 148, 156);
  b.write(type, 156);
  b.write("ustar\0", 257, "ascii");
  b.write("00", 263, "ascii");
  b.write(
    b
      .reduce((a, c) => a + c, 0)
      .toString(8)
      .padStart(6, "0") + "\0 ",
    148,
    "ascii",
  );
  return b;
}
function paxPath(path) {
  const payload = ` path=${path}\n`;
  let length = Buffer.byteLength(payload) + 1;
  while (Buffer.byteLength(String(length) + payload) !== length)
    length = Buffer.byteLength(String(length) + payload);
  return Buffer.from(String(length) + payload);
}
function member(path, bytes, mode, type) {
  return [
    header(path, bytes.length, mode, type),
    bytes,
    Buffer.alloc((512 - (bytes.length % 512)) % 512),
  ];
}
async function archive(source, files) {
  const chunks = [];
  for (const f of files) {
    await regular(source, f.path);
    const bytes = await readFile(join(source, f.path));
    if (bytes.length !== f.size || hash(bytes) !== f.sha256) fail();
    let name = f.path;
    if (Buffer.byteLength(name) > 100) {
      chunks.push(...member("PaxHeader", paxPath(name), 0o644, "x"));
      name = "PaxFile";
    }
    chunks.push(...member(name, bytes, f.mode, "0"));
  }
  return Buffer.concat([...chunks, Buffer.alloc(1024)]);
}
const utf8 = new TextDecoder("utf-8", { fatal: true });
function text(b) {
  const end = b.indexOf(0);
  if (end !== -1 && b.subarray(end).some((v) => v !== 0)) fail();
  return utf8.decode(end === -1 ? b : b.subarray(0, end));
}
function octal(b) {
  const s = text(b);
  if (!/^[0-7]+$/.test(s)) fail();
  const n = Number.parseInt(s, 8);
  if (!Number.isSafeInteger(n)) fail();
  return n;
}
function verifyArchive(bytes, files) {
  let offset = 0,
    pendingPath;
  const found = new Map();
  while (
    offset + 512 <= bytes.length &&
    bytes.subarray(offset, offset + 512).some((v) => v !== 0)
  ) {
    const h = bytes.subarray(offset, offset + 512);
    const checksum = h.subarray(148, 156).toString("ascii");
    if (!/^[0-7]{6}\0 $/.test(checksum)) fail();
    const expected = Number.parseInt(checksum, 8);
    if (
      h.reduce((sum, v, i) => sum + (i >= 148 && i < 156 ? 32 : v), 0) !==
        expected ||
      h.subarray(257, 265).toString("ascii") !== "ustar\0" + "00" ||
      h.subarray(157, 257).some((v) => v !== 0) ||
      h.subarray(265).some((v) => v !== 0) ||
      octal(h.subarray(108, 116)) !== 0 ||
      octal(h.subarray(116, 124)) !== 0
    )
      fail();
    const size = octal(h.subarray(124, 136)),
      mode = octal(h.subarray(100, 108));
    const start = offset + 512,
      end = start + size,
      next = start + Math.ceil(size / 512) * 512;
    if (next > bytes.length || bytes.subarray(end, next).some((v) => v !== 0))
      fail();
    const data = bytes.subarray(start, end),
      type = String.fromCharCode(h[156]);
    const name = text(h.subarray(0, 100));
    if (type === "x") {
      if (pendingPath !== undefined || name !== "PaxHeader" || mode !== 0o644)
        fail();
      const pax = utf8.decode(data),
        match = /^([1-9][0-9]*) path=([^\n]+)\n$/.exec(pax);
      if (!match || Number(match[1]) !== data.length) fail();
      pendingPath = safePath(match[2]);
    } else {
      const path = safePath(pendingPath ?? name);
      if (
        type !== "0" ||
        (pendingPath !== undefined && name !== "PaxFile") ||
        found.has(path) ||
        ![0o644, 0o755].includes(mode)
      )
        fail();
      found.set(path, { path, size, sha256: hash(data), mode });
      pendingPath = undefined;
    }
    offset = next;
  }
  if (
    pendingPath !== undefined ||
    bytes.length - offset < 1024 ||
    bytes.subarray(offset).some((v) => v !== 0) ||
    found.size !== files.length
  )
    fail();
  for (const f of files)
    if (JSON.stringify(found.get(f.path)) !== JSON.stringify(f)) fail();
}
async function verifyTree(source, files, allowBuildOutputs = false) {
  await safeDirectory(source);
  const paths = [];
  async function walk(directory, prefix = "") {
    for (const name of await readdir(directory)) {
      const path = `${prefix}${name}`,
        s = await lstat(join(directory, name));
      // Worker installs/builds add only these generated directories. Admission
      // still verifies every manifest byte/mode and rejects extra source files.
      if (
        allowBuildOutputs &&
        /^(?:(?:apps\/(?:api|web)\/)?(?:node_modules|dist)|apps\/api\/src\/infrastructure\/db\/generated)$/.test(
          path,
        ) &&
        s.isDirectory() &&
        !s.isSymbolicLink()
      )
        continue;
      if (s.isSymbolicLink()) fail();
      if (s.isDirectory()) {
        safePath(path);
        await walk(join(directory, name), `${path}/`);
      } else {
        await regular(source, path);
        paths.push(path);
      }
    }
  }
  await walk(source);
  if (JSON.stringify(paths.sort()) !== JSON.stringify(files.map((f) => f.path)))
    fail();
  for (const f of files) {
    const s = await regular(source, f.path),
      b = await readFile(join(source, f.path));
    // Windows has no POSIX executable bit. Archive metadata is always checked.
    if (
      s.size !== f.size ||
      hash(b) !== f.sha256 ||
      (process.platform !== "win32" && (s.mode & 0o7777) !== f.mode)
    )
      fail();
  }
}

export async function createSourceSnapshot(root, evidenceRoot) {
  root = await safeDirectory(root);
  const evidence = await safeDirectory(evidenceRoot);
  const names = [
    "source",
    "source.tar",
    "source-snapshot.json",
    "source-files.txt",
  ];
  for (const n of names) {
    const exists = await lstat(join(evidence, n)).catch((e) => {
      if (e.code !== "ENOENT") throw e;
      return null;
    });
    if (exists) fail();
  }
  const tracked = await git(root, ["ls-files", "--stage", "-z"]);
  const untracked = await git(root, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ]);
  const inventory = new Map();
  for (const record of tracked.toString("utf8").split("\0").filter(Boolean)) {
    const match =
      /^(100644|100755|120000|160000) [a-f0-9]+ ([0-3])\t([\s\S]+)$/.exec(
        record,
      );
    if (!match || match[2] !== "0" || inventory.has(match[3])) fail();
    inventory.set(
      match[3],
      match[1] === "100755" ? 0o755 : match[1] === "100644" ? 0o644 : null,
    );
  }
  for (const p of untracked.toString("utf8").split("\0").filter(Boolean)) {
    if (inventory.has(p)) fail();
    inventory.set(p, 0o644);
  }
  const source = join(evidence, "source");
  await mkdir(source); // Exclusive claim; never replace a retained capture.
  const files = [];
  const evidenceRelative = relative(root, evidence).split("\\").join("/");
  for (const [path, mode] of [...inventory].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    if (
      excluded(path) ||
      path === evidenceRelative ||
      path.startsWith(`${evidenceRelative}/`)
    )
      continue;
    safePath(path);
    const info = await lstat(join(root, path)).catch((e) => {
      if (e.code === "ENOENT") return null;
      throw e;
    });
    if (!info) continue; // Current tracked deletions, never Git HEAD content.
    if (mode === null) fail();
    await regular(root, path);
    const bytes = await readFile(join(root, path)),
      destination = join(source, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: "wx", mode });
    if (process.platform !== "win32") await chmod(destination, mode);
    files.push({ path, size: bytes.length, sha256: hash(bytes), mode });
  }
  const base = await git(root, ["rev-parse", "--verify", "HEAD"], true);
  const bytes = await archive(source, files);
  const manifest = {
    schemaVersion: "2",
    base: base?.toString().trim() ?? null,
    files,
    sourceSha256: hash(JSON.stringify(files)),
    archiveSha256: hash(bytes),
  };
  await writeFile(
    join(evidence, "source-files.txt"),
    files.map((f) => f.path + "\n").join(""),
    { flag: "wx" },
  );
  await writeFile(join(evidence, "source.tar"), bytes, {
    flag: "wx",
    mode: 0o600,
  });
  await writeFile(
    join(evidence, "source-snapshot.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  const verified = await verifySourceSnapshot(evidence);
  captures.set(evidence, hash(JSON.stringify(verified)));
  return verified;
}

// sourceRoot permits the existing owned driver layout (/workspace, /source.tar).
// It is only a read target; both roots and every file ancestry are admitted.
export async function verifySourceSnapshot(
  snapshotRoot,
  { sourceRoot, allowBuildOutputs = false } = {},
) {
  const root = await safeDirectory(snapshotRoot);
  for (const name of ["source-snapshot.json", "source.tar"])
    await regular(root, name);
  const m = admitManifest(
    JSON.parse(await readFile(join(root, "source-snapshot.json"), "utf8")),
  );
  const bytes = await readFile(join(root, "source.tar"));
  if (hash(bytes) !== m.archiveSha256) fail();
  verifyArchive(bytes, m.files);
  await verifyTree(
    resolve(sourceRoot ?? join(root, "source")),
    m.files,
    allowBuildOutputs,
  );
  return m;
}

export async function verifySourceSnapshotHandoff({ root, manifest } = {}) {
  if (
    typeof root !== "string" ||
    captures.get(resolve(root)) !== hash(JSON.stringify(manifest) ?? "")
  )
    fail();
  const verified = await verifySourceSnapshot(root);
  if (JSON.stringify(verified) !== JSON.stringify(manifest)) fail();
  return verified;
}
