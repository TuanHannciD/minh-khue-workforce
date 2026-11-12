import assert from "node:assert/strict";
import { cp, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  boundaryFixture,
  BASH,
  posix,
} from "./fixtures/provenance-boundary.mjs";
import test from "node:test";
const ROOT =
  process.env.MKW_PROVENANCE_TEST_ROOT ?? resolve(import.meta.dirname, "../..");
const { resolveExactRelease } = await import(
  pathToFileURL(join(ROOT, "scripts/product/release/resolve-release.mjs"))
);
const { coordinateRelease } = await import(
  pathToFileURL(join(ROOT, "scripts/product/release/coordinator.mjs"))
);

const SHA = "a".repeat(40);
const DIGEST = `sha256:${"b".repeat(64)}`;
const manifest = {
  schemaVersion: "1",
  releaseSha: SHA,
  sourceRepository: "org/repo",
  createdAt: "2026-11-12T10:00:00Z",
  apiImage: `x@sha256:${"1".repeat(64)}`,
  webImage: `x@sha256:${"2".repeat(64)}`,
  postgresImage: `postgres@sha256:${"3".repeat(64)}`,
  artifacts: {
    sbom: { sha256: "c".repeat(64), size: 1 },
    provenance: { sha256: "d".repeat(64), size: 1 },
  },
};
const input = {
  sha: SHA,
  repository: "org/repo",
  artifactId: "101",
  runId: "10",
  dispatchRef: "refs/heads/main",
};
const producer = {
  id: "10",
  path: ".github/workflows/build-release.yml",
  event: "workflow_run",
  head_branch: "main",
  status: "completed",
  conclusion: "success",
  run_attempt: 1,
  run_started_at: "2026-11-12T10:00:00Z",
  updated_at: "2026-11-12T10:59:59Z",
};
function api({ attempt = 1, digest = DIGEST, metadata = {} } = {}) {
  return {
    async artifact() {
      return {
        id: "101",
        name: `mkw-release-${SHA}`,
        expired: false,
        digest,
        workflow_run: { id: "10" },
        created_at: "2026-11-12T10:00:30Z",
      };
    },
    async run(id, requestedAttempt) {
      assert.equal(id, "10");
      return {
        ...producer,
        run_attempt: requestedAttempt ?? attempt,
        run_started_at: `2026-11-12T${String(requestedAttempt ?? attempt) === "1" ? "10" : "11"}:00:00Z`,
        updated_at: `2026-11-12T${String(requestedAttempt ?? attempt) === "1" ? "10" : "11"}:59:59Z`,
      };
    },
    async jsonFromArtifact(id, entry) {
      assert.equal(id, "101");
      if (entry === "release-manifest.json") return manifest;
      return {
        sourceSha: SHA,
        producerRunId: "10",
        producerRunAttempt: 1,
        artifactDigest: DIGEST,
        ...metadata,
      };
    },
  };
}

test("manual resolver returns the archive's producing attempt and trusted digest", async () => {
  assert.deepEqual(await resolveExactRelease(input, api()), {
    artifactId: "101",
    runId: "10",
    runAttempt: "1",
    artifactDigest: DIGEST,
  });
});

for (const binding of ["metadata", "dispatch"])
  for (const latestStatus of ["success", "failure", "in_progress"]) {
    test(`${binding}-bound producing attempt 1 remains valid when latest rerun is ${latestStatus}`, async () => {
      const boundary = api();
      const originalRun = boundary.run;
      const attempts = [];
      boundary.run = async (id, requestedAttempt) => {
        attempts.push(String(requestedAttempt));
        if (requestedAttempt === undefined)
          return {
            ...(await originalRun(id, "2")),
            status:
              latestStatus === "in_progress" ? "in_progress" : "completed",
            conclusion: latestStatus === "in_progress" ? null : latestStatus,
          };
        return originalRun(id, requestedAttempt);
      };
      assert.deepEqual(
        await resolveExactRelease(
          { ...input, ...(binding === "dispatch" ? { runAttempt: "1" } : {}) },
          boundary,
        ),
        {
          artifactId: "101",
          runId: "10",
          runAttempt: "1",
          artifactDigest: DIGEST,
        },
      );
      assert.deepEqual(
        attempts,
        ["1"],
        "only the bound attempt may be consulted",
      );
    });
  }

test("explicit producing attempt resolves a legacy archive without consulting latest", async () => {
  const boundary = api({
    metadata: { producerRunId: undefined, producerRunAttempt: undefined },
  });
  const readRun = boundary.run;
  boundary.run = async (id, attempt) => {
    assert.equal(attempt, "1");
    return readRun(id, attempt);
  };
  assert.equal(
    (await resolveExactRelease({ ...input, runAttempt: "1" }, boundary))
      .runAttempt,
    "1",
  );
});

