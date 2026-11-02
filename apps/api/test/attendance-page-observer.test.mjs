import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { runCheckedDestroy } from "./attendance-page-race-cleanup.mjs";
import { withCleanup } from "../../../scripts/product/cleanup.mjs";

// Exercise the integration suite's actual assignment without acquiring its DBs.
const source = await readFile(
  new URL("./attendance-page.integration.test.mjs", import.meta.url),
  "utf8",
);
const start = source.indexOf("db.onModuleDestroy = async function () {");
const end = source.indexOf("\n          };", start) + "\n          };".length;
assert(start > 0 && end > start);
const leaves = (error) =>
  error.errors ? [...error.errors].flatMap(leaves) : [error];

function observer({ checkError, destroyError, attempted, name }) {
  const db = {};
  const report = {};
  const independent = {
    pool: {
      async query(sql) {
        if (checkError) throw checkError;
        return {
          rows: sql.includes('FROM "User"')
            ? [1, 2].map((i) => ({ username: String(i), passwordHash: "new" }))
            : [{ n: 0 }],
        };
      },
    },
  };
  runInNewContext(source.slice(start, end), {
    db,
    independent,
    report,
    assert,
    initialHashes: [1, 2].map((i) => ({
      username: String(i),
      passwordHash: "old",
    })),
    runCheckedDestroy,
    destroy: async function () {
      assert.equal(this, db);
      attempted.push(name);
      if (destroyError) throw destroyError;
    },
  });
  return db.onModuleDestroy.bind(db);
}

for (const scenario of ["check-only", "destroy-only", "both"]) {
  test(`page observer ${scenario} always attempts Prisma destroy and retains errors`, async () => {
    const checkError =
      scenario === "destroy-only"
        ? undefined
        : new Error("observer query failed");
    const destroyError =
      scenario === "check-only"
        ? undefined
        : new Error("Prisma destroy failed");
    const attempted = [];
    await assert.rejects(
      observer({ checkError, destroyError, attempted, name: "db" })(),
      (error) => {
        assert.deepEqual(
          leaves(error),
          [checkError, destroyError].filter(Boolean),
        );
        return true;
      },
    );
    assert.deepEqual(attempted, ["db"]);
  });
}

test("page observer faults retain body/cleanup causes and attempt all owners", async () => {
  const attempted = [];
  const bodyError = new Error("body failed");
  const checkError = new Error("observer failed");
  const destroyError = new Error("destroy failed");
  await assert.rejects(
    withCleanup(
      async () => {
        throw bodyError;
      },
      ...["app-0", "app-1", "provision-db"].map((name) =>
        observer({ checkError, destroyError, attempted, name }),
      ),
      async () => {
        attempted.push("independent-pool");
      },
    ),
    (error) => {
      assert.equal(error.cause, bodyError);
      assert.deepEqual(leaves(error), [
        bodyError,
        ...Array(3).fill([checkError, destroyError]).flat(),
      ]);
      return true;
    },
  );
  assert.deepEqual(attempted, [
    "app-0",
    "app-1",
    "provision-db",
    "independent-pool",
  ]);
});
