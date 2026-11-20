// Subprocess boundary double: import the workflow's actual entrypoint and call
// its parser. Only Docker/engine boundaries are replaced; snapshot/report real.
import { fixture } from "./parity-boundary.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
const cleanups = [];
const f = await fixture(
  { after: (fn) => cleanups.push(fn) },
  process.env.PARITY_PROBE_FAULT ?? "none",
);
try {
  const [entrypoint, ...args] = process.argv.slice(2);
  const { parityMain } = await import(pathToFileURL(resolve(entrypoint)));
  process.exitCode = await parityMain(
    [...args, "--repo-root", f.repoRoot],
    f.adapters,
  );
  await writeFile(
    process.env.PARITY_PROBE_RESULT,
    JSON.stringify({
      args,
      exit: process.exitCode,
      profiles: f.profiles,
      rehearsals: f.rehearsals.length,
      calls: f.calls,
      output: f.output,
    }),
  );
} finally {
  for (const cleanup of cleanups) await cleanup();
}
