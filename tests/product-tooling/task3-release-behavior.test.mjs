import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "../..");
const bash =
  process.env.MKW_TEST_BASH ||
  (process.platform === "win32"
    ? `${process.env.ProgramFiles}/Git/bin/bash.exe`
    : "bash");
const workflow = (name) =>
  readFile(join(root, ".github/workflows", name), "utf8");
const posix = (path) =>
  path
    .replaceAll("\\", "/")
    .replace(/^([a-z]):/i, (_, drive) => `/${drive.toLowerCase()}`);

function block(source, name, values = {}) {
  source = source.replaceAll("\r\n", "\n");
  const start = source.indexOf(`      - name: ${name}\n`);
  assert.notEqual(start, -1, `step missing: ${name}`);
  const tail = source.slice(start);
  const section = tail.slice(
    0,
    tail.indexOf("\n      - ", 1) < 0
      ? undefined
      : tail.indexOf("\n      - ", 1),
  );
  const run = section.indexOf("        run: |\n");
  assert.notEqual(run, -1, `run block missing: ${name}`);
  return (
    section
      .slice(run + "        run: |\n".length)
      .split("\n")
      .map((line) => line.replace(/^ {10}/, ""))
      .join("\n")
      // Model Actions expression substitution, including the vulnerable old blocks.
      .replace(/\$\{\{\s*([^}]+?)\s*\}\}/g, (_, expression) => {
        assert.ok(expression in values, `unresolved expression: ${expression}`);
        return values[expression];
      })
  );
}

function run(script, cwd, env = {}) {
  return spawnSync(bash, ["-Eeuo", "pipefail", "-c", script], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    windowsHide: true,
    timeout: 15_000,
  });
}

test("actual always receipt/signal/summary blocks preserve hostile inputs after checkout or validation failure", async () => {
  const source = await workflow("post-deploy-verify.yml");
  for (const result of ["success", "failure", "cancelled"]) {
    for (const releaseSha of [
      "a".repeat(40),
      'quote"value',
      "`touch payload-executed`",
      "$(touch payload-executed)",
      "first\nsecond",
    ]) {
      const cwd = await mkdtemp(join(tmpdir(), "mkw-receipt-"));
      const env = {
        RELEASE_SHA: releaseSha,
        ROLLBACK_ON_FAILURE: "true",
        JOB_STATUS: result,
        RUN_ID: '123"\nrun',
        GITHUB_STEP_SUMMARY: "summary",
      };
      const values = {
        "inputs.release_sha": releaseSha,
        "inputs.rollback_on_failure": "true",
        "job.status": result,
        "github.run_id": env.RUN_ID,
      };
      const receipt = run(
        block(source, "Record verification receipt", values),
        cwd,
        env,
      );
      assert.equal(receipt.status, 0, receipt.stdout + receipt.stderr);
      const data = JSON.parse(
        await readFile(join(cwd, "verification-receipt.json"), "utf8"),
      );
      assert.equal(data.releaseSha, releaseSha);
      assert.equal(data.rollbackOnFailure, true);
      assert.equal(data.result, result);
      let signal = JSON.parse(
        await readFile(join(cwd, "rollback-signal.json"), "utf8"),
      );
      assert.equal(signal.releaseSha, releaseSha);
      assert.equal(signal.runId, env.RUN_ID);
      if (result === "failure") {
        const failed = run(
          block(source, "Emit actionable rollback signal", values),
          cwd,
          env,
        );
        assert.equal(failed.status, 0, failed.stdout + failed.stderr);
        signal = JSON.parse(
          await readFile(join(cwd, "rollback-signal.json"), "utf8"),
        );
        assert.equal(signal.signal, "rollback-requested");
        assert.equal(signal.releaseSha, releaseSha);
        const summary = await readFile(join(cwd, "summary"), "utf8");
        assert.ok(summary.includes(JSON.stringify(releaseSha)));
      }
      assert.equal(
        await readFile(join(cwd, "payload-executed")).catch(() => null),
        null,
        "shell payload executed",
      );
    }
  }
});

