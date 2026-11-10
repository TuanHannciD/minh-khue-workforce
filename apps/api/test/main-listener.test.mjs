import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { networkInterfaces } from "node:os";

test("main honors container HOST and retains loopback by default", async () => {
  for (const host of ["0.0.0.0", undefined]) {
    const env = {
      ...process.env,
      NODE_ENV: "development",
      PORT: "0",
      WEB_ORIGIN: "http://127.0.0.1:5173",
      DATABASE_URL: "postgresql://fixture@127.0.0.1:1/fixture",
      AUTH_THROTTLE_SECRET: "local-test-fixture-secret-at-least-32-bytes",
    };
    delete env.HOST;
    if (host) env.HOST = host;
    const child = spawn(process.execPath, ["dist/main.js"], {
      cwd: new URL("../", import.meta.url),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("main readiness timed out")),
        10000,
      );
      child.once("exit", () => {
        clearTimeout(timer);
        reject(new Error("main exited before readiness"));
      });
      child.stdout.on("data", (chunk) => {
        output += chunk;
        if (output.includes("MKW bootstrap API listening")) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    try {
      await ready;
      const address = output.match(/http:\/\/[^:]+:(\d+)/);
      assert.ok(address, output);
      const loopback = await fetch(`http://127.0.0.1:${address[1]}/health`);
      assert.equal(loopback.status, 200);
      if (host) {
        const external = Object.values(networkInterfaces())
          .flat()
          .find((entry) => entry?.family === "IPv4" && !entry.internal);
        assert.ok(external, "requires an external IPv4 interface");
        const response = await fetch(
          `http://${external.address}:${address[1]}/health`,
          {
            signal: AbortSignal.timeout(3000),
          },
        );
        assert.equal(response.status, 200);
      }
    } finally {
      const closed = once(child, "exit");
      child.kill();
      await closed;
    }
  }
});
