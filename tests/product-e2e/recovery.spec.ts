import { runBulkEntry } from "./bulk-entry.spec.ts";
import { runSelectionInput } from "./selection-input.spec.ts";
import { runEmployeeRecoveryR1 } from "./employee-recovery-r1.spec.ts";
import { runExport } from "./export.spec.ts";
import { startSandbox } from "./sandbox.mjs";

export async function runRecovery(_s, browser) {
  for (const run of [
    runBulkEntry,
    runSelectionInput,
    runEmployeeRecoveryR1,
    runExport,
  ]) {
    const s = await startSandbox({ acceptance: true });
    try {
      await run(s, browser);
    } finally {
      await s.stop();
    }
  }
}
