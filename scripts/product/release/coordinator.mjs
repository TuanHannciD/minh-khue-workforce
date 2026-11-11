import { validateManifest } from "./validate-manifest.mjs";
import { validateBackupReadyFreshness } from "./orchestration-policy.mjs";

export const CANONICAL_REF = "main";

const single = (items, label) => {
  if (items.length !== 1)
    throw new Error(`${label}: expected one match, found ${items.length}`);
  return items[0];
};
const id = (value) => {
  if (!/^[1-9][0-9]*$/.test(String(value)))
    throw new Error("invalid Actions id");
  return String(value);
};

// Only trusted current orchestration code is imported. Release archives are data.
export async function coordinateRelease(input, api) {
  const { sha, mode, kind, correlationId, repository, maxAgeMs } = input;
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

  // workflow_run execution head_sha is not the CI source SHA. Select by artifact
  // name, then validate the manifest and build-metadata sourceSha inside that ID.
  const artifacts = await api.listArtifacts(`mkw-release-${sha}`);
  const matches = [];
  for (const artifact of artifacts.filter(
    (a) => !a.expired && a.name === `mkw-release-${sha}`,
  )) {
    const run = await api.run(id(artifact.workflow_run?.id));
    if (
      run.path !== ".github/workflows/build-release.yml" ||
      run.event !== "workflow_run" ||
      run.head_branch !== CANONICAL_REF ||
      run.status !== "completed" ||
      run.conclusion !== "success"
    )
      continue;
    const manifest = await api.jsonFromArtifact(
      id(artifact.id),
      "release-manifest.json",
    );
    const metadata = await api.jsonFromArtifact(
      id(artifact.id),
      "build-metadata.json",
    );
    if (
      !validateManifest(manifest).ok ||
      manifest.releaseSha !== sha ||
      metadata.sourceSha !== sha ||
      manifest.sourceRepository !== repository
    )
      throw new Error("release manifest/source SHA linkage failed");
    matches.push({ artifactId: id(artifact.id), runId: id(run.id) });
  }
  const release = single(matches, "successful source SHA release artifact");

  async function dispatchAndWait(workflow, fields) {
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
    await api.dispatch(workflow, CANONICAL_REF, {
      ...fields,
      coordinator_id: marker,
    });
    let selected;
    for (let poll = 0; poll < 120; poll++) {
      const runs = (await api.runs(workflow)).filter(
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
    if (!selected) throw new Error(`${workflow} dispatch timed out`);
    const runId = id(selected.id);
    const attempt = id(selected.run_attempt);
    for (let poll = 0; poll < 600; poll++) {
      const run = await api.run(runId);
      if (
        id(run.id) !== runId ||
        id(run.run_attempt) !== attempt ||
        run.event !== "workflow_dispatch" ||
        run.head_branch !== CANONICAL_REF ||
        run.path !== `.github/workflows/${workflow}` ||
        run.display_title !== selected.display_title
      )
        throw new Error("exact run/attempt identity changed");
      if (run.status === "completed") {
        if (run.conclusion !== "success")
          throw new Error(`${workflow} failed: ${run.conclusion}`);
        return { runId, attempt };
      }
      await api.pause();
    }
    throw new Error(`${workflow} conclusion timed out`);
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
