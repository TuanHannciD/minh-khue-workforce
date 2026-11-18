import test from "node:test";
import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { bashPath, runBash } from "./fixtures/deploy-account.mjs";
import { entrypointFixture, linuxOnly } from "./fixtures/deploy-entrypoint.mjs";
import { writeOperationEvent } from "../../scripts/product/release/operation-receipts.mjs";
import { randomUUID } from "node:crypto";

const ROOT = resolve(import.meta.dirname, "../..");
const HELPER = bashPath(join(ROOT, "scripts/product/release/deploy-config.sh"));
const SHA = "a".repeat(40);
const dockerPath = (
  await runBash("-c", ["command -v docker"], { cwd: ROOT })
).stdout.trim();
const images = {
  api: `ghcr.io/example/api@sha256:${"1".repeat(64)}`,
  gateway: `ghcr.io/example/web@sha256:${"2".repeat(64)}`,
  db: `postgres@sha256:${"3".repeat(64)}`,
};

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "mkw-config-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const p of ["bin", "shared", "current", "operations/op-1"])
    await mkdir(join(root, p), { recursive: true });
  await writeFile(
    join(root, "shared/api.env"),
    "DATABASE_URL=fixture-private\nWEB_ORIGIN=https://old.test\nTLS_TERMINATED=false\n",
  );
  await writeFile(join(root, "shared/db.env"), "POSTGRES_DB=mkw\n");
  await writeFile(join(root, "current/compose.rendered.yml"), "old-compose\n");
  await writeFile(
    join(root, "manifest.json"),
    JSON.stringify({
      schemaVersion: "1",
      releaseSha: SHA,
      sourceRepository: "example/project",
      createdAt: "2026-11-15T00:00:00Z",
      apiImage: images.api,
      webImage: images.gateway,
      postgresImage: images.db,
      artifacts: {
        sbom: { sha256: "4".repeat(64), size: 1 },
        provenance: { sha256: "5".repeat(64), size: 1 },
      },
    }),
  );
  await writeFile(join(root, "compose.yml"), "services: {}\n");
  await writeFile(
    join(root, "resolved.json"),
    JSON.stringify({
      services: Object.fromEntries(
        Object.entries(images).map(([s, image]) => [s, { image }]),
      ),
    }),
  );
  await writeFile(
    join(root, "bin/docker"),
    '#!/usr/bin/env bash\nif [[ "${CONFIG_FAIL:-false}" == true ]]; then echo fixture-private >&2; exit 19; fi\ncat "$FIXTURE_RESOLVED"\n',
  );
  await chmod(join(root, "bin/docker"), 0o755);
  const invoke = (script, env = {}) =>
    runBash(
      "-c",
      [
        `set -Eeuo pipefail
run_node() { node "$@"; }
source "$HELPER"
if [[ "\${USE_REAL_COMPOSE:-false}" == true ]]; then docker() { "$REAL_DOCKER" "$@"; }; fi
phase=validated
record_operation_event() { printf '%s %s\\n' "$1" "$2" >> "$MKW_DEPLOY_PATH/events"; }
operation_dir="$MKW_DEPLOY_PATH/operations/op-1"
manifest="$MKW_DEPLOY_PATH/manifest.json"
${script}`,
        "fixture",
      ],
      {
        cwd: ROOT,
        env: {
          PATH: `${join(root, "bin")}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`,
          HELPER,
          MKW_DEPLOY_PATH: bashPath(root),
          MKW_PROJECT_NAME: "fixture",
          MKW_RELEASE_SHA: SHA,
          MKW_WEB_ORIGIN: "https://new.test",
          MKW_CONTROL_ROOT: bashPath(ROOT),
          FIXTURE_RESOLVED: bashPath(join(root, "resolved.json")),
          REAL_DOCKER: dockerPath,
          ...env,
        },
      },
    );
  return { root, invoke };
}

