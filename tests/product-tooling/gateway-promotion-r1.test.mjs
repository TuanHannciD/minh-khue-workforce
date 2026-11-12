import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { sample } from "./fixtures/gateway-operation.mjs";
import { promoteOperation } from "../../scripts/product/release/operation-state.mjs";
import { validVerifiedState } from "../../scripts/product/release/verified-state.mjs";
import { decideOrchestrationOutcome } from "../../scripts/product/release/orchestration-policy.mjs";
import { selectApiReuse } from "../../scripts/product/release/select-api-reuse.mjs";
import {
  buildPolicy,
  bindPolicy,
} from "../../scripts/product/release/gateway-policy.mjs";

const root = resolve(import.meta.dirname, "../..");
const bash =
  process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const posix = (p) =>
  p
    .replaceAll("\\", "/")
    .replace(/^([a-z]):/i, (_, drive) => `/${drive.toLowerCase()}`);
const options = (f, runtime) => ({
  operationId: f.state.operationId,
  releaseSha: f.state.releaseSha,
  database: f.state.after,
  verifiedAt: "2026-11-12T02:02:00Z",
  runtimeServices: runtime,
});
const mutations = [
  [
    "missing receipt",
    (s) => {
      delete s.dataOperationEvidence;
    },
  ],
  [
    "unknown migration",
    (s) => {
      s.migrationOutcome = "unknown";
    },
  ],
  [
    "unknown dataOperations",
    (s) => {
      s.dataOperations = "unknown";
    },
  ],
  [
    "missing class",
    (s) => {
      delete s.operationClass;
    },
  ],
  [
    "normal class",
    (s) => {
      s.operationClass = "normal";
    },
  ],
  [
    "canonical policy alone requires proof",
    (s) => {
      delete s.operationClass;
      delete s.gatewayPolicy;
      delete s.dataOperationEvidence;
      s.dataOperations = "unknown";
    },
  ],
  [
    "runtime API replacement",
    (s) => {
      s.runtimeServices.api.containerId = "d".repeat(64);
    },
  ],
  [
    "runtime PG restart",
    (s) => {
      s.runtimeServices.db.restartCount++;
    },
  ],
  [
    "receipt runtime replacement",
    (s) => {
      s.dataOperationEvidence.after.api.containerId = "e".repeat(64);
    },
  ],
  [
    "stale receipt",
    (s) => {
      s.dataOperationEvidence.recordedAt = "2026-11-12T01:01:00Z";
    },
  ],
  [
    "forged receipt operation",
    (s) => {
      s.dataOperationEvidence.operationId = "interleaved";
    },
  ],
  [
    "wrong canonical descriptor",
    (s) => {
      s.manifest.artifacts.releasePolicy.sha256 = "f".repeat(64);
    },
  ],
  [
    "wrong gateway policy",
    (s) => {
      s.gatewayPolicy.apiSourceSha = "e".repeat(40);
    },
  ],
  [
    "missing descriptor with markers",
    (s) => {
      delete s.manifest.artifacts.releasePolicy;
    },
  ],
];

for (const [name, mutate] of mutations) {
  test(`R1 gateway promotion and existing LKG refuse ${name}`, async () => {
    const { f, runtime } = sample();
    const healthy = promoteOperation(f.state, options(f, runtime));
    assert.equal(validVerifiedState(healthy), true);
    const pending = structuredClone(f.state);
    mutate(pending);
    assert.throws(
      () => promoteOperation(pending, options(f, runtime)),
      /incident-required/,
    );
    mutate(healthy);
    assert.equal(validVerifiedState(healthy), false);
    assert.throws(
      () =>
        decideOrchestrationOutcome({
          requestedSha: healthy.releaseSha,
          state: healthy,
        }),
      /incident-required/,
    );
    const result = await selectApiReuse(
      {
        previous: healthy,
        sha: "e".repeat(40),
        repository: f.repository,
        postgresImage: healthy.manifest.postgresImage,
        fingerprintAt: () => healthy.manifest.buildInputs.apiSourceFingerprint,
      },
      {
        artifact: () => {
          throw new Error("invalid LKG reached producer reuse");
        },
      },
    );
    assert.equal(result.mode, "build");
    assert.equal(result.apiImage, undefined);
  });
}

