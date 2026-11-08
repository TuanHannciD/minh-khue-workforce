import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { startSandbox } from "../../tests/product-e2e/sandbox.mjs";
import { chromium } from "@playwright/test";
import productConfig from "../../playwright.product.config.ts";
import { withCleanup } from "./cleanup.mjs";

const interactive = process.argv.includes("--serve");
const reviewR1 = process.argv.includes("--review-r1");
const selection = process.argv.includes("--selection");
const wholeBranchR1 = process.argv.includes("--whole-branch-r1");
const acceptanceOnly = process.argv.includes("--acceptance-only");
const attendanceRaceClamp = process.argv.includes("--attendance-race-clamp");
if (
  attendanceRaceClamp &&
  process.argv.slice(2).some((arg) => arg !== "--attendance-race-clamp")
)
  throw new Error("--attendance-race-clamp is an exclusive focused route");
const acceptance =
  process.argv.includes("--acceptance") ||
  acceptanceOnly ||
  wholeBranchR1 ||
  attendanceRaceClamp;
const exporting = process.argv.includes("--export");
const sandbox = await startSandbox({
  interactive,
  reviewR1,
  selection,
  exporting,
  acceptance,
});
await withCleanup(
  async () => {
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
      await withCleanup(
        async () => {
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
          if (attendanceRaceClamp) {
            const { runAttendanceRaceClamp } =
              await import("../../tests/product-e2e/pagination-race-clamp.spec.ts");
            await runAttendanceRaceClamp(sandbox, browser);
          } else if (wholeBranchR1) {
            const { runEmployeeRecoveryR1 } =
              await import("../../tests/product-e2e/employee-recovery-r1.spec.ts");
            const { runBulkPreviewR1 } =
              await import("../../tests/product-e2e/bulk-preview-r1.spec.ts");
            await runEmployeeRecoveryR1(sandbox, browser);
            await runBulkPreviewR1(sandbox, browser);
          } else if (acceptance) {
            const { runAcceptance } =
              await import("../../tests/product-e2e/acceptance.spec.ts");
            const { runTwoSessions } =
              await import("../../tests/product-e2e/two-sessions.spec.ts");
            const { runRecovery } =
              await import("../../tests/product-e2e/recovery.spec.ts");
            await runAcceptance(sandbox, browser);
            // Acceptance owns its contexts/pools. Pagination requires a distinct
            // empty UUID DB, never cleanup/truncation of acceptance residue.
            const paginationSandbox = await startSandbox({ acceptance: true });
            let paginationInvocations = 0;
            await withCleanup(
              async () => {
                const { default: assert } = await import("node:assert/strict");
                assert.notEqual(
                  paginationSandbox.targetFile,
                  sandbox.targetFile,
                );
                assert.notEqual(
                  paginationSandbox.target.database,
                  sandbox.target.database,
                );
                const emptyEmployeeCount = (
                  await paginationSandbox.pool.query(
                    'SELECT count(*)::int n FROM "Employee"',
                  )
                ).rows[0].n;
                assert.equal(emptyEmployeeCount, 0);
                const { runPagination } =
                  await import("../../tests/product-e2e/pagination.spec.ts");
                paginationInvocations++;
                assert.equal(paginationInvocations, 1);
                await writeFile(
                  resolve(paginationSandbox.runDir, "pagination-route.json"),
                  JSON.stringify(
                    {
                      route: acceptanceOnly
                        ? "--acceptance-only"
                        : "--acceptance",
                      acceptanceTargetFile: sandbox.targetFile,
                      acceptanceDatabase: sandbox.target.database,
                      paginationTargetFile: paginationSandbox.targetFile,
                      paginationDatabase: paginationSandbox.target.database,
                      emptyEmployeeCount,
                      paginationInvocations,
                    },
                    null,
                    2,
                  ),
                );
                await runPagination(paginationSandbox, browser);
              },
              () => paginationSandbox.stop(),
            );
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
        },
        () => browser.close(),
      );
    }
  },
  () => sandbox.stop(),
);
