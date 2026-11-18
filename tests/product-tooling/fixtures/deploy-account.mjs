// File map: runBash/makeBundleFixture serve existing bundle units;
// runRealAccountScenarios owns SQL/auth assertions; makeRehearsalArtifact owns
// canonical/provenance fixtures; accountFaults owns negative runtime boundaries;
// audit/canonicalBackup/releaseBytes support runRealReleaseScenarios's single
// publish/failure/recovery matrix. Shared transport f never substitutes domain code.
import { spawn } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  cp,
  stat,
  chmod,
  rename,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { writeBundleInventory } from "../../../scripts/product/release/release-bundle.mjs";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { resolveRollbackBackup } from "../../../scripts/product/release/resolve-rollback-backup.mjs";
import {
  readOperationReceipt,
  writeOperationEvent,
} from "../../../scripts/product/release/operation-receipts.mjs";

const bash =
  process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
export const bashPath = (path) =>
  process.platform === "win32"
    ? resolve(path)
        .replaceAll("\\", "/")
        .replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`)
    : resolve(path);

export function runBash(file, args, { cwd, env, input } = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(bash, [file, ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: "pipe",
    });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (b) => {
      stdout += b;
    });
    child.stderr.on("data", (b) => {
      stderr += b;
    });
    child.on("error", reject);
    child.on("close", (code) => resolveResult({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

export async function makeBundleFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "mkw-task4-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const release = join(root, "release"),
    controls = join(root, "controls"),
    operation = join(root, "operation");
  const sha = "a".repeat(40),
    operationId = "fixture-operation-1";
  for (const [directory, files] of [
    [
      release,
      {
        "release-manifest.json": JSON.stringify({
          schemaVersion: "1",
          releaseSha: sha,
        }),
        "release-manifest.sha256": "fixture manifest checksum\n",
        "release-checksums.sha256": "fixture checksums\n",
        "build-metadata.json": JSON.stringify({ sourceSha: sha }),
        "api-attestations.json": "{}\n",
        "web-attestations.json": "{}\n",
        "deploy/compose.production.yml": "services: {}\n",
        "scripts/product/manage-production-account.sh": "#!/usr/bin/env bash\n",
      },
    ],
    [
      controls,
      {
        "scripts/product/deploy-entrypoint.sh": "trusted entrypoint\n",
        "scripts/product/post-deploy-verify.sh": "trusted verifier\n",
        "scripts/product/release/policy.mjs": "trusted current policy\n",
      },
    ],
    [
      operation,
      {
        "backup-ready.json": "{}\n",
        "backup-ready.sha256": "checksum\n",
        "producer.json": "{}\n",
        "target.json": "{}\n",
      },
    ],
  ]) {
    for (const [path, data] of Object.entries(files)) {
      await mkdir(join(directory, path, ".."), { recursive: true });
      await writeFile(join(directory, path), data);
    }
    await writeBundleInventory(directory);
  }
  const archive = join(root, "bundle.tar");
  const result = await runBash(
    "-c",
    [
      'tar -cf "$1" -C "$2" release controls operation',
      "fixture",
      bashPath(archive),
      bashPath(root),
    ],
    { cwd: root },
  );
  if (result.code !== 0)
    throw new Error(`GNU tar fixture failed: ${result.stderr}`);
  return { root, release, controls, operation, archive, sha, operationId };
}

// Real Task9 account acceptance. The adapters own only transport/resources;
// every mutation uses the shipped compiled CLI or the canonical operator shell.
// SQL/readback stays in memory, evidence receives booleans/counts only.
export async function runRealAccountScenarios(f) {
  const secret = () => ` Khuê\t"\\${randomBytes(20).toString("hex")}🙂 `;
  const passwords = [secret(), secret(), secret()];
  const [oldPassword, newPassword, otherPassword] = passwords;
  const clean = (result) => {
    const output = `${result.stdout}${result.stderr}`;
    for (const password of passwords)
      assert.equal(output.includes(password), false);
    assert.doesNotMatch(
      output,
      /\$argon2|postgres(?:ql)?:\/\/|PrismaClient|driverAdapterError|passwordHash/,
    );
  };
  const cli = async (input, options) => {
    const result = await f.cli(
      typeof input === "string" || Buffer.isBuffer(input)
        ? input
        : JSON.stringify(input),
      options,
    );
    clean(result);
    return result;
  };
  const shell = async (operation, username, password, env) => {
    const result = await f.shell(
      operation,
      operation === "list"
        ? undefined
        : `${username}\n${password}\n${password}\n`,
      env,
    );
    clean(result);
    return result;
  };
  const state = () =>
    f.sql(
      `SELECT json_build_object('users', (SELECT coalesce(json_agg(u ORDER BY u.id),'[]') FROM "User" u), 'sessions',(SELECT coalesce(json_agg(s ORDER BY s.id),'[]') FROM "Session" s))::text;`,
    );
  const hashCheck = async (username, yes, no) => {
    const row = JSON.parse(
      await f.sql(
        `SELECT row_to_json(u)::text FROM (SELECT "passwordHash", "authVersion"::text FROM "User" WHERE username='${username}') u;`,
      ),
    );
    const result = await f.nativeVerify(row.passwordHash, yes, no);
    assert.deepEqual(result, { argon2id: true, valid: true, invalid: false });
    return row.authVersion;
  };
  await f.scenario("list_empty_then_sorted_users", async () => {
    const empty = await cli({ operation: "list" });
    assert.equal(empty.status, 0);
    assert.deepEqual(JSON.parse(empty.stdout), {
      operation: "list",
      usernames: [],
    });
    assert.equal((await shell("list")).stdout.trim(), "");
    for (const username of ["fixture-B", "fixture-A"])
      assert.equal((await shell("add", username, oldPassword)).status, 0);
    const listed = await cli({ operation: "list" });
    assert.equal(listed.status, 0);
    assert.deepEqual(JSON.parse(listed.stdout).usernames, [
      "fixture-A",
      "fixture-B",
    ]);
    assert.equal((await shell("list")).stdout.trim(), "fixture-A\nfixture-B");
    assert.equal(
      await f.sql(
        "SELECT string_agg(username,',' ORDER BY username) FROM \"User\";",
      ),
      "fixture-A,fixture-B",
    );
  });
  await f.scenario("add_duplicate_concurrent", async () => {
    const payload = JSON.stringify({
      operation: "add",
      username: "fixture-race",
      password: otherPassword,
    });
    const pending = [f.cli(payload), f.cli(payload)];
    await f.scanProcesses(passwords);
    const results = await Promise.all(pending);
    results.forEach(clean);
    assert.deepEqual(results.map((r) => r.status).sort(), [0, 1]);
    assert.match(results.find((r) => r.status === 1).stderr, /ACCOUNT_EXISTS/);
    assert.equal(
      await f.sql(`SELECT count(*) FROM "User" WHERE username='fixture-race';`),
      "1",
    );
    assert.equal(
      await hashCheck("fixture-race", otherPassword, newPassword),
      "1",
    );
  });
  await f.scenario("reset_commits_and_revokes", async () => {
    const sessions = [
      await f.login("fixture-A", oldPassword),
      await f.login("fixture-A", oldPassword),
    ];
    assert.equal(
      await f.sql(
        `SELECT count(*) FROM "Session" s JOIN "User" u ON s."userId"=u.id WHERE u.username='fixture-A' AND s."revokedAt" IS NULL;`,
      ),
      "2",
    );
    for (const session of sessions) assert.equal(await f.session(session), 200);
    const version = await hashCheck("fixture-A", oldPassword, newPassword);
    assert.equal(
      (await shell("reset-password", "fixture-A", newPassword)).status,
      0,
    );
    assert.equal(
      await hashCheck("fixture-A", newPassword, oldPassword),
      String(BigInt(version) + 1n),
    );
    assert.equal(
      await f.sql(
        `SELECT count(*) FROM "Session" s JOIN "User" u ON s."userId"=u.id WHERE u.username='fixture-A' AND s."revokedAt" IS NOT NULL;`,
      ),
      "2",
    );
    for (const session of sessions) assert.equal(await f.session(session), 401);
    assert.equal(await f.session(await f.login("fixture-A", newPassword)), 200);
  });
  await f.scenario("reset_failure_rolls_back", async () => {
    const session = await f.login("fixture-B", oldPassword);
    await f.sql(
      `CREATE FUNCTION task9_revoke_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'task9-owned'; END $$; CREATE TRIGGER task9_revoke_failure BEFORE UPDATE ON "Session" FOR EACH ROW EXECUTE FUNCTION task9_revoke_failure();`,
    );
    try {
      const before = await state();
      const result = await shell("reset-password", "fixture-B", newPassword);
      assert.equal(result.status, 1);
      assert.equal(result.stdout.trim(), "");
      assert.match(result.stderr, /OPERATION_FAILED/);
      assert.equal(await state(), before);
      assert.equal(await hashCheck("fixture-B", oldPassword, newPassword), "1");
      assert.equal(await f.session(session), 200);
    } finally {
      await f.sql(
        'DROP TRIGGER task9_revoke_failure ON "Session"; DROP FUNCTION task9_revoke_failure();',
      );
    }
  });
  await f.scenario("add_deferred_commit_failure", async () => {
    await f.sql(
      `CREATE FUNCTION task9_commit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.username='fixture-commit-fail' THEN RAISE EXCEPTION 'task9-owned'; END IF; RETURN NEW; END $$; CREATE CONSTRAINT TRIGGER task9_commit_failure AFTER INSERT ON "User" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION task9_commit_failure();`,
    );
    try {
      const before = await state();
      const result = await cli({
        operation: "add",
        username: "fixture-commit-fail",
        password: otherPassword,
      });
      assert.equal(result.status, 1);
      assert.equal(result.stdout.trim(), "");
      assert.match(result.stderr, /OPERATION_FAILED/);
      assert.equal(await state(), before);
      assert.equal(
        await f.sql(
          `SELECT count(*) FROM "User" WHERE username='fixture-commit-fail';`,
        ),
        "0",
      );
    } finally {
      await f.sql(
        'DROP TRIGGER task9_commit_failure ON "User"; DROP FUNCTION task9_commit_failure();',
      );
    }
  });
  await f.scenario("reset_missing", async () => {
    const before = await state();
    const result = await shell(
      "reset-password",
      "fixture-missing",
      newPassword,
    );
    assert.equal(result.status, 1);
    assert.equal(result.stdout.trim(), "");
    assert.match(result.stderr, /ACCOUNT_NOT_FOUND/);
    assert.equal(await state(), before);
  });
  await f.scenario("invalid_private_input_preserves_sql", async () => {
    const before = await state();
    for (const input of [
      "{",
      '{"operation":"list","operation":"add"}',
      "x".repeat(16385),
      JSON.stringify({
        operation: "add",
        username: "bad name",
        password: otherPassword,
      }),
      JSON.stringify({
        operation: "add",
        username: "fixture-invalid",
        password: "🙂".repeat(7),
      }),
      JSON.stringify({
        operation: "add",
        username: "fixture-invalid",
        password: "🙂".repeat(257),
      }),
      JSON.stringify({
        operation: "add",
        username: "fixture-invalid",
        password: otherPassword,
        extra: true,
      }),
      Buffer.from([0xff, 0xfe]),
    ]) {
      const result = await cli(input);
      assert.equal(result.status, 64);
      assert.equal(result.stdout.trim(), "");
      assert.equal(await state(), before);
    }
    for (const [username, password] of [
      ["fixture-unicode8", "🙂".repeat(8)],
      ["fixture-unicode1024", "🙂".repeat(256)],
    ]) {
      passwords.push(password);
      const result = await shell("add", username, password);
      assert.equal(result.status, 0);
      await hashCheck(username, password, otherPassword);
    }
  });
  for (const [fault, expected] of [
    ["project", 78],
    ["service", 78],
    ["image", 78],
    ["health", 78],
    ["config", 78],
    ["dependency", 69],
    ["schema", 78],
  ]) {
    await f.scenario(
      `account_reject_${fault}_without_sql_mutation`,
      async () => {
        const before = await state();
        const result = await f.accountFault(
          fault,
          JSON.stringify({
            operation: "add",
            username: "fixture-rejected",
            password: otherPassword,
          }),
        );
        clean(result);
        assert.equal(result.status, expected);
        assert.equal(await state(), before);
      },
    );
  }
  await f.scenario("credential_scan_evidence_and_runtime", async () => {
    await f.scanProcesses(passwords, false);
    await f.scanEvidence(passwords);
  });
}