for (const [label, patch] of [
  ["run ID", { id: "11" }],
  ["attempt", { run_attempt: "2" }],
  ["branch", { head_branch: "attacker" }],
  ["workflow", { path: ".github/workflows/noncanonical.yml" }],
  ["event", { event: "workflow_dispatch" }],
  ["failed", { conclusion: "failure" }],
  ["in-progress", { status: "in_progress", conclusion: null }],
])
  test(`bound producer rejects mismatched ${label} even with successful latest rerun`, async () => {
    const boundary = api();
    const originalRun = boundary.run;
    boundary.run = async (id, requestedAttempt) => {
      const run = await originalRun(id, requestedAttempt);
      return String(requestedAttempt) === "1" ? { ...run, ...patch } : run;
    };
    await assert.rejects(
      () => resolveExactRelease(input, boundary),
      /canonical|producer/,
    );
  });

test("producer fields cannot override missing API evidence or an artifact created in another attempt", async () => {
  for (const change of [
    "missing-digest",
    "missing-time",
    "forged-attempt",
    "mismatched-digest",
  ]) {
    const boundary = api(
      change === "forged-attempt"
        ? { metadata: { producerRunAttempt: "2" } }
        : change === "mismatched-digest"
          ? { metadata: { artifactDigest: `sha256:${"e".repeat(64)}` } }
          : {},
    );
    const artifact = boundary.artifact;
    boundary.artifact = async () => ({
      ...(await artifact()),
      ...(change === "missing-digest"
        ? { digest: undefined }
        : change === "missing-time"
          ? { created_at: undefined }
          : {}),
    });
    await assert.rejects(
      () => resolveExactRelease(input, boundary),
      /provenance|digest|attempt|canonical/,
    );
  }
});

test("manual resolver rejects missing or forged producer metadata and mismatched supplied provenance", async () => {
  await assert.rejects(
    () =>
      resolveExactRelease(
        input,
        api({ metadata: { producerRunAttempt: undefined } }),
      ),
    /producer|provenance|attempt/i,
  );
  await assert.rejects(
    () => resolveExactRelease({ ...input, runAttempt: "2" }, api()),
    /attempt|producer/i,
  );
  await assert.rejects(
    () =>
      resolveExactRelease(
        { ...input, artifactDigest: `sha256:${"e".repeat(64)}` },
        api(),
      ),
    /digest/i,
  );
});

