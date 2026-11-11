import { fixture } from "./auto-rollback.mjs";

// GitHub is the external boundary. These canonical records do not inherit
// ownership fields from the untrusted journal passed to the policy.
export function rollbackApi(change = {}) {
  const f = fixture();
  const previous = f.state.previousState;
  const current = f.state;
  return {
    artifact: async (id) => {
      const s =
        String(id) === current.ownership.artifactId ? current : previous;
      return {
        id: s.ownership.artifactId,
        name: `mkw-release-${s.releaseSha}`,
        digest: s.ownership.artifactDigest,
        expired: false,
        workflow_run: { id: s.ownership.runId },
        ...(s === current ? change.currentArtifact : change.artifact),
      };
    },
    run: async (id) => {
      const s = String(id) === current.ownership.runId ? current : previous;
      return {
        id: s.ownership.runId,
        run_attempt: s.ownership.runAttempt,
        repository: { full_name: "owner/repo" },
        head_repository: { full_name: "owner/repo" },
        head_sha: s.ownership.controlSha,
        head_branch: "main",
        path:
          s === current
            ? ".github/workflows/main-release.yml"
            : ".github/workflows/build-release.yml",
        event: s === current ? "push" : "workflow_run",
        status: s === current ? "in_progress" : "completed",
        conclusion: s === current ? null : "success",
        referenced_workflows: [
          {
            path: "owner/repo/.github/workflows/build-release.yml@refs/heads/main",
            ref: "refs/heads/main",
            sha: s.releaseSha,
          },
        ],
        ...(s === current ? change.currentRun : change.run),
      };
    },
    runJobs: async () =>
      change.jobs ?? [
        {
          name: "build / release",
          run_id: current.ownership.runId,
          run_attempt: Number(current.ownership.runAttempt),
          head_sha: current.releaseSha,
          status: "completed",
          conclusion: "success",
        },
      ],
    jsonFromArtifact: async (id, entry) => {
      const s =
        String(id) === current.ownership.artifactId ? current : previous;
      if (entry === "data-operation-evidence.json") {
        if (change.missingDataReceipt)
          throw new Error("missing artifact entry");
        return { ...s.dataOperationEvidence, ...change.dataReceipt };
      }
      if (entry === "build-metadata.json")
        return {
          sourceSha: s.releaseSha,
          ...(s === current ? change.currentMetadata : {}),
        };
      return {
        ...s.manifest,
        ...(s === current ? change.currentManifest : change.manifest),
      };
    },
  };
}