export async function runRealRestoreReadinessScenario(f) {
  await f.scenario("restore_waits_for_final_postgres_server", async () => {
    const directory = "/local-only/readiness-init";
    await mkdir(directory);
    const script = `${directory}/01-barrier.sh`;
    await writeFile(
      script,
      "#!/usr/bin/env bash\nset -e\ntouch /tmp/task9-init-ready\nwhile [[ ! -e /tmp/task9-init-release ]]; do sleep .05; done\n",
    );
    await chmod(script, 0o755);
    const id = await f.acquire("readiness", "task9-readiness", f.pg, [
      "--network=none",
      "-e",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      "-e",
      "POSTGRES_USER=mkw",
      "-e",
      "POSTGRES_DB=mkw",
      "-v",
      `${directory}:/docker-entrypoint-initdb.d:ro`,
    ]);
    let waiting;
    try {
      let initialized = false;
      for (let i = 0; i < 100; i++) {
        if (
          (
            await f.command("docker", [
              "exec",
              id,
              "test",
              "-e",
              "/tmp/task9-init-ready",
            ])
          ).status === 0
        ) {
          initialized = true;
          break;
        }
        await new Promise((done) => setTimeout(done, 100));
      }
      assert.equal(initialized, true);
      assert.equal(
        (
          await f.command("docker", [
            "exec",
            id,
            "pg_isready",
            "-U",
            "mkw",
            "-d",
            "mkw",
          ])
        ).status,
        0,
      );
      assert.notEqual(
        (
          await f.command("docker", [
            "exec",
            id,
            "pg_isready",
            "-h",
            "127.0.0.1",
            "-U",
            "mkw",
            "-d",
            "mkw",
          ])
        ).status,
        0,
      );
      let completed = false;
      waiting = f.waitForPostgres(id).then(() => {
        completed = true;
      });
      await new Promise((done) => setTimeout(done, 150));
      assert.equal(completed, false);
      await f.docker("exec", id, "touch", "/tmp/task9-init-release");
      await waiting;
      assert.equal(completed, true);
    } finally {
      await f.docker("exec", id, "touch", "/tmp/task9-init-release");
      await waiting?.catch(() => {});
      const info = JSON.parse(await f.docker("inspect", id))[0];
      assert.equal(
        info.Config.Labels["com.mkw.task"],
        JSON.parse(await readFile("/mkw-local-owned.json", "utf8")).taskId,
      );
      await f.docker("rm", "-f", "-v", id);
    }
  });
}

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (path, value) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
async function allFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(join(directory, prefix), {
    withFileTypes: true,
  })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await allFiles(directory, path)));
    else files.push(path);
  }
  return files.sort();
}

