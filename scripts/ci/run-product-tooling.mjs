import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const testRoot = resolve(root, "tests/product-tooling");
const releaseOnly = new Set([
  "api-reuse.test.mjs",
  "auto-rollback-behavior.test.mjs",
  "auto-rollback-policy.test.mjs",
  "auto-rollback-r1.test.mjs",
  "bootstrap-runtime.test.mjs",
  "compose-service-map.test.mjs",
  "deploy-account-rehearsal.test.mjs",
  "deploy-backup-gate.test.mjs",
  "deploy-config.test.mjs",
  "deploy-entrypoint-policy.test.mjs",
  "deploy-publish.test.mjs",
  "final-review-boundaries.test.mjs",
  "gateway-policy.test.mjs",
  "gateway-promotion-r1.test.mjs",
  "integrated-r2.test.mjs",
  "manual-provenance-fix.test.mjs",
  "manual-recovery-environment.test.mjs",
  "operation-id.test.mjs",
  "operation-receipts.test.mjs",
  "operations-target.test.mjs",
  "policy-pin-metadata.test.mjs",
  "production-account-script.test.mjs",
  "push-main-orchestration.test.mjs",
  "push-main-workflow-policy.test.mjs",
  "registry-deploy-policy.test.mjs",
  "release-attestation-policy.test.mjs",
  "release-bundle.test.mjs",
  "release-contracts.test.mjs",
  "release-coordinator-policy.test.mjs",
  "release-coordinator-transport.test.mjs",
  "release-workflow-policy.test.mjs",
  "rollback-artifact-resolver.test.mjs",
  "rollback-backup-resolver.test.mjs",
  "simplified-release-policy.test.mjs",
  "task3-release-behavior.test.mjs",
  "task3-supply-chain-policy.test.mjs",
]);
const mode = process.argv.includes("--full")
  ? "full"
  : process.argv.includes("--release")
    ? "release"
    : "fast";
const validOptions = new Set(["--full", "--release", "--list"]);
if (process.argv.slice(2).some((arg) => !validOptions.has(arg)))
  throw new Error("Unknown tooling runner option");
const allFiles = (await readdir(testRoot))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort();
for (const name of releaseOnly)
  if (!allFiles.includes(name))
    throw new Error(`Missing release tooling test: ${name}`);
const files = allFiles.filter((name) =>
  mode === "full"
    ? true
    : mode === "release"
      ? releaseOnly.has(name)
      : !releaseOnly.has(name),
);

if (files.length === 0) throw new Error("No product tooling tests found");
if (process.argv.includes("--list")) {
  console.log(JSON.stringify({ mode, files }));
  process.exit(0);
}
const result = spawnSync(
  process.execPath,
  [
    "--test",
    "--test-concurrency=1",
    ...files.map((name) => resolve(testRoot, name)),
  ],
  { cwd: root, stdio: "inherit", windowsHide: true },
);
process.exitCode = result.status ?? 1;
