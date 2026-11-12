import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseJsonStrict } from "./validate-manifest.mjs";
import { createGithubApi } from "./github-actions.mjs";
import {
  resolveExactRelease,
  validateReleaseSource,
} from "./resolve-release.mjs";
import {
  rollbackPrecheck,
  incident,
  validDataOperationEvidence,
} from "./auto-rollback.mjs";
import { canonicalDataEvidenceMatches } from "./gateway-policy.mjs";

// The failed push run is still running while its recovery job executes. Require
// its exact successful reusable build job instead of treating the failed parent
// as a successful release or weakening the historical artifact resolver.
async function resolveCurrentFailedRelease(input, api) {
  const {
    state,
    expectedSha: sha,
    repository,
    expectedOperationId,
    expectedOwnership,
  } = input;
  const o = state.ownership;
  if (
    JSON.stringify(o) !== JSON.stringify(expectedOwnership) ||
    expectedOperationId !== `${o.runId}-${o.runAttempt}-${sha}` ||
    o.controlSha !== input.expectedControlSha ||
    input.expectedControlSha !== sha
  )
    throw new Error("failed operation ownership mismatch");
  const artifact = await api.artifact(o.artifactId);
  const run = await api.run(o.runId);
  if (
    String(artifact.id) !== o.artifactId ||
    String(artifact.workflow_run?.id) !== o.runId ||
    artifact.expired !== false ||
    artifact.name !== `mkw-release-${sha}` ||
    artifact.digest !== o.artifactDigest ||
    String(run.id) !== o.runId ||
    String(run.run_attempt) !== o.runAttempt ||
    run.repository?.full_name !== repository ||
    run.head_repository?.full_name !== repository ||
    run.path !== ".github/workflows/main-release.yml" ||
    run.event !== "push" ||
    run.head_branch !== "main" ||
    run.head_sha !== sha ||
    !["in_progress", "completed"].includes(run.status) ||
    !run.referenced_workflows?.some(
      (w) =>
        w.path ===
          `${repository}/.github/workflows/build-release.yml@refs/heads/main` &&
        w.ref === "refs/heads/main" &&
        w.sha === o.controlSha,
    )
  )
    throw new Error("current canonical artifact producer mismatch");
  const jobs = (await api.runJobs(o.runId, o.runAttempt)).filter(
    (j) => j.name === "build / release",
  );
  if (
    jobs.length !== 1 ||
    jobs[0].status !== "completed" ||
    jobs[0].conclusion !== "success" ||
    String(jobs[0].run_id) !== o.runId ||
    String(jobs[0].run_attempt) !== o.runAttempt ||
    jobs[0].head_sha !== sha
  )
    throw new Error("current exact build attempt not successful");
  await validateReleaseSource(
    { sha, repository, artifactId: o.artifactId },
    api,
  );
  const manifest = await api.jsonFromArtifact(
    o.artifactId,
    "release-manifest.json",
  );
  const dataOperationEvidence = await api.jsonFromArtifact(
    o.artifactId,
    "data-operation-evidence.json",
  );
  if (
    JSON.stringify(manifest) !== JSON.stringify(state.manifest) ||
    !(
      canonicalDataEvidenceMatches(dataOperationEvidence, state) ||
      (validDataOperationEvidence(dataOperationEvidence, state) &&
        JSON.stringify(dataOperationEvidence) ===
          JSON.stringify(state.dataOperationEvidence))
    )
  )
    throw new Error("current canonical release evidence mismatch");
  return { ownership: o, manifest, dataOperationEvidence };
}

export async function prepareAutomaticRollback(input, api) {
  const result = rollbackPrecheck(input);
  if (result.action !== "eligible") return result;
  const previous = input.state.previousState;
  const o = previous.ownership;
  try {
    const currentReleaseProof = await resolveCurrentFailedRelease(input, api);
    await resolveExactRelease(
      {
        sha: previous.releaseSha,
        repository: input.repository,
        dispatchRef: "refs/heads/main",
        artifactId: o.artifactId,
        runId: o.runId,
        runAttempt: o.runAttempt,
        artifactDigest: o.artifactDigest,
      },
      api,
    );
    const artifact = await api.artifact(o.artifactId);
    const run = await api.run(o.runId, o.runAttempt);
    const m = await api.jsonFromArtifact(o.artifactId, "release-manifest.json");
    if (
      Number(run.run_attempt) !== Number(o.runAttempt) ||
      artifact.digest !== o.artifactDigest ||
      JSON.stringify(m) !== JSON.stringify(previous.manifest)
    )
      return incident("last-known-good-artifact-identity-mismatch");
    return {
      action: "eligible",
      currentReleaseProof: JSON.stringify(currentReleaseProof),
      pipelineStatus: "failed",
      releaseSha: previous.releaseSha,
      ...o,
      failedApiImage: input.state.manifest.apiImage,
      failedWebImage: input.state.manifest.webImage,
      postgresImage: input.state.manifest.postgresImage,
    };
  } catch {
    return incident("canonical-artifact-missing-expired-or-untrusted");
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { appendFile } = await import("node:fs/promises");
  let result = incident("rollback-preparation-unavailable");
  try {
    const state = parseJsonStrict(
      await readFile(process.env.CURRENT_STATE_PATH, "utf8"),
    );
    result = await prepareAutomaticRollback(
      {
        state,
        expectedOperationId: process.env.MKW_OPERATION_ID,
        expectedSha: process.env.RELEASE_SHA,
        expectedControlSha: process.env.CONTROL_SHA,
        expectedOwnership: {
          runId: process.env.CURRENT_RUN_ID,
          runAttempt: process.env.CURRENT_RUN_ATTEMPT,
          artifactId: process.env.CURRENT_ARTIFACT_ID,
          artifactDigest: process.env.CURRENT_ARTIFACT_DIGEST?.startsWith(
            "sha256:",
          )
            ? process.env.CURRENT_ARTIFACT_DIGEST
            : `sha256:${process.env.CURRENT_ARTIFACT_DIGEST}`,
          controlSha: process.env.CONTROL_SHA,
        },
        repository: process.env.GITHUB_REPOSITORY,
      },
      createGithubApi({
        repository: process.env.GITHUB_REPOSITORY,
        token: process.env.GH_TOKEN,
      }),
    );
  } catch {
    /* Fixed evidence only; never propagate untrusted API/SSH output. */
  }
  if (process.env.GITHUB_OUTPUT)
    for (const [key, value] of Object.entries(result))
      await appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `${JSON.stringify(result)}\n`,
    );
  console.log(JSON.stringify(result));
}
