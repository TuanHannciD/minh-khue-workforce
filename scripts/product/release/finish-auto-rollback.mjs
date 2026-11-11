import { readFile, writeFile, appendFile } from "node:fs/promises";
import { buildRollbackEvidence } from "./auto-rollback.mjs";
let evidence = buildRollbackEvidence({
  operationId: process.env.MKW_OPERATION_ID,
  releaseSha: process.env.RELEASE_SHA,
});
// Missing transport output cannot prove that no remote attempt started.
evidence.attemptCount = "unknown";
try {
  const raw = JSON.parse(
    await readFile(
      `${process.env.RUNNER_TEMP}/mkw-recovery-output.json`,
      "utf8",
    ),
  );
  if (
    raw.operationId === process.env.MKW_OPERATION_ID &&
    raw.releaseSha === process.env.RELEASE_SHA &&
    ["recovered-by-app-rollback", "incident-required"].includes(raw.result)
  ) {
    evidence = buildRollbackEvidence({
      decision: {
        action:
          raw.result === "recovered-by-app-rollback"
            ? "rollback"
            : "incident-required",
      },
      attempted: raw.attemptCount === 1,
      verification:
        raw.result === "recovered-by-app-rollback" ? "passed" : "failed",
      operationId: raw.operationId,
      releaseSha: raw.releaseSha,
    });
  }
} catch {
  /* Failure before/inside SSH is an incident, not successful recovery. */
}
await writeFile(
  "auto-rollback-evidence.json",
  `${JSON.stringify(evidence)}\n`,
  { mode: 0o600 },
);
await appendFile(
  process.env.GITHUB_OUTPUT,
  `recovery_status=${evidence.result}\n`,
);
await appendFile(
  process.env.GITHUB_STEP_SUMMARY,
  `${JSON.stringify(evidence)}\n`,
);
