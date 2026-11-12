import { validateManifest } from "./validate-manifest.mjs";
import { validateBackupReady } from "./validate-backup-ready.mjs";

export const actionsId = (value) => {
  if (!/^[1-9][0-9]*$/.test(String(value)))
    throw new Error("invalid Actions id");
  return String(value);
};
export function isTrustedBuild(run, { sha, repository } = {}) {
  const legacy =
    run.path === ".github/workflows/build-release.yml" &&
    run.event === "workflow_run";
  const automatic =
    run.path === ".github/workflows/main-release.yml" &&
    run.event === "push" &&
    run.head_sha === sha &&
    run.referenced_workflows?.some(
      (workflow) =>
        workflow.path ===
          `${repository}/.github/workflows/build-release.yml@refs/heads/main` &&
        workflow.sha === sha &&
        workflow.ref === "refs/heads/main",
    );
  return (
    (legacy || automatic) &&
    run.head_branch === "main" &&
    run.status === "completed" &&
    run.conclusion === "success"
  );
}
export async function validateReleaseSource(
  { sha, repository, artifactId },
  api,
) {
  const manifest = await api.jsonFromArtifact(
    actionsId(artifactId),
    "release-manifest.json",
  );
  const metadata = await api.jsonFromArtifact(
    actionsId(artifactId),
    "build-metadata.json",
  );
  if (
    !validateManifest(manifest).ok ||
    manifest.releaseSha !== sha ||
    metadata.sourceSha !== sha ||
    manifest.sourceRepository !== repository
  )
    throw new Error("release manifest/source SHA linkage failed");
  for (const [field, expected] of [
    ["apiDigest", manifest.apiImage.split("@")[1]],
    ["webDigest", manifest.webImage.split("@")[1]],
    ["postgresImage", manifest.postgresImage],
  ])
    if (metadata[field] !== undefined && metadata[field] !== expected)
      throw new Error("release build metadata image linkage failed");
  return { manifest, metadata };
}

const digest = (value) => {
  const normalized = String(value ?? "").startsWith("sha256:")
    ? String(value)
    : `sha256:${value ?? ""}`;
  if (!/^sha256:[a-f0-9]{64}$/.test(normalized))
    throw new Error("release artifact digest is missing or invalid");
  return normalized;
};

