// File map: catalog and parser tests; fixture/admit/report helpers; validation
// matrix (rejectContext exercises native API/CLI and adapter ordering); process
// failure/admission and shared snapshot regressions. One worker contract suite.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  rm,
  readdir,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { getCheckPlan } from "../../scripts/ci/check-plan.mjs";
import { runChecks, checksMain } from "../../scripts/ci/run-checks.mjs";
import { validatePublicReport } from "../../scripts/ci/evidence.mjs";
import {
  createSourceSnapshot,
  verifySourceSnapshot,
} from "../../scripts/ci/source-snapshot.mjs";

const expected = [
  ["lint", ["run", "product:lint"]],
  ["format", ["run", "product:format:check"]],
  ["typecheck", ["run", "product:typecheck"]],
  ["build", ["run", "product:build"]],
  ["tooling-fast", ["run", "product:test:tooling:ci"]],
  ["sandbox", ["run", "product:test:sandbox"]],
  ["web", ["--filter", "@mkw/web", "test", "--run", "--maxWorkers=2"]],
  ["api", ["--filter", "@mkw/api", "test"]],
  ["contract", ["run", "product:contract:check"]],
  ["boundaries", ["run", "product:boundaries"]],
].map(([id, args]) => ({ id, executable: "pnpm", args }));

test("quality resolves all ordered commands and bounded web workers; release keeps its separate coverage", () => {
  assert.deepEqual(getCheckPlan("quality"), expected);
  assert.deepEqual(getCheckPlan("release-tooling"), [
    {
      id: "tooling-release",
      executable: "pnpm",
      args: ["run", "product:test:tooling:release"],
    },
  ]);
  getCheckPlan("quality")[0].args.push("mutated");
  assert.deepEqual(getCheckPlan("quality"), expected);
});

test("invalid profile/options and duplicate IDs fail64 before admission or processes", async (t) => {
  const options = await fixture(t);
  const forbidden = () => {
    throw Error("must not acquire or spawn");
  };
  for (const args of [
    ["--profile", "typo"],
    ["--profile", "quality", "--typo"],
    ["--profile", "quality", "--profile", "release-tooling"],
    ["--list"],
    ["--profile"],
    ["--profile", "quality", "--list", "--list"],
    ["--profile", "quality", "--list", "--run-id", "not-a-uuid"],
  ]) {
    assert.equal(
      await checksMain(args, {
        admit: forbidden,
        execute: forbidden,
        output: () => {},
      }),
      64,
    );
  }
  assert.equal(
    await runChecks(
      { ...options, profile: "typo" },
      { admit: forbidden, execute: forbidden },
    ),
    64,
  );
  assert.equal(
    await runChecks(options, {
      getPlan: () => [expected[0], expected[0]],
      admit: forbidden,
      execute: forbidden,
    }),
    64,
  );
  assert.equal(
    await runChecks(options, {
      getPlan: () => [{ executable: "pnpm", args: [] }],
      admit: forbidden,
      execute: forbidden,
    }),
    64,
  );
});

test("list works on an unadmitted host and never invokes process/admission adapters", async () => {
  let output;
  const forbidden = () => {
    throw Error("must not spawn");
  };
  assert.equal(
    await checksMain(["--profile", "quality", "--list"], {
      admit: forbidden,
      execute: forbidden,
      output: (text) => {
        output = JSON.parse(text);
      },
    }),
    0,
  );
  assert.deepEqual(output, expected);
  const child = spawnSync(
    process.execPath,
    ["scripts/ci/run-checks.mjs", "--profile", "quality", "--list"],
    {
      encoding: "utf8",
      env: { ...process.env, MKW_CI_SNAPSHOT_ROOT: "missing" },
    },
  );
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), expected);
});

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "mkw-checks-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, "workspace");
  await mkdir(workspace);
  return {
    profile: "quality",
    workspace,
    reportRoot: join(root, "reports"),
    runId: randomUUID(),
  };
}
const admit = async () => ({
  sourceSha256: "a".repeat(64),
  baseSha: "b".repeat(40),
  environmentLockSha256: "c".repeat(64),
  runtime: {
    node: process.version,
    pnpm: "12.15.0",
    platform: process.platform,
    arch: process.arch,
    uid: 1000,
  },
});
const report = async (options) =>
  validatePublicReport(
    JSON.parse(
      await readFile(
        join(options.reportRoot, options.runId, "public/check-report.json"),
        "utf8",
      ),
    ),
  );

