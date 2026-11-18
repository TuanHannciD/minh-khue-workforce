import { createHash } from "node:crypto";
import {
  lstat,
  realpath,
  readdir,
  readFile,
  writeFile,
  mkdir,
  copyFile,
  rename,
} from "node:fs/promises";
import { dirname, join, resolve, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify, isDeepStrictEqual } from "node:util";
import { parseJsonStrict, validateManifest } from "./validate-manifest.mjs";

// File map: scan/inventory/compare own exact tree identity; copy/checksum helpers
// enforce packaging inputs; assembleDeploymentBundle separates trust sources;
// rollbackBinding/verifyBoundBytes bind canonical release/producer data through tar;
// main owns only CLI admission. Keep this planned public module self-contained
// so trusted controls can carry the same verifier as the local packager.
const inventoryName = "bundle-inventory.json";
const checksumName = "release-checksums.sha256";
const hash = (b) => createHash("sha256").update(b).digest("hex");
const exec = promisify(execFile);
const safePath = (p) =>
  typeof p === "string" &&
  /^[A-Za-z0-9._/-]+$/.test(p) &&
  p.split("/").every((c) => c !== "" && c !== "." && c !== "..");
const objectKeys = (v, keys) =>
  v !== null &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.keys(v).sort().join(",") === [...keys].sort().join(",");

async function directory(root) {
  const info = await lstat(root);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    resolve(root) !== (await realpath(root))
  )
    throw new Error(
      "directory must be canonical and contain no symlink ancestors",
    );
}

async function scan(root) {
  await directory(root);
  const files = [],
    directories = [];
  async function walk(prefix) {
    for (const name of (await readdir(join(root, prefix))).sort()) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (!safePath(path)) throw new Error("unsafe bundle path");
      const info = await lstat(join(root, path));
      if (info.isSymbolicLink()) throw new Error("bundle symlink is forbidden");
      if (info.isDirectory()) {
        directories.push(path);
        await walk(path);
      } else if (info.isFile() && info.nlink === 1) {
        const bytes = await readFile(join(root, path));
        files.push({ path, size: bytes.length, sha256: hash(bytes) });
      } else throw new Error("bundle special file or hardlink is forbidden");
    }
  }
  await walk("");
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const path of directories)
    if (!files.some((f) => f.path.startsWith(`${path}/`)))
      throw new Error("bundle contains an unused directory");
  return files;
}

export async function writeBundleInventory(root) {
  const files = (await scan(root)).filter((f) => f.path !== inventoryName);
  if (files.length === 0) throw new Error("bundle must contain files");
  await writeFile(
    join(root, inventoryName),
    `${JSON.stringify({ schemaVersion: "1", files }, null, 2)}\n`,
  );
}

export async function verifyBundleInventory(root) {
  try {
    const actual = await scan(root);
    const inventory = parseJsonStrict(
      await readFile(join(root, inventoryName), "utf8"),
    );
    if (
      !objectKeys(inventory, ["schemaVersion", "files"]) ||
      inventory.schemaVersion !== "1" ||
      !Array.isArray(inventory.files) ||
      inventory.files.length === 0
    )
      throw new Error("invalid bundle inventory schema");
    let previous = "";
    for (const f of inventory.files) {
      if (
        !objectKeys(f, ["path", "size", "sha256"]) ||
        !safePath(f.path) ||
        f.path === inventoryName ||
        f.path <= previous ||
        !Number.isSafeInteger(f.size) ||
        f.size < 0 ||
        !/^[a-f0-9]{64}$/.test(f.sha256)
      )
        throw new Error("invalid inventory entry or order");
      previous = f.path;
    }
    const payload = actual.filter((f) => f.path !== inventoryName);
    if (
      payload.length !== inventory.files.length ||
      payload.some((f, i) =>
        ["path", "size", "sha256"].some((k) => f[k] !== inventory.files[i][k]),
      )
    )
      throw new Error("bundle file set or bytes differ from inventory");
    return { ok: true, errors: [] };
  } catch {
    return { ok: false, errors: ["bundle inventory validation failed"] };
  }
}

async function requireInventory(root) {
  if (!(await verifyBundleInventory(root)).ok)
    throw new Error("bundle inventory validation failed");
}