// Canonical GitHub/provenance is simulated only here, with real local image digests.
// These fixtures never grant a production bypass or execute production account logic.
export async function makeRehearsalArtifact(
  input,
  { refreshOnly = false } = {},
) {
  if (refreshOnly) {
    const files = (await allFiles(input.directory)).filter(
      (p) => !["bundle-inventory.json", "release-checksums.sha256"].includes(p),
    );
    await writeFile(
      `${input.directory}/release-checksums.sha256`,
      (
        await Promise.all(
          files.map(
            async (p) =>
              `${digest(await readFile(`${input.directory}/${p}`))}  ${p}\n`,
          ),
        )
      ).join(""),
    );
    await writeBundleInventory(input.directory);
    return input;
  }
  const { sha, images, postgresImage, source, evidence, sequence } = input;
  const directory = `/local-only/artifacts/${sha}`;
  await mkdir(`${directory}/deploy`, { recursive: true });
  await mkdir(`${directory}/scripts/product`, { recursive: true });
  const provenance = Buffer.from(
    JSON.stringify({
      fixtureOnly: true,
      sourceSnapshot: sha,
      materials: images,
    }),
  );
  const descriptor = { sha256: digest(provenance), size: provenance.length };
  const manifest = {
    schemaVersion: "1",
    releaseSha: sha,
    sourceRepository: "mkw-local/rehearsal",
    createdAt: new Date().toISOString(),
    apiImage: images.api,
    webImage: images.web,
    postgresImage,
    artifacts: { sbom: descriptor, provenance: descriptor },
  };
  const runId = String(sequence + 1),
    id = String(sequence + 2);
  await json(`${directory}/release-manifest.json`, manifest);
  await writeFile(
    `${directory}/release-manifest.sha256`,
    `${digest(await readFile(`${directory}/release-manifest.json`))}  release-manifest.json\n`,
  );
  await json(`${directory}/build-metadata.json`, {
    sourceSha: sha,
    producerRunId: runId,
    producerRunAttempt: "1",
    apiDigest: images.api.split("@")[1],
    webDigest: images.web.split("@")[1],
  });
  for (const p of ["api-attestations.json", "web-attestations.json"])
    await writeFile(`${directory}/${p}`, provenance);
  await cp(
    `${source}/deploy/compose.production.yml`,
    `${directory}/deploy/compose.production.yml`,
  );
  await cp(
    `${source}/scripts/product/manage-production-account.sh`,
    `${directory}/scripts/product/manage-production-account.sh`,
  );
  const record = {
    sha,
    directory,
    manifest,
    runId,
    id,
    digest: `sha256:${digest(provenance)}`,
    operationId: `release-${sha.slice(0, 12)}-${randomUUID()}`,
  };
  await makeRehearsalArtifact(record, { refreshOnly: true });
  await json(`${evidence}/canonical-fixture-${sha}.json`, {
    ...record,
    fixtureOnly: true,
  });
  return record;
}

