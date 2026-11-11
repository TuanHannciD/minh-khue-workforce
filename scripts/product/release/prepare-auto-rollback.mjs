import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseJsonStrict } from "./validate-manifest.mjs";
import { createGithubApi } from "./github-actions.mjs";
import { resolveExactRelease } from "./resolve-release.mjs";
import { rollbackPrecheck, incident } from "./auto-rollback.mjs";

export async function prepareAutomaticRollback(input, api) {
  const result = rollbackPrecheck(input);
  if (result.action !== "eligible") return result;
  const previous = input.state.previousState;
  const o = previous.ownership;
  try {
    await resolveExactRelease(
      {
        sha: previous.releaseSha,
        repository: input.repository,
        dispatchRef: "refs/heads/main",
        artifactId: o.artifactId,
        runId: o.runId,
      },
      api,
    );
    const artifact = await api.artifact(o.artifactId);
    const run = await api.run(o.runId);
    const m = await api.jsonFromArtifact(o.artifactId, "release-manifest.json");
    if (
      Number(run.run_attempt) !== Number(o.runAttempt) ||
      artifact.digest !== o.artifactDigest ||
      JSON.stringify(m) !== JSON.stringify(previous.manifest)
    )
      return incident("last-known-good-artifact-identity-mismatch");
    return {
      action: "eligible",
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