export async function compareReleaseDirectories(existing, candidate) {
  try {
    await requireInventory(existing);
    await requireInventory(candidate);
    const a = await scan(existing),
      b = await scan(candidate);
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (e) {
    if (e.code === "ENOENT") return false;
    throw e;
  }
}

// Internal publisher operation. The caller holds the deployment flock across
// the absence check and rename; every writer must obey that lock. rename itself
// never copies across devices/mounts, so EXDEV and other errors leave both paths.
async function renameReleaseDirectory(candidate, destination) {
  await directory(candidate);
  await directory(dirname(resolve(destination)));
  if (await exists(destination)) throw new Error("destination already exists");
  await rename(candidate, destination);
}

async function copySelected(source, destination, paths) {
  // Validate each selected component; never follow a source symlink via copyFile.
  await directory(source);
  for (const path of paths) {
    if (!safePath(path)) throw new Error("unsafe selected path");
    let current = source;
    for (const component of path.split("/")) {
      current = join(current, component);
      if ((await lstat(current)).isSymbolicLink())
        throw new Error("source symlink is forbidden");
    }
    const info = await lstat(current);
    if (!info.isFile() || info.nlink !== 1)
      throw new Error("source must be a regular unlinked file");
    await mkdir(dirname(join(destination, path)), { recursive: true });
    await copyFile(current, join(destination, path));
  }
}

async function verifyChecksums(root, fullCoverage) {
  const files = await scan(root),
    names = files.map((f) => f.path);
  const required = [
    "release-manifest.json",
    "release-manifest.sha256",
    checksumName,
    "build-metadata.json",
  ];
  if (fullCoverage)
    required.push(
      "api-attestations.json",
      "web-attestations.json",
      "deploy/compose.production.yml",
      "scripts/product/manage-production-account.sh",
    );
  if (required.some((p) => !names.includes(p)))
    throw new Error("required release file is missing");
  const checks = parseChecksums(
    await readFile(join(root, checksumName), "utf8"),
  );
  for (const [path, digest] of checks)
    if (files.find((f) => f.path === path)?.sha256 !== digest)
      throw new Error("release checksum mismatch");
  if (checks.has(checksumName) || checks.has(inventoryName))
    throw new Error("checksum cycle is forbidden");
  const manifest = parseChecksums(
    await readFile(join(root, "release-manifest.sha256"), "utf8"),
  );
  if (
    manifest.size !== 1 ||
    manifest.get("release-manifest.json") !==
      files.find((f) => f.path === "release-manifest.json").sha256 ||
    !checks.has("release-manifest.json")
  )
    throw new Error("manifest checksum mismatch");
  if (
    fullCoverage &&
    (checks.size !== files.length - 2 ||
      files.some(
        (f) =>
          ![inventoryName, checksumName].includes(f.path) &&
          !checks.has(f.path),
      ))
  )
    throw new Error("release checksum coverage is incomplete");
}

function parseChecksums(text) {
  const result = new Map();
  if (!text.endsWith("\n")) throw new Error("invalid checksums");
  for (const line of text.slice(0, -1).split("\n")) {
    const match = /^([a-f0-9]{64}) {2}([A-Za-z0-9._/-]+)$/.exec(line);
    if (!match || !safePath(match[2]) || result.has(match[2]))
      throw new Error("invalid checksums");
    result.set(match[2], match[1]);
  }
  return result;
}

function contains(parent, child) {
  const path = relative(parent, child);
  return (
    path === "" ||
    (!path.startsWith(`..${sep}`) &&
      path !== ".." &&
      !resolve(child).startsWith(`${sep}${sep}`) &&
      !/^[A-Za-z]:/.test(path))
  );
}

async function createArchive(root, archive) {
  if (process.platform === "win32") {
    const posix = (p) =>
      p
        .replaceAll("\\", "/")
        .replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`);
    await exec("C:/Program Files/Git/bin/bash.exe", [
      "-c",
      'tar --version | head -1 | grep -q "GNU tar" || exit 69; tar -cf "$1" -C "$2" release controls operation',
      "bundle",
      posix(archive),
      posix(root),
    ]);
  } else {
    const { stdout } = await exec("tar", ["--version"]);
    if (!stdout.includes("GNU tar")) throw new Error("GNU tar is required");
    await exec("tar", [
      "-cf",
      archive,
      "-C",
      root,
      "release",
      "controls",
      "operation",
    ]);
  }
}

// Only the resolver's separately trusted record authorizes rollback identity.
// Capture the accepted input bytes once, then compare copied files AND the tar
// members against them. Recomputed inventory/checksums cannot authorize changes.
async function rollbackBinding(canonicalPath, artifact, operation) {
  const canonicalBytes = await readFile(canonicalPath);
  const canonical = parseJsonStrict(canonicalBytes.toString("utf8"));
  const recordBytes = await readFile(
    join(operation, "rollback-operation.json"),
  );
  const record = parseJsonStrict(recordBytes.toString("utf8"));
  if (
    !objectKeys(canonical, [
      "artifactId",
      "runId",
      "runAttempt",
      "artifactDigest",
      "manifest",
      "metadata",
    ]) ||
    !validateManifest(canonical.manifest).ok ||
    record.releaseSha !== canonical.manifest.releaseSha ||
    !["runId", "runAttempt", "artifactId"].every(
      (k) =>
        typeof canonical[k] === "string" && /^[1-9][0-9]*$/.test(canonical[k]),
    ) ||
    !/^sha256:[a-f0-9]{64}$/.test(canonical.artifactDigest) ||
    [
      ["releaseRunId", "runId"],
      ["releaseRunAttempt", "runAttempt"],
      ["releaseArtifactId", "artifactId"],
      ["releaseArtifactDigest", "artifactDigest"],
    ].some(([actual, expected]) => record[actual] !== canonical[expected])
  )
    throw new Error("canonical rollback release identity mismatch");
  const bytes = new Map([
    ["operation/rollback-release-resolved.json", canonicalBytes],
    ["operation/rollback-operation.json", recordBytes],
  ]);
  for (const [name, expected] of [
    ["release-manifest.json", canonical.manifest],
    ["build-metadata.json", canonical.metadata],
  ]) {
    const data = await readFile(join(artifact, name));
    if (!isDeepStrictEqual(parseJsonStrict(data.toString("utf8")), expected))
      throw new Error("canonical rollback release metadata mismatch");
    bytes.set(`release/${name}`, data);
  }
  if (
    !(await readFile(join(operation, "rollback-release-resolved.json"))).equals(
      canonicalBytes,
    )
  )
    throw new Error("canonical rollback release sidecar mismatch");
  return bytes;
}

async function verifyBoundBytes(bytes, read) {
  for (const [name, expected] of bytes)
    if (!(await read(name)).equals(expected))
      throw new Error("canonical rollback bundle bytes changed");
}

async function archiveMember(archive, name) {
  const { stdout } =
    process.platform === "win32"
      ? await exec(
          "C:/Program Files/Git/bin/bash.exe",
          [
            "-c",
            'tar -xOf "$1" "$2"',
            "bundle",
            archive
              .replaceAll("\\", "/")
              .replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`),
            name,
          ],
          { encoding: "buffer" },
        )
      : await exec("tar", ["-xOf", archive, name], { encoding: "buffer" });
  return stdout;
}

