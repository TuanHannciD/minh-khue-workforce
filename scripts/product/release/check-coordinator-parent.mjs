import { createGithubApi } from "./github-actions.mjs";
import { validateCoordinatorParent } from "./coordinator.mjs";

const correlation = process.env.COORDINATOR_ID ?? "";
const parentId =
  /^parent-([1-9][0-9]*)-[1-9][0-9]*-(?:backup|deploy|post-deploy-verify)$/.exec(
    correlation,
  )?.[1];
if (correlation.startsWith("parent-") && !parentId)
  throw new Error("coordinator parent correlation is invalid");
if (parentId) {
  const api = createGithubApi({
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GH_TOKEN,
  });
  validateCoordinatorParent(await api.run(parentId), parentId, correlation);
}
