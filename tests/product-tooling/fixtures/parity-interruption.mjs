import { writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fixture } from "./parity-boundary.mjs";
import { runParity } from "../../../scripts/ci/parity.mjs";
const cleanups = [];
const f = await fixture({ after: (fn) => cleanups.push(fn) });
const execute = f.adapters.execute;
let delivered = false;
f.adapters.execute = async (bin, args, options) => {
  const result = await execute(bin, args, options);
  if (args.includes("--profile")) {
    if (process.platform === "win32") process.emit("SIGTERM");
    else process.kill(process.pid, "SIGTERM");
    await delay(10);
    delivered = options.signal.aborted;
  }
  return result;
};
try {
  const exit = await runParity({ ...f, mode: "all" }, f.adapters);
  await writeFile(
    process.argv[2],
    JSON.stringify({
      exit,
      delivered,
      report: await f.report(),
      profiles: f.profiles,
      rehearsals: f.rehearsals.length,
      calls: f.calls,
      output: f.output,
    }),
  );
  process.exitCode = exit;
} finally {
  for (const cleanup of cleanups) await cleanup();
}