// These cases catch validation after mkdir/admission, list short-circuiting,
// lexical-prefix containment and missing canonical checks through aliases.
test("invalid context fails64 before mutation for API and CLI including list", async (t) => {
  for (const [name, change] of [
    ["invalid UUID", () => ({ runId: "not-a-uuid" })],
    ["empty workspace", () => ({ workspace: "" })],
    ["blank workspace", () => ({ workspace: "   " })],
    ["empty report root", () => ({ reportRoot: "" })],
    ["blank report root", () => ({ reportRoot: "   " })],
    ["missing workspace", (o) => ({ workspace: join(o.workspace, "missing") })],
    ["report equals workspace", (o) => ({ reportRoot: o.workspace })],
    [
      "report inside generated dist",
      (o) => ({ reportRoot: join(o.workspace, "apps/web/dist/reports") }),
    ],
    [
      "normalized report inside",
      (o) => ({ reportRoot: join(o.workspace, "..", "workspace", "reports") }),
    ],
    [
      "workspace is file",
      async (o) => {
        const p = join(o.workspace, "file");
        await writeFile(p, "owned");
        return { workspace: p };
      },
    ],
    [
      "report ancestor is file",
      async (o) => {
        const p = join(dirname(o.workspace), "file");
        await writeFile(p, "owned");
        return { reportRoot: join(p, "reports") };
      },
    ],
  ]) {
    await t.test(name, async (t) => {
      const valid = await fixture(t),
        options = { ...valid, ...(await change(valid)) };
      await rejectContext(options, dirname(valid.workspace), valid.workspace);
    });
  }
});

test("canonical report ancestry rejects junction aliases and missing descendants", async (t) => {
  const valid = await fixture(t),
    root = dirname(valid.workspace);
  const alias = join(root, "alias");
  await symlink(
    valid.workspace,
    alias,
    process.platform === "win32" ? "junction" : "dir",
  );
  // No capability skip: junction creation must work on Windows fixtures.
  for (const options of [
    { ...valid, reportRoot: alias },
    { ...valid, reportRoot: join(alias, "new", "reports") },
    {
      ...valid,
      workspace: alias,
      reportRoot: join(valid.workspace, "new", "reports"),
    },
  ])
    await rejectContext(options, root, valid.workspace);
});

