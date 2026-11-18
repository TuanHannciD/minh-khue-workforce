import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const api = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(api, "dist/ops/account-cli.js");
const marker = "PRIVATE-CLI-FIXTURE";
const databaseUrl = "postgresql://fixture@127.0.0.1:1/unused";
const list = '{"operation":"list"}';

function run(input, options = {}) {
  const env = { ...process.env };
  for (const key of ["DATABASE_URL", "NODE_OPTIONS", "NODE_PATH"])
    delete env[key];
  Object.assign(env, options.env);
  return new Promise((resolveRun, reject) => {
    const child = spawn(
      process.execPath,
      [
        ...(options.nodeArgs ?? []),
        options.cli ?? cli,
        ...(options.args ?? []),
      ],
      { cwd: options.cwd ?? api, env, stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "",
      stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.stdin.on("error", (error) => {
      if (error.code !== "EPIPE") reject(error);
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("CLI fixture timed out"));
    }, 15000);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolveRun({ code, signal, stdout, stderr });
    });
    child.stdin.end(input);
  });
}

function failure(result, exit, code) {
  assert.equal(result.signal, null);
  assert.equal(result.code, exit);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, JSON.stringify({ error: { code } }) + "\n");
  assert.equal(result.stderr.includes(marker), false);
}

// Real compiled ESM and real auth validation; only Prisma subprocess/DB are fixtures.
async function fixture(t, { omit = [], status = 0, dbMode } = {}) {
  const root = await mkdtemp(join(tmpdir(), "mkw-account-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(join(api, "dist"), join(root, "dist"), { recursive: true });
  await cp(join(api, "package.json"), join(root, "package.json"));
  await mkdir(join(root, "node_modules"));
  for (const entry of await readdir(join(api, "node_modules"), {
    withFileTypes: true,
  })) {
    if (
      entry.name.startsWith(".") ||
      omit.includes(entry.name) ||
      entry.name === "prisma"
    )
      continue;
    if (entry.name.startsWith("@")) {
      await mkdir(join(root, "node_modules", entry.name));
      for (const name of await readdir(join(api, "node_modules", entry.name)))
        await symlink(
          await realpath(join(api, "node_modules", entry.name, name)),
          join(root, "node_modules", entry.name, name),
          "junction",
        );
    } else {
      await symlink(
        await realpath(join(api, "node_modules", entry.name)),
        join(root, "node_modules", entry.name),
        "junction",
      );
    }
  }
  const trace = join(root, "trace.jsonl");
  if (!omit.includes("prisma")) {
    const build = join(root, "node_modules/prisma/build");
    await mkdir(build, { recursive: true });
    await writeFile(
      join(build, "index.js"),
      `
      const fs = require('node:fs');
      const assert = require('node:assert/strict');
      assert.deepEqual(process.argv.slice(2), ['migrate', 'status']);
      assert.equal(process.cwd(), ${JSON.stringify(root)});
      assert.equal(process.env.DATABASE_URL, ${JSON.stringify(databaseUrl)});
      fs.appendFileSync(${JSON.stringify(trace)}, '"preflight"\\n');
      console.log(${JSON.stringify(marker)}); console.error(${JSON.stringify(marker)});
      process.exitCode = ${status};
    `,
    );
  }
  const options = {
    cwd: root,
    cli: join(root, "dist/ops/account-cli.js"),
    env: { DATABASE_URL: databaseUrl },
  };
  if (dbMode) {
    const preload = join(root, "preload.mjs");
    await writeFile(
      preload,
      `
      import { mock } from 'node:test';
      import { appendFileSync } from 'node:fs';
      const trace = (event) => appendFileSync(${JSON.stringify(trace)}, JSON.stringify(event) + '\\n');
      const mode = ${JSON.stringify(dbMode)};
      const stdoutWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = (...args) => { trace('stdout'); return stdoutWrite(...args); };
      class Database {
        constructor(url) { if (url !== ${JSON.stringify(databaseUrl)}) throw Error('wrong fixture URL'); trace('construct'); }
        client = { user: { findMany: async () => {
          trace('query');
          if (mode === 'driver' || mode === 'driver-close') throw Error(${JSON.stringify(marker)});
          return [{ username: 'Đội-A' }, { username: 'foo' }];
        } } };
        async transaction() {
          const { AccountOperationError } = await import('./dist/modules/auth/index.js');
          throw new AccountOperationError(mode === 'duplicate' ? 'ACCOUNT_EXISTS' : 'ACCOUNT_NOT_FOUND');
        }
        async onModuleDestroy() { await new Promise(r => setImmediate(r)); trace('destroy'); if (mode.endsWith('close')) throw Error(${JSON.stringify(marker)}); }
      }
      mock.module(${JSON.stringify(pathToFileURL(join(root, "dist/infrastructure/db/database.js")).href)}, { exports: { Database } });
    `,
    );
    options.nodeArgs = [
      "--disable-warning=ExperimentalWarning",
      "--experimental-test-module-mocks",
      "--import",
      pathToFileURL(preload).href,
    ];
  }
  return {
    root,
    options,
    events: async () => {
      try {
        return (await readFile(trace, "utf8"))
          .trim()
          .split("\n")
          .map(JSON.parse);
      } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
      }
    },
  };
}

test("compiled_esm_rejects_invalid_before_db", async (t) => {
  const f = await fixture(t);
  const add = (extra) =>
    JSON.stringify({
      operation: "add",
      username: "Đội-A",
      password: marker,
      ...extra,
    });
  const cases = [
    "",
    "{",
    list + list,
    "null",
    "[]",
    "1",
    JSON.stringify(marker),
    Buffer.from([0x7b, 0xc3, 0x28, 0x7d]),
    JSON.stringify({ operation: "list", password: marker }),
    JSON.stringify({ operation: "remove", password: marker }),
    add({ username: "" }),
    add({ username: "a".repeat(65) }),
    add({ username: "Đội A" }),
    add({ password: 123 }),
    add({ password: "😀".repeat(7) }),
    add({ password: "ế".repeat(342) }),
    add({ unexpected: marker }),
    JSON.stringify({ operation: "add", username: "foo" }),
    list.padEnd(16385, " "),
  ];
  for (const [i, input] of cases.entries()) {
    const result = await run(input, f.options);
    assert.equal(result.code, 64, `invalid input case ${i}`);
    failure(result, 64, "INVALID_INPUT");
  }
  assert.deepEqual(
    await f.events(),
    [],
    "invalid input never starts migration status or DB",
  );
});

test("exact_16384_raw_bytes_and_trailing_newline_are_accepted_before_config", async () => {
  for (const input of [
    list.padEnd(16384, " "),
    list + "\n",
    JSON.stringify({
      operation: "add",
      username: "Đội-A",
      password: "😀".repeat(8),
    }),
    JSON.stringify({
      operation: "reset-password",
      username: "Foo",
      password: "ế".repeat(341) + "a",
    }),
    JSON.stringify({
      operation: "add",
      username: "foo",
      password: '  quote"slash\\ 😀  ',
    }),
  ])
    failure(await run(input), 78, "CONFIG_INVALID");
});

test("reject_extra_argv_without_echoing_private_values", async () => {
  failure(
    await run(list, { args: ["--password", marker] }),
    64,
    "INVALID_INPUT",
  );
});

test("missing_and_invalid_database_config_are_sanitized_before_preflight", async (t) => {
  const f = await fixture(t);
  for (const value of [
    "",
    marker,
    "https://example.test/db",
    "postgresql://",
    "postgresql://host/",
    "postgresql://host/db#fragment",
  ])
    failure(
      await run(list, { ...f.options, env: { DATABASE_URL: value } }),
      78,
      "CONFIG_INVALID",
    );
  assert.deepEqual(await f.events(), []);
});

test("missing_prisma_cli_and_native_package_fail_as_dependency_unavailable", async (t) => {
  for (const omit of [["prisma"], ["argon2"]]) {
    const f = await fixture(t, { omit });
    failure(await run(list, f.options), 69, "DEPENDENCY_UNAVAILABLE");
    assert.deepEqual(await f.events(), []);
  }
});

test("migration_status_failure_blocks_database_construction", async (t) => {
  for (const status of [1, 2]) {
    const f = await fixture(t, { status, dbMode: "list" });
    failure(await run(list, f.options), 78, "SCHEMA_NOT_READY");
    assert.deepEqual(await f.events(), ["preflight"]);
  }
});

test("success_is_one_json_line_only_after_database_cleanup", async (t) => {
  const f = await fixture(t, { dbMode: "list" });
  const result = await run(list, f.options);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(
    result.stdout,
    '{"operation":"list","usernames":["Đội-A","foo"]}\n',
  );
  assert.deepEqual(await f.events(), [
    "preflight",
    "construct",
    "query",
    "destroy",
    "stdout",
  ]);
});

test("driver_and_cleanup_errors_are_filtered_and_suppress_success", async (t) => {
  for (const dbMode of ["driver", "list-close", "driver-close"]) {
    const f = await fixture(t, { dbMode });
    failure(await run(list, f.options), 1, "OPERATION_FAILED");
    assert.deepEqual(await f.events(), [
      "preflight",
      "construct",
      "query",
      "destroy",
    ]);
  }
});

test("typed_domain_errors_survive_cleanup_failure_without_payload", async (t) => {
  for (const [dbMode, operation, code] of [
    ["duplicate", "add", "ACCOUNT_EXISTS"],
    ["missing-close", "reset-password", "ACCOUNT_NOT_FOUND"],
  ]) {
    const f = await fixture(t, { dbMode });
    failure(
      await run(
        JSON.stringify({ operation, username: "Đội-A", password: marker }),
        f.options,
      ),
      1,
      code,
    );
    assert.deepEqual(await f.events(), ["preflight", "construct", "destroy"]);
  }
});