// Caller authenticates canonical artifact/source provenance before opting into legacy.
// Inventories establish exact bytes, never attestation or image account capability.
export async function assembleDeploymentBundle(input) {
  const {
    releaseArtifact,
    releaseSource,
    controlSource,
    operationDirectory,
    outputDirectory,
    legacy,
    rollbackResolvedRelease,
  } = input;
  if (typeof legacy !== "boolean")
    throw new Error("explicit legacy policy is required");
  const inputs = [
    releaseArtifact,
    releaseSource,
    controlSource,
    operationDirectory,
  ].map((p) => resolve(p));
  const output = resolve(outputDirectory);
  for (const path of inputs) {
    await directory(path);
    if (contains(path, output) || contains(output, path))
      throw new Error("bundle output overlaps an input");
  }
  await directory(dirname(output));
  if (
    !rollbackResolvedRelease &&
    (await exists(join(operationDirectory, "rollback-release-resolved.json")))
  )
    throw new Error("trusted canonical rollback release path is required");
  const boundBytes = rollbackResolvedRelease
    ? await rollbackBinding(
        rollbackResolvedRelease,
        releaseArtifact,
        operationDirectory,
      )
    : null;
  const hasInventory = await exists(join(releaseArtifact, inventoryName));
  if (hasInventory) await requireInventory(releaseArtifact);
  else if (!legacy) throw new Error("modern release inventory is required");
  await verifyChecksums(releaseArtifact, hasInventory);
  const releaseFiles = (await scan(releaseArtifact)).map((f) => f.path);
  const compose = "deploy/compose.production.yml",
    operator = "scripts/product/manage-production-account.sh";
  const sourcePaths = [
    compose,
    ...(releaseFiles.includes(operator) ? [operator] : []),
  ];
  for (const path of sourcePaths) {
    // Validate source components before comparing to build-owned artifact bytes.
    const components = path.split("/");
    let current = releaseSource;
    for (const c of components) {
      current = join(current, c);
      const s = await lstat(current);
      if (s.isSymbolicLink())
        throw new Error("release source symlink is forbidden");
    }
    if (!(await lstat(current)).isFile())
      throw new Error("release source file missing");
    if (
      releaseFiles.includes(path) &&
      !(await readFile(current)).equals(
        await readFile(join(releaseArtifact, path)),
      )
    )
      throw new Error("release source differs from artifact");
  }
  const controlsRoot = join(controlSource, "scripts/product/release");
  const controlFiles = (await scan(controlsRoot)).map(
    (f) => `scripts/product/release/${f.path}`,
  );
  controlFiles.push(
    "scripts/product/deploy-entrypoint.sh",
    "scripts/product/post-deploy-verify.sh",
  );
  const operationFiles = (await scan(operationDirectory))
    .map((f) => f.path)
    .filter((p) => p !== inventoryName);
  if (
    !["backup-ready.json", "backup-ready.sha256"].every((p) =>
      operationFiles.includes(p),
    )
  )
    throw new Error("operation backup metadata is required");
  await mkdir(output); // no-clobber: existing output is never reused or cleaned
  const release = join(output, "release"),
    controls = join(output, "controls"),
    operation = join(output, "operation");
  await copySelected(releaseArtifact, release, releaseFiles);
  if (!hasInventory) {
    if (!releaseFiles.includes(compose))
      await copySelected(releaseSource, release, [compose]);
    await writeBundleInventory(release);
  }
  await copySelected(controlSource, controls, controlFiles);
  await writeBundleInventory(controls);
  await copySelected(operationDirectory, operation, operationFiles);
  await writeBundleInventory(operation);
  for (const path of [release, controls, operation])
    await requireInventory(path);
  if (boundBytes)
    await verifyBoundBytes(boundBytes, (name) => readFile(join(output, name)));
  const archivePath = join(output, "deployment-bundle.tar");
  await createArchive(output, archivePath);
  if (boundBytes)
    await verifyBoundBytes(boundBytes, (name) =>
      archiveMember(archivePath, name),
    );
  return { archivePath };
}

