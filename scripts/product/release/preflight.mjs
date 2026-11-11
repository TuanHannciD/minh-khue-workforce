import { readFile, appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseJsonStrict } from "./validate-manifest.mjs";
import { createGithubApi } from "./github-actions.mjs";
import { decideOrchestrationOutcome } from "./orchestration-policy.mjs";

// The probe supplies only the secret-free operation journal, never env files.
export async function preflightRelease({ sha, statePath, api }) {
  const currentSha = await api.currentSourceSha();
  if (currentSha !== sha)
    return decideOrchestrationOutcome({ requestedSha: sha, currentSha });
  const state = statePath
    ? parseJsonStrict(await readFile(statePath, "utf8"))
    : null;
  return (
    decideOrchestrationOutcome({ requestedSha: sha, currentSha, state }) ?? {
      status: "ready",
    }
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = await preflightRelease({
    sha: process.env.RELEASE_SHA,
    statePath: process.env.CURRENT_STATE_PATH,
    api: createGithubApi({
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GH_TOKEN,
    }),
  });
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `release_status=${result.status}\n`,
  );
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `release_status=${result.status}\n`,
    );
}
