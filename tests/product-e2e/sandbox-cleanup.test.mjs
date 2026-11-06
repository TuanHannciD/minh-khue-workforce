// No live DB/listener/browser: mock only resource boundaries, run startSandbox/stop.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as files from "node:fs/promises";
import { createEvidenceRun } from "../../scripts/product/evidence-run.mjs";

const calls = [];
const faults = new Set();
const errors = new Map();
const holds = new Map();
async function action(name) {
  calls.push(name);
  if (holds.has(name)) {
    holds.get(name).arrive();
    await holds.get(name).promise;
  }
  if (faults.has(name)) {
    const error = new Error(`injected ${name}`);
    errors.set(name, error);
    throw error;
  }
}
const pool = (name) => ({
  async query(sql) {
    await action(sql.startsWith("CREATE") ? "create" : "verify-sessions");
    return { rows: [{ count: 0 }] };
  },
  async end() {
    await action(name);
  },
});
let opened = 0;
mock.module("../../scripts/product/sandbox-target.mjs", {
  namedExports: {
    async openSandboxTarget() {
      opened++;
      await action(opened === 1 ? "cluster-open" : "run-open");
      return {
        pool: pool(opened === 1 ? "cluster-pool" : "run-pool"),
        connectionString: "fixture-only",
        target: { owner: "fault-test", database: "fixture-only" },
      };
    },
  },
});
mock.module("../../apps/api/test/auth-sandbox.mjs", {
  namedExports: {
    async command() {
      await action("migration");
      return { code: 0, output: "fixture migration" };
    },
  },
});
mock.module("../../apps/api/dist/bootstrap.js", {
  namedExports: {
    async createApp() {
      await action("app-acquire");
      return {
        async listen() {
          await action("listen");
        },
        async close() {
          await action("app-close");
        },
      };
    },
  },
});
mock.module("../../apps/api/dist/infrastructure/db/database.js", {
  namedExports: {
    Database: class {
      async onModuleDestroy() {
        await action("disconnect");
      }
    },
  },
});
mock.module("../../apps/api/dist/modules/auth/auth-operations.js", {
  namedExports: {
    async provisionAccounts() {
      await action("provision");
    },
    async resetPassword(_db, username) {
      await action(`rotate-${username}`);
    },
  },
});
const requireWeb = createRequire(
  new URL("../../apps/web/package.json", import.meta.url),
);
mock.module("node:fs/promises", {
  namedExports: {
    ...files,
    async writeFile(path, ...args) {
      const name = String(path).endsWith("fixture-invalidated.json")
        ? "invalidation-metadata"
        : String(path).endsWith("http-released.json")
          ? "release-metadata"
          : "other-metadata";
      if (faults.has(name) || holds.has(name)) await action(name);
      return files.writeFile(path, ...args);
    },
  },
});
mock.module(pathToFileURL(requireWeb.resolve("vite")), {
  namedExports: {
    async preview() {
      await action("web-acquire");
      return {
        async close() {
          await action("web-close");
        },
      };
    },
  },
});
mock.module("node:net", {
  namedExports: {
    createServer() {
      return {
        listen(_port, _host, done) {
          done();
        },
        address() {
          return { port: 40000 + opened };
        },
        close(done) {
          done();
        },
      };
    },
  },
});
const { startSandbox } = await import("./sandbox.mjs");
const evidenceRoot = resolve(
  process.env.MKW_PRODUCT_EVIDENCE_ROOT ??
    ".agent-runs/MKW-PRODUCT-001/whole-branch-fix-r1",
);
async function setup(fail = []) {
  calls.length = 0;
  faults.clear();
  errors.clear();
  holds.clear();
  opened = 0;
  for (const name of fail) faults.add(name);
  const run = await createEvidenceRun(resolve(evidenceRoot, "cleanup-fault-"));
  process.env.MKW_PRODUCT_EVIDENCE_ROOT = run;
  return run;
}
const metadata = async (s, file) =>
  JSON.parse(await readFile(resolve(s.runDir, file), "utf8"));