for (const latestStatus of ["success", "failure", "in_progress"])
  test(`coordinator forwards immutable release and backup provenance with latest rerun ${latestStatus}`, async () => {
    const sha = SHA;
    const runs = new Map();
    const calls = [];
    const readiness = {
      schemaVersion: "1",
      kind: "BACKUP",
      backupId: "mkw-20-1-release",
      releaseSha: sha,
      createdAt: "2026-11-12T10:00:00Z",
      dumpSha256: "e".repeat(64),
      size: 1,
      restoreVerified: true,
      retentionUntil: "2026-12-12T10:00:00Z",
      storageLocation: "github-actions-artifact:mkw",
      databaseIdentity: {
        host: "prod",
        name: "mkw",
        engine: "postgresql",
        targetIdentity: "vps/mkw",
      },
    };
    const api = {
      now: () => Date.parse("2026-11-12T12:00:00Z"),
      async listArtifacts() {
        return [
          {
            id: "101",
            name: `mkw-release-${sha}`,
            expired: false,
            digest: DIGEST,
            workflow_run: { id: "10" },
          },
        ];
      },
      async artifact(id) {
        return id === "101"
          ? {
              id,
              name: `mkw-release-${sha}`,
              expired: false,
              digest: DIGEST,
              workflow_run: { id: "10" },
              created_at: "2026-11-12T10:00:30Z",
            }
          : {
              id,
              name: "mkw-backup-20-1",
              expired: false,
              digest: `sha256:${"f".repeat(64)}`,
              workflow_run: { id: "20" },
            };
      },
      async run(id, attempt) {
        if (id === "10")
          return {
            ...producer,
            run_attempt: attempt ?? 2,
            ...(attempt === undefined
              ? {
                  status:
                    latestStatus === "in_progress"
                      ? "in_progress"
                      : "completed",
                  conclusion:
                    latestStatus === "in_progress" ? null : latestStatus,
                }
              : {}),
          };
        const stored = runs.get(id);
        return { ...stored, run_attempt: attempt ?? stored.run_attempt };
      },
      async jsonFromArtifact(id, entry) {
        if (id === "101")
          return entry === "release-manifest.json"
            ? manifest
            : {
                sourceSha: sha,
                producerRunId: "10",
                producerRunAttempt: 1,
                artifactDigest: DIGEST,
              };
        return readiness;
      },
      async runArtifacts() {
        return [
          {
            id: "201",
            name: "mkw-backup-20-1",
            expired: false,
            digest: `sha256:${"f".repeat(64)}`,
            workflow_run: { id: "20" },
          },
        ];
      },
      async runs(workflow) {
        return [...runs.values()].filter((run) => run.path.endsWith(workflow));
      },
      async dispatch(workflow, ref, fields) {
        calls.push({ workflow, fields });
        const id =
          workflow === "backup.yml"
            ? "20"
            : workflow === "deploy.yml"
              ? "30"
              : "40";
        runs.set(id, {
          id,
          path: `.github/workflows/${workflow}`,
          event: "workflow_dispatch",
          head_branch: "main",
          status: "completed",
          conclusion: "success",
          run_attempt: 1,
          display_title: `mkw-${workflow.replace(".yml", "")}-${fields.coordinator_id}`,
        });
      },
      async pause() {},
    };
    const result = await coordinateRelease(
      {
        sha,
        mode: "release",
        kind: "BACKUP",
        correlationId: "coord-provenance",
        repository: "org/repo",
        maxAgeMs: 86400000,
        target: { host: "prod", database: "mkw", identity: "vps/mkw" },
      },
      api,
    );
    const deploy = [...runs.values()].find((run) =>
      run.path.endsWith("deploy.yml"),
    );
    assert.equal(result.outputs.release_run_attempt, "1");
    assert.equal(result.outputs.release_artifact_digest, DIGEST);
    assert.equal(
      result.outputs.backup_artifact_digest,
      `sha256:${"f".repeat(64)}`,
    );
    assert.equal(deploy.path, ".github/workflows/deploy.yml");
    const forwarded = JSON.parse(calls[1].fields.provenance);
    assert.equal(forwarded.release.runAttempt, "1");
    assert.equal(forwarded.release.artifactDigest, DIGEST);
    assert.equal(forwarded.backup.runAttempt, "1");
    assert.equal(forwarded.backup.artifactDigest, `sha256:${"f".repeat(64)}`);
    assert.equal(calls[2].fields.release_run_attempt, "1");
    assert.equal(calls[2].fields.release_artifact_digest, DIGEST);
  });

