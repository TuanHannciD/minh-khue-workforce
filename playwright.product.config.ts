import { defineConfig } from "@playwright/test";

// The product coordinator imports the spec modules in-process so fixture
// credentials never enter worker config, argv, traces or a JSON report.
// e2e.mjs consumes the headless/retry/trace policy; invoke that coordinator.
export default defineConfig({
  testDir: "./tests/product-e2e",
  workers: 1,
  retries: 0,
  use: {
    browserName: "chromium",
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: "off",
    screenshot: "off",
  },
});
