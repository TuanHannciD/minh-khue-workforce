import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseJsonStrict } from "./validate-manifest.mjs";
import {
  validOwnership,
  validAttestation,
  validSnapshot,
} from "./auto-rollback.mjs";

const read = async (path) => parseJsonStrict(await readFile(path, "utf8"));
const optional = async (path) => {
  try {
    return await read(path);
  } catch {
    return null;
  }
};
export function beginOperation({
  manifest,
  previousState,
  operationId,
  ownership,
  attestation,
  backup,
}) {
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(operationId ?? ""))
    throw new Error("invalid operation identity");
  return {
    schemaVersion: 2,
    status: "deploying",
    operationId,
    releaseSha: manifest.releaseSha,
    manifest,
    ownership,
    attestation,
    previousState,
    preReleaseBackupId: backup.backupId,
    applicationAttempted: false,
    migrationOutcome: "unknown",
    dataOperations: "migration-only",
  };
}
export function promoteOperation(
  state,
  { operationId, releaseSha, database, verifiedAt },
) {
  if (
    !state ||
    state.operationId !== operationId ||
    state.releaseSha !== releaseSha ||
    !["deploying", "verified"].includes(state.status)
  )
    throw new Error("incident-required: verification operation mismatch");
  // Legacy/manual releases retain the Task3 journal, but cannot seed auto recovery.
  if (
    state.schemaVersion !== 2 ||
    !validOwnership(state.ownership) ||
    !validAttestation(state.attestation) ||
    !validSnapshot(database)
  )
    return {
      status: "verified",
      operationId,
      releaseSha,
      verifiedAt,
      database,
    };
  const result = { ...state, status: "verified", database, verifiedAt };
  delete result.previousState;
  delete result.rollbackAttempted;
  return result;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  let output;
  if (command === "begin") {
    const [
      manifest,
      previous,
      backup,
      operationId,
      runId,
      runAttempt,
      artifactId,
      artifactDigest,
      controlSha,
      mode,
      status,
    ] = args;
    output = beginOperation({
      manifest: await read(manifest),
      previousState: await optional(previous),
      backup: await read(backup),
      operationId,
      ownership: {
        runId,
        runAttempt,
        artifactId,
        artifactDigest: artifactDigest?.startsWith("sha256:")
          ? artifactDigest
          : `sha256:${artifactDigest}`,
        controlSha,
      },
      attestation: { mode, status },
    });
  } else if (command === "update") {
    const [path, phase, snapshot, now] = args;
    output = await read(path);
    if (phase === "before") {
      output.before = await read(snapshot);
      output.migrationOutcome = "started";
    } else if (phase === "after") {
      output.after = await read(snapshot);
      output.migrationOutcome = "succeeded";
    } else if (phase === "app") {
      output.applicationAttempted = true;
      output.applicationStartedAt = now;
    } else if (phase === "failed") output.status = "failed";
    else if (phase === "attempt") {
      if (output.rollbackAttempted)
        throw new Error("rollback already attempted");
      output.rollbackAttempted = true;
    } else throw new Error("invalid journal phase");
  } else if (command === "promote") {
    const [path, operationId, releaseSha, snapshot, verifiedAt] = args;
    output = promoteOperation(await read(path), {
      operationId,
      releaseSha,
      database: await read(snapshot),
      verifiedAt,
    });
  } else throw new Error("invalid state command");
  console.log(JSON.stringify(output));
}
