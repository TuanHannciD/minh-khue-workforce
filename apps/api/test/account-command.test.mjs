import assert from "node:assert/strict";
import { test } from "node:test";
import * as auth from "../dist/modules/auth/index.js";
import * as operations from "../dist/modules/auth/auth-operations.js";
import { Prisma } from "../dist/infrastructure/db/generated/client.js";
import { verifyPassword } from "../dist/modules/auth/password.js";

const password = " fixture mật khẩu 😀 ";
const account = { username: "Đội-A", password };
const errorCode = (code) => (error) => {
  assert.equal(error.code, code);
  assert.ok(error instanceof auth.AccountOperationError);
  return true;
};
const uniqueError = (meta) =>
  new Prisma.PrismaClientKnownRequestError("fixture unique conflict", {
    code: "P2002",
    clientVersion: "7.10.1",
    meta,
  });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
};

// Catches the existing reset's untyped not-found error, independently of new exports.
test("reset_missing_account_has_typed_error_and_keeps_legacy_message", async () => {
  const db = {
    transaction: (run) => run({ $queryRaw: async () => [] }),
  };
  await assert.rejects(
    operations.resetPassword(db, "legacy fixture", password),
    (error) => {
      assert.equal(error.code, "ACCOUNT_NOT_FOUND");
      assert.ok(error instanceof auth.AccountOperationError);
      assert.match(error.message, /existing account/);
      return true;
    },
  );
});

// Catches permissive fields/types, UTF-16 length counting and secret normalization.
test("validate_command_exact_fields_and_unicode", () => {
  assert.deepEqual(auth.validateAccountCommand({ operation: "list" }), {
    operation: "list",
  });
  for (const operation of ["add", "reset-password"]) {
    for (const username of ["Đội-A", "Foo", "foo", "😀".repeat(64)]) {
      const input = { operation, username, password };
      assert.deepEqual(auth.validateAccountCommand(input), input);
    }
  }
  const invalid = [
    null,
    [],
    "list",
    42,
    true,
    {},
    { operation: "remove" },
    { operation: "list", username: "fixture" },
    { operation: "list", password },
    { operation: "add", ...account, role: "admin" },
    { operation: "reset-password", ...account, extra: undefined },
    { operation: "list", [Symbol("extra")]: true },
    Object.create({ operation: "list" }),
  ];
  for (const operation of ["add", "reset-password"]) {
    invalid.push({ operation, username: account.username });
    invalid.push({ operation, password });
    for (const username of [
      "",
      "a".repeat(65),
      "😀".repeat(65),
      "a b",
      " a",
      "a\t",
      "a\n",
      "a\u00a0b",
      1,
      null,
    ])
      invalid.push({ operation, username, password });
    for (const value of [null, 123, [], "😀".repeat(7), "ế".repeat(342)])
      invalid.push({ operation, username: account.username, password: value });
  }
  for (const value of invalid)
    assert.throws(
      () => auth.validateAccountCommand(value),
      errorCode("INVALID_INPUT"),
    );
  for (const value of ["😀".repeat(8), "ế".repeat(341) + "a", "        "])
    assert.equal(
      auth.validateAccountCommand({
        operation: "add",
        username: "fixture",
        password: value,
      }).password,
      value,
    );
});

// Catches prechecks, nontransactional writes, unhashed input and broad P2002 mapping.
test("add_is_one_transaction_and_only_username_unique_is_account_exists", async () => {
  let transactions = 0;
  let created;
  const db = {
    async transaction(run) {
      transactions++;
      return run({
        user: {
          async create({ data }) {
            created = data;
          },
        },
      });
    },
  };
  await auth.addAccount(db, account);
  assert.equal(transactions, 1);
  assert.deepEqual(Object.keys(created).sort(), [
    "id",
    "passwordHash",
    "username",
  ]);
  assert.match(
    created.id,
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
  );
  assert.equal(created.username, "Đội-A");
  assert.ok(await verifyPassword(created.passwordHash, password));
  assert.equal(
    await verifyPassword(created.passwordHash, password.trim()),
    false,
  );
  for (const meta of [
    { modelName: "User", target: ["username"] },
    {
      modelName: "User",
      driverAdapterError: {
        cause: {
          kind: "UniqueConstraintViolation",
          table: "User",
          constraint: { index: "User_username_key" },
        },
      },
    },
    {
      modelName: "User",
      driverAdapterError: {
        cause: {
          kind: "UniqueConstraintViolation",
          table: "User",
          constraint: { fields: ["username"] },
        },
      },
    },
  ]) {
    const failure = uniqueError(meta);
    const duplicateDb = {
      transaction: (run) =>
        run({
          user: {
            create: async () => {
              throw failure;
            },
          },
        }),
    };
    await assert.rejects(
      auth.addAccount(duplicateDb, account),
      errorCode("ACCOUNT_EXISTS"),
    );
  }
  for (const failure of [
    uniqueError({ modelName: "User", target: ["id"] }),
    uniqueError({ modelName: "User", target: ["username", "id"] }),
    uniqueError({
      driverAdapterError: {
        cause: {
          kind: "UniqueConstraintViolation",
          table: "User",
          constraint: { index: "User_pkey" },
        },
      },
    }),
    uniqueError({}),
    new Error("fixture persistence failure"),
  ]) {
    const failingDb = {
      transaction: (run) =>
        run({
          user: {
            create: async () => {
              throw failure;
            },
          },
        }),
    };
    await assert.rejects(
      auth.addAccount(failingDb, account),
      (error) => error === failure,
    );
  }
});