function block(workflow, name) {
  return workflow
    .replaceAll("\r\n", "\n")
    .split(`      - name: ${name}\n`)[1]
    .split("        run: |\n")[1]
    .split(/\n {6}- /)[0]
    .replace(/^ {10}/gm, "");
}
function runBlock(f, script, extra = {}) {
  return spawnSync(BASH, ["--noprofile", "--norc", "-c", script], {
    cwd: f.dir,
    env: { ...process.env, ...f.env, ...extra },
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true,
  });
}
for (const workflow of ["deploy", "post-deploy-verify"]) {
  for (const mutation of [
    "healthy-rerun",
    "failed-latest-rerun",
    "in-progress-latest-rerun",
    "missing-attempt",
    "wrong-attempt",
    "wrong-digest",
    "wrong-checksum",
    "incomplete-backup",
    ...(workflow === "deploy"
      ? [
          "wrong-backup-attempt",
          "wrong-backup-digest",
          "incomplete-backup-tuple",
        ]
      : []),
  ]) {
    test(`actual manual ${workflow} block: ${mutation} before SSH`, async (t) => {
      const f = await boundaryFixture(t, ROOT, manifest);
      const yaml = await readFile(
        join(ROOT, `.github/workflows/${workflow}.yml`),
        "utf8",
      );
      const script = block(
        yaml,
        workflow === "deploy"
          ? "Validate artifact and release manifest"
          : "Validate exact release linkage for every mode",
      );
      const env = {};
      if (
        ["failed-latest-rerun", "in-progress-latest-rerun"].includes(mutation)
      ) {
        f.records.runs["10"].status =
          mutation === "failed-latest-rerun" ? "completed" : "in_progress";
        f.records.runs["10"].conclusion =
          mutation === "failed-latest-rerun" ? "failure" : null;
        await f.persist();
      }
      if (mutation === "missing-attempt") {
        delete f.metadata.producerRunAttempt;
        await f.persist();
      }
      if (mutation === "wrong-attempt") env.RELEASE_RUN_ATTEMPT = "2";
      if (mutation === "wrong-digest")
        env.RELEASE_ARTIFACT_DIGEST = `sha256:${"f".repeat(64)}`;
      if (mutation === "wrong-checksum") {
        // Keep a readable ZIP and the same entries, but alter archive bytes.
        // Old unzip-only validation would accept this valid archive comment.
        const archive = await readFile(join(f.dir, "101.zip"));
        archive.writeUInt16LE(1, archive.length - 2);
        await writeFile(
          join(f.dir, "101.zip"),
          Buffer.concat([archive, Buffer.from("x")]),
        );
      }
      if (mutation === "wrong-backup-attempt") env.BACKUP_RUN_ATTEMPT = "2";
      if (mutation === "wrong-backup-digest")
        env.BACKUP_ARTIFACT_DIGEST = `sha256:${"f".repeat(64)}`;
      if (mutation === "incomplete-backup-tuple")
        env.PROVENANCE_JSON = JSON.stringify({
          release: {
            runId: "10",
            runAttempt: "1",
            artifactId: "101",
            artifactDigest: f.records.artifacts["101"].digest,
          },
          backup: { runId: "20", runAttempt: "1", artifactId: "201" },
        });
      if (mutation === "incomplete-backup") {
        if (workflow === "deploy") {
          delete f.ready.dumpSha256;
          await f.persist();
          await writeFile(
            join(f.dir, "backup-ready/backup-ready.json"),
            JSON.stringify(f.ready),
          );
        } else
          env.PROVENANCE_JSON = JSON.stringify({
            release: { runId: "10", artifactId: "101" },
          });
      }
      if (workflow === "post-deploy-verify") {
        env.BACKUP_ARTIFACT_ID = "";
        env.BACKUP_RUN_ID = "";
      }
      const result = runBlock(
        f,
        `date() { echo 2026-11-12T12:00:00Z; }\n${script}\necho SSH_MUTATION_REACHED`,
        env,
      );
      if (
        [
          "healthy-rerun",
          "failed-latest-rerun",
          "in-progress-latest-rerun",
        ].includes(mutation)
      ) {
        assert.equal(result.status, 0, result.stdout + result.stderr);
        const output = await readFile(join(f.dir, "output"), "utf8");
        assert.match(output, /release_run_attempt=1\n/);
        assert.ok(
          output.includes(
            `release_artifact_digest=${f.records.artifacts["101"].digest}\n`,
          ),
        );
        if (workflow === "deploy")
          assert.ok(
            output.includes(
              `backup_artifact_digest=${f.records.artifacts["201"].digest}\n`,
            ),
          );
      } else {
        assert.notEqual(result.status, 0, result.stdout + result.stderr);
        assert.doesNotMatch(result.stdout, /SSH_MUTATION_REACHED/);
        assert.match(
          result.stderr,
          /provenance|attempt|digest|checksum|dumpSha256|backup/i,
        );
      }
    });
  }
}

for (const latestStatus of ["success", "failure", "in_progress"])
  test(`legacy artifact discovers unique attempt1 with latest rerun ${latestStatus}; overlapping windows fail closed`, async () => {
    const legacy = api({
      attempt: "2",
      metadata: { producerRunId: undefined, producerRunAttempt: undefined },
    });
    const artifact = legacy.artifact;
    legacy.artifact = async () => ({
      ...(await artifact()),
      created_at: "2026-11-12T10:30:00Z",
    });
    legacy.run = async (id, attempt) => ({
      ...producer,
      run_attempt: attempt ?? "2",
      ...(attempt === undefined
        ? {
            status:
              latestStatus === "in_progress" ? "in_progress" : "completed",
            conclusion: latestStatus === "in_progress" ? null : latestStatus,
          }
        : {}),
      run_started_at: `2026-11-12T${attempt === "1" ? "10" : "11"}:00:00Z`,
      updated_at: `2026-11-12T${attempt === "1" ? "10" : "11"}:59:59Z`,
    });
    assert.equal((await resolveExactRelease(input, legacy)).runAttempt, "1");
    legacy.run = async (id, attempt) => ({
      ...producer,
      run_attempt: attempt ?? "2",
      run_started_at: "2026-11-12T10:00:00Z",
      updated_at: "2026-11-12T11:59:59Z",
    });
    await assert.rejects(() => resolveExactRelease(input, legacy), /ambiguous/);
  });

