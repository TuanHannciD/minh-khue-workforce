import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseJsonStrict, validateManifest } from "./validate-manifest.mjs";
import {
  validOwnership,
  validAttestation,
  validSnapshot,
  validVerifiedState,
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
    // A release must earn a producer-backed data-operation receipt after the
    // forward migration step. Never infer safety from a missing input.
    dataOperations: "unknown",
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
  if (
    state.schemaVersion !== 2 ||
    !validOwnership(state.ownership) ||
    !validAttestation(state.attestation) ||
    !validateManifest(state.manifest).ok ||
    state.manifest.releaseSha !== releaseSha ||
    !validSnapshot(database) ||
    database.postgresImage !== state.manifest.postgresImage ||
    !Number.isFinite(Date.parse(verifiedAt ?? ""))
  )
    throw new Error("incident-required: verification evidence is incomplete");
  const result = {
    ...state,
    status: "verified",
    database,
    verifiedAt,
    runtimeVerification: {
      status: "verified",
      operationId,
      releaseSha,
      verifiedAt,
      apiImage: state.manifest.apiImage,
      webImage: state.manifest.webImage,
      postgresImage: state.manifest.postgresImage,
    },
  };
  if (!validVerifiedState(result))
    throw new Error("incident-required: runtime verification evidence invalid");
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
