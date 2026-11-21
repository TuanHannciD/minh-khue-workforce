import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { createRequire } from "node:module";
import { getCheckPlan } from "../../scripts/ci/check-plan.mjs";

const require = createRequire(import.meta.url);
const { load, JSON_SCHEMA } = createRequire(
  require.resolve("eslint/package.json"),
)("js-yaml");

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
    /packages:\s*write|docker\/login-action|docker\/build-push-action|deploy-entrypoint\.sh|backup-source\.sh|(?:^|\s)(?:ssh|scp|deploy)(?:\s|$)|gh\s+workflow\s+run|uses:[^\n]*deploy/im,
  );
  const workflow = load(ci, { schema: JSON_SCHEMA });
  assert.equal(workflow.jobs.checks["runs-on"], "ubuntu-24.04");
  assert.match(ci, /node scripts\/ci\/parity.mjs --quality/);
  assert.deepEqual(
    getCheckPlan("quality").map((s) => s.id),
    [
      "lint",
      "format",
      "typecheck",
      "build",
      "tooling-fast",
      "sandbox",
      "web",
      "api",
      "contract",
      "boundaries",
    ],
  );
  assert.doesNotMatch(ci, /run: (?:corepack|pnpm)/);
  assert.doesNotMatch(ci, /pnpm run product:check/);
});

test("release-only tooling is removed from fast CI and retained in the release gate", async () => {
  const ci = await read(".github/workflows/ci.yml");
  const release = await read(".github/workflows/release-validation.yml");
  assert.doesNotMatch(ci, /production-account-script|deploy-account-rehearsal/);
  assert.match(
    release,
    /node scripts\/ci\/parity.mjs --release-tooling(?:\s|$)/,
  );
  assert.deepEqual(getCheckPlan("release-tooling"), [
    {
      id: "tooling-release",
      executable: "pnpm",
      args: ["run", "product:test:tooling:release"],
    },
  ]);
});

test("release tooling delegates worker preparation and gates to the shared runner", async () => {
  const release = load(await read(".github/workflows/release-validation.yml"), {
    schema: JSON_SCHEMA,
  });
  const step = release.jobs["release-validation"].steps.find(
    (candidate) => candidate.id === "rehearsal",
  );
  assert.ok(step);
  assert.match(
    step.run,
    /node scripts\/ci\/parity.mjs --release-tooling(?:\s|$)/,
  );
  assert.equal(step.if, undefined);
  assert.equal(step["continue-on-error"], undefined);
  assert.doesNotMatch(
    release.jobs["release-validation"].steps.map((s) => s.run ?? "").join("\n"),
    /docker\.sock|--privileged|\bssh\b|\bscp\b|docker login/,
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