test("entrypoint apply blocks reject DB mismatch before mutations and apply only old API/web on matching DB", async () => {
  const entrypoint = await readFile(
    join(root, "scripts/product/deploy-entrypoint.sh"),
    "utf8",
  );
  // Linux /home, bootstrap and flock prerequisites are outside this fixture.
  // Execute the exact remaining apply path, including guard, render and receipt.
  const marker = "# Hold the deployment lock";
  assert.ok(entrypoint.includes(marker));
  const apply = entrypoint.slice(entrypoint.indexOf(marker));
  const sha = "a".repeat(40);
  const images = {
    api: `ghcr.io/example/api@sha256:${"1".repeat(64)}`,
    web: `ghcr.io/example/web@sha256:${"2".repeat(64)}`,
    postgres: `postgres@sha256:${"3".repeat(64)}`,
  };
  const compose = `services:\n  db:\n    image: ${images.postgres}\n  api:\n    image: ${images.api}\n  gateway:\n    image: ${images.web}\n`;
  for (const mismatch of [true, false]) {
    const cwd = await mkdtemp(join(tmpdir(), "mkw-apply-"));
    for (const dir of ["bin", "shared", "current", "receipts"])
      await mkdir(join(cwd, dir));
    await writeFile(join(cwd, "shared/api.env"), "fixture-retained=true\n");
    await writeFile(join(cwd, "compose.yml"), compose);
    await writeFile(
      join(cwd, "manifest.json"),
      JSON.stringify({
        releaseSha: sha,
        apiImage: images.api,
        webImage: images.web,
        postgresImage: images.postgres,
      }),
    );
    await writeFile(
      join(cwd, "bin/docker"),
      `#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "$1" == ps ]]; then echo db-current; exit 0; fi
if [[ "$1" == inspect ]]; then printf 'true %s\\n' "$CURRENT_POSTGRES"; exit 0; fi
[[ "$1" == compose ]] || exit 99
case "$6" in
  config) printf '%s\\n' "$FIXTURE_COMPOSE" ;;
  run|up) printf '%s\\n' "$*" >> "$MUTATIONS" ;;
  ps) ;;
  *) exit 99 ;;
esac
`,
    );
    await chmod(join(cwd, "bin/docker"), 0o755);
    const result = run(
      `cd "$script_root"\nrun_node() { node "$@"; }\ncurl() { :; }\n${apply}`,
      cwd,
      {
        PATH: `${join(cwd, "bin")}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`,
        script_root: posix(root),
        MKW_DEPLOY_PATH: posix(cwd),
        MKW_PROJECT_NAME: "fixture",
        MKW_GATEWAY_PORT: "3200",
        MKW_RELEASE_SHA: sha,
        release_sha: sha,
        MKW_API_IMAGE: images.api,
        MKW_WEB_IMAGE: images.web,
        MKW_POSTGRES_IMAGE: images.postgres,
        MKW_OPERATION_KIND: "application-rollback",
        MKW_ATTESTATION_STATUS: "verified",
        MKW_WEB_ORIGIN: "https://example.test",
        manifest: posix(join(cwd, "manifest.json")),
        compose: posix(join(cwd, "compose.yml")),
        CURRENT_POSTGRES: mismatch
          ? `postgres@sha256:${"4".repeat(64)}`
          : images.postgres,
        FIXTURE_COMPOSE: compose,
        MUTATIONS: posix(join(cwd, "mutations")),
      },
    );
    assert.equal(
      result.status,
      mismatch ? 78 : 0,
      result.stdout + result.stderr,
    );
    if (mismatch) {
      assert.match(result.stderr, /PostgreSQL runtime digest mismatch/);
      for (const file of ["mutations", "current/compose.rendered.yml"])
        assert.equal(await readFile(join(cwd, file)).catch(() => null), null);
      assert.equal(
        await readFile(join(cwd, "shared/api.env"), "utf8"),
        "fixture-retained=true\n",
      );
    } else {
      const mutations = await readFile(join(cwd, "mutations"), "utf8");
      assert.match(mutations, /up -d --wait --no-deps api gateway/);
      assert.doesNotMatch(mutations, /up .* db(?:\n|$)|--remove-orphans/);
      const [file] = await readdir(join(cwd, "receipts"));
      const receipt = JSON.parse(
        await readFile(join(cwd, "receipts", file), "utf8"),
      );
      assert.equal(receipt.rollbackScope, "application-only");
      assert.equal(receipt.databaseRecovery, false);
      assert.deepEqual(receipt.imageDigests, images);
    }
  }
});

test("build rejects unknown attestation mode before registry work and honors the effective scoped value", async () => {
  const source = await workflow("build-release.yml");
  const script = block(source, "Validate attestation mode");
  const cwd = await mkdtemp(join(tmpdir(), "mkw-build-mode-"));
  // Actions supplies vars after organization < repository < environment precedence.
  // Build has no environment; an environment-only required value is absent here.
  for (const [effective, expected] of [
    ["", 0],
    ["off", 0],
    ["not-configured", 0],
    ["best-effort", 0],
    ["required", 0],
    ["requried", 78],
    ["$(touch payload-executed)", 78],
  ]) {
    const result = run(script, cwd, { ATTESTATION_MODE: effective });
    assert.equal(result.status, expected, result.stdout + result.stderr);
  }
  assert.equal(
    await readFile(join(cwd, "payload-executed")).catch(() => null),
    null,
  );
});

