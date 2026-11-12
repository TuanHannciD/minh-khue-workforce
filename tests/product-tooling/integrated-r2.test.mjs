import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { createGithubApi } from "../../scripts/product/release/github-actions.mjs";
import { fixture } from "./fixtures/auto-rollback.mjs";
import { promoteOperation } from "../../scripts/product/release/operation-state.mjs";
import { prepareAutomaticRollback } from "../../scripts/product/release/prepare-auto-rollback.mjs";
import { rollbackApi } from "./fixtures/rollback-api.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const BASH =
  process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const posix = (path) =>
  path
    .replaceAll("\\", "/")
    .replace(/^([a-z]):/i, (_, drive) => `/${drive.toLowerCase()}`);

test("GitHub producer attempt lookup reads immutable attempt1 rather than transient latest attempt2", async () => {
  const api = createGithubApi({
    repository: "owner/repo",
    token: "fixture-only",
    exec: async (command, args) => {
      assert.equal(command, "gh");
      const route = args.at(-1);
      if (route.endsWith("/workflows/100"))
        return {
          stdout: JSON.stringify([
            { id: 100, path: ".github/workflows/build-release.yml" },
          ]),
        };
      return {
        stdout: JSON.stringify([
          {
            id: 41,
            workflow_id: 100,
            run_attempt: route.endsWith("/attempts/1") ? 1 : 2,
          },
        ]),
      };
    },
  });
  const run = await api.run("41", "1");
  assert.equal(run.run_attempt, 1);
  assert.equal(run.path, ".github/workflows/build-release.yml");
});

for (const latestStatus of ["success", "failure", "in_progress"])
  test(`recovery resolves LKG producing attempt1 with latest rerun ${latestStatus}`, async () => {
    const f = fixture();
    const api = rollbackApi();
    const readRun = api.run;
    api.run = async (id, attempt) => {
      const run = await readRun(id);
      return id === f.state.previousState.ownership.runId
        ? {
            ...run,
            run_attempt: attempt === "1" ? 1 : 2,
            ...(attempt === undefined
              ? {
                  status:
                    latestStatus === "in_progress"
                      ? "in_progress"
                      : "completed",
                  conclusion:
                    latestStatus === "in_progress" ? null : latestStatus,
                }
              : {}),
          }
        : run;
    };
    assert.equal((await prepareAutomaticRollback(f, api)).action, "eligible");
  });

test("actual manual verification branch preserves valid v2 current-state/LKG for the next push-main preflight", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "mkw-manual-state-r2-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "shared"));
  const f = fixture();
  const state = promoteOperation(f.state, {
    operationId: f.expectedOperationId,
    releaseSha: f.expectedSha,
    database: f.state.after,
    verifiedAt: f.now,
  });
  const before = JSON.stringify(state);
  for (const file of ["current-state.json", "last-known-good.json"])
    await writeFile(join(dir, "shared", file), before);
  const source = (
    await readFile(join(ROOT, "scripts/product/post-deploy-verify.sh"), "utf8")
  ).replaceAll("\r\n", "\n");
  const start = source.lastIndexOf("\nelse\n");
  assert.ok(start > 0);
  const block = source.slice(
    start + "\nelse\n".length,
    source.lastIndexOf("\nfi\n"),
  );
  const result = spawnSync(BASH, ["-Eeuo", "pipefail"], {
    encoding: "utf8",
    input: block,
    env: {
      ...process.env,
      MKW_DEPLOY_PATH: posix(dir),
      RELEASE_SHA: state.releaseSha,
      MKW_OPERATION_ID: "manual-recheck",
    },
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  for (const file of ["current-state.json", "last-known-good.json"])
    assert.equal(await readFile(join(dir, "shared", file), "utf8"), before);
  const preflight = spawnSync(
    process.execPath,
    [
      join(ROOT, "scripts/product/release/read-current-state.mjs"),
      join(dir, "shared/current-state.json"),
      state.releaseSha,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  assert.equal(preflight.status, 0, preflight.stderr);
  assert.equal(preflight.stdout.trim(), "already-deployed");
});
