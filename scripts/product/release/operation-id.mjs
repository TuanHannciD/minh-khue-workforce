import { lstat, realpath, mkdir } from "node:fs/promises";
import { resolve, join, dirname, basename, relative, parse } from "node:path";
import { fileURLToPath } from "node:url";

const invalid = () =>
  Object.assign(new Error("operation admission rejected"), { exitCode: 78 });

export function validateOperationId(value) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9._-]{1,160}$/.test(value) ||
    value === "." ||
    value === ".."
  )
    throw invalid();
  return value;
}

async function optionalStat(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

// Deploy owner controls these ancestors. Caller holds the shared deployment
// lock while reserving/mutating: this is not an adversarial openat sandbox.
async function canonicalDirectory(path) {
  const absolute = resolve(path),
    root = parse(absolute).root;
  let current = root;
  for (const part of relative(root, absolute).split(/[\\/]/).filter(Boolean)) {
    current = join(current, part);
    const info = await lstat(current);
    if (info.isSymbolicLink() || !info.isDirectory()) throw invalid();
  }
  const canonical = await realpath(absolute);
  if (relative(absolute, canonical) !== "") throw invalid();
  return canonical;
}

export async function resolveOperationDirectory(deployRoot, operationId) {
  try {
    validateOperationId(operationId);
    if (typeof deployRoot !== "string" || !deployRoot) throw invalid();
    const root = await canonicalDirectory(deployRoot);
    const parent = join(root, "operations"),
      directory = join(parent, operationId);
    if (
      relative(root, parent) !== "operations" ||
      relative(parent, directory) !== operationId ||
      dirname(directory) !== parent ||
      basename(directory) !== operationId
    )
      throw invalid();
    if (await optionalStat(parent)) {
      if ((await canonicalDirectory(parent)) !== parent) throw invalid();
      if (await optionalStat(directory)) {
        if ((await canonicalDirectory(directory)) !== directory)
          throw invalid();
      }
    }
    return directory;
  } catch {
    throw invalid();
  }
}

// Caller MUST hold the deployment flock. No adoption, deletion, or reuse, even
// after an interrupted/failed attempt; retry mutation requires a new ID.
export async function reserveOperationDirectory(deployRoot, operationId) {
  try {
    const directory = await resolveOperationDirectory(deployRoot, operationId);
    const parent = dirname(directory);
    if (!(await optionalStat(parent))) await mkdir(parent, { mode: 0o750 });
    if (
      (await resolveOperationDirectory(deployRoot, operationId)) !== directory
    )
      throw invalid();
    await mkdir(directory, { mode: 0o700 }); // deliberately nonrecursive; EEXIST fails closed
    if (
      (await resolveOperationDirectory(deployRoot, operationId)) !== directory
    )
      throw invalid();
    return directory;
  } catch {
    throw invalid();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2);
    let output;
    if (command === "validate" && args.length === 1)
      output = validateOperationId(args[0]);
    else if (command === "resolve" && args.length === 2)
      output = await resolveOperationDirectory(...args);
    else if (command === "reserve" && args.length === 2)
      output = await reserveOperationDirectory(...args);
    else throw invalid();
    console.log(output);
  } catch {
    console.error("operation admission rejected");
    process.exitCode = 78;
  }
}
