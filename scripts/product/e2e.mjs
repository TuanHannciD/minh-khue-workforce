import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { startSandbox } from "../../tests/product-e2e/sandbox.mjs";
import { chromium } from "@playwright/test";

const interactive = process.argv.includes("--serve");
const reviewR1 = process.argv.includes("--review-r1");
const selection = process.argv.includes("--selection");
const sandbox = await startSandbox({ interactive, reviewR1, selection });
try {
  if (interactive) {
    await writeFile(
      resolve(sandbox.runDir, "interactive.json"),
      JSON.stringify({
        owner: selection
          ? "MKW-PRODUCT-001/Task8"
          : reviewR1
            ? "MKW-PRODUCT-001/Task7FixR1"
            : "MKW-PRODUCT-001/Task7",
        webOrigin: sandbox.webOrigin,
        apiOrigin: sandbox.apiOrigin,
        runDir: sandbox.runDir,
        targetFile: sandbox.targetFile,
      }),
    );
    process.stdout.write(
      `${selection ? "Task8" : "Task7"} fake sandbox ${sandbox.webOrigin}\nRun ${sandbox.runDir}\n`,
    );
    await new Promise((resolveStop) => {
      const timer = setInterval(async () => {
        if (
          (
            await readFile(
              resolve(sandbox.runDir, "stop.request"),
              "utf8",
            ).catch(() => "")
          ).trim() === "stop"
        ) {
          clearInterval(timer);
          resolveStop();
        }
      }, 250);
    });
  } else {
    const browser = await chromium.launch({ headless: true });
    try {
      if (selection && !reviewR1) {
        const { runBulkEntry } =
          await import("../../tests/product-e2e/bulk-entry.spec.ts");
        const { runSelectionInput } =
          await import("../../tests/product-e2e/selection-input.spec.ts");
        await runBulkEntry(sandbox, browser);
        await runSelectionInput(sandbox, browser);
      } else if (reviewR1) {
        const { runEmployeeRecoveryR1 } =
          await import("../../tests/product-e2e/employee-recovery-r1.spec.ts");
        await runEmployeeRecoveryR1(sandbox, browser);
      } else {
        const { runAttendanceE2E } =
          await import("../../tests/product-e2e/attendance-save.spec.ts");
        await runAttendanceE2E(sandbox, browser);
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await sandbox.stop();
}
