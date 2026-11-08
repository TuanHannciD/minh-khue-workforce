// Child-process resource boundaries only; e2e/benchmark orchestration stays real.
import { mock } from "node:test";
import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
const event = (name) =>
  appendFile(
    resolve(process.env.MKW_PRODUCT_EVIDENCE_ROOT, "calls.log"),
    `${name}\n`,
  );
mock.module("./sandbox.mjs", {
  namedExports: {
    async startSandbox() {
      return {
        runDir: process.env.MKW_PRODUCT_EVIDENCE_ROOT,
        pool: {
          async query() {
            throw new Error("injected measurement failure");
          },
        },
        async stop() {
          await event("sandbox-stop");
          throw new Error("injected sandbox cleanup failure");
        },
      };
    },
  },
});
mock.module("@playwright/test", {
  namedExports: {
    defineConfig(config) {
      return config;
    },
    chromium: {
      async launch() {
        return {
          version() {
            return "fault-fixture";
          },
          async close() {
            await event("browser-close");
            throw new Error("injected browser close failure");
          },
        };
      },
    },
  },
});
mock.module("./employee-recovery-r1.spec.ts", {
  namedExports: {
    async runEmployeeRecoveryR1() {
      throw new Error("injected assertion failure");
    },
  },
});
