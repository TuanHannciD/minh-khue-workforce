import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const entrypoint = await readFile(
  join(ROOT, "scripts/product/deploy-entrypoint.sh"),
  "utf8",
);
const compose = await readFile(
  join(ROOT, "deploy/compose.production.yml"),
  "utf8",
);
const readme = await readFile(join(ROOT, "deploy/README.md"), "utf8");

test("entrypoint validates JSON manifest and backup-ready before rendering", () => {
  assert.match(entrypoint, /validate-manifest\.mjs/);
  assert.match(entrypoint, /validate-backup-ready\.mjs/);
  assert.match(entrypoint, /backup-ready\.json/);
  assert.doesNotMatch(entrypoint, /backup\.ready/);
  assert.match(entrypoint, /INITIAL_EMPTY_DEPLOYMENT/);
});

test("entrypoint is runnable from a remote release directory without host Node", () => {
  assert.match(entrypoint, /BASH_SOURCE\[0\]:-/);
  assert.match(entrypoint, /run_node\(\)/);
  assert.match(entrypoint, /docker run --rm -i/);
  assert.match(entrypoint, /MKW_API_IMAGE/);
});

test("entrypoint delegates registry auth/pull and requires exact immutable digests", () => {
  assert.match(entrypoint, /release\/pull-exact-images\.sh/);
  assert.match(
    entrypoint,
    /registry pull\/identity gate failed before migration/,
  );
  assert.match(entrypoint, /sha256:\[0-9a-f\]\{64\}/i);
  assert.match(entrypoint, /releaseSha/);
  assert.match(entrypoint, /verify-release\.mjs/);
});

test("forward migration gate is before compose up and traffic smoke checks follow health", () => {
  const migration = entrypoint.indexOf("migrate deploy");
  const up = entrypoint.indexOf(" up -d --wait --remove-orphans");
  assert.ok(migration >= 0, "approved forward migration command is required");
  assert.ok(up > migration, "migration must run before compose up");
  assert.match(entrypoint, /--wait|service_healthy|Health/);
  assert.match(entrypoint, /\/api\/health/);
  assert.match(entrypoint, /curl .*127\.0\.0\.1/);
});

test("receipts are atomic and include release sha, image digests, status, and UTC", () => {
  assert.match(entrypoint, /mktemp.*receipts/);
  assert.match(entrypoint, /mv .*receipts/);
  assert.match(entrypoint, /releaseSha/);
  assert.match(entrypoint, /imageDigests/);
  assert.match(entrypoint, /status/);
  assert.match(entrypoint, /utc/);
  assert.match(entrypoint, /failed/);
});

test("production compose uses only digest variables and health checks DB API and gateway", () => {
  assert.match(compose, /image:\s*\$\{MKW_POSTGRES_IMAGE/);
  assert.match(compose, /image:\s*\$\{MKW_API_IMAGE/);
  assert.match(compose, /image:\s*\$\{MKW_WEB_IMAGE/);
  assert.match(compose, /pull_policy:\s*never/);
  assert.doesNotMatch(compose, /image:\s*[^$\s].*:/);
  assert.match(compose, /db:[\s\S]*healthcheck:/);
  assert.match(compose, /api:[\s\S]*healthcheck:/);
  assert.match(compose, /gateway:[\s\S]*healthcheck:/);
});

test("runbook documents JSON gate and does not instruct empty marker", () => {
  assert.match(readme, /backup-ready\.json/);
  assert.match(readme, /INITIAL_EMPTY_DEPLOYMENT/);
  assert.doesNotMatch(readme, /backup\.ready/);
});
