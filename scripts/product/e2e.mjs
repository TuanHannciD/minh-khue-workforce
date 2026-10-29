import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { startSandbox } from "../../tests/product-e2e/sandbox.mjs";
import { chromium } from "@playwright/test";
import productConfig from "../../playwright.product.config.ts";

const interactive = process.argv.includes("--serve");
const reviewR1 = process.argv.includes("--review-r1");
const selection = process.argv.includes("--selection");
const acceptanceOnly = process.argv.includes("--acceptance-only");
const acceptance = process.argv.includes("--acceptance") || acceptanceOnly;
const exporting = process.argv.includes("--export");
const sandbox = await startSandbox({
  interactive,
  reviewR1,
  selection,
  exporting,
  acceptance,
});
try {
  if (interactive) {
    await writeFile(
      resolve(sandbox.runDir, "interactive.json"),
      JSON.stringify({
        owner: acceptance
          ? "MKW-PRODUCT-001/Task10"
          : exporting
            ? "MKW-PRODUCT-001/Task9"
            : selection
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
      `${acceptance ? "Task10" : exporting ? "Task9" : selection ? "Task8" : "Task7"} fake sandbox ${sandbox.webOrigin}\nRun ${sandbox.runDir}\n`,
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
    const browser = await chromium.launch({
      headless: productConfig.use.headless,
    });
    try {
      await writeFile(
        resolve(sandbox.runDir, "e2e-runtime.json"),
        JSON.stringify(
          {
            node: process.version,
            browser: browser.version(),
            headless: productConfig.use.headless,
            retries: productConfig.retries,
            trace: productConfig.use.trace,
            webOrigin: sandbox.webOrigin,
            apiOrigin: sandbox.apiOrigin,
            targetFile: sandbox.targetFile,
          },
          null,
          2,
        ),
      );
      if (acceptance) {
        const { runAcceptance } =
          await import("../../tests/product-e2e/acceptance.spec.ts");
        const { runTwoSessions } =
          await import("../../tests/product-e2e/two-sessions.spec.ts");
        const { runRecovery } =
          await import("../../tests/product-e2e/recovery.spec.ts");
        await runAcceptance(sandbox, browser);
        if (!acceptanceOnly) {
          await runTwoSessions(sandbox, browser);
          await runRecovery(sandbox, browser);
        }
      } else if (exporting) {
        const { runExport } =
          await import("../../tests/product-e2e/export.spec.ts");
        await runExport(sandbox, browser);
      } else if (selection && !reviewR1) {
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