async function verifierBlock(t, mutate, expected) {
  const dir = await mkdtemp(join(tmpdir(), "mkw-gateway-promotion-r1-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "shared"));
  const { f, runtime } = sample();
  mutate(f.state, runtime);
  const before = JSON.stringify(f.state),
    oldGood = JSON.stringify(f.state.previousState);
  await writeFile(join(dir, "shared/current-state.json"), before);
  await writeFile(join(dir, "shared/last-known-good.json"), oldGood);
  await writeFile(join(dir, "database.json"), JSON.stringify(f.state.after));
  await writeFile(join(dir, "runtime.json"), JSON.stringify(runtime));
  const source = (
    await readFile(join(root, "scripts/product/post-deploy-verify.sh"), "utf8")
  ).replaceAll("\r\n", "\n");
  const start = source.indexOf(
    '  source "$script_root/scripts/product/release/operation-state.sh"',
  );
  assert.ok(start > 0);
  const block = source.slice(start, source.indexOf("\nelse\n", start));
  const result = spawnSync(bash, ["-Eeuo", "pipefail"], {
    encoding: "utf8",
    windowsHide: true,
    input:
      `run_node() { "$REAL_NODE" "$@"; }
bash() { case "$1" in *database-evidence.sh) cat "$DATABASE_CAPTURE";; *runtime-evidence.sh) cat "$RUNTIME_CAPTURE";; *) return 79;; esac; }
` + block,
    env: {
      ...process.env,
      REAL_NODE: posix(process.execPath),
      script_root: posix(root),
      rendered: "unused",
      MKW_DEPLOY_PATH: posix(dir),
      MKW_PROJECT_NAME: "fixture",
      MKW_POSTGRES_IMAGE: f.state.manifest.postgresImage,
      MKW_OPERATION_ID: f.state.operationId,
      RELEASE_SHA: f.state.releaseSha,
      DATABASE_CAPTURE: posix(join(dir, "database.json")),
      RUNTIME_CAPTURE: posix(join(dir, "runtime.json")),
    },
  });
  if (expected === "refuse") {
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stderr, /incident-required/);
    assert.equal(
      await readFile(join(dir, "shared/current-state.json"), "utf8"),
      before,
    );
    assert.equal(
      await readFile(join(dir, "shared/last-known-good.json"), "utf8"),
      oldGood,
    );
  } else {
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const current = await readFile(
      join(dir, "shared/current-state.json"),
      "utf8",
    );
    assert.equal(
      await readFile(join(dir, "shared/last-known-good.json"), "utf8"),
      current,
    );
    const state = JSON.parse(current);
    assert.equal(validVerifiedState(state), true);
    assert.equal(state.previousState.previousState, undefined);
    assert.equal(
      decideOrchestrationOutcome({ requestedSha: state.releaseSha, state })
        .status,
      "already-deployed",
    );
  }
}
for (const [name, mutate] of mutations) {
  test(`R1 real verifier CLI preserves current-state and LKG for ${name}`, async (t) =>
    verifierBlock(t, mutate, "refuse"));
}
test("R1 real verifier CLI preserves both files when freshly captured runtime changed", async (t) =>
  verifierBlock(
    t,
    (_, runtime) => {
      runtime.db.restartCount++;
    },
    "refuse",
  ));
test("R1 real verifier CLI promotes a healthy gateway and retains bounded receipt baseline", async (t) =>
  verifierBlock(t, () => {}, "healthy"));

test("R1 classification CLI refuses a corrupted existing gateway LKG without import cycles", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "mkw-gateway-classify-r1-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { f, runtime } = sample();
  const previous = promoteOperation(f.state, options(f, runtime));
  const nextSha = "e".repeat(40);
  const manifest = {
    ...structuredClone(previous.manifest),
    releaseSha: nextSha,
  };
  const policy = buildPolicy({
    manifest,
    operationId: `91-1-${nextSha}`,
    previous,
    ...manifest.buildInputs,
  });
  const next = {
    operationId: `91-1-${nextSha}`,
    releaseSha: nextSha,
    ownership: { runId: "91", runAttempt: "1" },
    manifest: bindPolicy(manifest, policy),
    previousState: previous,
    attestation: f.attestation,
  };
  await writeFile(join(dir, "policy.json"), JSON.stringify(policy));
  for (const [name, mutate] of [["healthy", () => {}], ...mutations]) {
    const state = structuredClone(next);
    mutate(state.previousState);
    await writeFile(join(dir, "state.json"), JSON.stringify(state));
    const result = spawnSync(
      process.execPath,
      [
        join(root, "scripts/product/release/gateway-policy.mjs"),
        "classify",
        join(dir, "state.json"),
        join(dir, "policy.json"),
      ],
      { encoding: "utf8", windowsHide: true, timeout: 10000 },
    );
    if (name === "healthy") {
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), "gateway-only");
    } else {
      assert.notEqual(result.status, 0, name);
      assert.match(result.stderr, /incident-required/);
    }
  }
});
