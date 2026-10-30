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
async function action(name) {
  calls.push(name);
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
      if (faults.has(name)) await action(name);
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
  assert.deepEqual(calls, ["create", "cluster-pool"]);
});
