import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

const result = spawnSync(
  docker,
  [
    "run",
    "--rm",
    "--init",
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
    "node:24.22.1-bookworm",
    "bash",
    "-lc",
    `set -Eeuo pipefail\n${commands.join("\n")}`,
  ],
  { cwd: root, stdio: "inherit", windowsHide: true },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
