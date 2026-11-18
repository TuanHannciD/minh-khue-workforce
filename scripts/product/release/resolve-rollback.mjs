import { createGithubApi } from "./github-actions.mjs";
import { resolveExactRelease } from "./resolve-release.mjs";
import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const api = createGithubApi({
  repository: process.env.GITHUB_REPOSITORY,
  token: process.env.GH_TOKEN,
});
const result = await resolveExactRelease(
  {
    sha: process.env.OLD_RELEASE_SHA,
    artifactId: process.env.OLD_RELEASE_ARTIFACT_ID,
    runId: process.env.OLD_RELEASE_RUN_ID,
    dispatchRef: process.env.GITHUB_REF,
    repository: process.env.GITHUB_REPOSITORY,
  },
  api,
);
// Keep canonical old-release data outside the download tree. The compatibility
// packager must never trust a self-checksummed replacement manifest/metadata.
const canonicalPath = join(
  process.env.RUNNER_TEMP || process.cwd(),
  "rollback-release-resolved.json",
);
const canonical = {
  ...result,
  manifest: await api.jsonFromArtifact(
    result.artifactId,
    "release-manifest.json",
  ),
  metadata: await api.jsonFromArtifact(
    result.artifactId,
    "build-metadata.json",
  ),
};
const artifact = await api.artifact(result.artifactId);
if (artifact.digest !== result.artifactDigest)
  throw new Error("rollback release artifact changed");
await writeFile(canonicalPath, JSON.stringify(canonical), {
  mode: 0o600,
  flag: "wx",
});
console.log(JSON.stringify(result));
if (process.env.GITHUB_OUTPUT)
  await appendFile(
    process.env.GITHUB_OUTPUT,
    Object.entries({
      release_artifact_id: result.artifactId,
      release_run_id: result.runId,
      release_run_attempt: result.runAttempt,
      release_artifact_digest: result.artifactDigest,
      release_resolved_path: canonicalPath,
    })
      .map(([key, value]) => `${key}=${value}\n`)
      .join(""),
  );
