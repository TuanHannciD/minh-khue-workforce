import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parseJsonStrict } from "./validate-manifest.mjs";

const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const SECRET =
  /(?:password|token|secret|private[_-]?key|access[_-]?key|credential|db[_-]?url|signature|(?:^|[?&#])sig(?:nature)?=|postgres(?:ql)?:\/\/|mysql:\/\/|https?:\/\/[^/]*:[^/@]+@)/i;

function parseUtcTimestamp(value) {
  if (typeof value !== "string" || !UTC.test(value)) return null;
  const parsed = Date.parse(value);
  if (
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString().slice(0, 19) !== value.slice(0, 19)
  )
    return null;
  return parsed;
}

export function validateBackupReady(value, options = {}) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { ok: false, errors: ["backup-ready must be an object"] };
  const allowed = new Set([
    "schemaVersion",
    "kind",
    "backupId",
    "releaseSha",
    "createdAt",
    "dumpSha256",
    "size",
    "restoreVerified",
    "retentionUntil",
    "storageLocation",
    "databaseIdentity",
    "databaseVerifiedEmpty",
    "emptyEvidence",
  ]);
  for (const key of Object.keys(value))
    if (!allowed.has(key)) errors.push("backup-ready contains unknown fields");
  for (const key of [
    "schemaVersion",
    "kind",
    "backupId",
    "releaseSha",
    "createdAt",
    "restoreVerified",
    "retentionUntil",
    "storageLocation",
  ])
    if (!(key in value)) errors.push(`${key} is required`);
  if (value.schemaVersion !== "1") errors.push('schemaVersion must be "1"');
  if (!["BACKUP", "INITIAL_EMPTY_DEPLOYMENT"].includes(value.kind))
    errors.push("kind must be BACKUP or INITIAL_EMPTY_DEPLOYMENT");
  if (
    typeof value.backupId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(value.backupId)
  )
    errors.push("backupId is invalid");
  if (typeof value.releaseSha !== "string" || !SHA.test(value.releaseSha))
    errors.push("releaseSha must be a full hexadecimal commit SHA");
  for (const field of ["createdAt", "retentionUntil"])
    if (parseUtcTimestamp(value[field]) === null)
      errors.push(`${field} must be a UTC timestamp`);
  const expectedKind = options.expectedKind;
  if (expectedKind !== undefined && value.kind !== expectedKind)
    errors.push("kind does not match expected kind");
  const expectedReleaseSha = options.expectedReleaseSha;
  if (expectedReleaseSha !== undefined) {
    if (typeof expectedReleaseSha !== "string" || !SHA.test(expectedReleaseSha))
      errors.push("expected release SHA is invalid");
    else if (
      typeof value.releaseSha === "string" &&
      SHA.test(value.releaseSha) &&
      value.releaseSha.toLowerCase() !== expectedReleaseSha.toLowerCase()
    )
      errors.push("releaseSha does not match expected release SHA");
  }
  // Callers supply time explicitly so contract-only validation stays deterministic.
  const maxAgeSeconds = options.maxAgeSeconds;
  const timestampNow = parseUtcTimestamp(options.now);
  if (
    (Object.hasOwn(options, "now") || maxAgeSeconds !== undefined) &&
    timestampNow === null
  )
    errors.push("validation time must be a UTC timestamp");
  if (
    maxAgeSeconds !== undefined &&
    (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 0)
  )
    errors.push("maximum age must be a non-negative safe integer of seconds");
  const createdAt = parseUtcTimestamp(value.createdAt);
  const retentionUntil = parseUtcTimestamp(value.retentionUntil);
  if (timestampNow !== null && createdAt !== null) {
    if (createdAt > timestampNow)
      errors.push("createdAt must not be in the future");
    if (
      Number.isFinite(maxAgeSeconds) &&
      timestampNow - createdAt > maxAgeSeconds * 1000
    )
      errors.push("createdAt exceeds maximum age");
  }
  if (
    timestampNow !== null &&
    retentionUntil !== null &&
    retentionUntil <= timestampNow
  )
    errors.push("retentionUntil has expired");
  if (
    createdAt !== null &&
    retentionUntil !== null &&
    retentionUntil <= createdAt
  )
    errors.push("retentionUntil must be after createdAt");
  if (
    typeof value.storageLocation !== "string" ||
    value.storageLocation.length === 0 ||
    value.storageLocation.length > 1024 ||
    SECRET.test(value.storageLocation)
  )
    errors.push("storageLocation contains invalid or secret-like content");
  if (typeof value.restoreVerified !== "boolean")
    errors.push("restoreVerified must be boolean");
  if (value.kind === "BACKUP") {
    if (value.restoreVerified !== true)
      errors.push("restoreVerified must be true for BACKUP");
    if (
      typeof value.dumpSha256 !== "string" ||
      !/^[a-f0-9]{64}$/i.test(value.dumpSha256)
    )
      errors.push("dumpSha256 is required and must be a SHA-256 digest");
    if (!Number.isInteger(value.size) || value.size < 1)
      errors.push("size is required and must be positive");
    if (
      !value.databaseIdentity ||
      typeof value.databaseIdentity !== "object" ||
      Array.isArray(value.databaseIdentity)
    )
      errors.push("databaseIdentity is required for BACKUP");
  } else {
    if (value.restoreVerified !== false)
      errors.push("restoreVerified must be false for INITIAL_EMPTY_DEPLOYMENT");
    if (value.databaseVerifiedEmpty !== true)
      errors.push(
        "databaseVerifiedEmpty must be true for INITIAL_EMPTY_DEPLOYMENT",
      );
    const evidence = value.emptyEvidence;
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence))
      errors.push(
        "emptyEvidence target/database identity and UTC checkedAt are required",
      );
    else {
      for (const key of Object.keys(evidence))
        if (!["targetIdentity", "databaseIdentity", "checkedAt"].includes(key))
          errors.push("emptyEvidence contains unknown fields");
      if (
        typeof evidence.targetIdentity !== "string" ||
        evidence.targetIdentity.length === 0
      )
        errors.push("emptyEvidence.targetIdentity is required");
      if (
        typeof evidence.databaseIdentity !== "string" ||
        evidence.databaseIdentity.length === 0
      )
        errors.push("emptyEvidence.databaseIdentity is required");
      if (
        typeof evidence.checkedAt !== "string" ||
        parseUtcTimestamp(evidence.checkedAt) === null
      )
        errors.push("emptyEvidence.checkedAt must be a UTC timestamp");
      else if (timestampNow !== null) {
        const checkedAt = parseUtcTimestamp(evidence.checkedAt);
        if (checkedAt > timestampNow)
          errors.push("emptyEvidence.checkedAt must not be in the future");
        if (
          Number.isFinite(maxAgeSeconds) &&
          timestampNow - checkedAt > maxAgeSeconds * 1000
        )
          errors.push("emptyEvidence.checkedAt exceeds maximum age");
      }
    }
    if ("dumpSha256" in value || "size" in value)
      errors.push("INITIAL_EMPTY_DEPLOYMENT cannot contain dump metadata");
  }
  if (value.databaseIdentity) {
    if (
      typeof value.databaseIdentity !== "object" ||
      Array.isArray(value.databaseIdentity)
    )
      errors.push("databaseIdentity is invalid");
    else {
      for (const key of Object.keys(value.databaseIdentity))
        if (!["host", "name", "engine"].includes(key))
          errors.push("databaseIdentity contains unknown fields");
      if (
        typeof value.databaseIdentity.host !== "string" ||
        value.databaseIdentity.host.length === 0
      )
        errors.push("databaseIdentity.host is required");
      if (
        typeof value.databaseIdentity.name !== "string" ||
        value.databaseIdentity.name.length === 0
      )
        errors.push("databaseIdentity.name is required");
      if (value.databaseIdentity.engine !== "postgresql")
        errors.push("databaseIdentity.engine must be postgresql");
    }
  }
  return { ok: errors.length === 0, errors };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let args;
  try {
    args = parseArgs({
      allowPositionals: true,
      tokens: true,
      options: {
        schema: { type: "string" },
        "expected-release-sha": { type: "string" },
        "max-age-seconds": { type: "string" },
        now: { type: "string" },
        "expected-kind": { type: "string" },
      },
    });
    const names = args.tokens
      .filter((token) => token.kind === "option")
      .map((token) => token.name);
    if (args.positionals.length !== 1 || new Set(names).size !== names.length)
      throw new Error("invalid arguments");
  } catch {
    console.error(
      "usage: node validate-backup-ready.mjs <backup-ready> [--schema <schema>] [--expected-release-sha <sha>] [--max-age-seconds <seconds>] [--now <UTC timestamp>] [--expected-kind <kind>]",
    );
    process.exitCode = 2;
  }
  if (args && process.exitCode !== 2)
    try {
      const maxAgeArgument = args.values["max-age-seconds"];
      const result = validateBackupReady(
        parseJsonStrict(await readFile(args.positionals[0], "utf8")),
        {
          expectedReleaseSha: args.values["expected-release-sha"],
          expectedKind: args.values["expected-kind"],
          maxAgeSeconds:
            maxAgeArgument === undefined
              ? undefined
              : /^[0-9]+$/.test(maxAgeArgument)
                ? Number(maxAgeArgument)
                : Number.NaN,
          now: args.values.now ?? new Date().toISOString(),
        },
      );
      if (!result.ok) {
        console.error(result.errors.join("\n"));
        process.exitCode = 1;
      } else console.log("valid backup-ready contract");
    } catch {
      console.error("backup-ready JSON could not be read or parsed");
      process.exitCode = 1;
    }
}
