import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseJsonStrict } from "./validate-manifest.mjs";

const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const SECRET =
  /(?:password|token|secret|private[_-]?key|access[_-]?key|credential|db[_-]?url|signature|(?:^|[?&#])sig(?:nature)?=|postgres(?:ql)?:\/\/|mysql:\/\/|https?:\/\/[^/]*:[^/@]+@)/i;

export function validateBackupReady(value) {
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
    if (!allowed.has(key)) errors.push(`${key} is unknown`);
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
    if (
      typeof value[field] !== "string" ||
      !UTC.test(value[field]) ||
      Number.isNaN(Date.parse(value[field]))
    )
      errors.push(`${field} must be a UTC timestamp`);
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
          errors.push(`emptyEvidence.${key} is unknown`);
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
        !UTC.test(evidence.checkedAt) ||
        Number.isNaN(Date.parse(evidence.checkedAt))
      )
        errors.push("emptyEvidence.checkedAt must be a UTC timestamp");
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
          errors.push(`databaseIdentity.${key} is unknown`);
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
  const [inputPath] = process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"));
  if (!inputPath) {
    console.error(
      "usage: node validate-backup-ready.mjs <backup-ready> [--schema <schema>]",
    );
    process.exitCode = 2;
  } else
    try {
      const result = validateBackupReady(
        parseJsonStrict(await readFile(inputPath, "utf8")),
      );
      if (!result.ok) {
        console.error(result.errors.join("\n"));
        process.exitCode = 1;
      } else console.log("valid backup-ready contract");
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
}
