import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as release from "../../scripts/product/release/verify-release.mjs";

const SHA = "a".repeat(40);
const API = "ghcr.io/minh-khue/api@sha256:" + "1".repeat(64);
const WEB = "ghcr.io/minh-khue/web@sha256:" + "2".repeat(64);
const PG = "postgres@sha256:" + "3".repeat(64);

function manifest(overrides = {}) {
  return {
    schemaVersion: "1",
    releaseSha: SHA,
    sourceRepository: "minh-khue/workforce",
    createdAt: "2026-11-15T10:00:00Z",
    apiImage: API,
    webImage: WEB,
    postgresImage: PG,
    artifacts: {
      sbom: { sha256: "4".repeat(64), size: 120 },
      provenance: { sha256: "5".repeat(64), size: 220 },
    },
    ...overrides,
  };
}

function composeConfig() {
  return {
    services: {
      api: { image: API },
      gateway: { image: WEB },
      db: { image: PG },
    },
  };
}

test("service_mapping_exact accepts immutable production service images", () => {
  assert.equal(typeof release.verifyResolvedRelease, "function");
  assert.deepEqual(
    release.verifyResolvedRelease({
      manifest: manifest(),
      expectedSha: SHA,
      composeConfig: composeConfig(),
    }),
    { ok: true, errors: [] },
  );
});

test("service_mapping_exact rejects swaps, decoys, wrong service sets and shapes", () => {
  assert.equal(typeof release.verifyResolvedRelease, "function");
  const invalid = [
    [
      "api/gateway swap",
      { api: { image: WEB }, gateway: { image: API }, db: { image: PG } },
    ],
    [
      "api/db swap",
      { api: { image: PG }, gateway: { image: WEB }, db: { image: API } },
    ],
    [
      "gateway/db swap",
      { api: { image: API }, gateway: { image: PG }, db: { image: WEB } },
    ],
    ["missing api", { gateway: { image: WEB }, db: { image: PG } }],
    ["missing gateway", { api: { image: API }, db: { image: PG } }],
    ["missing db", { api: { image: API }, gateway: { image: WEB } }],
    [
      "legacy web service",
      { api: { image: API }, web: { image: WEB }, db: { image: PG } },
    ],
    ["extra service", { ...composeConfig().services, worker: { image: API } }],
    ["no services", {}],
    ["null services", null],
    ["array services", []],
    ["string services", "api gateway db"],
  ];
  for (const name of ["api", "gateway", "db"]) {
    for (const value of [
      null,
      [],
      "image",
      {},
      { image: null },
      { image: [API] },
      { image: "image:latest" },
    ]) {
      invalid.push([
        `${name}: ${JSON.stringify(value)}`,
        { ...composeConfig().services, [name]: value },
      ]);
    }
  }
  for (const [label, services] of invalid) {
    const result = release.verifyResolvedRelease({
      manifest: manifest(),
      expectedSha: SHA,
      composeConfig: { services },
    });
    assert.equal(result.ok, false, label);
    assert.ok(result.errors.length > 0, label);
  }
  for (const config of [
    null,
    [],
    "services",
    42,
    {},
    {
      ...composeConfig(),
      services: { ...composeConfig().services, api: { image: WEB } },
      "x-api-image": API,
      comment: `# image: ${API}`,
    },
  ]) {
    const result = release.verifyResolvedRelease({
      manifest: manifest(),
      expectedSha: SHA,
      composeConfig: config,
    });
    assert.equal(result.ok, false, JSON.stringify(config));
    assert.ok(result.errors.length > 0);
  }
});