test("reset failure still attempts both accounts and every owned release, retains failure metadata", async () => {
  await setup();
  const s = await startSandbox({ acceptance: true });
  calls.length = 0;
  faults.add("rotate-fixture-one");
  await assert.rejects(s.stop());
  assert.deepEqual(calls, [
    "rotate-fixture-one",
    "rotate-fixture-two",
    "verify-sessions",
    "web-close",
    "app-close",
    "disconnect",
    "run-pool",
  ]);
  const invalidation = await metadata(s, "fixture-invalidated.json");
  assert.equal(invalidation.passwordsRotated, 1);
  assert.equal(invalidation.state, "incomplete");
  assert.equal((await metadata(s, "http-released.json")).state, "released");
  faults.clear();
  calls.length = 0;
  await assert.rejects(s.stop());
  assert.deepEqual(calls, []); // closed DB clients must never reconnect for retry
  assert.equal(
    (await metadata(s, "fixture-invalidated.json")).state,
    "incomplete",
  );
});

test("first close failure cannot skip API/disconnect/pool; retry releases only failed resource", async () => {
  await setup();
  const s = await startSandbox({ acceptance: true });
  calls.length = 0;
  faults.add("web-close");
  await assert.rejects(s.stop());
  assert.deepEqual(calls, [
    "rotate-fixture-one",
    "rotate-fixture-two",
    "verify-sessions",
    "web-close",
    "app-close",
    "disconnect",
    "run-pool",
  ]);
  assert.equal(
    (await metadata(s, "http-released.json")).state,
    "release-failed",
  );
  assert.equal(
    (await metadata(s, "fixture-invalidated.json")).state,
    "invalidated",
  );
  faults.clear();
  calls.length = 0;
  await s.stop();
  assert.deepEqual(calls, ["web-close"]);
  assert.equal((await metadata(s, "http-released.json")).state, "released");
  calls.length = 0;
  await s.stop();
  assert.deepEqual(calls, []);
});

test("setup failure retains original cause plus cleanup failures and closes partial resources", async () => {
  await setup(["web-acquire", "app-close", "rotate-fixture-two"]);
  let failure;
  try {
    await startSandbox({ acceptance: true });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure.cause, errors.get("web-acquire"));
  assert(failure.errors.includes(errors.get("app-close")));
  assert(failure.errors.includes(errors.get("rotate-fixture-two")));
  assert(calls.includes("rotate-fixture-one"));
  assert(calls.includes("disconnect"));
  assert(calls.includes("run-pool"));
  assert(!calls.includes("web-close"));
});

test("migration throws before app acquisition but releases acquired pool and preserves cause", async () => {
  await setup(["migration", "run-pool"]);
  let failure;
  try {
    await startSandbox();
  } catch (error) {
    failure = error;
  }
  assert.equal(failure.cause, errors.get("migration"));
  assert(failure.errors.includes(errors.get("run-pool")));
  assert(calls.includes("run-pool"));
  assert(!calls.includes("provision"));
});

for (const name of [
  "app-close",
  "disconnect",
  "run-pool",
  "verify-sessions",
  "invalidation-metadata",
  "release-metadata",
]) {
  test(`${name} failure still attempts every remaining owned resource and never succeeds overall`, async () => {
    await setup();
    const s = await startSandbox({ acceptance: true });
    calls.length = 0;
    faults.add(name);
    await assert.rejects(s.stop());
    for (const release of ["web-close", "app-close", "disconnect", "run-pool"])
      assert(
        calls.includes(release),
        `${release} must be attempted after ${name}`,
      );
    if (name === "verify-sessions")
      assert.equal(
        (await metadata(s, "fixture-invalidated.json")).state,
        "incomplete",
      );
    if (["app-close", "disconnect", "run-pool"].includes(name))
      assert.equal(
        (await metadata(s, "http-released.json")).state,
        "release-failed",
      );
  });
}
test("both resets failing cannot claim invalidated even if the session read is zero", async () => {
  await setup();
  const s = await startSandbox({ acceptance: true });
  faults.add("rotate-fixture-one");
  faults.add("rotate-fixture-two");
  await assert.rejects(s.stop(), (error) => error.errors.length === 2);
  const result = await metadata(s, "fixture-invalidated.json");
  assert.equal(result.passwordsRotated, 0);
  assert.equal(result.state, "incomplete");
});
test("acquisition fails at CREATE and failed cluster-pool release preserves the setup cause", async () => {
  await setup(["create", "cluster-pool"]);
  let failure;
  try {
    await startSandbox();
  } catch (error) {
    failure = error;
  }
  assert.equal(failure.cause, errors.get("create"));
  assert(failure.errors.includes(errors.get("cluster-pool")));
  assert.deepEqual(calls, ["cluster-open", "create", "cluster-pool"]);
});

