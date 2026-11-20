// Standalone early-engine probe. Only statfs is injected; Docker discovery uses
// a genuinely empty private PATH, so no real daemon can be contacted.
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { runOwnedRehearsal } from "../../../scripts/product/local-rehearsal-engine.mjs";
const [kind, evidencePath, taskId] = process.argv.slice(2);
const original = fs.statfs;
fs.statfs = async () => ({
  bsize: 4096,
  bavail: kind === "disk" ? 3145727 : 3145728,
});
syncBuiltinESMExports();
process.env.PATH = "";
try {
  await runOwnedRehearsal({ taskId, evidencePath });
} catch (error) {
  console.error(`PROBE_CODE=${error.code}`);
  process.exitCode = 1;
} finally {
  fs.statfs = original;
  syncBuiltinESMExports();
}
