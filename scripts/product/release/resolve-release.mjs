import { validateManifest } from "./validate-manifest.mjs";

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
  const run = await api.run(runId);
  if (actionsId(run.id) !== runId || !isTrustedBuild(run, { sha, repository }))
    throw new Error(
      "release artifact producer is not a successful canonical build-release",
    );
  await validateReleaseSource({ sha, repository, artifactId }, api);
  return { artifactId, runId };
}
