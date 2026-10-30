// Existing suite owns the real PostgreSQL lock barriers, two independent
// browser sessions, polling, atomic saves, response loss and fresh SQL readback.
import { runAttendanceE2E } from "./attendance-save.spec.ts";
import { startSandbox } from "./sandbox.mjs";
import { withCleanup } from "../../scripts/product/cleanup.mjs";
export async function runTwoSessions(_s, browser) {
  const s = await startSandbox({ acceptance: true });
  await withCleanup(
    async () => {
      await runAttendanceE2E(s, browser);
    },
    () => s.stop(),
  );
}
