import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = (name) => readFile(name, "utf8");

test("push-main is one linear release path without state adoption or automatic rollback", async () => {
  const text = await source(".github/workflows/main-release.yml");
  assert.match(text, /jobs:\s+quality:[\s\S]*?\n  build:/);
  assert.doesNotMatch(text, /jobs:\s+preflight:|^  recovery:/m);
  assert.doesNotMatch(text, /previous_state:/);
  assert.match(text, /kind: BACKUP/);
  assert.match(text, /simple_release:\s*true/);
  assert.doesNotMatch(text, /rollback_on_failure/);
  assert.doesNotMatch(text, /current-state|last-known-good|automatic-rollback|INITIAL_EMPTY_DEPLOYMENT/);
});

test("build-release always builds both application images and emits exact digests", async () => {
  const text = await source(".github/workflows/build-release.yml");
  assert.doesNotMatch(text, /inputs:\s+previous_state/);
  assert.match(text, /name: Build and push API image[\s\S]*?push: true/);
  assert.match(text, /name: Build and push web image[\s\S]*?push: true/);
  assert.doesNotMatch(text, /Validate canonical previous API source and provenance before reuse/);
  assert.doesNotMatch(text, /select-api-reuse|data-operation-evidence|gateway-only|previous_state/);
  assert.match(text, /api_digest:[\s\S]*steps\.api\.outputs\.digest/);
});

test("automatic deploy and verification keep backup and runtime gates while omitting rollback orchestration", async () => {
  const deployText = await source(".github/workflows/deploy.yml");
  assert.match(deployText, /simple_release:\s*[\s\S]*?type: boolean/);
  assert.match(deployText, /simple_release:[\s\S]*?default: false/);
  assert.match(deployText, /MKW_SIMPLE_RELEASE/);
  assert.match(deployText, /MKW_BACKUP_EXPECTED_KIND/);
  const verifyText = await source(".github/workflows/post-deploy-verify.yml");
  assert.doesNotMatch(verifyText, /rollback_on_failure|automatic-rollback|rollback-requested/);
  assert.match(verifyText, /MKW_SIMPLE_RELEASE/);
  assert.match(verifyText, /remote_env="MKW_SIMPLE_RELEASE=/);
});

test("simple remote release never writes current-state or LKG files", async () => {
  const entrypoint = await source("scripts/product/deploy-entrypoint.sh");
  const verifier = await source("scripts/product/post-deploy-verify.sh");
  assert.match(entrypoint, /MKW_SIMPLE_RELEASE/);
  assert.match(entrypoint, /MKW_SIMPLE_RELEASE.*true|\[\[.*MKW_SIMPLE_RELEASE/);
  assert.match(verifier, /MKW_SIMPLE_RELEASE/);
  assert.match(verifier, /migrate status/);
});