async function executeAccountFault(f, fault, input) {
  if (fault === "project")
    return f.shell("list", undefined, {
      MKW_PROJECT_NAME: "wrong-task9-project",
    });
  if (["service", "image"].includes(fault)) {
    const path = `${f.target}/current/compose.rendered.yml`,
      before = await readFile(path);
    try {
      const config = JSON.parse(before);
      if (fault === "service") {
        config.services.worker = config.services.api;
        delete config.services.api;
      } else config.services.api.image = f.currentRelease.manifest.webImage;
      await json(path, config);
      return await f.shell("list");
    } finally {
      await writeFile(path, before);
    }
  }
  if (fault === "health") {
    const id = await f.apiId();
    await f.docker("pause", id);
    try {
      return await f.shell("list");
    } finally {
      await f.docker("unpause", id);
    }
  }
  if (fault === "dependency" || fault === "config") {
    const args = [
      "run",
      "--rm",
      "-i",
      "--read-only",
      "--network=mkw-internal",
      "--cap-drop=ALL",
      "-w",
      fault === "dependency" ? "/tmp" : "/app",
    ];
    if (fault === "dependency")
      args.push("--env-file", `${f.target}/shared/api.env`);
    // Missing DATABASE_URL tests config refusal; no secret env is passed by CLI.
    return f.command(
      "docker",
      [
        ...args,
        f.currentRelease.manifest.apiImage,
        "node",
        "/app/dist/ops/account-cli.js",
      ],
      { input },
    );
  }
  if (fault === "schema") {
    await f.sql("CREATE DATABASE task9_schema;");
    try {
      const id = await f.dbId();
      await f.run("bash", [
        "-ceu",
        'docker exec "$1" pg_dump -U mkw -d mkw -Fc | docker exec -i "$1" pg_restore --exit-on-error --no-owner -U mkw -d task9_schema',
        "clone",
        id,
      ]);
      const before = await f.sql(
        `SELECT json_build_object('users',(SELECT json_agg(u ORDER BY u.id) FROM "User" u),'sessions',(SELECT json_agg(s ORDER BY s.id) FROM "Session" s))::text;`,
        "task9_schema",
      );
      await f.sql(
        "UPDATE _prisma_migrations SET finished_at=NULL WHERE id=(SELECT id FROM _prisma_migrations ORDER BY id LIMIT 1);",
        "task9_schema",
      );
      const path = "/local-only/schema-api.env";
      await writeFile(
        path,
        (await readFile(`${f.target}/shared/api.env`, "utf8")).replace(
          "@db:5432/mkw",
          "@db:5432/task9_schema",
        ),
        { mode: 0o600 },
      );
      const result = await f.command(
        "docker",
        [
          "run",
          "--rm",
          "-i",
          "--read-only",
          "--network=mkw-internal",
          "--env-file",
          path,
          "-w",
          "/app",
          f.currentRelease.manifest.apiImage,
          "node",
          "dist/ops/account-cli.js",
        ],
        { input },
      );
      assert.equal(
        await f.sql(
          `SELECT json_build_object('users',(SELECT json_agg(u ORDER BY u.id) FROM "User" u),'sessions',(SELECT json_agg(s ORDER BY s.id) FROM "Session" s))::text;`,
          "task9_schema",
        ),
        before,
      );
      return result;
    } finally {
      await f.sql("DROP DATABASE task9_schema;");
    }
  }
  throw new Error("unknown fixture fault");
}

