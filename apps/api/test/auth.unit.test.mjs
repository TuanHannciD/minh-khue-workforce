import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { hashPassword, verifyPassword } from "../dist/modules/auth/password.js";
import { createApp } from "../dist/bootstrap.js";

test("Argon2 native preserves Unicode and whitespace, randomized salts, and byte limits", async () => {
  const value = ` ử nghiệm ${randomBytes(24).toString("base64url")} `;
  const start = performance.now(),
    a = await hashPassword(value),
    firstMs = performance.now() - start;
  const secondStart = performance.now(),
    b = await hashPassword(value),
    secondMs = performance.now() - secondStart;
  assert.ok(a !== b, "random salts produce distinct hashes");
  assert.ok(await verifyPassword(a, value));
  assert.equal(await verifyPassword(a, value.trim()), false);
  const exact = "ế".repeat(341) + "a";
  assert.equal(Buffer.byteLength(exact), 1024);
  assert.ok(await verifyPassword(await hashPassword(exact), exact));
  await assert.rejects(hashPassword("ế".repeat(342)), /1024/);
  if (process.env.MKW_AUTH_EVIDENCE)
    await writeFile(
      `${process.env.MKW_AUTH_EVIDENCE}/argon2-native.json`,
      JSON.stringify(
        {
          platform: process.platform,
          arch: process.arch,
          node: process.version,
          algorithm: "argon2id",
          memoryKiB: 65536,
          iterations: 3,
          parallelism: 1,
          hashBytes: 32,
          samplesMs: [firstMs, secondMs],
          limit: "two local samples, not a production load benchmark",
        },
        null,
        2,
      ),
    );
});

test("password hashing accepts eight Unicode code points and rejects shorter input", async () => {
  for (const value of ["abcdefgh", "ế".repeat(8), "😀".repeat(8)]) {
    const hash = await hashPassword(value);
    assert.ok(await verifyPassword(hash, value));
    assert.equal(await verifyPassword(hash, value + "x"), false);
  }
  for (const value of ["", "abcdefg", "ế".repeat(7), "😀".repeat(4)])
    await assert.rejects(hashPassword(value), /at least 8/);
});

test("production fails closed without exact HTTPS and configured TLS termination", async () => {
  for (const [origin, config] of [
    ["http://127.0.0.1:5173", { production: true }],
    [
      "https://example.test",
      {
        production: true,
        databaseUrl: "postgresql://unconfigured@127.0.0.1:1/none",
        throttleSecret: randomBytes(32).toString("hex"),
      },
    ],
    ["http://public.example.test", {}],
  ])
    await assert.rejects(createApp(origin, config));
});
