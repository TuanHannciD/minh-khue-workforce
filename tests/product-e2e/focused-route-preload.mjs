import assert from "node:assert/strict";
import { mock } from "node:test";
import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";

const event = (name) =>
  appendFile(
    resolve(process.env.MKW_PRODUCT_EVIDENCE_ROOT, "route.log"),
    `${name}\n`,
  );
mock.module("./sandbox.mjs", {
  namedExports: {
    async startSandbox(options) {
      assert.equal(options.acceptance, true, "focused route must use Task10");
      await event("sandbox-start");
      return {
        runDir: process.env.MKW_PRODUCT_EVIDENCE_ROOT,
        async stop() {
          await event("sandbox-stop");
        },
      };
    },
  },
});
mock.module("@playwright/test", {
  namedExports: {
    defineConfig: (config) => config,
    chromium: {
      async launch() {
        await event("browser-start");
        return {
          version: () => "route-fixture",
          async close() {
            await event("browser-close");
          },
        };
      },
    },
  },
});
mock.module("./pagination-race-clamp.spec.ts", {
  namedExports: {
    async runAttendanceRaceClamp() {
      await event("focused-test");
    },
  },
});
