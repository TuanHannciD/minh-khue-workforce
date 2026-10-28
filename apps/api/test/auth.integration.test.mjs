/**
 * File map: one fresh owned DB per suite; sequential subtests share two accounts.
 * Entry: PostgreSQL auth/session/CSRF/flooding/reset sandbox.
 * - request/cli/waitForLock: HTTP, private-stdin CLI and DB lock barriers.
 * - Subtests cover transport, provision, guard seams, expiry, reset, quotas,
 *   queued login/authorizer races, rollback and production cookie policy.
 * Keep together so fixture identities, secret lifetime and cleanup have one owner.
 * No business employee/attendance route or real target is created.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createApp } from "../dist/bootstrap.js";
import { freshSandbox, command } from "./auth-sandbox.mjs";
import { Database } from "../dist/infrastructure/db/database.js";
import { AuthService, SessionAuthorizer } from "../dist/modules/auth/index.js";

const origin = "http://127.0.0.1:5173";
const secret = () => ` thử nghiệm ${randomBytes(20).toString("base64url")} `;
const cookieOf = (response) =>
  response.headers.get("set-cookie")?.split(";")[0];

test("PostgreSQL auth/session/CSRF/flooding/reset sandbox", async (t) => {
  const db = await freshSandbox();
  const config = {
    databaseUrl: db.connectionString,
    throttleSecret: randomBytes(32).toString("hex"),
  };
  const apps = [
    await createApp(origin, config),
    await createApp(origin, config),
  ];
  const accounts = [
    { username: "fixture-one", password: secret() },
    { username: "fixture-two", password: secret() },
  ];
  let cookie;
  try {
    for (const app of apps) await app.listen(0, "127.0.0.1");
    const request = async (
      path,
      { app = 0, method = "GET", body, headers = {}, session = cookie } = {},
    ) =>
      fetch(`${await apps[app].getUrl()}/api/v1${path}`, {
        method,
        headers: {
          ...(method === "GET"
            ? {}
            : { origin, "content-type": "application/json" }),
          ...(session ? { cookie: session } : {}),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const cli = (operation, input, extra = []) =>
      command(
        process.platform === "win32" ? "pnpm.exe" : "pnpm",
        [
          "--filter",
          "@mkw/api",
          `auth:${operation}`,
          "--",
          "--target",
          db.targetFile,
          "--alias",
          "task3-auth",
          "--secret-stdin",
          ...extra,
        ],
        { cwd: db.root },
        JSON.stringify(input),
      );

    async function waitForLock(pattern, expected = 1) {
      const deadline = performance.now() + 10000;
      while (performance.now() < deadline) {
        const result = await db.pool.query(
          "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = $1 AND wait_event_type = 'Lock' AND query LIKE $2",
          [db.target.database, pattern],
        );
        if (result.rows[0].n >= expected) return;
      }
      throw new Error("Database lock barrier was not reached");
    }

    await t.test(
      "wrong/missing username has identical generic response; JSON, origin and DTO are enforced",
      async () => {
        for (const name of ["missing-one", "missing-two"]) {
          const response = await request("/auth/login", {
            method: "POST",
            body: { username: name, password: secret() },
          });
          assert.equal(response.status, 401);
          assert.deepEqual((await response.json()).error, {
            code: "INVALID_CREDENTIALS",
            message: "Tên đăng nhập hoặc mật khẩu chưa đúng.",
          });
        }
        for (const badOrigin of [
          "",
          "null",
          "http://127.0.0.1:5173.evil.test",
          "http://localhost:5173",
        ]) {
          const response = await request("/auth/login", {
            method: "POST",
            body: accounts[0],
            headers: { origin: badOrigin },
          });
          assert.equal(response.status, 403);
          assert.equal(
            (await response.json()).error.code,
            "ORIGIN_NOT_ALLOWED",
          );
        }
        const missingOrigin = await fetch(
          `${await apps[0].getUrl()}/api/v1/auth/login`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(accounts[0]),
          },
        );
        assert.equal(missingOrigin.status, 403);
        const malformed = await fetch(
          `${await apps[0].getUrl()}/api/v1/auth/login`,
          {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
            body: "{",
          },
        );
        assert.equal(malformed.status, 400);
        assert.equal(
          (
            await request("/auth/logout", {
              method: "POST",
              body: { admin: true },
            })
          ).status,
          400,
        );
        const simple = await request("/auth/login", {
          method: "POST",
          body: accounts[0],
          headers: { "content-type": "text/plain" },
        });
        assert.equal(simple.status, 415);
        for (const body of [
          { ...accounts[0], admin: true },
          { username: 1, password: "x" },
          { username: "a", password: "ế".repeat(400) },
        ])
          assert.equal(
            (await request("/auth/login", { method: "POST", body })).status,
            400,
          );
      },
    );

    await t.test(
      "provision exactly two users and read back independent SQL: Argon2id parameters, no role/plaintext",
      async () => {
        const result = await cli("provision", { accounts });
        assert.equal(result.code, 0, result.output);
        const again = await cli("provision", { accounts });
        assert.notEqual(again.code, 0);
        const { rows } = await db.pool.query(
          'SELECT * FROM "User" ORDER BY "username"',
        );
        assert.equal(rows.length, 2);
        for (const row of rows) {
          const encoded = row.passwordHash.split("$");
          assert.equal(encoded[1], "argon2id");
          assert.equal(encoded[2], "v=19");
          assert.deepEqual(
            Object.fromEntries(
              encoded[3].split(",").map((param) => param.split("=")),
            ),
            { m: "65536", t: "3", p: "1" },
          );
          assert.equal(Buffer.from(encoded[5], "base64").length, 32);
          assert.equal(row.authVersion, "1");
          assert.equal("role" in row, false);
        }
        for (const account of accounts)
          assert.equal(result.output.includes(account.password), false);
        const invalid = await cli("reset-password", { password: "short" }, [
          "--username",
          accounts[0].username,
        ]);
        assert.notEqual(invalid.code, 0);
      },
    );

    await t.test(
      "auth_rejects_anonymous_and_equal_accounts_can_edit through test-owned guard/transaction seams",
      async () => {
        // Dynamic Nest test routes are registered below after auth exists; never product business endpoints.
        const { installProtectedProbes } =
          await import("./protected-probes.mjs");
        const probe = await installProtectedProbes(config, origin);
        try {
          for (const path of ["month", "write", "export"])
            assert.equal(
              (
                await fetch(`${probe.url}/test-owned/${path}`, {
                  method: path === "write" ? "POST" : "GET",
                  headers: { origin, "content-type": "application/json" },
                  ...(path === "write" ? { body: "{}" } : {}),
                })
              ).status,
              401,
            );
          for (const account of accounts) {
            const response = await request("/auth/login", {
              method: "POST",
              body: account,
            });
            assert.equal(response.status, 200);
            cookie = cookieOf(response);
            const dto = await response.json();
            assert.deepEqual(Object.keys(dto).sort(), [
              "expiresAt",
              "idleExpiresAt",
              "user",
            ]);
            assert.equal(dto.user.username, account.username);
            assert.match(response.headers.get("set-cookie"), /HttpOnly/);
            assert.match(response.headers.get("set-cookie"), /SameSite=Lax/);
            assert.doesNotMatch(
              response.headers.get("set-cookie"),
              /Secure|Domain=/,
            );
            assert.equal(response.headers.get("cache-control"), "no-store");
            assert.equal(
              response.headers.get("x-content-type-options"),
              "nosniff",
            );
            for (const path of ["month", "write", "export"])
              assert.equal(
                (
                  await fetch(`${probe.url}/test-owned/${path}`, {
                    method: path === "write" ? "POST" : "GET",
                    headers: {
                      cookie,
                      origin,
                      "content-type": "application/json",
                    },
                    ...(path === "write" ? { body: "{}" } : {}),
                  })
                ).status,
                200,
              );
          }
        } finally {
          await probe.close();
        }
        const token = cookie.split("=")[1];
        assert.equal(Buffer.from(token, "base64url").length, 32);
        const { rows } = await db.pool.query(
          'SELECT "tokenHash" FROM "Session"',
        );
        assert.ok(
          rows.some((row) =>
            row.tokenHash.equals(createHash("sha256").update(token).digest()),
          ),
        );
        assert.ok(
          rows.every((row) => !row.tokenHash.equals(Buffer.from(token))),
        );
        for (const path of ["signup", "reset-password", "admin"])
          assert.equal(
            (await request(`/auth/${path}`, { method: "POST", body: {} }))
              .status,
            404,
          );
      },
    );

    await t.test(
      "rotation, idle/absolute expiry and lastSeen coalescing use DB timestamps without sleeps",
      async () => {
        await db.pool.query('DELETE FROM "AuthThrottle"'); // Only this run's owned DB, retain all sessions/users.
        const login = async () => {
          const r = await request("/auth/login", {
            method: "POST",
            body: accounts[0],
          });
          assert.equal(r.status, 200);
          return cookieOf(r);
        };
        const a = await login(),
          b = await login();
        assert.notEqual(a, b);
        const hash = (c) =>
          createHash("sha256").update(c.split("=")[1]).digest();
        await db.pool.query(
          'UPDATE "Session" SET "lastSeenAt" = clock_timestamp() - interval \'2 hours 1 second\' WHERE "tokenHash" = $1',
          [hash(a)],
        );
        assert.equal(
          (await request("/auth/session", { session: a })).status,
          401,
        );
        await db.pool.query(
          'UPDATE "Session" SET "createdAt" = clock_timestamp() - interval \'12 hours 1 second\', "expiresAt" = clock_timestamp() - interval \'1 second\' WHERE "tokenHash" = $1',
          [hash(b)],
        );
        assert.equal(
          (await request("/auth/session", { session: b })).status,
          401,
        );
        cookie = await login();
        await db.pool.query(
          'UPDATE "Session" SET "lastSeenAt" = clock_timestamp() - interval \'61 seconds\' WHERE "tokenHash" = $1',
          [hash(cookie)],
        );
        assert.equal((await request("/auth/session")).status, 200);
        const before = (
          await db.pool.query(
            'SELECT "lastSeenAt" FROM "Session" WHERE "tokenHash" = $1',
            [hash(cookie)],
          )
        ).rows[0].lastSeenAt;
        assert.equal((await request("/auth/session")).status, 200);
        const after = (
          await db.pool.query(
            'SELECT "lastSeenAt" FROM "Session" WHERE "tokenHash" = $1',
            [hash(cookie)],
          )
        ).rows[0].lastSeenAt;
        assert.equal(before.getTime(), after.getTime());
      },
    );

    await t.test(
      "reset_revokes_sessions_without_admin_role; CLI target allowlist and rollback",
      async () => {
        await db.pool.query('DELETE FROM "AuthThrottle"');
        const first = await request("/auth/login", {
          method: "POST",
          body: accounts[0],
        });
        const old = cookieOf(first),
          second = await request("/auth/login", {
            method: "POST",
            body: accounts[0],
          });
        const nextPassword = secret();
        const wrongTarget = resolve(db.evidence, "wrong-target.json");
        await writeFile(
          wrongTarget,
          JSON.stringify({ ...db.target, database: "unknown_database" }),
        );
        const denied = await command(
          process.execPath,
          [
            resolve(db.root, "scripts/product/auth-cli.mjs"),
            "reset-password",
            "--target",
            wrongTarget,
            "--alias",
            "task3-auth",
            "--username",
            accounts[0].username,
            "--secret-stdin",
          ],
          { cwd: db.root },
          JSON.stringify({ password: nextPassword }),
        );
        assert.notEqual(denied.code, 0);
        const countBefore = await db.pool.query(
          'SELECT count(*)::int AS n FROM "User"',
        );
        const missingUser = await cli(
          "reset-password",
          { password: nextPassword },
          ["--username", "missing-reset-fixture"],
        );
        assert.notEqual(missingUser.code, 0);
        const countAfter = await db.pool.query(
          'SELECT count(*)::int AS n FROM "User"',
        );
        assert.equal(countAfter.rows[0].n, countBefore.rows[0].n);
        assert.equal(countAfter.rows[0].n, 2);
        const reset = await cli("reset-password", { password: nextPassword }, [
          "--username",
          accounts[0].username,
        ]);
        assert.equal(reset.code, 0, reset.output);
        assert.equal(reset.output.includes(nextPassword), false);
        for (const c of [old, cookieOf(second)])
          assert.equal(
            (await request("/auth/session", { session: c })).status,
            401,
          );
        assert.equal(
          (await request("/auth/login", { method: "POST", body: accounts[0] }))
            .status,
          401,
        );
        accounts[0].password = nextPassword;
        const success = await request("/auth/login", {
          method: "POST",
          body: accounts[0],
        });
        assert.equal(success.status, 200);
        cookie = cookieOf(success);
        const { rows } = await db.pool.query(
          'SELECT "authVersion" FROM "User" WHERE username = $1',
          [accounts[0].username],
        );
        assert.equal(rows[0].authVersion, "2");
        const logout = await request("/auth/logout", {
          method: "POST",
          body: {},
        });
        assert.equal(logout.status, 204);
        assert.match(
          logout.headers.get("set-cookie"),
          /Expires=Thu, 01 Jan 1970/,
        );
        assert.equal((await request("/auth/session")).status, 401);
        assert.equal(
          (await request("/auth/logout", { method: "POST", body: {} })).status,
          204,
        );
      },
    );

    await t.test(
      "shared atomic username/IP flooding limits cannot be bypassed by second app or forwarded header",
      async () => {
        await db.pool.query('DELETE FROM "AuthThrottle"');
        const responses = await Promise.all(
          Array.from({ length: 8 }, (_, i) =>
            request("/auth/login", {
              app: i % 2,
              method: "POST",
              body: { username: "quota-probe", password: secret() },
              headers: { "x-forwarded-for": `192.0.2.${i}` },
            }),
          ),
        );
        assert.equal(responses.filter((r) => r.status === 401).length, 5);
        assert.equal(responses.filter((r) => r.status === 429).length, 3);
        for (const response of responses.filter((r) => r.status === 429))
          assert.ok(Number(response.headers.get("retry-after")) > 0);
        await db.pool.query('DELETE FROM "AuthThrottle"');
        const byIp = await Promise.all(
          Array.from({ length: 23 }, (_, i) =>
            request("/auth/login", {
              app: i % 2,
              method: "POST",
              body: { username: `quota-${i}`, password: secret() },
              headers: { "x-forwarded-for": `192.0.2.${i}` },
            }),
          ),
        );
        assert.equal(byIp.filter((r) => r.status === 401).length, 20);
        assert.equal(byIp.filter((r) => r.status === 429).length, 3);
      },
    );
    await t.test(
      "reset-before-login fence never issues a session verified against the old hash",
      async () => {
        await db.pool.query('DELETE FROM "AuthThrottle"');
        const barrier = await db.pool.connect();
        const password = secret();
        let reset, login;
        try {
          await barrier.query("BEGIN");
          await barrier.query(
            'SELECT "id" FROM "User" WHERE "username" = $1 FOR UPDATE',
            [accounts[0].username],
          );
          reset = cli("reset-password", { password }, [
            "--username",
            accounts[0].username,
          ]);
          await waitForLock(
            '%SELECT "id" FROM "User" WHERE "username"%FOR UPDATE%',
          );
          login = request("/auth/login", { method: "POST", body: accounts[0] });
          await waitForLock('%SELECT "id" FROM "User" WHERE "id"%FOR SHARE%');
          await barrier.query("COMMIT");
          assert.equal((await reset).code, 0);
          assert.equal((await login).status, 401);
          accounts[0].password = password;
        } finally {
          await barrier.query("ROLLBACK");
          barrier.release();
          await Promise.allSettled([reset, login]);
        }
      },
    );

    await t.test(
      "reset-before-authorizeMutation rejects a previously valid guard credential behind a real DB barrier",
      async () => {
        await db.pool.query('DELETE FROM "AuthThrottle"');
        const response = await request("/auth/login", {
          method: "POST",
          body: accounts[0],
        });
        assert.equal(response.status, 200);
        const rawCookie = cookieOf(response).split("=")[1];
        const credential = (
          await apps[0]
            .get(AuthService)
            .requireSession({ cookies: { mkw_session: rawCookie } })
        ).credential;
        const barrier = await db.pool.connect(),
          password = secret();
        let reset, authorize;
        try {
          await barrier.query("BEGIN");
          await barrier.query(
            'SELECT "id" FROM "User" WHERE "username" = $1 FOR UPDATE',
            [accounts[0].username],
          );
          reset = cli("reset-password", { password }, [
            "--username",
            accounts[0].username,
          ]);
          await waitForLock(
            '%SELECT "id" FROM "User" WHERE "username"%FOR UPDATE%',
          );
          authorize = apps[0]
            .get(Database)
            .client.$transaction((tx) =>
              apps[0].get(SessionAuthorizer).authorizeMutation(tx, credential),
            )
            .then(
              () => ({ accepted: true }),
              (error) => ({ accepted: false, status: error.getStatus?.() }),
            );
          await waitForLock('%SELECT "id" FROM "User" WHERE "id"%FOR SHARE%');
          await barrier.query("COMMIT");
          assert.equal((await reset).code, 0);
          assert.deepEqual(await authorize, { accepted: false, status: 401 });
          accounts[0].password = password;
        } finally {
          await barrier.query("ROLLBACK");
          barrier.release();
          await Promise.allSettled([reset, authorize]);
        }
      },
    );

    await t.test(
      "reset transaction rolls back hash/version and all revocations when persistence fails",
      async () => {
        await db.pool.query('DELETE FROM "AuthThrottle"');
        const response = await request("/auth/login", {
          method: "POST",
          body: accounts[0],
        });
        const validCookie = cookieOf(response);
        const before = (
          await db.pool.query(
            'SELECT "passwordHash", "authVersion" FROM "User" WHERE "username" = $1',
            [accounts[0].username],
          )
        ).rows[0];
        await db.pool
          .query(`CREATE FUNCTION test_owned_fail_revoke() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test-owned rollback probe'; END $$;
        CREATE TRIGGER test_owned_revoke_failure BEFORE UPDATE ON "Session" FOR EACH ROW EXECUTE FUNCTION test_owned_fail_revoke()`);
        try {
          assert.notEqual(
            (
              await cli("reset-password", { password: secret() }, [
                "--username",
                accounts[0].username,
              ])
            ).code,
            0,
          );
          const after = (
            await db.pool.query(
              'SELECT "passwordHash", "authVersion" FROM "User" WHERE "username" = $1',
              [accounts[0].username],
            )
          ).rows[0];
          assert.ok(
            before.passwordHash === after.passwordHash,
            "failed reset preserves prior hash",
          );
          assert.equal(before.authVersion, after.authVersion);
          assert.equal(
            (await request("/auth/session", { session: validCookie })).status,
            200,
          );
        } finally {
          await db.pool.query(
            'DROP TRIGGER test_owned_revoke_failure ON "Session"; DROP FUNCTION test_owned_fail_revoke()',
          );
        }
      },
    );

    await t.test(
      "production cookie policy is fixed by trusted configuration, not request forwarding headers",
      async () => {
        await db.pool.query('DELETE FROM "AuthThrottle"');
        const app = await createApp("https://example.test", {
          ...config,
          production: true,
          tlsTerminated: true,
        });
        try {
          await app.listen(0, "127.0.0.1");
          const response = await fetch(
            `${await app.getUrl()}/api/v1/auth/login`,
            {
              method: "POST",
              headers: {
                origin: "https://example.test",
                "content-type": "application/json",
                "x-forwarded-proto": "http",
              },
              body: JSON.stringify(accounts[1]),
            },
          );
          assert.equal(response.status, 200);
          const header = response.headers.get("set-cookie");
          assert.ok(header.startsWith("__Host-mkw_session="));
          assert.match(header, /Secure/);
          assert.match(header, /HttpOnly/);
          assert.match(header, /Path=\//);
          assert.doesNotMatch(header, /Domain=/);
          assert.ok(response.headers.get("strict-transport-security"));
        } finally {
          await app.close();
        }
      },
    );

    await t.test(
      "transaction seam uses approved isolation and local lock budget",
      async () => {
        const settings = await apps[0].get(Database).transaction(async (tx) => {
          const result =
            await tx.$queryRaw`SELECT current_setting('lock_timeout') AS budget, current_setting('transaction_isolation') AS isolation`;
          return result[0];
        });
        assert.deepEqual(settings, {
          budget: "3s",
          isolation: "read committed",
        });
      },
    );
    await writeFile(
      resolve(db.evidence, "readback.json"),
      JSON.stringify({
        users: (await db.pool.query('SELECT count(*) FROM "User"')).rows[0]
          .count,
        sessionCount: (await db.pool.query('SELECT count(*) FROM "Session"'))
          .rows[0].count,
        scope: "Task3 auth fake sandbox; test-owned protected routes",
      }),
    );
  } finally {
    for (const app of apps) await app.close();
    await db.pool.end();
  }
});
