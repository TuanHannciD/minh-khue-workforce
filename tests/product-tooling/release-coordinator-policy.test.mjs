import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const workflow = await readFile(
  ".github/workflows/release-pipeline.yml",
  "utf8",
);

test("release coordinator accepts the bounded manual inputs", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(
    workflow,
    /release_sha:[\s\S]*required: true[\s\S]*type: string/,
  );
  assert.match(
    workflow,
    /mode:[\s\S]*options: \[dry-run, bootstrap, release\]/,
  );
  assert.match(
    workflow,
    /backup_kind:[\s\S]*options: \[BACKUP, INITIAL_EMPTY_DEPLOYMENT\]/,
  );
});

test("resolution requires one successful exact-SHA build and backup match", () => {
  assert.match(workflow, /head_sha=\$\{RELEASE_SHA\}/);
  assert.match(workflow, /\.head_sha == \$sha/);
  assert.match(workflow, /\.status == "completed"/);
  assert.match(workflow, /\.conclusion == "success"/);
  assert.match(workflow, /mkw-release-\$\{RELEASE_SHA\}/);
  assert.match(workflow, /value\.releaseSha !== expectedSha/);
  assert.match(workflow, /value\.kind !== expectedKind/);
  assert.match(workflow, /No successful backup artifact matches/);
  assert.match(workflow, /Multiple successful backup artifacts match/);
});

test("resolved outputs are passed to deploy and verification handoff", () => {
  for (const name of [
    "release_run_id",
    "backup_run_id",
    "backup_artifact_name",
  ]) {
    assert.match(workflow, new RegExp(`${name}:`));
    assert.match(workflow, new RegExp(`--field \\\"${name}=`));
  }
  assert.match(
    workflow,
    /release_artifact_name: \$\{\{ steps\.resolve\.outputs\.release_artifact_name \}\}/,
  );
  assert.match(workflow, /post-deploy-verify\.yml/);
  assert.match(workflow, /workflow_dispatch does not return a child run id/);
});

test("coordinator keeps token handling out of shell interpolation", () => {
  assert.match(workflow, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(workflow, /:latest|docker\s+pull|imagetools\s+inspect/);
});

test("backup artifact name is bound to the successful current run attempt", () => {
  assert.ok(workflow.includes(".run_attempt"));
  assert.ok(
    workflow.includes(
      "mkw-backup-${artifact_run_id}-${successful_run[$artifact_run_id]}",
    ),
  );
});

test("unreadable backup candidates fail closed rather than hide ambiguity", () => {
  assert.match(
    workflow,
    /Unable to read a candidate backup artifact' >&2\s+exit 1/,
  );
  assert.match(
    workflow,
    /Candidate backup artifact has invalid readiness metadata' >&2\s+exit 1/,
  );
});
