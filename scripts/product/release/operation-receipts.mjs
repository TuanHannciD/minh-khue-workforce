import {
  lstat,
  realpath,
  readdir,
  readFile,
  open,
  rename,
  unlink,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve, dirname, basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateOperationId,
  resolveOperationDirectory,
} from "./operation-id.mjs";
import { parseJsonStrict } from "./validate-manifest.mjs";

const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;
const IMAGE = /^[^@\s]+@sha256:[a-f0-9]{64}$/i;
const phases = [
  "validated",
  "published",
  "config-staged",
  "api-config-published",
  "compose-config-published",
  "db-prepared",
  "migration-complete",
  "app-applied",
  "smoke-complete",
];
const keys = [
  "schemaVersion",
  "operationId",
  "eventId",
  "sequence",
  "operation",
  "releaseSha",
  "imageDigests",
  "status",
  "phase",
  "utc",
  "mutationStarted",
  "registry",
  "attestationVerification",
  "rollbackScope",
  "databaseRecovery",
  "backupId",
  "targetIdentity",
  "controlSha",
];
const invalid = () =>
  Object.assign(new Error("operation receipt rejected"), { exitCode: 78 });
const exactObject = (value, fields) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).length === fields.length &&
  fields.every((key) => Object.hasOwn(value, key));
const safeText = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  !/[\p{Cc}\u2028\u2029]/u.test(value);

function validateIdentity(value) {
  validateOperationId(value.operationId);
  if (
    typeof value.releaseSha !== "string" ||
    !SHA.test(value.releaseSha) ||
    !exactObject(value.imageDigests, ["api", "web", "postgres"]) ||
    !Object.values(value.imageDigests).every(
      (image) => typeof image === "string" && IMAGE.test(image),
    )
  )
    throw invalid();
}

function validateEvent(value) {
  if (!exactObject(value, keys)) throw invalid();
  validateIdentity(value);
  if (
    value.schemaVersion !== 1 ||
    typeof value.eventId !== "string" ||
    !UUID.test(value.eventId) ||
    !Number.isSafeInteger(value.sequence) ||
    value.sequence <= 0 ||
    !["release", "application-rollback"].includes(value.operation) ||
    !["in-progress", "ok", "failed", "registry-pull-failed"].includes(
      value.status,
    ) ||
    !phases.includes(value.phase) ||
    (value.status === "ok" && value.phase !== "smoke-complete") ||
    typeof value.mutationStarted !== "boolean" ||
    value.rollbackScope !== "application-only" ||
    value.databaseRecovery !== false ||
    typeof value.controlSha !== "string" ||
    !SHA.test(value.controlSha) ||
    !safeText(value.backupId) ||
    !safeText(value.targetIdentity)
  )
    throw invalid();
  if (
    typeof value.utc !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value.utc) ||
    !Number.isFinite(Date.parse(value.utc)) ||
    new Date(value.utc).toISOString().slice(0, 19) !== value.utc.slice(0, 19)
  )
    throw invalid();
  if (
    !exactObject(value.registry, ["host", "auth", "pull"]) ||
    value.registry.host !== "ghcr.io" ||
    !["not-run", "public", "private"].includes(value.registry.auth) ||
    !["not-run", "verified", "failed"].includes(value.registry.pull) ||
    !["verified", "not-verified", "not-applicable", "not-configured"].includes(
      value.attestationVerification,
    )
  )
    throw invalid();
  return value;
}

async function exactDirectory(directory, operationId) {
  if (typeof directory !== "string" || !directory) throw invalid();
  const absolute = resolve(directory);
  if (
    basename(absolute) !== operationId ||
    basename(dirname(absolute)) !== "operations"
  )
    throw invalid();
  if (
    (await resolveOperationDirectory(
      dirname(dirname(absolute)),
      operationId,
    )) !== absolute
  )
    throw invalid();
  const info = await lstat(absolute);
  if (
    info.isSymbolicLink() ||
    !info.isDirectory() ||
    (await realpath(absolute)) !== absolute
  )
    throw invalid();
  return absolute;
}

const sameIdentity = (a, b) =>
  a.operationId === b.operationId &&
  a.releaseSha === b.releaseSha &&
  ["api", "web", "postgres"].every(
    (key) => a.imageDigests[key] === b.imageDigests[key],
  );