test("stage config validates exact resolved JSON and preserves live files until publication", async (t) => {
  const f = await fixture(t);
  const result = await f.invoke(
    'stage_deploy_config "$MKW_DEPLOY_PATH/compose.yml" "$operation_dir"\ntest "$phase" = config-staged\npublish_deploy_config "$operation_dir"',
  );
  assert.equal(result.code, 0, result.stderr);
  assert.match(
    await readFile(join(f.root, "shared/api.env"), "utf8"),
    /DATABASE_URL=fixture-private\nWEB_ORIGIN=https:\/\/new.test\nTLS_TERMINATED=true/,
  );
  assert.deepEqual(
    JSON.parse(
      await readFile(join(f.root, "current/compose.rendered.yml"), "utf8"),
    ).services.api,
    { image: images.api },
  );
  assert.equal(
    await readFile(join(f.root, "events"), "utf8"),
    "in-progress config-staged\nin-progress api-config-published\nin-progress compose-config-published\n",
  );
});

for (const kind of [
  "command",
  "malformed",
  "duplicate",
  "swap",
  "missing",
  "extra",
  "mutable",
])
  test(`config validation ${kind} fails78 before live publication`, async (t) => {
    const f = await fixture(t);
    const services = Object.fromEntries(
      Object.entries(images).map(([s, image]) => [s, { image }]),
    );
    if (kind === "swap")
      [services.api.image, services.gateway.image] = [
        services.gateway.image,
        services.api.image,
      ];
    if (kind === "missing") delete services.api;
    if (kind === "extra") services.worker = { image: images.api };
    if (kind === "mutable") services.api.image = "api:latest";
    await writeFile(
      join(f.root, "resolved.json"),
      kind === "malformed"
        ? "fixture-private"
        : kind === "duplicate"
          ? '{"services":{},"services":{}}'
          : JSON.stringify({ services }),
    );
    const result = await f.invoke(
      'stage_deploy_config "$MKW_DEPLOY_PATH/compose.yml" "$operation_dir"\npublish_deploy_config "$operation_dir"',
      { CONFIG_FAIL: String(kind === "command") },
    );
    assert.equal(result.code, 78, result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, /fixture-private/);
    assert.equal(
      await readFile(join(f.root, "current/compose.rendered.yml"), "utf8"),
      "old-compose\n",
    );
    assert.match(
      await readFile(join(f.root, "shared/api.env"), "utf8"),
      /https:\/\/old.test/,
    );
  });

test("second config rename failure leaves accurate first-publish phase and no silent restore", async (t) => {
  const f = await fixture(t);
  const result =
    await f.invoke(`stage_deploy_config "$MKW_DEPLOY_PATH/compose.yml" "$operation_dir"
eval "$(declare -f rename_deploy_file | sed '1s/rename_deploy_file/real_rename_deploy_file/')"
rename_deploy_file() { if [[ "$2" == *compose.rendered.yml ]]; then return 96; fi; real_rename_deploy_file "$@"; }
trap 'code=$?; printf "%s\\n" "$phase" > "$MKW_DEPLOY_PATH/failed-phase"; exit "$code"' EXIT
publish_deploy_config "$operation_dir"`);
  assert.equal(result.code, 96, result.stderr);
  assert.equal(
    await readFile(join(f.root, "failed-phase"), "utf8"),
    "api-config-published\n",
  );
  assert.match(
    await readFile(join(f.root, "shared/api.env"), "utf8"),
    /https:\/\/new.test/,
  );
  assert.equal(
    await readFile(join(f.root, "current/compose.rendered.yml"), "utf8"),
    "old-compose\n",
  );
});

