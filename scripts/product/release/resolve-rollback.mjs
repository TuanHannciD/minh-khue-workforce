import { createGithubApi } from "./github-actions.mjs";
import { resolveExactRelease } from "./resolve-release.mjs";

const result = await resolveExactRelease(
  {
    sha: process.env.OLD_RELEASE_SHA,
    artifactId: process.env.OLD_RELEASE_ARTIFACT_ID,
    runId: process.env.OLD_RELEASE_RUN_ID,
    dispatchRef: process.env.GITHUB_REF,
    repository: process.env.GITHUB_REPOSITORY,
  },
  createGithubApi({
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GH_TOKEN,
  }),
);
console.log(JSON.stringify(result));
