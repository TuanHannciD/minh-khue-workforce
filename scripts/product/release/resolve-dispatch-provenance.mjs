import { appendFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import {
  actionsId,
  resolveExactRelease,
  resolveExactBackup,
} from "./resolve-release.mjs";
import { createGithubApi } from "./github-actions.mjs";

const supplied = (value) =>
  value === "" || value === undefined ? undefined : value;
const normalizeDigest = (value) => {
  const result = value?.startsWith("sha256:") ? value : `sha256:${value}`;
  if (!/^sha256:[a-f0-9]{64}$/.test(result))
    throw new Error("missing exact artifact digest");
  return result;
};

// Called by the actual deploy/verify blocks before SSH. Automatic callers own
// exact build outputs while their parent is still running; manual callers must
// independently resolve successful canonical producers.
export async function resolveDispatchProvenance(input, api) {
  const expected = input.expectedProvenance;
  if (
    expected !== undefined &&
    (!expected ||
      typeof expected !== "object" ||
      !expected.release ||
      (input.backupArtifactId && !expected.backup))
  )
    throw new Error("supplied producer provenance is incomplete");
  const releaseInput = {
    sha: input.sha,
    repository: input.repository,
    dispatchRef: input.dispatchRef,
    runId: input.releaseRunId,
    artifactId: input.releaseArtifactId,
    runAttempt: supplied(input.releaseRunAttempt),
    artifactDigest: supplied(input.releaseArtifactDigest),
  };
  const release = input.automatic
    ? {
        runId: actionsId(input.releaseRunId),
        artifactId: actionsId(input.releaseArtifactId),
        runAttempt: actionsId(input.releaseRunAttempt),
        artifactDigest: normalizeDigest(input.releaseArtifactDigest),
      }
    : await resolveExactRelease(releaseInput, api);
  let backup;
  if (input.backupArtifactId) {
    backup = input.automatic
      ? {
          runId: actionsId(input.backupRunId),
          artifactId: actionsId(input.backupArtifactId),
          runAttempt: actionsId(input.backupRunAttempt),
          artifactDigest: normalizeDigest(input.backupArtifactDigest),
        }
      : await resolveExactBackup(
          {
            sha: input.sha,
            repository: input.repository,
            dispatchRef: input.dispatchRef,
            runId: input.backupRunId,
            artifactId: input.backupArtifactId,
            runAttempt: supplied(input.backupRunAttempt),
            artifactDigest: supplied(input.backupArtifactDigest),
            kind: input.backupKind,
          },
          api,
        );
  }
  if (!input.automatic && input.localReleaseDirectory) {
    for (const entry of ["release-manifest.json", "build-metadata.json"]) {
      const canonical = await api.jsonFromArtifact(release.artifactId, entry);
      const local = JSON.parse(
        await readFile(`${input.localReleaseDirectory}/${entry}`, "utf8"),
      );
      if (!isDeepStrictEqual(canonical, local))
        throw new Error(`downloaded ${entry} differs from canonical artifact`);
    }
  }
  if (!input.automatic && backup && input.localBackupPath) {
    const canonical = await api.jsonFromArtifact(
      backup.artifactId,
      "backup-ready.json",
    );
    if (
      !isDeepStrictEqual(
        canonical,
        JSON.parse(await readFile(input.localBackupPath, "utf8")),
      )
    )
      throw new Error(
        "downloaded backup metadata differs from canonical artifact",
      );
  }
  const result = { release, ...(backup && { backup }) };
  if (expected !== undefined) {
    for (const kind of [
      "release",
      ...(input.backupArtifactId ? ["backup"] : []),
    ]) {
      for (const field of [
        "runId",
        "runAttempt",
        "artifactId",
        "artifactDigest",
      ]) {
        if (
          expected[kind]?.[field] === undefined ||
          String(expected[kind][field]) !== result[kind][field]
        )
          throw new Error(
            `supplied ${kind} producer provenance ${field} mismatch or missing`,
          );
      }
    }
  }
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const e = process.env;
  const result = await resolveDispatchProvenance(
    {
      sha: e.RELEASE_SHA,
      repository: e.GITHUB_REPOSITORY,
      dispatchRef: e.GITHUB_REF,
      automatic: e.MKW_AUTOMATIC_RELEASE === "true",
      releaseRunId: e.RELEASE_RUN_ID,
      releaseRunAttempt: e.RELEASE_RUN_ATTEMPT,
      releaseArtifactId: e.RELEASE_ARTIFACT_ID,
      releaseArtifactDigest: e.RELEASE_ARTIFACT_DIGEST,
      backupRunId: e.BACKUP_RUN_ID,
      backupRunAttempt: e.BACKUP_RUN_ATTEMPT,
      backupArtifactId: e.BACKUP_ARTIFACT_ID,
      backupArtifactDigest: e.BACKUP_ARTIFACT_DIGEST,
      backupKind: e.BACKUP_KIND,
      localReleaseDirectory: "release-artifact",
      expectedProvenance: e.PROVENANCE_JSON
        ? JSON.parse(e.PROVENANCE_JSON)
        : undefined,
      localBackupPath: e.BACKUP_ARTIFACT_ID
        ? "backup-ready/backup-ready.json"
        : undefined,
    },
    createGithubApi({ repository: e.GITHUB_REPOSITORY, token: e.GH_TOKEN }),
  );
  const outputs = Object.entries(result)
    .flatMap(([kind, identity]) =>
      Object.entries(identity).map(
        ([key, value]) =>
          `${kind}_${key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}=${value}\n`,
      ),
    )
    .join("");
  const backupOwnership = result.backup
    ? Object.fromEntries(
        ["runId", "runAttempt", "artifactId", "artifactDigest"].map((field) => [
          field,
          result.backup[field],
        ]),
      )
    : undefined;
  await appendFile(
    e.GITHUB_OUTPUT,
    outputs +
      (backupOwnership
        ? `backup_provenance=${JSON.stringify(backupOwnership)}\n`
        : ""),
  );
}
