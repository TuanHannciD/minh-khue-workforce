import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const docker = process.platform === "win32" ? "docker.exe" : "docker";
if (!existsSync(resolve(root, "package.json")))
  throw new Error(`Repository root not found: ${root}`);

const commands = [
  "corepack enable",
  "pnpm install --frozen-lockfile",
  "pnpm run product:lint",
  "pnpm run product:format:check",
  "pnpm run product:typecheck",
  "pnpm run product:build",
  "pnpm run product:test:tooling",
  "pnpm run product:test:sandbox",
  "pnpm --filter @mkw/web test --run --maxWorkers=2",
  "pnpm --filter @mkw/api test",
  "pnpm run product:contract:check",
  "pnpm run product:boundaries",
];

// Each invocation owns its tag/container; concurrent hooks cannot replace them.
const runId = randomUUID();
const image = `mkw-ci-parity:${runId}`;
const labels = [
  "--label",
  "mkw.owner=ci-parity",
  "--label",
  `mkw.run=${runId}`,
];
function runDocker(args) {
  const result = spawnSync(docker, args, {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

const buildStatus = runDocker([
  "build",
  ...labels,
  "--tag",
  image,
  resolve(root, "scripts/ci"),
]);
if (buildStatus !== 0) {
  process.exitCode = buildStatus;
} else {
  try {
    process.exitCode = runDocker([
      "run",
      "--rm",
      "--init",
      "--name",
      `mkw-ci-parity-${runId}`,
      ...labels,
      "-v",
      `${root}:/workspace`,
      "-v",
      "/workspace/node_modules",
      "-v",
      "/workspace/apps/api/node_modules",
      "-v",
      "/workspace/apps/web/node_modules",
      "-w",
      "/workspace",
      image,
      "bash",
      "-lc",
      `set -Eeuo pipefail\n${commands.join("\n")}`,
    ]);
  } finally {
    // --rm removes the container and anonymous dependency volumes. Remove only
    // this invocation's image tag; keep shared build cache/base images intact.
    const cleanupStatus = runDocker(["image", "rm", image]);
    if (cleanupStatus !== 0 && !process.exitCode)
      process.exitCode = cleanupStatus;
  }
}
