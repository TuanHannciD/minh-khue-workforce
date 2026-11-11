import { readFile } from "node:fs/promises";
import { parseJsonStrict, validateManifest } from "./validate-manifest.mjs";
import {
  decideAutomaticRollback,
  buildRollbackEvidence,
  unchangedDatabase,
} from "./auto-rollback.mjs";

const read = async (p) => parseJsonStrict(await readFile(p, "utf8"));
const [command, ...args] = process.argv.slice(2);
if (command === "check") {
  const [
    statePath,
    dir,
    expectedOperationId,
    expectedSha,
    repository,
    age,
    host,
    target,
    mode,
    status,
    now,
  ] = args;
  const state = await read(statePath);
  const runtime = await read(`${dir}/runtime.json`);
  const backup = await read(`${dir}/backup-ready.json`).catch(() => null);
  const trustedManifest = await read(`${dir}/release-manifest.json`);
  const currentReleaseProof = await read(
    `${dir}/current-release-proof.json`,
  ).catch(() => null);
  const decision = decideAutomaticRollback({
    state,
    runtime,
    backup,
    trustedManifest,
    currentReleaseProof,
    expectedOwnership: currentReleaseProof?.ownership,
    expectedControlSha: currentReleaseProof?.ownership?.controlSha,
    artifactsVerified: true,
    expectedOperationId,
    expectedSha,
    repository,
    now,
    attestation: { mode, status },
    backupPolicy: {
      maxAgeSeconds: Number(age),
      expectedTargetHost: host,
      expectedDatabase: "mkw",
      expectedTargetIdentity: target,
    },
  });
  console.log(JSON.stringify(decision));
} else if (command === "runtime") {
  const [databasePath, apiImage, webImage, imageIdsMatch] = args;
  console.log(
    JSON.stringify({
      database: await read(databasePath),
      apiImage,
      webImage,
      imageIdsMatch: imageIdsMatch === "true",
    }),
  );
} else if (command === "fields") {
  const manifest = await read(args[0]);
  if (!validateManifest(manifest).ok)
    throw new Error("invalid rollback manifest");
  for (const k of ["releaseSha", "apiImage", "webImage", "postgresImage"])
    console.log(manifest[k]);
} else if (command === "complete") {
  const [statePath, snapshotPath, opId, now] = args;
  const state = await read(statePath),
    database = await read(snapshotPath);
  if (
    !state.rollbackAttempted ||
    state.operationId !== opId ||
    !unchangedDatabase(state.after, database)
  )
    throw new Error("rollback DB invariant mismatch");
  console.log(
    JSON.stringify({
      ...state.previousState,
      operationId: `${opId}.rollback`,
      verifiedAt: now,
      database,
      runtimeVerification: {
        ...(state.previousState.runtimeVerification ?? {}),
        status: "verified",
        operationId: `${opId}.rollback`,
        verifiedAt: now,
      },
      recovery: "recovered-by-app-rollback",
    }),
  );
} else if (command === "evidence") {
  const [outcome, attempted, opId, releaseSha] = args;
  console.log(
    JSON.stringify(
      buildRollbackEvidence({
        decision: {
          action:
            outcome === "recovered-by-app-rollback"
              ? "rollback"
              : "incident-required",
        },
        attempted: attempted === "true",
        verification:
          outcome === "recovered-by-app-rollback" ? "passed" : "failed",
        operationId: opId,
        releaseSha,
      }),
    ),
  );
} else throw new Error("invalid recovery command");
