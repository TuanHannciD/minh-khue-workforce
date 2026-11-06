import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mock, test } from "node:test";

if (!process.execArgv.includes("--experimental-test-module-mocks")) {
  test("offline lifecycle boundaries in isolated Node module-mock process", async () => {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(
      process.execPath,
      ["--experimental-test-module-mocks", "--test", import.meta.filename],
      {
        encoding: "utf8",
        windowsHide: true,
        timeout: 15000,
      },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
} else {
  let child,
    options,
    spawned = 0;
  mock.module("node:child_process", {
    namedExports: {
      spawn(_exe, _args, opts) {
        spawned++;
        options = opts;
        child = new EventEmitter();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.stdin = new PassThrough();
        child.kill = () => {
          child.killed = true;
          return true;
        };
        return child;
      },
    },
  });
  const { command } = await import("../../apps/api/test/auth-sandbox.mjs");
  const tick = () => new Promise((done) => setImmediate(done));
  test("preabort never spawns", async () => {
    const before = spawned;
    const c = new AbortController();
    c.abort();
    const p = command("fixture", [], { signal: c.signal }).catch((e) => e);
    if (spawned !== before) child.emit("close", 0);
    const result = await p;
    assert.equal(spawned, before);
    assert.equal(result.code, "COMMAND_ABORTED");
  });
  test("combined multibyte output cap terminates, waits close, and reveals no output", async () => {
    let settled = false;
    const p = command(
      "fixture",
      [],
      { maxOutputBytes: 5, drainMs: 100 },
      "secret",
    ).catch((e) => {
      settled = true;
      return e;
    });
    child.stdout.write(Buffer.from("éé"));
    child.stderr.write(Buffer.from("é"));
    await tick();
    assert.equal(child.killed, true);
    assert.equal(settled, false);
    child.emit("close", null);
    const e = await p;
    assert.equal(e.code, "COMMAND_OUTPUT_LIMIT");
    assert.equal(e.drained, true);
    assert(!JSON.stringify(e).includes("secret"));
    assert.equal(options.maxOutputBytes, undefined);
    assert.equal(child.listenerCount("close"), 0);
  });
  for (const mode of ["abort", "timeout", "error"])
    test(`${mode} waits for close and removes listeners`, async () => {
      const c = new AbortController();
      let settled = false;
      const p = command("fixture", [], {
        signal: c.signal,
        timeout: mode === "timeout" ? 5 : undefined,
        drainMs: 100,
      }).catch((e) => {
        settled = true;
        return e;
      });
      if (mode === "abort") c.abort();
      if (mode === "error") child.emit("error", new Error("credential-secret"));
      if (mode === "timeout") await new Promise((done) => setTimeout(done, 10));
      await tick();
      assert.equal(settled, false);
      child.emit("close", 1);
      const e = await p;
      assert.equal(
        e.code,
        `COMMAND_${mode === "error" ? "PROCESS_ERROR" : mode === "abort" ? "ABORTED" : "TIMEOUT"}`,
      );
      assert.equal(e.drained, true);
      assert(!e.message.includes("credential-secret"));
      assert.equal(child.listenerCount("error"), 0);
      assert.equal(child.stdout.listenerCount("data"), 0);
    });
  test("descendant-held stream/error before close remains owned after drain expires", async () => {
    let owner;
    const p = command("fixture", [], {
      drainMs: 5,
      onOwner: (o) => (owner = o),
    }).catch((e) => e);
    child.emit("error", new Error("fixture spawn failure"));
    const e = await p;
    assert.equal(e.code, "COMMAND_DRAIN_PENDING");
    assert.equal(e.drained, false);
    assert.equal(owner.snapshot().state, "pending");
    child.emit("close", 1);
    await owner.drained;
    assert.equal(owner.snapshot().state, "drained");
    assert.equal(child.listenerCount("close"), 0);
  });
  test("old command signature returns normal output/code on close", async () => {
    const p = command("fixture", [], {}, "input");
    child.stdout.write("normal");
    child.stderr.write(" output");
    child.emit("close", 0);
    assert.deepEqual(await p, { code: 0, output: "normal output" });
  });
  test(
    "Windows termination cannot claim descendant release from parent close alone",
    { skip: process.platform !== "win32" },
    async () => {
      let owner;
      const c = new AbortController();
      const p = command("fixture", [], {
        signal: c.signal,
        drainMs: 10,
        onOwner: (o) => (owner = o),
      }).catch((e) => e);
      child.pid = 12345; // Mock-owned invocation; no OS process is touched.
      c.abort();
      child.emit("close", 1);
      const error = await p;
      assert.equal(error.drained, false);
      assert.equal(owner.snapshot().state, "pending");
      assert.equal(owner.snapshot().stdioClosed, true);
      assert.equal(owner.snapshot().descendants, "unverified");
    },
  );
}
