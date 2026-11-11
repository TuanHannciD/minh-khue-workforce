import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (name) => readFile(`.github/workflows/${name}`, "utf8");
const entrypoint = await readFile("scripts/product/deploy-entrypoint.sh", "utf8");

test("touched release workflows pin third-party actions immutably", async () => {
  for (const name of ["build-release.yml", "deploy.yml", "rollback.yml", "post-deploy-verify.yml"]) {
    const workflow = await read(name);
    for (const match of workflow.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)) {
      assert.match(match[1], /@[0-9a-f]{40}$/i, `${name} uses mutable action ${match[1]}`);
    }
  }
});

test("deploy has explicit attestation verification states and required fail-closed mode", async () => {
  const workflow = await read("deploy.yml");
  assert.match(workflow, /gh attestation verify/);
  assert.match(workflow, /release-artifact\/release-manifest\.json/);
  assert.match(workflow, /not-configured/);
  assert.match(workflow, /not-verified/);
  assert.match(workflow, /required/);
  assert.match(workflow, /attestation_status/);
  assert.match(workflow, /MKW_ATTESTATION_STATUS/);
});

test("rollback sanitizes reason and receipt declares application-only scope", async () => {
  const workflow = await read("rollback.yml");
  assert.match(workflow, /ROLLBACK_REASON/);
  assert.match(workflow, /application-only/);
  assert.match(workflow, /databaseRecovery.*false|database-recovery.*false/i);
  assert.match(workflow, /control character/);
  assert.doesNotMatch(workflow, /reason=\"\$\{\{\s*inputs\.reason/);
  assert.match(entrypoint, /attestationVerification/);
  assert.match(entrypoint, /application-only/);
});
