import {
  actionsId as id,
  isTrustedBuild,
  validateReleaseSource,
} from "./resolve-release.mjs";
import { validateBackupReadyFreshness } from "./orchestration-policy.mjs";

export const CANONICAL_REF = "main";
const DEFAULT_TIMEOUTS = Object.freeze({
  totalMs: 150 * 60 * 1000,
  discoveryMs: 5 * 60 * 1000,
  stages: {
    "backup.yml": 50 * 60 * 1000,
    "deploy.yml": 50 * 60 * 1000,
    "post-deploy-verify.yml": 30 * 60 * 1000,
  },
});

const single = (items, label) => {
  if (items.length !== 1)
    throw new Error(`${label}: expected one match, found ${items.length}`);
  return items[0];
};

// Only trusted current orchestration code is imported. Release archives are data.
export async function coordinateRelease(input, api) {
  const { sha, mode, kind, correlationId, repository, maxAgeMs } = input;
  const target = input.target ?? {};
  const timeouts = { ...DEFAULT_TIMEOUTS, ...(input.timeouts ?? {}) };
  const startedAt = api.now?.() ?? Date.now();
  const clock = () => api.now?.() ?? Date.now();
  const checkTotal = () => {
    if (clock() - startedAt >= timeouts.totalMs)
      throw new Error(
        `coordinator total timed out after ${timeouts.totalMs}ms`,
      );
  };
  for (const timeout of [
    timeouts.totalMs,
    timeouts.discoveryMs,
    ...Object.values(timeouts.stages),
  ])
    if (!Number.isSafeInteger(timeout) || timeout <= 0)
      throw new Error("invalid coordinator timeout");
  if (
    !/^[a-f0-9]{40}$/.test(sha) ||
    !["dry-run", "bootstrap", "release"].includes(mode) ||
    !["BACKUP", "INITIAL_EMPTY_DEPLOYMENT"].includes(kind) ||
    !/^[A-Za-z0-9-]{1,100}$/.test(correlationId) ||
    !/^[\w.-]+\/[\w.-]+$/.test(repository)
  )
    throw new Error("invalid coordinator inputs");
  if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0)
    throw new Error("invalid backup age policy");
  if (!target.host || !target.database || !target.identity)
    throw new Error("trusted production target configuration is required");

  // workflow_run execution head_sha is not the CI source SHA. Select by artifact
  // name, then validate the manifest and build-metadata sourceSha inside that ID.
  const artifacts = await api.listArtifacts(`mkw-release-${sha}`);
  const matches = [];
  for (const artifact of artifacts.filter(
    (a) => !a.expired && a.name === `mkw-release-${sha}`,
  )) {
    checkTotal();
    const run = await api.run(id(artifact.workflow_run?.id));
    if (!isTrustedBuild(run, { sha, repository })) continue;
    await validateReleaseSource(
      { sha, repository, artifactId: id(artifact.id) },
      api,
    );
    matches.push({ artifactId: id(artifact.id), runId: id(run.id) });
  }
  const release = single(matches, "successful source SHA release artifact");

  async function dispatchAndWait(workflow, fields) {
    checkTotal();
    const stageDeadline = Math.min(
      startedAt + timeouts.totalMs,
      clock() + timeouts.stages[workflow],
    );
    const marker = `${correlationId}-${workflow.replace(/\.yml$/, "")}`;
    // Never dispatch the same marker twice (including coordinator reruns).
    const before = await api.runs(workflow);
    if (
      before.some(
        (r) =>
          r.display_title === `mkw-${workflow.replace(/\.yml$/, "")}-${marker}`,
      )
    )
      throw new Error("dispatch correlation already exists");
    checkTotal();
    if (clock() >= stageDeadline)
      throw new Error(`${workflow} stage timed out before dispatch`);
    let selected;
    const workflowUrl = `https://github.com/${repository}/actions/workflows/${workflow}`;
    const discoveryTimeout = () => {
      throw new Error(
        `${workflow} dispatch timed out; child may still be active; correlation=${marker}; inspect ${workflowUrl}`,
      );
    };
    try {
      await api.dispatch(workflow, CANONICAL_REF, {
        ...fields,
        coordinator_id: marker,
      });
    } catch {
      discoveryTimeout();
    }
    const discoveryStarted = clock();
    for (let poll = 0; poll < 120; poll++) {
      if (
        clock() >= stageDeadline ||
        clock() - discoveryStarted >= timeouts.discoveryMs
      )
        discoveryTimeout();
      let discovered;
      try {
        discovered = await api.runs(workflow);
      } catch {
        discoveryTimeout();
      }
      const runs = discovered.filter(
        (run) =>
          run.display_title ===
            `mkw-${workflow.replace(/\.yml$/, "")}-${marker}` &&
          run.event === "workflow_dispatch" &&
          run.head_branch === CANONICAL_REF &&
          run.path === `.github/workflows/${workflow}`,
      );
      if (runs.length > 1) throw new Error("ambiguous dispatch correlation");
      if (runs.length === 1) {
        selected = runs[0];
        break;
      }
      await api.pause();
    }
    if (!selected) discoveryTimeout();
    const runId = id(selected.id);
    const attempt = id(selected.run_attempt);
    const timeoutRun = async () => {
      let cancelMessage = "child run may still be active";
      if (typeof api.cancelRun === "function") {
        try {
          await api.cancelRun(runId);
          cancelMessage = "cancel requested";
        } catch {
          cancelMessage = "child run may still be active (cancel failed)";
        }
      }
      throw new Error(
        `${workflow} conclusion timed out (https://github.com/${repository}/actions/runs/${runId}; ${cancelMessage}; verify termination before retry)`,
      );
    };
    for (let poll = 0; poll < 1800; poll++) {
      if (clock() >= stageDeadline) await timeoutRun();
      let run;
      try {
        run = await api.run(runId);
      } catch {
        await timeoutRun();
      }
      if (
        id(run.id) !== runId ||
        id(run.run_attempt) !== attempt ||
        run.event !== "workflow_dispatch" ||
        run.head_branch !== CANONICAL_REF ||
        run.path !== `.github/workflows/${workflow}` ||
        run.display_title !== selected.display_title
      )
        throw new Error("exact run/attempt identity changed");
      if (clock() >= stageDeadline) await timeoutRun();
      if (run.status === "completed") {
        checkTotal();
        if (run.conclusion !== "success")
          throw new Error(`${workflow} failed: ${run.conclusion}`);
        return { runId, attempt };
      }
      await api.pause();
    }
    await timeoutRun();
  }

  const backup = await dispatchAndWait("backup.yml", {
    release_sha: sha,
    kind,
  });
  const backupName = `mkw-backup-${backup.runId}-${backup.attempt}`;
  const backupArtifact = single(
    (await api.runArtifacts(backup.runId)).filter(
      (a) => !a.expired && a.name === backupName,
    ),
    "exact backup run/attempt artifact",
  );
  const backupId = id(backupArtifact.id);
  const readiness = await api.jsonFromArtifact(backupId, "backup-ready.json");
  const gate = validateBackupReadyFreshness(readiness, {
    expectedSha: sha,
    expectedKind: kind,
    now: api.now(),
    maxAgeMs,
    expectedTargetHost: target.host,
    expectedDatabase: target.database,
    expectedTargetIdentity: target.identity,
  });
  if (!gate.ok) throw new Error(gate.errors.join("; "));

  const deploy = await dispatchAndWait("deploy.yml", {
    mode,
    release_sha: sha,
    release_run_id: release.runId,
    release_artifact_id: release.artifactId,
    backup_run_id: backup.runId,
    backup_artifact_id: backupId,
    backup_artifact_name: backupName,
    backup_kind: kind,
  });
  // The verifier records preflight-only for dry-run/bootstrap, where no release
  // was installed. Release mode must pass the runtime checks.
  const verify = await dispatchAndWait("post-deploy-verify.yml", {
    mode,
    release_sha: sha,
    release_run_id: release.runId,
    release_artifact_id: release.artifactId,
    rollback_on_failure: "true",
  });
  return {
    releaseSha: sha,
    release,
    backup: { ...backup, artifactId: backupId },
    deploy,
    verify,
  };
}