test(
  "full entrypoint second config rename failure records terminal phase and blocks same/new operation retries",
  { skip: linuxOnly },
  async (t) => {
    const f = await entrypointFixture(t);
    const preload = join(f.root, "fail-compose-rename.mjs");
    const marker = join(f.root, "rename-failed");
    // Inject only the external fs.rename boundary in child Node processes.
    // Entrypoint, helpers, ERR/EXIT traps and receipt writer remain untouched.
    await writeFile(
      preload,
      `
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
const rename = fs.rename;
fs.rename = async (source, destination) => {
  if (source === process.env.FAIL_COMPOSE_SOURCE && destination === process.env.FAIL_COMPOSE_DESTINATION) {
    await fs.writeFile(process.env.FAIL_COMPOSE_MARKER, 'EACCES\\n', { flag: 'wx' });
    throw Object.assign(new Error('injected rename failure'), { code: 'EACCES' });
  }
  return rename(source, destination);
};
syncBuiltinESMExports();
`,
    );
    const result = await f.start("op-a", await f.stage("op-a"), {
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${pathToFileURL(preload).href}`,
      FAIL_COMPOSE_SOURCE: join(f.root, "operations/op-a/compose.rendered.yml"),
      FAIL_COMPOSE_DESTINATION: join(f.root, "current/compose.rendered.yml"),
      FAIL_COMPOSE_MARKER: marker,
    }).result;
    // rename_deploy_file maps filesystem EACCES to policy exit78. The actual
    // lifecycle must retain that primary exit through failed-receipt cleanup.
    assert.equal(result.code, 78, result.stderr);
    assert.match(result.stderr, /config rename failed/);
    assert.equal(await readFile(marker, "utf8"), "EACCES\n");
    const api = await readFile(join(f.root, "shared/api.env"));
    const compose = await readFile(
      join(f.root, "current/compose.rendered.yml"),
    );
    assert.match(
      api.toString(),
      /WEB_ORIGIN=https:\/\/new.test\nTLS_TERMINATED=true/,
    );
    assert.equal(compose.toString(), "old-config\n");
    const events = await f.events("op-a");
    const terminal = events.filter((event) => event.status !== "in-progress");
    assert.equal(terminal.length, 1);
    assert.equal(terminal[0].status, "failed");
    assert.equal(terminal[0].phase, "api-config-published");
    assert.equal(terminal[0].mutationStarted, true);
    assert.equal(terminal[0].registry.pull, "verified");
    assert.equal(
      events.some((event) => event.phase === "compose-config-published"),
      false,
    );
    const pointer = await readFile(
      join(f.root, "shared/deploy-operation.json"),
    );
    assert.equal(JSON.parse(pointer).operationId, "op-a");
    const verify = await f.verify("op-a");
    assert.equal(verify.code, 78, verify.stderr);
    for (const id of ["op-a", "op-b"]) {
      const retry = await f.start(id, await f.stage(id)).result;
      assert.equal(retry.code, 78, retry.stderr);
      if (id === "op-b") {
        assert.match(
          retry.stderr,
          /previous operation uncertain.*runtime inspected/,
        );
        assert.match(
          await readFile(
            join(f.root, "operations/op-b/previous-uncertainty.txt"),
            "utf8",
          ),
          /runtime inspection attempted/,
        );
      }
      assert.deepEqual(await readFile(join(f.root, "shared/api.env")), api);
      assert.deepEqual(
        await readFile(join(f.root, "current/compose.rendered.yml")),
        compose,
      );
      assert.deepEqual(
        await readFile(join(f.root, "shared/deploy-operation.json")),
        pointer,
      );
      assert.deepEqual(await f.events("op-a"), events);
    }
    // The Docker double records every up/run, including DB preparation,
    // migration and application apply. None may run on failure or either retry.
    await assert.rejects(readFile(join(f.root, "mutations")), {
      code: "ENOENT",
    });
  },
);

test("actual Compose client stages structured config and rejects duplicate/invalid YAML before publication", async (t) => {
  const f = await fixture(t);
  const yaml = `services:
  api:
    image: ${images.api}
    env_file: ./shared/api.env
  gateway:
    image: ${images.gateway}
  db:
    image: ${images.db}
    env_file: ./shared/db.env
`;
  for (const [name, input, code] of [
    ["valid", yaml, 0],
    ["duplicate service", yaml + `  api:\n    image: ${images.api}\n`, 78],
    [
      "duplicate image",
      yaml.replace(
        `    image: ${images.api}`,
        `    image: ${images.api}\n    image: ${images.gateway}`,
      ),
      78,
    ],
    ["invalid YAML", "services: [\n", 78],
  ]) {
    await writeFile(join(f.root, "compose.yml"), input);
    const r = await f.invoke(
      'stage_deploy_config "$MKW_DEPLOY_PATH/compose.yml" "$operation_dir"',
      { USE_REAL_COMPOSE: "true" },
    );
    assert.equal(r.code, code, `${name}: ${r.stderr}`);
    assert.doesNotMatch(r.stdout + r.stderr, /fixture-private/);
    assert.match(
      await readFile(join(f.root, "shared/api.env"), "utf8"),
      /https:\/\/old.test/,
    );
    assert.equal(
      await readFile(join(f.root, "current/compose.rendered.yml"), "utf8"),
      "old-compose\n",
    );
    if (code === 0) {
      const candidate = await readFile(
        join(f.root, "operations/op-1/compose.rendered.yml"),
        "utf8",
      );
      assert.doesNotMatch(candidate, /fixture-private/);
      assert.equal(JSON.parse(candidate).services.api.env_file.length, 1);
    }
  }
});

test("atomic operation pointer and incomplete-operation runtime inspection fail closed", async (t) => {
  const f = await fixture(t);
  await mkdir(join(f.root, "operations/interrupted"));
  const result = await f.invoke(`MKW_OPERATION_ID=op-1
release_sha="$MKW_RELEASE_SHA"
MKW_CONTROL_SHA=${"c".repeat(40)}
MKW_OPERATION_KIND=release
write_deploy_pointer
inspect_previous_operation`);
  assert.equal(result.code, 78, result.stderr);
  assert.match(
    result.stderr,
    /previous operation uncertain.*runtime inspected/,
  );
  assert.deepEqual(
    JSON.parse(await readFile(join(f.root, "shared/deploy-operation.json"))),
    { operationId: "op-1", releaseSha: SHA, controlSha: "c".repeat(40) },
  );
  assert.equal(
    await readFile(join(f.root, "current/compose.rendered.yml"), "utf8"),
    "old-compose\n",
  );
  assert.match(
    await readFile(
      join(f.root, "operations/op-1/previous-uncertainty.txt"),
      "utf8",
    ),
    /runtime inspection attempted/,
  );
});

test("successful protected recovery covers preserved uncertainty across later forward operations", async (t) => {
  const f = await fixture(t),
    controlSha = "c".repeat(40);
  for (const id of ["interrupted", "recovery"])
    await mkdir(join(f.root, "operations", id));
  await mkdir(join(f.root, "releases", SHA), { recursive: true });
  await writeFile(
    join(f.root, "releases", SHA, "release-manifest.json"),
    await readFile(join(f.root, "manifest.json")),
  );
  const event = (operationId, operation) => ({
    schemaVersion: 1,
    operationId,
    operation,
    eventId: randomUUID(),
    sequence: 1,
    releaseSha: SHA,
    imageDigests: { api: images.api, web: images.gateway, postgres: images.db },
    status: "ok",
    phase: "smoke-complete",
    utc: new Date().toISOString(),
    mutationStarted: true,
    registry: { host: "ghcr.io", auth: "public", pull: "verified" },
    attestationVerification: "not-applicable",
    rollbackScope: "application-only",
    databaseRecovery: false,
    backupId: "fixture-backup",
    targetIdentity: "fixture-target",
    controlSha,
  });
  await writeOperationEvent(
    join(f.root, "operations/recovery"),
    event("recovery", "application-rollback"),
  );
  await writeFile(
    join(f.root, "operations/recovery/previous-operation-ids.json"),
    JSON.stringify(["interrupted"]),
  );
  await writeFile(
    join(f.root, "shared/deploy-operation.json"),
    JSON.stringify({ operationId: "recovery", releaseSha: SHA, controlSha }),
  );
  const r = await f.invoke(
    "MKW_OPERATION_ID=op-1\nMKW_OPERATION_KIND=release\ninspect_previous_operation",
  );
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(
    JSON.parse(
      await readFile(
        join(f.root, "operations/op-1/previous-operation-ids.json"),
      ),
    ),
    ["interrupted"],
  );
  await writeOperationEvent(
    join(f.root, "operations/op-1"),
    event("op-1", "release"),
  );
  await writeFile(
    join(f.root, "shared/deploy-operation.json"),
    JSON.stringify({ operationId: "op-1", releaseSha: SHA, controlSha }),
  );
  await mkdir(join(f.root, "operations/next"));
  const next = await f.invoke(
    'MKW_OPERATION_ID=next\noperation_dir="$MKW_DEPLOY_PATH/operations/next"\nMKW_OPERATION_KIND=release\ninspect_previous_operation',
  );
  assert.equal(next.code, 0, next.stderr);
  assert.deepEqual(
    JSON.parse(
      await readFile(
        join(f.root, "operations/next/previous-operation-ids.json"),
      ),
    ),
    ["interrupted"],
  );
  assert.deepEqual(await readdir(join(f.root, "operations/interrupted")), []);
});