export async function accountFaults(f, fault, input) {
  const before = (await readFile("/local-only/docker-audit.log", "utf8"))
    .length;
  const result = await executeAccountFault(f, fault, input);
  const calls = (await readFile("/local-only/docker-audit.log", "utf8")).slice(
    before,
  );
  if (["project", "service", "image", "health"].includes(fault))
    assert.doesNotMatch(
      calls,
      /exec -i -w \/app .*node dist\/ops\/account-cli\.js/,
    );
  else assert.match(calls, /node (?:\/app\/)?dist\/ops\/account-cli\.js/);
  return result;
}

export async function installRehearsalAudit() {
  await mkdir("/local-only/bin");
  await writeFile(
    "/local-only/bin/docker",
    '#!/usr/bin/env bash\nprintf "%q " "$@" >> /local-only/docker-audit.log\nprintf "\\n" >> /local-only/docker-audit.log\nexec /usr/local/bin/docker "$@"\n',
  );
  await chmod("/local-only/bin/docker", 0o755);
  process.env.PATH = `/local-only/bin:${process.env.PATH}`;
}

async function canonicalBackup(metadata) {
  const runId = metadata.backupId.match(/^mkw-(\d+)-1-release$/)[1];
  const artifact = {
    id: 10000 + Number(runId),
    name: `mkw-backup-${runId}-1`,
    workflow_run: { id: Number(runId) },
    expired: false,
    digest: `sha256:${digest(JSON.stringify(metadata))}`,
  };
  return resolveRollbackBackup(
    {
      repository: "mkw-local/rehearsal",
      dispatchRef: "refs/heads/main",
      artifactId: String(artifact.id),
      runId,
      target: {
        host: "local-only",
        database: "mkw",
        targetIdentity: metadata.databaseIdentity.targetIdentity,
      },
      now: new Date().toISOString(),
      maxAgeSeconds: 86400,
    },
    {
      artifact: async () => artifact,
      run: async () => ({
        id: Number(runId),
        run_attempt: 1,
        path: ".github/workflows/backup.yml",
        event: "workflow_dispatch",
        head_branch: "main",
        status: "completed",
        conclusion: "success",
      }),
      jsonFromArtifact: async () => metadata,
    },
  );
}
async function releaseBytes(directory) {
  const files = {};
  for (const p of ["", ...(await allFiles(directory))]) {
    const path = p ? `${directory}/${p}` : directory,
      info = await stat(path, { bigint: true });
    files[p] = {
      ino: String(info.ino),
      mtimeNs: String(info.mtimeNs),
      ...(p ? { sha256: digest(await readFile(path)) } : {}),
    };
  }
  return files;
}