test("actual journal CLI consumes resolved release and backup provenance without empty ownership fields", async (t) => {
  const f = await boundaryFixture(t, ROOT, manifest);
  const yaml = await readFile(
    join(ROOT, ".github/workflows/deploy.yml"),
    "utf8",
  );
  const result = runBlock(
    f,
    `date() { echo 2026-11-12T12:00:00Z; }\n${block(yaml, "Validate artifact and release manifest")}`,
  );
  assert.equal(result.status, 0, result.stderr);
  const output = Object.fromEntries(
    (await readFile(join(f.dir, "output"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i), line.slice(i + 1)];
      }),
  );
  const remoteSection = yaml.split(
    "      - name: Run remote deploy entrypoint with verified artifact",
  )[1];
  const remoteBindings = {};
  for (const name of [
    "MKW_RELEASE_RUN_ID",
    "MKW_RELEASE_RUN_ATTEMPT",
    "MKW_RELEASE_ARTIFACT_ID",
    "MKW_RELEASE_ARTIFACT_DIGEST",
    "MKW_BACKUP_PROVENANCE",
  ]) {
    const expression = remoteSection.match(
      new RegExp(`^          ${name}: (.+)$`, "m"),
    )?.[1];
    const key = expression?.match(/steps\.provenance\.outputs\.([a-z_]+)/)?.[1];
    assert.ok(key, `missing resolved producer binding for ${name}`);
    remoteBindings[name] = output[key];
  }
  await cp(join(ROOT, "deploy"), join(f.dir, "release-source/deploy"), {
    recursive: true,
  });
  const remote = runBlock(
    f,
    `
install() { :; }; chmod() { :; }; scp() { :; }
ssh-keyscan() { echo fixture-key; }
ssh-keygen() { echo '256 fixture-fingerprint fixture (ED25519)'; }
ssh() {
  local command_text="\${!#}"
  case "$command_text" in
    MKW_BACKUP_PROVENANCE=*) (
      bash() { node --input-type=module -e 'console.log(JSON.stringify({runId:process.env.MKW_RELEASE_RUN_ID,runAttempt:process.env.MKW_RELEASE_RUN_ATTEMPT,artifactId:process.env.MKW_RELEASE_ARTIFACT_ID,artifactDigest:process.env.MKW_RELEASE_ARTIFACT_DIGEST,backup:JSON.parse(process.env.MKW_BACKUP_PROVENANCE)}))'; }
      eval "$command_text"
    ) ;;
    *) return 0 ;;
  esac
}
${block(yaml, "Run remote deploy entrypoint with verified artifact")}`,
    {
      MODE: "release",
      GITHUB_WORKSPACE: posix(f.dir),
      RUNNER_TEMP: posix(f.dir),
      MKW_SSH_HOST: "fixture.invalid",
      MKW_SSH_PORT: "22",
      MKW_SSH_HOST_FINGERPRINT: "fixture-fingerprint",
      MKW_SSH_PRIVATE_KEY: "fixture-only-key",
      MKW_DEPLOY_PATH: "/home/deploy/mkw",
      MKW_PROJECT_NAME: "mkw",
      MKW_GATEWAY_PORT: "3200",
      MKW_BACKUP_MAX_AGE_SECONDS: "86400",
      ...remoteBindings,
    },
  );
  assert.equal(remote.status, 0, remote.stdout + remote.stderr);
  const captured = JSON.parse(
    remote.stdout
      .trim()
      .split("\n")
      .find((line) => line.startsWith('{"runId"')),
  );
  assert.equal(captured.runAttempt, "1");
  assert.equal(captured.artifactDigest, f.records.artifacts["101"].digest);
  assert.equal(
    captured.backup.artifactDigest,
    f.records.artifacts["201"].digest,
  );
  const journal = spawnSync(
    process.execPath,
    [
      join(ROOT, "scripts/product/release/operation-state.mjs"),
      "begin",
      join(f.dir, "release-artifact/release-manifest.json"),
      join(f.dir, "missing-lkg.json"),
      join(f.dir, "backup-ready/backup-ready.json"),
      "manual-provenance",
      output.release_run_id,
      output.release_run_attempt,
      output.release_artifact_id,
      output.release_artifact_digest,
      SHA,
      "off",
      "not-configured",
      output.backup_provenance,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  assert.equal(journal.status, 0, journal.stderr);
  const state = JSON.parse(journal.stdout);
  assert.equal(state.ownership.runAttempt, "1");
  assert.equal(
    state.ownership.artifactDigest,
    f.records.artifacts["101"].digest,
  );
  assert.equal(state.preReleaseBackupOwnership.runAttempt, "1");
  assert.equal(
    state.preReleaseBackupOwnership.artifactDigest,
    f.records.artifacts["201"].digest,
  );
});