test("rollback uses current workflow controls for legacy payloads and serializes the runner receipt", async () => {
  const source = (await workflow("rollback.yml")).replaceAll("\r\n", "\n");
  const checkout = source.slice(
    source.indexOf("      - name: Checkout current rollback control tooling"),
    source.indexOf("      - name: Download and verify old manifest"),
  );
  assert.match(checkout, /ref: \$\{\{ github\.sha \}\}/);
  assert.doesNotMatch(checkout, /inputs\.old_release_sha/);
  const cwd = await mkdtemp(join(tmpdir(), "mkw-rollback-receipt-"));
  const old = "9f899308d6fdf1508ab75421e56457cf20e1f9b2";
  const control = "b".repeat(40);
  const reason =
    'incident-123 "quoted" `touch payload-executed` $(touch payload-executed)';
  const result = run(block(source, "Emit rollback receipt and signal"), cwd, {
    OLD_RELEASE_SHA: old,
    CONTROL_SHA: control,
    ROLLBACK_REASON: reason,
    ROLLBACK_RESULT: "failure",
    ATTESTATION_STATUS: "not-verified",
    GITHUB_STEP_SUMMARY: "summary",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const data = JSON.parse(
    await readFile(join(cwd, "rollback-receipt.json"), "utf8"),
  );
  assert.equal(data.oldReleaseSha, old);
  assert.equal(data.controlSha, control);
  assert.equal(data.reason, reason);
  assert.equal(data.databaseRecovery, false);
  assert.equal(data.scope, "application-only");
  assert.equal(data.attestationVerification, "not-verified");
  assert.equal(
    await readFile(join(cwd, "payload-executed")).catch(() => null),
    null,
  );
});

test("actual deploy verification fails closed for required and reflects effective repository/environment modes", async () => {
  const source = await workflow("deploy.yml");
  const script = block(source, "Verify release attestations when configured");
  const cwd = await mkdtemp(join(tmpdir(), "mkw-attestation-"));
  await mkdir(join(cwd, "bin"));
  await writeFile(
    join(cwd, "bin/gh"),
    '#!/usr/bin/env bash\nexit "$GH_RESULT"\n',
  );
  await chmod(join(cwd, "bin/gh"), 0o755);
  // These are literal effective values supplied by Actions, not a local claim
  // that repository or environment settings have been configured on GitHub.
  for (const [repositoryMode, environmentMode, ghResult, exit, status] of [
    ["required", undefined, "1", 78, "not-verified"],
    ["required", undefined, "0", 0, "verified"],
    ["best-effort", undefined, "1", 0, "not-verified"],
    ["required", "off", "1", 0, "not-configured"],
    ["off", "required", "1", 78, "not-verified"],
    ["", "required", "1", 78, "not-verified"],
    ["off", "requried", "0", 78, undefined],
  ]) {
    await writeFile(join(cwd, "outputs"), "");
    const result = run(script, cwd, {
      PATH: `${join(cwd, "bin")}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`,
      ATTESTATION_MODE: environmentMode ?? repositoryMode,
      GH_RESULT: ghResult,
      GITHUB_REPOSITORY: "example/mkw",
      GITHUB_OUTPUT: "outputs",
      GITHUB_STEP_SUMMARY: "summary",
    });
    assert.equal(result.status, exit, result.stdout + result.stderr);
    assert.equal(
      await readFile(join(cwd, "outputs"), "utf8"),
      status ? `status=${status}\n` : "",
    );
  }
});

test("actual PostgreSQL rollback guard rejects mismatched, missing, mutable, stopped or ambiguous runtime", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "mkw-postgres-guard-"));
  const bin = join(cwd, "bin");
  await mkdir(bin);
  await writeFile(
    join(bin, "docker"),
    `#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\\n' "$*" >> "$DOCKER_LOG"
if [[ "$*" == 'ps --filter label=com.docker.compose.project=fixture --filter label=com.docker.compose.service=db --format {{.ID}}' ]]; then printf '%s' "$CONTAINER_IDS"; exit 0; fi
if [[ "$*" == 'inspect --format {{.State.Running}} {{.Config.Image}} db-current' ]]; then printf '%s\\n' "$CURRENT_RUNTIME"; exit 0; fi
touch "$MUTATION_MARKER"
exit 99
`,
  );
  await chmod(join(bin, "docker"), 0o755);
  const digest = `sha256:${"1".repeat(64)}`;
  for (const [ids, runtime, expected] of [
    ["db-current", `true postgres:16@${digest}`, 0],
    ["db-current", `true postgres:17@sha256:${"2".repeat(64)}`, 78],
    ["", "", 78],
    ["db-current\ndb-other", `true postgres:16@${digest}`, 78],
    ["db-current", "true postgres:16", 78],
    ["db-current", `false postgres:16@${digest}`, 78],
  ]) {
    const result = run('bash "$GUARD"', cwd, {
      GUARD: posix(
        join(root, "scripts/product/release/verify-rollback-postgres.sh"),
      ),
      PATH: `${bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`,
      MKW_PROJECT_NAME: "fixture",
      MKW_POSTGRES_IMAGE: `postgres:16@${digest}`,
      CONTAINER_IDS: ids,
      CURRENT_RUNTIME: runtime,
      DOCKER_LOG: "docker.log",
      MUTATION_MARKER: "mutated",
    });
    assert.equal(result.status, expected, result.stdout + result.stderr);
    assert.equal(await readFile(join(cwd, "mutated")).catch(() => null), null);
  }
});
