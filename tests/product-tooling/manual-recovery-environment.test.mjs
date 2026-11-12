import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
const require = createRequire(import.meta.url);
const { load, JSON_SCHEMA } = createRequire(
  require.resolve("eslint/package.json"),
)("js-yaml");
const bash =
  process.env.MKW_TEST_BASH ||
  (process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash");
const read = async (name) =>
  load(await readFile(`.github/workflows/${name}`, "utf8"), {
    schema: JSON_SCHEMA,
  });
for (const [file, job] of [
  ["rollback.yml", "rollback"],
  ["release-pipeline.yml", "orchestrate"],
  ["deploy.yml", "deploy"],
  ["backup.yml", "backup"],
  ["post-deploy-verify.yml", "verify"],
]) {
  test(`${file} separates manual recovery and refuses unapproved branch before work`, async () => {
    const workflow = await read(file),
      value = workflow.jobs[job];
    assert.ok(workflow.on.workflow_dispatch);
    assert.ok(
      value.environment === "production-recovery" ||
        value.environment ===
          "${{ github.event_name == 'workflow_dispatch' && 'production-recovery' || 'production' }}",
    );
    assert.equal(value.steps[0].name, "Require approved source ref");
    for (const [event, ref, expected] of [
      ["workflow_dispatch", "refs/heads/feature", 78],
      ["workflow_dispatch", "refs/heads/main", 0],
      ["push", "refs/heads/main", 0],
      ["schedule", "refs/heads/main", 0],
    ]) {
      const result = spawnSync(bash, ["-c", value.steps[0].run], {
        env: { ...process.env, GITHUB_EVENT_NAME: event, GITHUB_REF: ref },
        encoding: "utf8",
        windowsHide: true,
      });
      assert.equal(result.status, expected, result.stderr);
    }
  });
}
test("automatic recovery and scheduled backup retain production without interactive input", async () => {
  const w = await read("automatic-rollback.yml");
  assert.equal(w.jobs.plan.environment, "production");
  assert.equal(w.jobs.recover.environment, "production");
  assert.deepEqual(Object.keys(w.on), ["workflow_call"]);
  assert.ok((await read("backup.yml")).on.schedule.length);
});
