import {
  actionsId as id,
  isTrustedBuild,
  validateReleaseSource,
} from "./resolve-release.mjs";
import {
  decideOrchestrationOutcome,
  validateBackupReadyFreshness,
} from "./orchestration-policy.mjs";

export const CANONICAL_REF = "main";
export function validateCoordinatorParent(run, parentId, correlation) {
  if (
    id(run.id) !== id(parentId) ||
    run.path !== ".github/workflows/release-pipeline.yml" ||
    run.event !== "workflow_dispatch" ||
    run.head_branch !== CANONICAL_REF ||
    run.status !== "in_progress" ||
    !["backup", "deploy", "post-deploy-verify"].some(
      (stage) =>
        correlation.replace(/^parent-/, "") ===
        `${parentId}-${id(run.run_attempt)}-${stage}`,
    )
  )
    throw new Error(
      "coordinator parent does not own an active canonical transaction",
    );
  return true;
}
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

const orchestrationError = (message, code = "failed") => {
  const error = new Error(message);
  error.code = code;
  return error;
};

// Only trusted current orchestration code is imported. Release archives are data.
export async function coordinateRelease(input, api) {
  const { sha, mode, kind, correlationId, repository, maxAgeMs } = input;
  const target = input.target ?? {};
  const timeouts = {
    ...DEFAULT_TIMEOUTS,
    ...(input.timeouts ?? {}),
    stages: { ...DEFAULT_TIMEOUTS.stages, ...(input.timeouts?.stages ?? {}) },
  };
  const startedAt = api.now?.() ?? Date.now();
  const clock = () => api.now?.() ?? Date.now();
  const checkTotal = () => {
    if (clock() - startedAt >= timeouts.totalMs)
      throw orchestrationError(
        `coordinator total timed out after ${timeouts.totalMs}ms`,
        "timeout",
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

  const outcome = (status, extra = {}) => ({
    status,
    releaseSha: sha,
    correlationId,
    ...extra,
  });
  const cancelled = async () =>
    (typeof api.isCancelled === "function" &&
      (await api.isCancelled({ sha, correlationId }))) === true;
  const superseded = async () => {
    if (
      input.enforceCurrentSource === false ||
      typeof api.currentSourceSha !== "function"
    )
      return false;
    const current = await api.currentSourceSha();
    return current !== sha;
  };

  // A queued push may be replaced before any child workflow is dispatched.
  // A rerun of a verified SHA is an idempotent no-op.
  if (await cancelled()) return outcome("cancelled");
  if (await superseded())
    return outcome("superseded", { reason: "newer main SHA is current" });
  if (typeof api.currentState === "function") {
    const state = (await api.currentState({ sha, target })) ?? {};
    const decision = decideOrchestrationOutcome({
      requestedSha: sha,
      currentSha: state.currentSha,
      state: state.status ? state : undefined,
      verifiedSha:
        state.verifiedSha ??
        (state.status === "verified" ? state.releaseSha : undefined),
    });
    if (decision) return outcome(decision.status, { reason: decision.reason });
  }

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
    const marker = `${input.parentRunId ? "parent-" : ""}${correlationId}-${workflow.replace(/\.yml$/, "")}`;
    // Never dispatch the same marker twice (including coordinator reruns).
    const before = await api.runs(workflow);
    if (
      before.some(
        (r) =>
          r.display_title === `mkw-${workflow.replace(/\.yml$/, "")}-${marker}`,
      )
    ) {
      const existing = before.filter(
        (r) =>
          r.display_title ===
            `mkw-${workflow.replace(/\.yml$/, "")}-${marker}` &&
          r.event === "workflow_dispatch" &&
          r.head_branch === CANONICAL_REF &&
          r.path === `.github/workflows/${workflow}`,
      );
      if (existing.length > 1)
        throw orchestrationError("ambiguous dispatch correlation");
      if (existing.length === 1) {
        // Reuse the exact successful/in-flight producer on a coordinator rerun.
        // This prevents duplicate backup/deploy/verify mutations.
        return await waitForRun(existing[0]);
      }
      throw new Error("dispatch correlation ownership mismatch");
    }
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
    return await waitForRun(selected);

    async function waitForRun(initial) {
      const runId = id(initial.id);
      const attempt = id(initial.run_attempt);
      let latestRun = initial;
      const timeoutRun = async () => {
        let cancelMessage = "child run may still be active";
        // A deploy can already be inside migration/Compose mutation. Cancellation
        // is only requested when the producer explicitly reports it is safe.
        const mutationStarted =
          latestRun.mutation_started === true ||
          latestRun.mutationStarted === true;
        const mutationBoundaryKnown =
          typeof latestRun.mutation_started === "boolean" ||
          typeof latestRun.mutationStarted === "boolean";
        const canCancel =
          typeof api.cancelRun === "function" &&
          mutationBoundaryKnown &&
          !mutationStarted &&
          typeof api.canCancelRun === "function" &&
          (await api.canCancelRun(runId)) === true;
        if (canCancel) {
          try {
            await api.cancelRun(runId);
            cancelMessage = "cancel requested";
          } catch {
            cancelMessage = "child run may still be active (cancel failed)";
          }
        }
        throw orchestrationError(
          `${workflow} conclusion timed out (https://github.com/${repository}/actions/runs/${runId}; ${cancelMessage}; verify termination before retry)`,
          "timeout",
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
        latestRun = run;
        if (
          id(run.id) !== runId ||
          id(run.run_attempt) !== attempt ||
          run.event !== "workflow_dispatch" ||
          run.head_branch !== CANONICAL_REF ||
          run.path !== `.github/workflows/${workflow}` ||
          run.display_title !== initial.display_title
        )
          throw new Error("exact run/attempt identity changed");
        if (clock() >= stageDeadline) await timeoutRun();
        if (run.status === "completed") {
          checkTotal();
          if (run.conclusion !== "success")
            throw orchestrationError(`${workflow} failed: ${run.conclusion}`);
          return { runId, attempt };
        }
        await api.pause();
      }
      await timeoutRun();
    }
  }

  const assertActive = async () => {
    if (await cancelled()) return outcome("cancelled");
    if (await superseded())
      return outcome("superseded", { reason: "newer main SHA is current" });
    return null;
  };

  const backup = await dispatchAndWait("backup.yml", {
    release_sha: sha,
    kind,
  });
  const afterBackup = await assertActive();
  if (afterBackup) return afterBackup;
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
    status: "success",
    releaseSha: sha,
    correlationId,
    release,
    backup: { ...backup, artifactId: backupId },
    deploy,
    verify,
    outputs: {
      correlation_id: correlationId,
      release_sha: sha,
      release_run_id: release.runId,
      release_artifact_id: release.artifactId,
      backup_run_id: backup.runId,
      backup_run_attempt: backup.attempt,
      backup_artifact_id: backupId,
      deploy_run_id: deploy.runId,
      verify_run_id: verify.runId,
    },
  };
}
