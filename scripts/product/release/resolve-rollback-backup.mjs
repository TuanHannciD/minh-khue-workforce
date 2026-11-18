import { appendFile, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { createGithubApi } from "./github-actions.mjs";
import { actionsId } from "./resolve-release.mjs";
import { parseJsonStrict } from "./validate-manifest.mjs";
import { validateBackupReady } from "./validate-backup-ready.mjs";

const workflowPath = ".github/workflows/backup.yml";
const digest = (value) => {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value))
    throw new Error("rollback backup digest is invalid");
  return value;
};
function checkReadiness(readiness, target, policy) {
  if (
    !target ||
    ["host", "database", "targetIdentity"].some(
      (k) => typeof target[k] !== "string" || !target[k],
    )
  )
    throw new Error("trusted rollback target is required");
  if (
    !policy ||
    typeof policy.now !== "string" ||
    !Number.isSafeInteger(policy.maxAgeSeconds) ||
    policy.maxAgeSeconds < 0 ||
    policy.maxAgeSeconds > 86400
  )
    throw new Error("trusted rollback freshness policy is required");
  if (
    !validateBackupReady(readiness, {
      expectedKind: "BACKUP",
      expectedTargetHost: target.host,
      expectedDatabase: target.database,
      expectedTargetIdentity: target.targetIdentity,
      now: policy.now,
      maxAgeSeconds: policy.maxAgeSeconds,
    }).ok
  )
    throw new Error("rollback backup readiness rejected");
}

// The snapshot belongs to the current database, independently of the old app SHA.
// Only canonical GitHub metadata and digest-checked archive bytes establish it.
export async function resolveRollbackBackup(input, api) {
  if (
    input.dispatchRef !== "refs/heads/main" ||
    !/^[\w.-]+\/[\w.-]+$/.test(input.repository)
  )
    throw new Error("rollback backup requires canonical main/repository");
  const artifactId = actionsId(input.artifactId),
    runId = actionsId(input.runId);
  const artifact = await api.artifact(artifactId);
  if (
    actionsId(artifact.id) !== artifactId ||
    artifact.expired !== false ||
    actionsId(artifact.workflow_run?.id) !== runId
  )
    throw new Error("rollback backup artifact ownership/expiry mismatch");
  const match = String(artifact.name ?? "").match(
    new RegExp(`^mkw-backup-${runId}-([1-9][0-9]*)$`),
  );
  if (!match) throw new Error("rollback backup artifact attempt is missing");
  const runAttempt = match[1],
    artifactDigest = digest(artifact.digest);
  if (
    (input.runAttempt !== undefined &&
      actionsId(input.runAttempt) !== runAttempt) ||
    (input.artifactDigest !== undefined &&
      digest(input.artifactDigest) !== artifactDigest)
  )
    throw new Error("rollback backup supplied producer tuple mismatch");
  const run = await api.run(runId, runAttempt);
  if (
    actionsId(run.id) !== runId ||
    String(run.run_attempt) !== runAttempt ||
    run.path !== workflowPath ||
    run.event !== "workflow_dispatch" ||
    run.head_branch !== "main" ||
    run.status !== "completed" ||
    run.conclusion !== "success"
  )
    throw new Error("rollback backup producer is not exact canonical success");
  const readiness = await api.jsonFromArtifact(artifactId, "backup-ready.json");
  const after = await api.artifact(artifactId);
  if (!isDeepStrictEqual(after, artifact))
    throw new Error(
      "rollback backup artifact changed during archive verification",
    );
  checkReadiness(readiness, input.target, input);
  if (readiness.backupId !== `mkw-${runId}-${runAttempt}-release`)
    throw new Error("rollback backup ID does not bind producer attempt");
  return {
    workflowPath,
    artifactId,
    artifactName: artifact.name,
    runId,
    runAttempt,
    artifactDigest,
    backupId: readiness.backupId,
    snapshotSha: readiness.releaseSha,
    target: structuredClone(input.target),
    freshness: {
      createdAt: readiness.createdAt,
      retentionUntil: readiness.retentionUntil,
      checkedAt: input.now,
      maxAgeSeconds: input.maxAgeSeconds,
    },
    readiness,
  };
}