export async function resolveExactBackup(input, api) {
  const { sha, repository, dispatchRef, kind = "BACKUP" } = input;
  if (dispatchRef !== "refs/heads/main")
    throw new Error("dispatch must use canonical main");
  if (!/^[a-f0-9]{40}$/.test(sha) || !/^[\w.-]+\/[\w.-]+$/.test(repository))
    throw new Error("invalid backup artifact inputs");
  const artifactId = actionsId(input.artifactId);
  const runId = actionsId(input.runId);
  const artifact = await api.artifact(artifactId);
  if (
    actionsId(artifact.id) !== artifactId ||
    artifact.expired !== false ||
    actionsId(artifact.workflow_run?.id) !== runId
  )
    throw new Error("backup artifact ownership/expiry mismatch");
  const name = String(artifact.name ?? "");
  const match = name.match(new RegExp(`^mkw-backup-${runId}-([1-9][0-9]*)$`));
  if (!match)
    throw new Error("backup artifact name does not bind a producing attempt");
  const runAttempt = match[1];
  if (input.runAttempt !== undefined && String(input.runAttempt) !== runAttempt)
    throw new Error("backup producing attempt mismatch");
  const artifactDigest = digest(artifact.digest);
  if (
    input.artifactDigest !== undefined &&
    digest(input.artifactDigest) !== artifactDigest
  )
    throw new Error("backup artifact digest mismatch");
  const run = await api.run(runId, runAttempt);
  if (
    actionsId(run.id) !== runId ||
    String(run.run_attempt) !== runAttempt ||
    run.path !== ".github/workflows/backup.yml" ||
    run.event !== "workflow_dispatch" ||
    run.head_branch !== "main" ||
    run.status !== "completed" ||
    run.conclusion !== "success"
  )
    throw new Error(
      "backup artifact producer is not an exact successful canonical backup",
    );
  const readiness = await api.jsonFromArtifact(artifactId, "backup-ready.json");
  if (
    !validateBackupReady(readiness, {
      expectedKind: kind,
      expectedReleaseSha: sha,
    }).ok
  )
    throw new Error("backup metadata does not match requested release");
  if (readiness.backupId !== `mkw-${runId}-${runAttempt}-release`)
    throw new Error("backup metadata does not bind producing attempt");
  return { artifactId, runId, runAttempt, artifactDigest, artifactName: name };
}
// Resolve the supplied immutable ID; a same-name artifact is never a fallback.
export async function resolveExactRelease(input, api) {
  const { sha, repository, dispatchRef } = input;
  if (dispatchRef !== "refs/heads/main")
    throw new Error("dispatch must use canonical main");
  if (!/^[a-f0-9]{40}$/.test(sha) || !/^[\w.-]+\/[\w.-]+$/.test(repository))
    throw new Error("invalid release artifact inputs");
  const artifactId = actionsId(input.artifactId),
    runId = actionsId(input.runId);
  const artifact = await api.artifact(artifactId);
  if (
    actionsId(artifact.id) !== artifactId ||
    artifact.expired !== false ||
    artifact.name !== `mkw-release-${sha}` ||
    actionsId(artifact.workflow_run?.id) !== runId
  )
    throw new Error("release artifact ownership/expiry mismatch");
  const artifactDigest = digest(artifact.digest);
  if (
    input.artifactDigest !== undefined &&
    digest(input.artifactDigest) !== artifactDigest
  )
    throw new Error("release artifact digest mismatch");
  // A supplied immutable attempt can be checked before reading the archive.
  // Archive-bound/legacy attempts are checked after reading their provenance.
  let boundRun;
  if (input.runAttempt !== undefined) {
    if (!/^[1-9][0-9]*$/.test(String(input.runAttempt)))
      throw new Error("release producer attempt provenance is invalid");
    boundRun = await api.run(runId, String(input.runAttempt));
    if (
      actionsId(boundRun.id) !== runId ||
      String(boundRun.run_attempt) !== String(input.runAttempt) ||
      !isTrustedBuild(boundRun, { sha, repository })
    )
      throw new Error(
        "release artifact producer is not a canonical build-release",
      );
  }
  const { metadata } = await validateReleaseSource(
    { sha, repository, artifactId },
    api,
  );
  if (
    metadata.artifactDigest !== undefined &&
    digest(metadata.artifactDigest) !== artifactDigest
  )
    throw new Error("release build metadata artifact digest linkage failed");
  const metadataRunId = metadata.producerRunId;
  const metadataAttempt = metadata.producerRunAttempt;
  if ((metadataRunId === undefined) !== (metadataAttempt === undefined))
    throw new Error("release producer attempt provenance is incomplete");
  if (metadataRunId !== undefined && actionsId(metadataRunId) !== runId)
    throw new Error("release producer run provenance mismatch");
  if (
    metadataAttempt !== undefined &&
    !/^[1-9][0-9]*$/.test(String(metadataAttempt))
  )
    throw new Error("release producer attempt provenance is invalid");
  if (
    input.runAttempt !== undefined &&
    metadataAttempt !== undefined &&
    String(input.runAttempt) !== String(metadataAttempt)
  )
    throw new Error("release producer attempt provenance mismatch");
  // An explicit dispatch binding or the archive's immutable producer metadata
  // identifies the run attempt. Do not gate that exact producer on the mutable
  // latest rerun, which may be failed or still in progress.
  let runAttempt =
    input.runAttempt !== undefined ? String(input.runAttempt) : metadataAttempt;
  if (runAttempt !== undefined && !/^[1-9][0-9]*$/.test(String(runAttempt)))
    throw new Error("release producer attempt provenance is invalid");
  if (runAttempt === undefined) {
    // Legacy archives predate producer fields. Only trusted API creation/run
    // windows can establish their attempt; latest is never a fallback.
    const created = Date.parse(artifact.created_at ?? "");
    const latest = await api.run(runId);
    const count = Number(latest.run_attempt);
    if (
      !Number.isFinite(created) ||
      actionsId(latest.id) !== runId ||
      !Number.isSafeInteger(count) ||
      count < 1 ||
      count > 100
    )
      throw new Error("release producer attempt provenance is missing");
    const matches = [];
    for (let attempt = 1; attempt <= count; attempt++) {
      const candidate = await api.run(runId, String(attempt));
      const start = Date.parse(candidate.run_started_at ?? "");
      const end = Date.parse(candidate.updated_at ?? "");
      if (
        actionsId(candidate.id) !== runId ||
        String(candidate.run_attempt) !== String(attempt)
      )
        throw new Error("release producer attempt API mismatch");
      if (
        isTrustedBuild(candidate, { sha, repository }) &&
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        start <= created &&
        created <= end
      )
        matches.push(String(attempt));
    }
    if (matches.length !== 1)
      throw new Error(
        "release producer attempt provenance is missing or ambiguous",
      );
    [runAttempt] = matches;
  }
  if (
    input.runAttempt !== undefined &&
    String(input.runAttempt) !== String(runAttempt)
  )
    throw new Error("release producer attempt provenance mismatch");
  const run = boundRun ?? (await api.run(runId, String(runAttempt)));
  const created = Date.parse(artifact.created_at ?? "");
  const started = Date.parse(run.run_started_at ?? "");
  const completed = Date.parse(run.updated_at ?? "");
  if (
    actionsId(run.id) !== runId ||
    String(run.run_attempt) !== String(runAttempt) ||
    !Number.isFinite(created) ||
    !Number.isFinite(started) ||
    !Number.isFinite(completed) ||
    created < started ||
    created > completed ||
    !isTrustedBuild(run, { sha, repository })
  )
    throw new Error(
      "release artifact producer is not a successful canonical build-release",
    );
  return { artifactId, runId, runAttempt: String(runAttempt), artifactDigest };
}
