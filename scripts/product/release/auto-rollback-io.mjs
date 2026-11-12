import { readFile } from "node:fs/promises";
import { parseJsonStrict, validateManifest } from "./validate-manifest.mjs";
import {
  decideAutomaticRollback,
  buildRollbackEvidence,
  unchangedDatabase,
} from "./auto-rollback.mjs";
import { same, validServices } from "./gateway-policy.mjs";
import { validVerifiedState } from "./verified-state.mjs";

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
  const [databasePath, apiImage, webImage, imageIdsMatch, servicesPath] = args;
  console.log(
    JSON.stringify({
      database: await read(databasePath),
      apiImage,
      webImage,
      imageIdsMatch: imageIdsMatch === "true",
      ...(servicesPath
        ? { services: await read(servicesPath).catch(() => null) }
        : {}),
    }),
  );
} else if (command === "fields") {
  const manifest = await read(args[0]);
  if (!validateManifest(manifest).ok)
    throw new Error("invalid rollback manifest");
  for (const k of ["releaseSha", "apiImage", "webImage", "postgresImage"])
    console.log(manifest[k]);
} else if (command === "complete") {
  const [statePath, snapshotPath, opId, now, servicesPath] = args;
  const state = await read(statePath),
    database = await read(snapshotPath);
  const services = servicesPath
    ? await read(servicesPath).catch(() => null)
    : null;
  if (
    !state.rollbackAttempted ||
    state.operationId !== opId ||
    !unchangedDatabase(state.after, database) ||
    (state.dataOperations === "gateway-only" &&
      (!validServices(services, state.manifest) ||
        !same(services, state.dataOperationEvidence?.after)))
  )
    throw new Error("rollback DB invariant mismatch");
  // A gateway receipt binds its source operation. Preserve that identity when
  // restoring the verified release; record this recovery transaction separately.
  const restoredOperationId = state.previousState?.manifest?.artifacts
    ?.releasePolicy
    ? state.previousState.operationId
    : `${opId}.rollback`;
  const restored = {
    ...state.previousState,
    operationId: restoredOperationId,
    verifiedAt: now,
    database,
    runtimeVerification: {
      ...(state.previousState.runtimeVerification ?? {}),
      status: "verified",
      operationId: restoredOperationId,
      verifiedAt: now,
    },
    recovery: "recovered-by-app-rollback",
    recoveryOperationId: `${opId}.rollback`,
  };
  if (!validVerifiedState(restored))
    throw new Error("invalid recovered verified state");
  console.log(JSON.stringify(restored));
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