const sameContext = (a, b) =>
  sameIdentity(a, b) &&
  [
    "operation",
    "backupId",
    "targetIdentity",
    "controlSha",
    "rollbackScope",
    "databaseRecovery",
  ].every((key) => a[key] === b[key]);

async function eventsFor(directory, operationId) {
  const events = [];
  for (const name of await readdir(directory)) {
    if (!name.startsWith(`${operationId}.`) || !name.endsWith(".json"))
      continue;
    // Split from the UUID suffix, since IDs themselves can contain dots and
    // another operation's ID may start with this one plus a dot.
    const match = /^(.*)\.([^.]+)\.json$/.exec(name);
    if (!match || !UUID.test(match[2])) throw invalid();
    if (match[1] !== operationId) continue;
    const path = join(directory, name),
      info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile()) throw invalid();
    const event = validateEvent(parseJsonStrict(await readFile(path, "utf8")));
    if (event.operationId !== operationId || event.eventId !== match[2])
      throw invalid();
    events.push(event);
  }
  const sequences = new Set(events.map((e) => e.sequence));
  if (
    sequences.size !== events.length ||
    events.some((e) => !sameContext(e, events[0]))
  )
    throw invalid();
  // Only the exact operation's validated sequences are ordered, never global
  // filenames/timestamps. A terminal event closes the operation permanently.
  events.sort((a, b) => a.sequence - b.sequence);
  const terminals = events.filter((e) => e.status !== "in-progress");
  if (
    terminals.length > 1 ||
    (terminals.length === 1 && terminals[0] !== events.at(-1))
  )
    throw invalid();
  return events;
}

// Caller holds the same lock used for reservation/lifecycle; this function
// appends only to that reserved operation and never creates/adopts a directory.
export async function writeOperationEvent(directory, event) {
  let temp, handle;
  try {
    // Snapshot caller-owned objects before asynchronous filesystem work.
    validateEvent(event);
    const value = validateEvent(parseJsonStrict(JSON.stringify(event)));
    const canonical = await exactDirectory(directory, value.operationId);
    const events = await eventsFor(canonical, value.operationId),
      last = events.at(-1);
    if (
      last &&
      (last.status !== "in-progress" ||
        value.sequence <= last.sequence ||
        !sameContext(value, last))
    )
      throw invalid();
    const destination = join(
      canonical,
      `${value.operationId}.${value.eventId}.json`,
    );
    try {
      await lstat(destination);
      throw invalid();
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const candidate = join(
      canonical,
      `.${value.operationId}.${value.eventId}.${randomUUID()}.tmp`,
    );
    handle = await open(candidate, "wx", 0o600);
    temp = candidate; // cleanup only a temp successfully created by this writer
    await handle.writeFile(`${JSON.stringify(value)}\n`);
    await handle.chmod(0o640);
    await handle.close();
    handle = undefined;
    if ((await exactDirectory(directory, value.operationId)) !== canonical)
      throw invalid();
    // Same-directory OS rename only, no EXDEV copy fallback. Absence is safe
    // under the caller-held lock; UUID collision is an error, never overwrite.
    try {
      await lstat(destination);
      throw invalid();
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await rename(temp, destination);
    temp = undefined;
    return destination;
  } catch {
    throw invalid();
  } finally {
    if (handle) await handle.close().catch(() => {});
    if (temp) await unlink(temp).catch(() => {});
  }
}

export async function readOperationReceipt(directory, expected) {
  try {
    if (!exactObject(expected, ["operationId", "releaseSha", "imageDigests"]))
      throw invalid();
    const identity = parseJsonStrict(JSON.stringify(expected));
    validateIdentity(identity);
    const canonical = await exactDirectory(directory, identity.operationId);
    const events = await eventsFor(canonical, identity.operationId),
      last = events.at(-1);
    if (
      !last ||
      last.status !== "ok" ||
      events.some((event) => !sameIdentity(event, identity))
    )
      throw invalid();
    return last;
  } catch {
    throw invalid();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [command, directory, path, ...extra] = process.argv.slice(2);
    if (
      extra.length ||
      !directory ||
      !path ||
      !["read", "write"].includes(command)
    )
      throw invalid();
    const value = parseJsonStrict(await readFile(path, "utf8"));
    const output =
      command === "write"
        ? await writeOperationEvent(directory, value)
        : await readOperationReceipt(directory, value);
    console.log(typeof output === "string" ? output : JSON.stringify(output));
  } catch {
    console.error("operation receipt rejected");
    process.exitCode = 78;
  }
}
