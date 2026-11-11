import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");
const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

test("CI runs product checks for PRs and reusable push-release calls with read-only permissions", async () => {
  const ci = await read(".github/workflows/ci.yml");
  assert.match(ci, /pull_request:/);
  assert.match(ci, /workflow_call:/);
  assert.doesNotMatch(ci, /^\s+push:/m);
  assert.match(ci, /permissions:\s*\n\s+contents:\s*read/);
  assert.doesNotMatch(
    ci,
    /packages:\s*write|docker\/login-action|docker\/build-push-action|deploy/i,
  );
  for (const command of [
    "pnpm run product:lint",
    "pnpm run product:format:check",
    "pnpm run product:typecheck",
    "pnpm run product:test",
    "pnpm run product:contract:check",
    "pnpm run product:build",
    "pnpm run product:check",
  ])
    assert.match(
      ci,
      new RegExp(command.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")),
      command,
    );
});

test("release workflow is reusable and checks the full push SHA", async () => {
  const release = await read(".github/workflows/build-release.yml");
  assert.match(release, /workflow_call:/);
  assert.doesNotMatch(release, /workflow_run:/);
  assert.match(release, /ref:\s*\$\{\{\s*github\.sha\s*\}\}/);
  assert.match(release, /fetch-depth:\s*0/);
  assert.match(release, /github\.sha/);
});

test("release builds immutable API and web images with attestations", async () => {
  const release = await read(".github/workflows/build-release.yml");
  assert.match(release, /docker\/build-push-action@/g);
  assert.match(release, /file:\s*deploy\/Dockerfile\.api/);
  assert.match(release, /file:\s*deploy\/Dockerfile\.web/);
  assert.match(release, /push:\s*true/g);
  assert.match(release, /tags:[\s\S]*github\.sha/);
  assert.match(release, /provenance:\s*true/);
  assert.match(release, /sbom:\s*true/);
  assert.match(release, /api-attestations\.json/);
  assert.match(release, /web-attestations\.json/);
  assert.match(release, /id:\s*api/);
  assert.match(release, /id:\s*web/);
  assert.match(release, /steps\.api\.outputs\.digest/);
  assert.match(release, /steps\.web\.outputs\.digest/);
});

test("release reads one pinned postgres digest and never resolves tags at runtime", async () => {
  const release = await read(".github/workflows/build-release.yml");
  assert.match(release, /deploy\/postgres-image\.env/);
  assert.match(release, /postgres@sha256:\[0-9a-f\]\{64\}/i);
  assert.match(release, /count\+\+/);
  assert.doesNotMatch(
    release,
    /docker\s+pull|resolve_digest|docker\s+manifest/i,
  );
  assert.match(release, /imagetools\s+inspect[\s\S]+@\$\{API_DIGEST\}/);
});

test("release writes a validated manifest, checksums, and SHA-named artifact", async () => {
  const release = await read(".github/workflows/build-release.yml");
  assert.match(release, /release-manifest\.json/);
  assert.match(release, /validate-manifest\.mjs/);
  assert.match(release, /sha256sum/);
  assert.match(release, /release-manifest\.sha256/);
  assert.match(release, /actions\/upload-artifact@/);
  assert.match(release, /mkw-release-\$\{\{\s*github\.sha\s*\}\}/);
  assert.match(release, /retention-days:/);
});

test("mutable build-publish release workflow is retired", async () => {
  assert.equal(await exists(".github/workflows/build-publish.yml"), false);
});
