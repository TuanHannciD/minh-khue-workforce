import { createGithubApi } from "./github-actions.mjs";
import { actionsId } from "./resolve-release.mjs";
export async function validateRecoveryBackupArtifact(input, api) {
  const { runId, runAttempt, artifactId, artifactDigest, artifactName, sha } =
    input;
  actionsId(runId);
  actionsId(runAttempt);
  actionsId(artifactId);
  if (
    !/^sha256:[a-f0-9]{64}$/.test(artifactDigest ?? "") ||
    artifactName !== `mkw-backup-${runId}-${runAttempt}-app-rollback`
  )
    throw new Error("invalid recovery backup identity");
  const artifact = await api.artifact(artifactId);
  if (
    String(artifact.id) !== artifactId ||
    String(artifact.workflow_run?.id) !== runId ||
    artifact.expired !== false ||
    artifact.name !== artifactName ||
    artifact.digest !== artifactDigest
  )
    throw new Error("recovery backup artifact ownership mismatch");
  const run = await api.run(runId);
  if (
    String(run.id) !== runId ||
    String(run.run_attempt) !== runAttempt ||
    run.head_sha !== sha ||
    run.head_branch !== "main" ||
    run.path !== ".github/workflows/main-release.yml" ||
    run.event !== "push"
  )
    throw new Error("recovery backup producer mismatch");
}
if (process.argv[1]?.endsWith("validate-auto-backup.mjs")) {
  await validateRecoveryBackupArtifact(
    {
      runId: process.env.BACKUP_RUN_ID,
      runAttempt: process.env.BACKUP_RUN_ATTEMPT,
      artifactId: process.env.BACKUP_ARTIFACT_ID,
      artifactDigest: process.env.BACKUP_ARTIFACT_DIGEST?.replace(
        /^(?!sha256:)/,
        "sha256:",
      ),
      artifactName: process.env.BACKUP_ARTIFACT_NAME,
      sha: process.env.RELEASE_SHA,
    },
    createGithubApi({
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GH_TOKEN,
    }),
  );
}
