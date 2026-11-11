import { readFile } from "node:fs/promises";
import { parseJsonStrict } from "./validate-manifest.mjs";
import { decideOrchestrationOutcome } from "./orchestration-policy.mjs";

const [path, sha] = process.argv.slice(2);
const state = parseJsonStrict(await readFile(path, "utf8"));
if (!state) throw new Error("incident-required: missing current state");
console.log(
  decideOrchestrationOutcome({ requestedSha: sha, state })?.status ?? "ready",
);