test("add_rejects_production_username_and_password_policy_before_transaction", async () => {
  const db = {
    transaction() {
      assert.fail("invalid input reached DB");
    },
  };
  for (const username of ["", "a b", "a".repeat(65)])
    await assert.rejects(
      auth.addAccount(db, { username, password }),
      errorCode("INVALID_INPUT"),
    );
  await assert.rejects(
    auth.addAccount(db, { username: "fixture", password: "short" }),
  );
});

// Catches lost row lock, hash/version update or session revoke and swallowed failures.
test("reset_uses_existing_domain_transaction", async () => {
  const userId = "a83db1dd-c880-4392-b99b-d4e26c3f2bd4";
  for (const failRevoke of [false, true]) {
    const calls = [];
    const failure = new Error("fixture revoke failure");
    let transactions = 0;
    const db = {
      async transaction(run) {
        transactions++;
        const result = await run({
          async $queryRaw(sql, ...values) {
            assert.match(
              sql.join("?"),
              /SELECT "id" FROM "User" WHERE "username" = \? FOR UPDATE/,
            );
            assert.deepEqual(values, ["legacy fixture"]);
            calls.push("lock");
            return [{ id: userId }];
          },
          async $executeRaw(sql, ...values) {
            if (calls.length === 1) {
              assert.match(
                sql.join("?"),
                /UPDATE "User" SET "passwordHash" = \?, "authVersion" = "authVersion" \+ 1/,
              );
              assert.match(
                sql.join("?"),
                /"updatedAt" = clock_timestamp\(\).*WHERE "id" = \?::uuid/,
              );
              assert.equal(values[1], userId);
              assert.ok(await verifyPassword(values[0], password));
              calls.push("hash-version");
            } else {
              assert.match(
                sql.join("?"),
                /UPDATE "Session" SET "revokedAt" = COALESCE\("revokedAt", clock_timestamp\(\)\) WHERE "userId" = \?::uuid/,
              );
              assert.deepEqual(values, [userId]);
              calls.push("revoke");
              if (failRevoke) throw failure;
            }
          },
        });
        calls.push("commit-boundary");
        return result;
      },
    };
    const pending = operations.resetPassword(db, "legacy fixture", password);
    if (failRevoke) await assert.rejects(pending, (error) => error === failure);
    else await pending;
    assert.equal(transactions, 1);
    assert.deepEqual(
      calls,
      failRevoke
        ? ["lock", "hash-version", "revoke"]
        : ["lock", "hash-version", "revoke", "commit-boundary"],
    );
  }
});

// Catches returning a result at callback completion before transaction resolution.
test("execute_returns_mutation_result_only_after_commit_and_propagates_commit_failure", async () => {
  for (const operation of ["add", "reset-password"]) {
    for (const failCommit of [false, true]) {
      const callbackDone = deferred(),
        commit = deferred();
      const failure = new Error("fixture commit failure");
      const db = {
        async transaction(run) {
          const result = await run({
            user: { create: async () => undefined },
            $queryRaw: async () => [
              { id: "a83db1dd-c880-4392-b99b-d4e26c3f2bd4" },
            ],
            $executeRaw: async () => 1,
          });
          callbackDone.resolve();
          await commit.promise;
          if (failCommit) throw failure;
          return result;
        },
      };
      let settled = false;
      const pending = auth.executeAccountCommand(db, { operation, ...account });
      pending.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
      await callbackDone.promise;
      assert.equal(settled, false);
      commit.resolve();
      if (failCommit)
        await assert.rejects(pending, (error) => error === failure);
      else assert.deepEqual(await pending, { operation, username: "Đội-A" });
    }
  }
});

test("list_selects_only_username_and_preserves_database_order", async () => {
  for (const rows of [[], [{ username: "đ" }, { username: "a" }]]) {
    const db = {
      client: {
        user: {
          async findMany(query) {
            assert.deepEqual(query, {
              select: { username: true },
              orderBy: { username: "asc" },
            });
            return rows;
          },
        },
      },
    };
    assert.deepEqual(
      await auth.listAccounts(db),
      rows.length ? ["đ", "a"] : [],
    );
    assert.deepEqual(
      await auth.executeAccountCommand(db, { operation: "list" }),
      { operation: "list", usernames: rows.length ? ["đ", "a"] : [] },
    );
  }
});

// Compatibility assertions protect the sandbox's two-account empty-table contract.
test("provision_semantics_unchanged", async () => {
  const noDb = {
    transaction() {
      assert.fail("invalid provision reached DB");
    },
  };
  for (const accounts of [
    [account],
    [account, account],
    [account, account, account],
  ])
    await assert.rejects(
      operations.provisionAccounts(noDb, accounts),
      /exactly two distinct/,
    );
  let created;
  const db = {
    transaction: (run) =>
      run({
        $executeRaw: async (sql) => {
          assert.match(sql.join(""), /LOCK TABLE "User" IN EXCLUSIVE MODE/);
        },
        user: {
          count: async () => 0,
          createMany: async ({ data }) => {
            created = data;
          },
        },
      }),
  };
  const accounts = [account, { username: "legacy fixture", password }];
  await operations.provisionAccounts(db, accounts);
  assert.deepEqual(
    created.map((row) => row.username),
    ["Đội-A", "legacy fixture"],
  );
  for (const row of created)
    assert.ok(await verifyPassword(row.passwordHash, password));
  const nonempty = {
    transaction: (run) =>
      run({
        $executeRaw: async () => 0,
        user: {
          count: async () => 1,
          createMany: async () => assert.fail("nonempty table mutated"),
        },
      }),
  };
  await assert.rejects(
    operations.provisionAccounts(nonempty, accounts),
    /nonempty/,
  );
});