test("service_mapping_exact validates the complete manifest and expected SHA", () => {
  assert.equal(typeof release.verifyResolvedRelease, "function");
  for (const value of [
    null,
    [],
    {},
    manifest({ extra: true }),
    manifest({ schemaVersion: "2" }),
    manifest({ artifacts: {} }),
    manifest({ sourceRepository: "bad" }),
    manifest({ createdAt: "bad" }),
    manifest({ postgresImage: API }),
    manifest({ apiImage: "api:latest" }),
    manifest({ webImage: "web:latest" }),
    manifest({ postgresImage: "postgres:latest" }),
  ]) {
    const result = release.verifyResolvedRelease({
      manifest: value,
      expectedSha: SHA,
      composeConfig: composeConfig(),
    });
    assert.equal(result.ok, false, JSON.stringify(value));
    assert.ok(result.errors.length > 0);
  }
  for (const expectedSha of [undefined, null, 42, "", "b".repeat(40)]) {
    const result = release.verifyResolvedRelease({
      manifest: manifest(),
      expectedSha,
      composeConfig: composeConfig(),
    });
    assert.equal(result.ok, false, String(expectedSha));
    assert.match(result.errors.join("\n"), /SHA/i);
  }
  const result = release.verifyResolvedRelease({
    manifest: manifest({ releaseSha: "bad" }),
    expectedSha: "bad",
    composeConfig: composeConfig(),
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /releaseSha/i);
});

test("resolved_json_parser_is_strict preserves config and rejects malformed or duplicate fields", () => {
  assert.equal(typeof release.parseResolvedCompose, "function");
  assert.deepEqual(
    release.parseResolvedCompose(JSON.stringify(composeConfig())),
    composeConfig(),
  );
  for (const text of [
    "",
    "{",
    '{"services":}',
    '{"services":{}} {}',
    '{"services":{},}',
    '{"services":{},"services":{}}',
    '{"services":{"api":{},"api":{}}}',
    '{"services":{"api":{"image":"one","image":"two"}}}',
    '{"services":{"api":{},"\\u0061pi":{}}}',
    '{"x-list":[{"key":1,"key":2}]}',
  ]) {
    assert.throws(() => release.parseResolvedCompose(text), undefined, text);
  }
});

async function withCompose(run) {
  const dir = await mkdtemp(join(tmpdir(), "mkw-task3-compose-"));
  try {
    const file = join(dir, "compose.yml");
    const envFile = join(dir, "empty.env");
    await writeFile(envFile, "");
    await run(async (yaml) => {
      await writeFile(file, yaml);
      const result = spawnSync(
        "docker",
        [
          "compose",
          "--project-name",
          "mkw-task3-config",
          "--project-directory",
          dir,
          "--env-file",
          envFile,
          "--file",
          file,
          "config",
          "--format",
          "json",
        ],
        { cwd: dir, encoding: "utf8", timeout: 30_000 },
      );
      assert.ifError(result.error);
      assert.equal(result.signal, null, result.stderr);
      return result;
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const VALID_YAML = `services:
  api:
    image: ${API}
  gateway:
    image: ${WEB}
  db:
    image: ${PG}
`;

test("compose_parser_rejects_duplicate_and_invalid_yaml with the real Compose client", async (t) => {
  await withCompose(async (resolve) => {
    const valid = await resolve(VALID_YAML);
    assert.equal(valid.status, 0, valid.stderr);
    for (const [label, yaml] of [
      ["duplicate service", VALID_YAML + `  api:\n    image: ${WEB}\n`],
      [
        "duplicate image",
        VALID_YAML.replace(
          `    image: ${API}`,
          `    image: ${API}\n    image: ${WEB}`,
        ),
      ],
      ["invalid YAML", "services:\n  api: [\n"],
    ]) {
      const result = await resolve(yaml);
      assert.notEqual(result.status, 0, label);
      assert.notEqual(result.stderr, "", label);
      t.diagnostic(`${label}: exit=${result.status}; ${result.stderr.trim()}`);
    }
    assert.equal(typeof release.parseResolvedCompose, "function");
    assert.equal(typeof release.verifyResolvedRelease, "function");
    assert.deepEqual(
      release.verifyResolvedRelease({
        manifest: manifest(),
        expectedSha: SHA,
        composeConfig: release.parseResolvedCompose(valid.stdout),
      }),
      { ok: true, errors: [] },
    );
    for (const [label, yaml] of [
      [
        "swapped images",
        VALID_YAML.replace(API, "SWAP").replace(WEB, API).replace("SWAP", WEB),
      ],
      [
        "comment/extension image decoy",
        `x-api-image: ${API}\n# image: ${API}\n` + VALID_YAML.replace(API, WEB),
      ],
      ["extra service", VALID_YAML + `  worker:\n    image: ${API}\n`],
      ["mutable image", VALID_YAML.replace(API, "api:latest")],
    ]) {
      const result = await resolve(yaml);
      assert.equal(result.status, 0, result.stderr);
      const verified = release.verifyResolvedRelease({
        manifest: manifest(),
        expectedSha: SHA,
        composeConfig: release.parseResolvedCompose(result.stdout),
      });
      assert.equal(verified.ok, false, label);
      assert.ok(verified.errors.length > 0, label);
    }
  });
});