function hold(name) {
  let release, arrive;
  const promise = new Promise((done) => (release = done));
  const entered = new Promise((done) => (arrive = done));
  holds.set(name, { promise, entered, arrive });
  return release;
}
test("pre-aborted lifecycle acquires nothing and publishes the owner synchronously", async () => {
  await setup();
  const controller = new AbortController();
  controller.abort();
  let owner;
  const starting = startSandbox({
    lifecycle: { signal: controller.signal, onOwner: (o) => (owner = o) },
  });
  assert.equal(typeof owner?.stop, "function");
  await assert.rejects(starting);
  assert.equal(opened, 0);
});
for (const boundary of [
  "cluster-open",
  "create",
  "run-open",
  "migration",
  "provision",
  "app-acquire",
  "listen",
  "web-acquire",
]) {
  test(`stop fences setup and retains late ${boundary} until drained`, async () => {
    await setup();
    const release = hold(boundary);
    let owner;
    const starting = startSandbox({
      acceptance: true,
      lifecycle: { onOwner: (o) => (owner = o), drainMs: 15 },
    });
    const failure = starting.catch((error) => error);
    await holds.get(boundary).entered;
    assert(calls.includes(boundary));
    if (!owner) {
      release();
      const s = await starting;
      await s.stop();
    }
    assert.equal(typeof owner?.stop, "function");
    const first = owner.stop();
    assert.equal(owner.stop(), first);
    await assert.rejects(first, (e) => e.code === "SANDBOX_DRAIN_PENDING");
    assert.equal(owner.snapshot().state, "pending");
    const atStop = [...calls];
    release();
    await failure;
    await owner.drained;
    assert.equal(owner.snapshot().state, "released");
    const later = calls.slice(atStop.length);
    assert(
      !later.some((name) =>
        [
          "create",
          "migration",
          "provision",
          "app-acquire",
          "listen",
          "web-acquire",
        ].includes(name),
      ),
    );
    if (["cluster-open", "create"].includes(boundary))
      assert(calls.includes("cluster-pool"));
    else assert(calls.includes("run-pool"));
    if (
      ["provision", "app-acquire", "listen", "web-acquire"].includes(boundary)
    ) {
      assert(calls.includes("rotate-fixture-one"));
      assert(calls.includes("rotate-fixture-two"));
      assert(calls.indexOf("rotate-fixture-one") > calls.indexOf("provision"));
    }
    if (["app-acquire", "listen", "web-acquire"].includes(boundary))
      assert(calls.includes("app-close"));
    if (boundary === "web-acquire") assert(calls.includes("web-close"));
  });
}
test("setup deadline stops a pending acquisition without losing its late resource", async () => {
  await setup();
  const release = hold("cluster-open");
  let owner;
  const failure = startSandbox({
    lifecycle: {
      setupDeadlineMs: performance.now() + 20,
      drainMs: 10,
      onOwner: (o) => (owner = o),
    },
  }).catch((e) => e);
  if (!owner) {
    release();
    const s = await failure;
    await s.stop();
  }
  assert.equal(typeof owner?.stop, "function");
  assert.equal((await failure).code, "SANDBOX_DRAIN_PENDING");
  assert.equal(owner.snapshot().state, "pending");
  release();
  await owner.drained;
  assert(calls.includes("cluster-pool"));
  assert(!calls.includes("create"));
});
test("hung independent close does not skip other resources or claim release", async () => {
  await setup();
  let owner;
  const s = await startSandbox({
    acceptance: true,
    lifecycle: { drainMs: 10, onOwner: (o) => (owner = o) },
  });
  assert.equal(typeof owner?.stop, "function");
  const release = hold("web-close");
  await assert.rejects(s.stop(), (e) => e.code === "SANDBOX_DRAIN_PENDING");
  for (const name of ["app-close", "disconnect", "run-pool"])
    assert(calls.includes(name));
  assert.equal(owner.snapshot().state, "pending");
  release();
  await owner.drained;
  assert.equal(owner.snapshot().state, "released");
});
test("one pending reset leaves DB owned, attempts the other reset and independent HTTP closes", async () => {
  await setup();
  let owner;
  const s = await startSandbox({
    acceptance: true,
    lifecycle: {
      cleanupDeadlineMs: performance.now() + 100,
      drainMs: 10,
      onOwner: (o) => (owner = o),
    },
  });
  calls.length = 0;
  const release = hold("rotate-fixture-one");
  const stopping = s.stop();
  await holds.get("rotate-fixture-one").entered;
  await assert.rejects(stopping, (e) => e.code === "SANDBOX_DRAIN_PENDING");
  assert(calls.includes("rotate-fixture-two"));
  assert(calls.includes("web-close"));
  assert(calls.includes("app-close"));
  assert(!calls.includes("disconnect"));
  assert(!calls.includes("run-pool"));
  release();
  await owner.drained;
  assert.equal(owner.snapshot().invalidated, true);
  assert(calls.includes("disconnect"));
});
test("signal abort during CREATE fences migration, closes maintenance and retains late original failure", async () => {
  await setup();
  const c = new AbortController();
  let owner;
  const release = hold("create");
  const p = startSandbox({
    lifecycle: { signal: c.signal, drainMs: 10, onOwner: (o) => (owner = o) },
  }).catch((e) => e);
  await holds.get("create").entered;
  c.abort();
  const result = await p;
  assert.equal(result.code, "SANDBOX_DRAIN_PENDING");
  faults.add("create");
  faults.add("cluster-pool");
  release();
  const facts = await owner.drained;
  assert(facts.error);
  const leaves = (e) => (e.errors ? e.errors.flatMap(leaves) : [e]);
  assert(leaves(facts.error).includes(errors.get("create")));
  assert(leaves(facts.error).includes(errors.get("cluster-pool")));
  assert(!calls.includes("migration"));
});
test("pending invalidation metadata cannot delay independent pool/database release", async () => {
  await setup();
  let owner;
  const s = await startSandbox({
    acceptance: true,
    lifecycle: { drainMs: 10, onOwner: (o) => (owner = o) },
  });
  calls.length = 0;
  const release = hold("invalidation-metadata");
  const stopping = s.stop();
  await holds.get("invalidation-metadata").entered;
  await assert.rejects(stopping, (e) => e.code === "SANDBOX_DRAIN_PENDING");
  const closed = calls.includes("disconnect") && calls.includes("run-pool");
  release();
  await owner.drained;
  assert.equal(closed, true);
});
for (const fault of [
  undefined,
  "web-close",
  "rotate-fixture-one",
  "release-metadata",
]) {
  test(`release metadata after drain settles terminal owner facts with ${fault ?? "no failure"}`, async () => {
    await setup();
    let owner;
    const s = await startSandbox({
      acceptance: true,
      lifecycle: { drainMs: 10, onOwner: (o) => (owner = o) },
    });
    calls.length = 0;
    if (fault) faults.add(fault);
    const release = hold("release-metadata");
    let drainedSettled = false;
    const drained = owner.drained.then((facts) => {
      drainedSettled = true;
      return facts;
    });
    const stopping = s.stop();
    const rejected = assert.rejects(
      stopping,
      (e) => e.code === "SANDBOX_DRAIN_PENDING",
    );
    assert.equal(owner.stop(), stopping);
    await holds.get("release-metadata").entered;
    const beforeExpiry = owner.snapshot().state;
    await rejected;
    assert.equal(owner.snapshot().state, "pending");
    assert.equal(drainedSettled, false);
    assert.equal(owner.stop(), stopping);
    release();
    const facts = await drained;
    const terminal = fault ? "release-failed" : "released";
    assert.equal(facts.state, terminal);
    assert.equal(owner.snapshot().state, terminal);
    assert.notEqual(beforeExpiry, "released");
    if (fault) assert(facts.error.errors.includes(errors.get(fault)));
    else assert.equal(facts.error, undefined);
    assert.equal(owner.snapshot().invalidated, fault !== "rotate-fixture-one");
    if (fault !== "release-metadata")
      assert.equal(
        (await metadata(s, "http-released.json")).state,
        fault === "web-close" ? "release-failed" : "released",
      );
    if (fault === "rotate-fixture-one")
      assert.equal(
        (await metadata(s, "fixture-invalidated.json")).state,
        "incomplete",
      );
    if (!fault) {
      calls.length = 0;
      await owner.stop();
      assert(
        !calls.some(
          (name) =>
            name.startsWith("rotate-") ||
            ["web-close", "app-close", "disconnect", "run-pool"].includes(name),
        ),
      );
      assert.equal(owner.snapshot().state, "released");
    }
  });
}