async function main(args) {
  const [command, ...rest] = args;
  if (command === "rename" && rest.length === 2) {
    await renameReleaseDirectory(...rest);
    return;
  }
  if (
    ["inventory", "verify", "compare"].includes(command) &&
    rest.length === (command === "compare" ? 2 : 1)
  ) {
    if (command === "inventory") await writeBundleInventory(rest[0]);
    else if (command === "verify") await requireInventory(rest[0]);
    else if (!(await compareReleaseDirectories(...rest)))
      throw new Error("release directories differ");
    return;
  }
  if (command === "pack") {
    const flags = {
      "--release-artifact": "releaseArtifact",
      "--release-source": "releaseSource",
      "--controls": "controlSource",
      "--operation": "operationDirectory",
      "--output": "outputDirectory",
      "--rollback-release": "rollbackResolvedRelease",
    };
    const input = { legacy: false };
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === "--legacy" && !input.legacy) input.legacy = true;
      else if (
        Object.hasOwn(flags, rest[i]) &&
        !Object.hasOwn(input, flags[rest[i]]) &&
        rest[i + 1] &&
        !rest[i + 1].startsWith("--")
      )
        input[flags[rest[i]]] = rest[++i];
      else {
        process.exitCode = 64;
        return;
      }
    }
    if (
      Object.values(flags)
        .filter((k) => k !== "rollbackResolvedRelease")
        .some((k) => !input[k])
    ) {
      process.exitCode = 64;
      return;
    }
    await assembleDeploymentBundle(input);
    return;
  }
  process.exitCode = 64;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main(process.argv.slice(2)).catch(() => {
    console.error("release bundle validation failed");
    process.exitCode = 78;
  });
}
