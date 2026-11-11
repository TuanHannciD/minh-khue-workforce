import { coordinateRelease } from "./coordinator.mjs";
import { createGithubApi } from "./github-actions.mjs";
import { MAX_BACKUP_AGE_MS } from "./orchestration-policy.mjs";

const token = process.env.GH_TOKEN_VALUE;
delete process.env.GH_TOKEN_VALUE;
delete process.env.GH_TOKEN;
delete process.env.GITHUB_TOKEN;
const repository = process.env.REPOSITORY;
if (!token) throw new Error("coordinator Actions token is required");
const api = createGithubApi({ repository, token });
const result = await coordinateRelease(
  {
    sha: process.env.RELEASE_SHA,
    mode: process.env.RELEASE_MODE,
    kind: process.env.BACKUP_KIND,
    correlationId: process.env.CORRELATION_ID,
    repository,
    maxAgeMs: MAX_BACKUP_AGE_MS,
    target: {
      host: process.env.MKW_SSH_HOST,
      database: "mkw",
      identity: `${process.env.MKW_SSH_HOST}/${process.env.MKW_DEPLOY_PATH}/${process.env.MKW_PROJECT_NAME}`,
    },
  },
  api,
);
console.log(JSON.stringify(result));
