import assert from "node:assert/strict";
import { test } from "node:test";
import { withCleanup } from "../../../scripts/product/cleanup.mjs";
import { runCheckedDestroy } from "./attendance-page-race-cleanup.mjs";

test("invalidation check failure still calls the original destroy", async () => {
  let destroyed = 0;
  const checkError = new Error("invalidation check failed");
  await assert.rejects(
    runCheckedDestroy({
      check: async () => {
        throw checkError;
      },
      destroy: async () => {
        destroyed++;
      },
    }),
    (error) => error === checkError,
  );
  assert.equal(destroyed, 1);
});

test("check and destroy failures retain both causes", async () => {
  const checkError = new Error("check failed");
  const destroyError = new Error("destroy failed");
  await assert.rejects(
    runCheckedDestroy({
      check: async () => {
        throw checkError;
      },
      destroy: async () => {
        throw destroyError;
      },
    }),
    (error) => {
      assert(error instanceof AggregateError);
      assert.equal(error.cause, checkError);
      assert.deepEqual(error.errors, [checkError, destroyError]);
      return true;
    },
  );
});

test("failure cleanup attempts every app, provision database, and pool", async () => {
  const attempted = [];
  const bodyError = new Error("body failed");
  const cleanupErrors = new Map([
    ["app-1", new Error("app 1 close failed")],
    ["provision-db", new Error("provision db destroy failed")],
  ]);
  const cleanup = (name) => async () => {
    attempted.push(name);
    const error = cleanupErrors.get(name);
    if (error) throw error;
  };
  const leaves = (error) =>
    error instanceof AggregateError ? error.errors.flatMap(leaves) : [error];
  await assert.rejects(
    withCleanup(
      async () => {
        throw bodyError;
      },
      () =>
        runCheckedDestroy({ check: async () => {}, destroy: cleanup("app-0") }),
      () =>
        runCheckedDestroy({ check: async () => {}, destroy: cleanup("app-1") }),
      () =>
        runCheckedDestroy({
          check: async () => {},
          destroy: cleanup("provision-db"),
        }),
      cleanup("independent-pool"),
    ),
    (error) => {
      assert(error instanceof AggregateError);
      assert.equal(error.cause, bodyError);
      assert(error.errors.includes(bodyError));
      for (const cleanupError of cleanupErrors.values())
        assert(leaves(error).includes(cleanupError));
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