export async function runRealReleaseScenarios(f, a) {
  const audit = () => readFile("/local-only/docker-audit.log", "utf8");
  const events = async (id) => {
    const dir = `${f.target}/operations/${id}`;
    return (
      await Promise.all(
        (await readdir(dir))
          .filter((p) => p.startsWith(`${id}.`) && p.endsWith(".json"))
          .map(async (p) => JSON.parse(await readFile(`${dir}/${p}`, "utf8"))),
      )
    ).sort((x, y) => x.sequence - y.sequence);
  };
  const identity = (record) => ({
    operationId: record.operationId,
    releaseSha: record.sha,
    imageDigests: {
      api: record.manifest.apiImage,
      web: record.manifest.webImage,
      postgres: record.manifest.postgresImage,
    },
  });
  const attempt = (record, prefix) => ({
    ...record,
    operationId: `${prefix}-${randomUUID()}`,
  });
  const data = () =>
    f.sql(
      `SELECT json_build_object('users',(SELECT json_agg(u ORDER BY u.id) FROM "User" u),'sessions',(SELECT json_agg(s ORDER BY s.id) FROM "Session" s),'probe',(SELECT value FROM local_rehearsal_probe WHERE id=1))::text;`,
    );
  const database = async () => ({
    id: await f.dbId(),
    mounts: JSON.parse(await f.docker("inspect", await f.dbId()))[0].Mounts,
    data: digest(await data()),
    schemaAndHistory: JSON.parse(
      await f.run(
        "bash",
        [
          "scripts/product/release/database-evidence.sh",
          `${f.target}/current/compose.rendered.yml`,
          "read-only-history",
        ],
        { env: f.envFor(f.currentRelease) },
      ),
    ),
  });
  const recover = async (old) => {
    const record = attempt(old, "manual-rollback");
    const metadata = await f.backup(f.currentRelease),
      rollback = await canonicalBackup(metadata);
    const before = await database(),
      offset = (await audit()).length;
    const result = await f.deploy(
      record,
      await f.stage(record, metadata, { rollback }),
      {
        MKW_OPERATION_KIND: "application-rollback",
        MKW_SIMPLE_RELEASE: "false",
      },
    );
    assert.equal(result.status, 0);
    assert.deepEqual(await database(), before);
    const calls = (await audit()).slice(offset);
    assert.match(calls, /up -d --wait --no-deps api gateway/);
    assert.doesNotMatch(
      calls,
      /migrate deploy|--no-deps db|pg_restore|restore .*mkw/,
    );
    const receipt = await readOperationReceipt(
      `${f.target}/operations/${record.operationId}`,
      identity(record),
    );
    assert.equal(receipt.operation, "application-rollback");
    assert.equal(receipt.databaseRecovery, false);
    assert.equal(receipt.controlSha, f.snapshot.sourceSha256);
    f.currentRelease = record;
    assert.equal((await f.verify(record)).status, 0);
    return record;
  };
  await f.scenario(
    "same_sha_new_backup_preserves_release_inode_bytes",
    async () => {
      const directory = `${f.target}/releases/${a.sha}`,
        before = await releaseBytes(directory);
      const retry = attempt(a, "same-sha"),
        metadata = await f.backup(retry);
      assert.equal(
        (await f.deploy(retry, await f.stage(retry, metadata))).status,
        0,
      );
      assert.deepEqual(await releaseBytes(directory), before);
      assert.equal(
        JSON.parse(
          await readFile(
            `${f.target}/operations/${retry.operationId}/backup-ready.json`,
            "utf8",
          ),
        ).backupId,
        metadata.backupId,
      );
      assert.equal(
        JSON.parse(
          await readFile(`${f.target}/shared/backup-ready.json`, "utf8"),
        ).backupId,
        metadata.backupId,
      );
      assert.equal(
        (await allFiles(directory)).includes("backup-ready.json"),
        false,
      );
      f.currentRelease = retry;
      assert.equal((await f.verify(retry)).status, 0);
    },
  );
  await f.scenario("publisher_lock_and_operation_no_clobber", async () => {
    const retry = attempt(a, "contender"),
      staged = await f.stage(retry, await f.backup(retry));
    const before = await releaseBytes(`${f.target}/releases/${a.sha}`);
    // Two actual entrypoint processes, synchronized at the real flock boundary.
    // The holder is an entrypoint blocked on a test-owned flock wrapper barrier.
    const bin = "/local-only/lock-bin";
    await mkdir(bin);
    await writeFile(
      `${bin}/flock`,
      '#!/usr/bin/env bash\n/usr/bin/flock "$@" || exit "$?"\nprintf ready > /local-only/lock-ready\nwhile [[ ! -e /local-only/lock-release ]]; do sleep .05; done\n',
    );
    await chmod(`${bin}/flock`, 0o755);
    const holderRecord = attempt(a, "holder"),
      holderStage = await f.stage(holderRecord, await f.backup(holderRecord));
    const holder = f.deploy(holderRecord, holderStage, {
      PATH: `${bin}:${process.env.PATH}`,
    });
    for (let i = 0; i < 200; i++) {
      if (await readFile("/local-only/lock-ready").catch(() => null)) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.equal(await readFile("/local-only/lock-ready", "utf8"), "ready");
    try {
      assert.equal((await f.deploy(retry, staged)).status, 75);
      assert.deepEqual(
        await releaseBytes(`${f.target}/releases/${a.sha}`),
        before,
      );
      assert.equal((await f.shell("list")).status, 75);
    } finally {
      await writeFile("/local-only/lock-release", "go");
    }
    assert.equal((await holder).status, 0);
    f.currentRelease = holderRecord;
    const reuse = `${f.target}/staging/${holderRecord.operationId}-${randomUUID()}`;
    await mkdir(reuse);
    await f.run("bash", [
      "scripts/product/release/extract-release-bundle.sh",
      `/local-only/bundles/${holderRecord.operationId}/deployment-bundle.tar`,
      reuse,
    ]);
    const offset = (await audit()).length;
    assert.equal((await f.deploy(holderRecord, reuse)).status, 78);
    assert.doesNotMatch((await audit()).slice(offset), /migrate deploy|up -d/);
    assert.equal((await f.verify(holderRecord)).status, 0);
  });
  await f.scenario(
    "extra_release_file_rejected_without_overwrite",
    async () => {
      const path = `${f.target}/releases/${a.sha}/task9-extra`,
        retry = attempt(a, "extra-file");
      await writeFile(path, "owned negative fixture");
      const before = await releaseBytes(`${f.target}/releases/${a.sha}`),
        beforeData = await data();
      try {
        const offset = (await audit()).length;
        assert.equal(
          (await f.deploy(retry, await f.stage(retry, await f.backup(retry))))
            .status,
          78,
        );
        assert.deepEqual(
          await releaseBytes(`${f.target}/releases/${a.sha}`),
          before,
        );
        assert.equal(await data(), beforeData);
        assert.doesNotMatch(
          (await audit()).slice(offset),
          /migrate deploy|up -d/,
        );
      } finally {
        await rm(path);
      }
    },
  );
  for (const fault of ["swap", "duplicate-yaml"])
    await f.scenario(`compose_${fault}_zero_migration_apply`, async () => {
      const sha = digest(`fixture-${fault}-${a.sha}`),
        record = {
          ...a,
          sha,
          operationId: `config-${fault}-${randomUUID()}`,
          manifest: { ...a.manifest, releaseSha: sha },
          directory: `/local-only/config-artifact-${fault}`,
        };
      await cp(a.directory, record.directory, { recursive: true });
      await json(`${record.directory}/release-manifest.json`, record.manifest);
      await writeFile(
        `${record.directory}/release-manifest.sha256`,
        `${digest(await readFile(`${record.directory}/release-manifest.json`))}  release-manifest.json\n`,
      );
      await makeRehearsalArtifact(record, { refreshOnly: true });
      const original = await readFile(
        `${f.root}/deploy/compose.production.yml`,
        "utf8",
      );
      const text =
        fault === "swap"
          ? original.replace(
              "image: ${MKW_API_IMAGE:?MKW_API_IMAGE immutable digest is required}",
              "image: ${MKW_WEB_IMAGE:?}",
            )
          : `${original}\nservices: {}\n`;
      const stage = await f.stage(record, await f.backup(record), {
        composeText: text,
      });
      const beforeData = await data(),
        apiConfig = await readFile(`${f.target}/shared/api.env`),
        current = await readFile(`${f.target}/current/compose.rendered.yml`),
        offset = (await audit()).length;
      assert.equal((await f.deploy(record, stage)).status, 78);
      assert.equal(await data(), beforeData);
      assert.deepEqual(await readFile(`${f.target}/shared/api.env`), apiConfig);
      assert.deepEqual(
        await readFile(`${f.target}/current/compose.rendered.yml`),
        current,
      );
      assert.doesNotMatch(
        (await audit()).slice(offset),
        /migrate deploy|up -d/,
      );
      const last = (await events(record.operationId)).at(-1);
      assert.equal(last.phase, "config-staged");
      assert.equal(last.status, "failed");
    });
  await f.scenario(
    "exact_receipt_ignores_later_foreign_operation",
    async () => {
      const current = f.currentRelease;
      const receipt = await readOperationReceipt(
        `${f.target}/operations/${current.operationId}`,
        identity(current),
      );
      const id = `foreign-${randomUUID()}`,
        dir = `${f.target}/operations/${id}`;
      await mkdir(dir);
      await writeOperationEvent(dir, {
        ...receipt,
        operationId: id,
        eventId: randomUUID(),
        sequence: 1,
        utc: new Date(Date.now() + 1000).toISOString(),
      });
      assert.equal((await f.verify(current)).status, 0);
      assert.equal(
        (await f.verify({ ...current, operationId: id })).status,
        78,
      );
    },
  );
  const b = await f.build("B");
  await f.scenario("new_real_images_preserve_postgres_data", async () => {
    const before = await database();
    assert.notEqual(a.manifest.apiImage, b.manifest.apiImage);
    assert.notEqual(a.manifest.webImage, b.manifest.webImage);
    assert.equal(
      (await f.deploy(b, await f.stage(b, await f.backup(b)))).status,
      0,
    );
    f.currentRelease = b;
    assert.equal((await f.verify(b)).status, 0);
    assert.deepEqual(await database(), before);
  });
  await f.scenario(
    "manual_old_release_current_controls_app_only_rollback",
    () => recover(a),
  );
  await f.scenario(
    "postgres_mismatch_rejects_before_config_apply",
    async () => {
      const sha = digest(`pg-mismatch-${a.sha}`),
        record = {
          ...a,
          sha,
          manifest: {
            ...a.manifest,
            releaseSha: sha,
            postgresImage: `postgres@sha256:${"8".repeat(64)}`,
          },
          operationId: `pg-mismatch-${randomUUID()}`,
          directory: "/local-only/pg-mismatch-artifact",
        };
      await cp(a.directory, record.directory, { recursive: true });
      await json(`${record.directory}/release-manifest.json`, record.manifest);
      await writeFile(
        `${record.directory}/release-manifest.sha256`,
        `${digest(await readFile(`${record.directory}/release-manifest.json`))}  release-manifest.json\n`,
      );
      await makeRehearsalArtifact(record, { refreshOnly: true });
      const metadata = await f.backup(f.currentRelease),
        stage = await f.stage(record, metadata, {
          rollback: await canonicalBackup(metadata),
        });
      const before = await database(),
        config = await readFile(`${f.target}/current/compose.rendered.yml`),
        offset = (await audit()).length;
      const result = await f.deploy(record, stage, {
        MKW_OPERATION_KIND: "application-rollback",
        MKW_SIMPLE_RELEASE: "false",
      });
      assert.equal(result.status, 78);
      assert.match(result.stderr, /PostgreSQL runtime digest mismatch/);
      assert.deepEqual(await database(), before);
      assert.deepEqual(
        await readFile(`${f.target}/current/compose.rendered.yml`),
        config,
      );
      assert.doesNotMatch(
        (await audit()).slice(offset),
        /migrate deploy|up -d/,
      );
    },
  );
  await f.scenario(
    "config_publication_failure_is_uncertain_not_success",
    async () => {
      const record = attempt(a, "config-interrupt"),
        staged = await f.stage(record, await f.backup(record));
      const path = `${f.target}/current/compose.rendered.yml`,
        saved = "/local-only/current-before-failure";
      const oldApiEnv = await readFile(`${f.target}/shared/api.env`);
      await rename(path, saved);
      await mkdir(path);
      try {
        const offset = (await audit()).length,
          result = await f.deploy(record, staged, {
            MKW_WEB_ORIGIN: "https://changed.local.invalid",
          });
        assert.equal(result.status, 78);
        assert.notDeepEqual(
          await readFile(`${f.target}/shared/api.env`),
          oldApiEnv,
        );
        const last = (await events(record.operationId)).at(-1);
        assert.equal(last.status, "failed");
        assert.equal(last.phase, "api-config-published");
        assert.doesNotMatch(
          (await audit()).slice(offset),
          /migrate deploy|up -d/,
        );
        await assert.rejects(
          readOperationReceipt(
            `${f.target}/operations/${record.operationId}`,
            identity(record),
          ),
        );
      } finally {
        await rm(path, { recursive: true });
        await rename(saved, path);
      }
      assert.equal((await f.verify(record)).status, 78);
      await recover(a);
    },
  );
  await f.scenario(
    "migration_failure_stops_app_and_requires_recovery",
    async () => {
      const record = attempt(a, "migration-fail"),
        staged = await f.stage(record, await f.backup(record));
      const before = await data(),
        offset = (await audit()).length;
      await f.sql(
        `INSERT INTO _prisma_migrations(id,checksum,migration_name,started_at,applied_steps_count) VALUES('task9-owned-failure','${"0".repeat(64)}','task9_owned_failed',clock_timestamp(),0);`,
      );
      try {
        const result = await f.deploy(record, staged);
        assert.notEqual(result.status, 0);
        const last = (await events(record.operationId)).at(-1);
        assert.equal(last.status, "failed");
        assert.equal(last.phase, "db-prepared");
        const calls = (await audit()).slice(offset);
        assert.match(calls, /migrate deploy/);
        assert.doesNotMatch(calls, /--remove-orphans|--no-deps api gateway/);
        assert.equal(await data(), before);
        await assert.rejects(
          readOperationReceipt(
            `${f.target}/operations/${record.operationId}`,
            identity(record),
          ),
        );
      } finally {
        await f.sql(
          "DELETE FROM _prisma_migrations WHERE id='task9-owned-failure';",
        );
      }
      await recover(a);
    },
  );
  await f.scenario("missing_terminal_blocks_forward_retry", async () => {
    const record = f.currentRelease,
      dir = `${f.target}/operations/${record.operationId}`;
    const terminal = (await events(record.operationId)).find(
      (e) => e.status === "ok",
    );
    const path = `${dir}/${record.operationId}.${terminal.eventId}.json`,
      bytes = await readFile(path);
    // Owned fixture models SIGKILL's missing terminal; actual signal test remains
    // separately exercised by the Linux lifecycle suite in this same engine.
    await rm(path);
    try {
      assert.equal((await f.verify(record)).status, 78);
      const retry = attempt(a, "uncertain-retry"),
        offset = (await audit()).length;
      const result = await f.deploy(
        retry,
        await f.stage(retry, await f.backup(retry)),
      );
      assert.equal(result.status, 78);
      assert.match(result.stderr, /previous operation uncertain/);
      assert.doesNotMatch(
        (await audit()).slice(offset),
        /migrate deploy|up -d/,
      );
    } finally {
      await writeFile(path, bytes);
    }
  });
  await f.scenario("privileged_exdev_and_bind_publish_boundaries", async () => {
    const output = await f.run(
      "node",
      [
        "--test",
        "--test-reporter=tap",
        "--test-name-pattern",
        "real Linux EXDEV",
        "tests/product-tooling/release-bundle.test.mjs",
      ],
      { env: { ...process.env, MKW_TEST_REAL_RENAME: "1" } },
    );
    assert.match(output, /# pass 1/);
    assert.match(output, /# skipped 0/);
    await writeFile(`${f.evidence}/privileged-rename.tap`, output);
  });
  await f.scenario("actual_sigkill_lifecycle_boundary_suite", async () => {
    const result = await f.command("node", [
      "--test",
      "--test-reporter=tap",
      "--test-name-pattern",
      "interruption without terminal",
      "tests/product-tooling/deploy-publish.test.mjs",
    ]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /# pass 1/);
    assert.match(result.stdout, /# skipped 0/);
    await writeFile(`${f.evidence}/sigkill-boundary.tap`, result.stdout);
  });
  await json(`${f.evidence}/release-final.json`, {
    sha: f.currentRelease.sha,
    operationId: f.currentRelease.operationId,
    database: await database(),
  });
}
