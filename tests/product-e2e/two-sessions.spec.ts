// Existing suite owns the real PostgreSQL lock barriers, two independent
// browser sessions, polling, atomic saves, response loss and fresh SQL readback.
import { runAttendanceE2E } from "./attendance-save.spec.ts";
import { startSandbox } from "./sandbox.mjs";
export async function runTwoSessions(_s, browser) {
  const s = await startSandbox({ acceptance: true });
  try {
    await runAttendanceE2E(s, browser);
  } finally {
    await s.stop();
  }
}