async function rejectContext(options, root, cwd) {
  const before = (await readdir(root, { recursive: true })).sort();
  const script = resolve("scripts/ci/run-checks.mjs");
  // Isolated cwd keeps even the historical empty-report-root repro task-owned.
  for (const injected of [false, true]) {
    const child = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
      const {runChecks}=await import(${JSON.stringify(pathToFileURL(script).href)});
      let admitted=0,executed=0;
      const adapters=${injected} ? {admit:async()=>{admitted++;return {};},execute:async()=>{executed++;return {status:0};},output:()=>{}} : undefined;
      const status=await runChecks(${JSON.stringify(options)},adapters);
      console.log(JSON.stringify({status,admitted,executed}));process.exitCode=status;
    `,
      ],
      { cwd, encoding: "utf8" },
    );
    assert.equal(child.status, 64, child.stdout + child.stderr);
    assert.deepEqual(JSON.parse(child.stdout.trim()), {
      status: 64,
      admitted: 0,
      executed: 0,
    });
    assert.deepEqual((await readdir(root, { recursive: true })).sort(), before);
  }
  const args = [
    "--profile",
    "quality",
    "--workspace",
    options.workspace,
    "--report-root",
    options.reportRoot,
    "--run-id",
    options.runId,
  ];
  for (const mode of [[], ["--list"]]) {
    let admitted = 0,
      executed = 0,
      outputs = 0;
    assert.equal(
      await checksMain([...args, ...mode], {
        admit: async () => {
          admitted++;
          return {};
        },
        execute: async () => {
          executed++;
          return { status: 0 };
        },
        output: () => {
          outputs++;
        },
      }),
      64,
    );
    assert.deepEqual(
      { admitted, executed, outputs },
      { admitted: 0, executed: 0, outputs: 0 },
    );
    const child = spawnSync(process.execPath, [script, ...args, ...mode], {
      cwd,
      encoding: "utf8",
    });
    assert.equal(child.status, 64, child.stdout + child.stderr);
    assert.equal(child.stdout, "");
    assert.deepEqual((await readdir(root, { recursive: true })).sort(), before);
  }
}

test("invalid API path types and NUL fail64 without acquisition", async (t) => {
  const options = await fixture(t),
    root = dirname(options.workspace);
  const before = (await readdir(root, { recursive: true })).sort();
  let admitted = 0,
    executed = 0;
  for (const key of ["workspace", "reportRoot"])
    for (const value of [null, 42, "bad\0path"])
      assert.equal(
        await runChecks(
          { ...options, [key]: value },
          {
            admit: () => {
              admitted++;
            },
            execute: () => {
              executed++;
            },
          },
        ),
        64,
      );
  assert.deepEqual({ admitted, executed }, { admitted: 0, executed: 0 });
  assert.deepEqual((await readdir(root, { recursive: true })).sort(), before);
});

test("external shared-prefix reports and omitted list context remain valid", async (t) => {
  const options = await fixture(t);
  options.reportRoot = options.workspace + "-reports";
  let admitted = 0;
  assert.equal(
    await runChecks(options, {
      admit: async () => {
        admitted++;
        return await admit();
      },
      getPlan: () => [
        {
          id: "lint",
          executable: process.execPath,
          args: ["-e", "process.exit(0)"],
        },
      ],
      output: () => {},
    }),
    0,
  );
  assert.equal(admitted, 1);
  assert.equal((await report(options)).result, "Passed");
  const root = dirname(options.workspace);
  const before = (await readdir(root, { recursive: true })).sort();
  const args = ["--profile", "quality", "--list"];
  for (const context of [
    [],
    ["--report-root", options.reportRoot],
    ["--workspace", options.workspace],
    [
      "--workspace",
      options.workspace,
      "--report-root",
      options.reportRoot,
      "--run-id",
      randomUUID(),
    ],
  ]) {
    const child = spawnSync(
      process.execPath,
      [resolve("scripts/ci/run-checks.mjs"), ...args, ...context],
      { cwd: options.workspace, encoding: "utf8" },
    );
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), expected);
  }
  assert.deepEqual((await readdir(root, { recursive: true })).sort(), before);
});

test("terminal export failure keeps the primary child failure", async (t) => {
  const options = await fixture(t),
    outputs = [];
  let executed = 0;
  const code = await runChecks(options, {
    admit,
    getPlan: () => [expected[0], expected[1]],
    output: (text) => outputs.push(text),
    execute: async () => {
      executed++;
      const publicRoot = join(options.reportRoot, options.runId, "public");
      await rm(publicRoot, { recursive: true });
      await writeFile(publicRoot, "owned blocker");
      return {
        status: 17,
        signal: null,
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
      };
    },
  });
  assert.equal(code, 17);
  assert.equal(executed, 1);
  assert.match(outputs.at(-1), /code=REHEARSAL_COMMAND exit=17/);
  assert.match(outputs.at(-1), /secondary=REPORT_WRITE/);
});

test("real process failure preserves exit17 and prevents every later step", async (t) => {
  const options = await fixture(t),
    marker = join(options.workspace, "later");
  const plan = [
    {
      id: "lint",
      executable: process.execPath,
      args: ["-e", "process.exit(17)"],
    },
    {
      id: "format",
      executable: process.execPath,
      args: [
        "-e",
        `require('fs').writeFileSync(${JSON.stringify(marker)},'bad')`,
      ],
    },
  ];
  assert.equal(await runChecks(options, { getPlan: () => plan, admit }), 17);
  await assert.rejects(readFile(marker), { code: "ENOENT" });
  const r = await report(options);
  assert.equal(r.primary.stepId, "lint");
  assert.equal(r.primary.code, "REHEARSAL_COMMAND");
  assert.equal(r.primary.exitCode, 17);
  assert.equal(r.counts.commands, 1);
});

test("real spawn errors produce safe failed reports and no later commands", async (t) => {
  const options = await fixture(t);
  assert.equal(
    await runChecks(options, {
      getPlan: () => [
        {
          id: "lint",
          executable: join(options.workspace, "missing-secret-canary"),
          args: [],
        },
      ],
      admit,
    }),
    1,
  );
  const r = await report(options);
  assert.equal(r.primary.code, "PROCESS_SPAWN");
  assert.equal(JSON.stringify(r).includes("secret-canary"), false);
});

test(
  "real child signals remain signals rather than successful null status",
  { skip: process.platform === "win32" },
  async (t) => {
    const options = await fixture(t);
    assert.equal(
      await runChecks(options, {
        getPlan: () => [
          {
            id: "lint",
            executable: process.execPath,
            args: ["-e", "process.kill(process.pid,'SIGTERM')"],
          },
        ],
        admit,
      }),
      143,
    );
    const r = await report(options);
    assert.equal(r.primary.signal, "SIGTERM");
    assert.equal(r.primary.code, "PROCESS_SIGNAL");
  },
);

test("admission failure prevents catalog execution and retains safe environment code", async (t) => {
  const options = await fixture(t);
  assert.equal(
    await runChecks(options, {
      admit: async () => {
        throw Object.assign(Error("private-canary"), {
          code: "ENVIRONMENT_UID",
        });
      },
      execute: () => {
        throw Error("must not spawn");
      },
    }),
    1,
  );
  const r = await report(options);
  assert.equal(r.primary.code, "ENVIRONMENT_UID");
  assert.equal(r.counts.commands, 0);
  assert.equal(JSON.stringify(r).includes("private-canary"), false);
});

test("actual host admission fails closed without a snapshot context", async (t) => {
  const options = await fixture(t);
  const child = spawnSync(
    process.execPath,
    [
      resolve("scripts/ci/run-checks.mjs"),
      "--profile",
      "quality",
      "--report-root",
      options.reportRoot,
      "--run-id",
      options.runId,
    ],
    {
      cwd: options.workspace,
      encoding: "utf8",
      env: {
        ...process.env,
        MKW_CI_SNAPSHOT_ROOT: "",
        MKW_CI_SOURCE_SHA256: "",
      },
    },
  );
  assert.equal(child.status, 1);
  assert.equal((await report(options)).counts.commands, 0);
});

test("worker source verification permits only generated dependency/build directories and still detects changed or extra source", async (t) => {
  const options = await fixture(t),
    source = join(options.workspace, "input"),
    snapshot = join(options.workspace, "snapshot");
  await mkdir(source);
  await mkdir(snapshot);
  spawnSync("git", ["init", "--quiet", source]);
  await writeFile(join(source, "code.mjs"), "export const value = 1;\n");
  await createSourceSnapshot(source, snapshot);
  const tree = join(snapshot, "source");
  await mkdir(join(tree, "node_modules"));
  await writeFile(join(tree, "node_modules", "dependency"), "generated");
  await assert.rejects(verifySourceSnapshot(snapshot));
  await verifySourceSnapshot(snapshot, { allowBuildOutputs: true });
  await mkdir(join(tree, "apps/api/src/infrastructure/db/generated"), {
    recursive: true,
  });
  await writeFile(
    join(tree, "apps/api/src/infrastructure/db/generated/client.ts"),
    "generated Prisma client",
  );
  await verifySourceSnapshot(snapshot, { allowBuildOutputs: true });
  await writeFile(join(tree, "extra.mjs"), "unexpected");
  await assert.rejects(
    verifySourceSnapshot(snapshot, { allowBuildOutputs: true }),
  );
  await rm(join(tree, "extra.mjs"));
  await writeFile(join(tree, "code.mjs"), "changed");
  await assert.rejects(
    verifySourceSnapshot(snapshot, { allowBuildOutputs: true }),
  );
});
