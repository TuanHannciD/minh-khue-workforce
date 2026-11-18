import { mkdtemp } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

// Real deploy admission requires /home/... paths. Use the runner's writable
// home, not /home itself; /tmp is outside the production path policy.
// Root parity containers use /root, so retain /home for that existing harness.
// Windows transport-only tests keep their ordinary temporary directory.
export function makeDeployFixtureRoot(prefix) {
  const home = homedir();
  const parent =
    process.platform === "win32"
      ? tmpdir()
      : home.startsWith("/home/")
        ? home
        : "/home";
  return mkdtemp(join(parent, prefix));
}