export function verifyDownloadedRollbackBackup(resolved, downloaded, policy) {
  if (
    !resolved ||
    resolved.workflowPath !== workflowPath ||
    resolved.artifactName !==
      `mkw-backup-${actionsId(resolved.runId)}-${actionsId(resolved.runAttempt)}` ||
    !actionsId(resolved.artifactId) ||
    !digest(resolved.artifactDigest) ||
    resolved.backupId !==
      `mkw-${resolved.runId}-${resolved.runAttempt}-release` ||
    resolved.backupId !== resolved.readiness?.backupId ||
    resolved.snapshotSha !== resolved.readiness?.releaseSha ||
    resolved.freshness?.createdAt !== resolved.readiness?.createdAt ||
    resolved.freshness?.retentionUntil !== resolved.readiness?.retentionUntil ||
    resolved.freshness?.maxAgeSeconds !== policy.maxAgeSeconds
  )
    throw new Error("canonical rollback snapshot tuple rejected");
  checkReadiness(resolved.readiness, resolved.target, {
    now: resolved.freshness.checkedAt,
    maxAgeSeconds: resolved.freshness.maxAgeSeconds,
  });
  checkReadiness(downloaded, resolved.target, policy);
  if (!isDeepStrictEqual(downloaded, resolved.readiness))
    throw new Error(
      "downloaded rollback snapshot differs from canonical archive",
    );
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const target = {
    host: process.env.MKW_SSH_HOST,
    database: process.env.TARGET_DATABASE,
    targetIdentity: process.env.TARGET_IDENTITY,
  };
  const policy = { now: new Date().toISOString(), maxAgeSeconds: 86400 };
  if (command === "resolve" && args.length === 0) {
    const result = await resolveRollbackBackup(
      {
        repository: process.env.GITHUB_REPOSITORY,
        dispatchRef: process.env.GITHUB_REF,
        runId: process.env.BACKUP_RUN_ID,
        artifactId: process.env.BACKUP_ARTIFACT_ID,
        ...(process.env.BACKUP_RUN_ATTEMPT
          ? { runAttempt: process.env.BACKUP_RUN_ATTEMPT }
          : {}),
        ...(process.env.BACKUP_ARTIFACT_DIGEST
          ? { artifactDigest: process.env.BACKUP_ARTIFACT_DIGEST }
          : {}),
        target,
        ...policy,
      },
      createGithubApi({
        repository: process.env.GITHUB_REPOSITORY,
        token: process.env.GH_TOKEN,
      }),
    );
    const path = join(
      process.env.RUNNER_TEMP || process.cwd(),
      "rollback-backup-resolved.json",
    );
    await writeFile(path, `${JSON.stringify(result)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    if (process.env.GITHUB_OUTPUT)
      await appendFile(
        process.env.GITHUB_OUTPUT,
        Object.entries({
          backup_artifact_id: result.artifactId,
          backup_run_id: result.runId,
          backup_run_attempt: result.runAttempt,
          backup_artifact_digest: result.artifactDigest,
          backup_resolved_path: path,
        })
          .map(([k, v]) => `${k}=${v}\n`)
          .join(""),
      );
    return;
  }
  if (command === "verify") {
    const parsed = parseArgs({
      args,
      options: { resolved: { type: "string" }, downloaded: { type: "string" } },
      tokens: true,
    });
    if (
      parsed.tokens.length !== 2 ||
      !parsed.values.resolved ||
      !parsed.values.downloaded
    )
      throw new Error("invalid verify arguments");
    const resolved = parseJsonStrict(
      await readFile(parsed.values.resolved, "utf8"),
    );
    if (!isDeepStrictEqual(resolved.target, target))
      throw new Error("trusted rollback target mismatch");
    verifyDownloadedRollbackBackup(
      resolved,
      parseJsonStrict(await readFile(parsed.values.downloaded, "utf8")),
      policy,
    );
    return;
  }
  throw new Error("invalid rollback backup command");
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch(() => {
    console.error("canonical rollback backup verification failed");
    process.exitCode = 78;
  });
}
