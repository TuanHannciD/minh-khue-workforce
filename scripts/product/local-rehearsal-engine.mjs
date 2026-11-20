// Outer lifecycle only. Production resource names are isolated by a fresh daemon.
// File map: executeRehearsalProcess handles shared owned process settlement;
// assert*/validateEngineOwnership
// admit storage/daemon/owner; source-snapshot.mjs owns retained source bytes;
// runOwnedRehearsal owns acquisition, public terminal, private export and cleanup;
// its buildImage/admitImage helpers bind tagless image IDs to one session;
// cleanup pre-admits both images and refuses aliases before immutable removal.
// optional signal cancels acquisition/readiness/driver; retention export stays
// available after abort. Verified handoff controls come from its
// retained source (controlRoot), while old callers retain native capture behavior.
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  statfs,
  rename,
  unlink,
} from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import {
  createSourceSnapshot,
  verifySourceSnapshot,
  verifySourceSnapshotHandoff,
} from "../ci/source-snapshot.mjs";
export { createSourceSnapshot } from "../ci/source-snapshot.mjs";
import {
  projectPublicReport,
  publicRuntimeVersion,
  admitInnerReport,
  safeReportSummary,
} from "../ci/evidence.mjs";
import {
  assertEnvironment,
  classifyEnvironmentFailure,
  readEnvironmentLock,
} from "../ci/environment.mjs";

const owner = "MKW-DEPLOY-ACCOUNT-001";
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export async function writeRehearsalEvidence(path, value) {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, { mode: 0o600, flag: "wx" });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
}
const save = writeRehearsalEvidence;
function failure(code) {
  return Object.assign(new Error(code), { code });
}

// Original command deadlines remain unchanged. After a failure, allow 1000ms
// for SIGTERM, then 1000ms for SIGKILL/close. A missing close is unverified,
// never evidence of termination. Retain listeners to absorb late stream errors.
// A 25ms close drain lets queued stdin errors join the same terminal outcome.
export function executeRehearsalProcess(bin, args, options = {}) {
  return new Promise((resolveResult) => {
    const { timeout = 2700000, input, ...spawnOptions } = options;
    let child;
    try {
      child = spawn(bin, args, {
        cwd: repository,
        stdio: "pipe",
        ...spawnOptions,
      });
    } catch {
      resolveResult({
        status: null,
        signal: null,
        processCode: "PROCESS_SPAWN",
        closeObserved: false,
        cleanupUnverified: false,
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
      });
      return;
    }
    let settled = false,
      closed = false,
      terminating = false;
    let status = null,
      signal = null,
      firstCode = null;
    let deadlineTimer, termTimer, killTimer, drainTimer;
    const stdout = [],
      stderr = [];
    const clearTimers = () => {
      for (const timer of [deadlineTimer, termTimer, killTimer, drainTimer])
        clearTimeout(timer);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimers();
      if (!closed) {
        // Release only our client handles; daemon/engine cleanup is a separate
        // ownership decision. The child may still be alive if close was absent.
        for (const stream of [child.stdin, child.stdout, child.stderr])
          stream?.destroy();
        child.unref?.();
      }
      resolveResult({
        status,
        signal,
        processCode: firstCode,
        closeObserved: closed,
        cleanupUnverified: !closed,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      });
    };
    const kill = (requestedSignal) => {
      try {
        child.kill(requestedSignal);
      } catch {
        /* Observation, not kill(), proves termination. */
      }
    };
    const fail = (code) => {
      if (settled) return;
      firstCode ??= code;
      if (closed || terminating) return;
      terminating = true;
      clearTimeout(deadlineTimer);
      // Arm before kill: child doubles and some native failures close inline.
      termTimer = setTimeout(() => {
        if (closed || settled) return;
        killTimer = setTimeout(finish, 1000);
        kill("SIGKILL");
      }, 1000);
      kill("SIGTERM");
    };
    child.stdout.on("data", (b) => stdout.push(b));
    child.stderr.on("data", (b) => stderr.push(b));
    child.on("error", (error) =>
      fail(
        error.code === "ETIMEDOUT"
          ? "PROCESS_TIMEOUT"
          : error.code === "ABORT_ERR"
            ? "PROCESS_SIGNAL"
            : "PROCESS_SPAWN",
      ),
    );
    child.stdin.on("error", () => fail("PROCESS_STDIN"));
    child.stdin.on("close", () => {
      if (!child.stdin.writableFinished) fail("PROCESS_STDIN");
    });
    child.on("close", (exitCode, exitSignal) => {
      if (settled || closed) return;
      closed = true;
      status =
        Number.isInteger(exitCode) && exitCode >= 0 && exitCode <= 255
          ? exitCode
          : null;
      signal = exitSignal ?? null;
      if (signal) firstCode ??= "PROCESS_SIGNAL";
      clearTimers();
      drainTimer = setTimeout(finish, 25);
    });
    deadlineTimer = setTimeout(() => fail("PROCESS_TIMEOUT"), timeout);
    try {
      child.stdin.end(input);
    } catch {
      fail("PROCESS_STDIN");
    }
  });
}
const execute = executeRehearsalProcess;
async function readinessPause(ms, signal) {
  try {
    await delay(ms, undefined, { signal });
  } catch (error) {
    if (error.code !== "ABORT_ERR") throw error;
    throw processOutcomeError({
      processCode: "PROCESS_SIGNAL",
      status: null,
      signal: null,
      cleanupUnverified: false,
    });
  }
}
function processOutcomeError(result) {
  const error = failure(result.processCode);
  error.processOutcome = {
    primary: {
      code: result.processCode,
      exitCode: result.status,
      signal: result.signal,
    },
    cleanupUnverified: result.cleanupUnverified,
  };
  return error;
}

export function assertLinuxEngine(info) {
  if (info?.OSType !== "linux") throw failure("REHEARSAL_PREREQUISITE");
}

export function assertRehearsalStorage(info) {
  const available = Number(info?.bavail) * Number(info?.bsize);
  // Two complete API/Web image pairs, the inner daemon and retained failure data
  // need host headroom beyond the daemon's own virtual free-space report.
  if (!Number.isFinite(available) || available < 12 * 1024 ** 3)
    throw failure("REHEARSAL_STORAGE");
}

// Fixed diagnostic vocabulary only: never persist a dependency's raw output.
export function classifyRehearsalFailure(stderr) {
  if (/database "[^"\r\n]+" does not exist/.test(stderr))
    return "PG_DATABASE_MISSING";
  if (/connection to server.*failed|server closed the connection/.test(stderr))
    return "PG_CONNECTION";
  if (/schema "[^"\r\n]+" already exists/.test(stderr))
    return "PG_OBJECT_EXISTS";
  if (/bad decrypt/.test(stderr)) return "BACKUP_DECRYPT";
  return "UNCLASSIFIED";
}

export async function waitForRehearsalPostgres(
  command,
  container,
  { attempts = 60, intervalMs = 500, signal } = {},
) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = await command(
      "docker",
      [
        "exec",
        container,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        "mkw",
        "-d",
        "mkw",
      ],
      { signal },
    );
    // The official image's temporary init server accepts only local sockets.
    if (result.processCode) throw processOutcomeError(result);
    if (result.status === 0 && !result.signal) return;
    await readinessPause(intervalMs, signal);
  }
  throw failure("REHEARSAL_POSTGRES_READINESS");
}

export function validateEngineOwnership({
  expected,
  inspection,
  marker,
  daemon,
}) {
  const { taskId, name, id } = expected;
  if (
    !uuid.test(taskId) ||
    name !== `mkw-deploy-account-${taskId}` ||
    !/^[a-f0-9]{64}$/.test(id) ||
    inspection?.Id !== id ||
    inspection.Name !== `/${name}` ||
    inspection.Config?.Hostname !== name ||
    inspection.Config.Labels?.["com.mkw.owner"] !== owner ||
    inspection.Config.Labels?.["com.mkw.task"] !== taskId ||
    (expected.sessionId !== undefined &&
      (inspection.Config.Labels?.["com.mkw.session"] !== expected.sessionId ||
        marker?.sessionId !== expected.sessionId ||
        inspection.Image !== expected.imageId ||
        marker?.imageId !== expected.imageId)) ||
    !Array.isArray(inspection.Mounts) ||
    inspection.Mounts.some(
      (m) => m.Type !== "volume" || m.Destination !== "/var/lib/docker",
    ) ||
    marker?.owner !== owner ||
    marker.taskId !== taskId ||
    marker.name !== name ||
    marker.id !== id ||
    daemon !== name
  )
    throw failure("REHEARSAL_OWNERSHIP");
}

export async function runOwnedRehearsal({
  evidencePath,
  taskId = randomUUID(),
  sourceSnapshot,
  signal,
}) {
  if (!uuid.test(taskId)) throw failure("REHEARSAL_TASK_ID");
  const evidence = resolve(evidencePath);
  await mkdir(dirname(evidence), { recursive: true });
  try {
    await mkdir(evidence, { mode: 0o700 });
  } catch (e) {
    if (e.code === "EEXIST") throw failure("REHEARSAL_EVIDENCE_EXISTS");
    throw e;
  }
  const name = `mkw-deploy-account-${taskId}`;
  const sessionId = randomUUID();
  let snapshotRoot = evidence;
  const started = new Date();
  let phase = "prerequisite",
    stepId = "prerequisite",
    expected,
    snapshot,
    innerReport,
    processFailure;
  let environmentLockSha256;
  const secondaryErrors = [];
  const commands = [];
  const runtime = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    uid: process.getuid?.(),
  };
  await mkdir(join(evidence, "public"), { mode: 0o700 });
  const makeReport = (result = "Not run", code = "REPORT_INCOMPLETE") =>
    projectPublicReport({
      ...innerReport,
      runId: taskId,
      environmentLockSha256,
      sourceSha256: snapshot?.sourceSha256,
      baseSha: snapshot?.base,
      result,
      primary: { phase, stepId, code, ...processFailure },
      runtime: innerReport?.runtime ?? runtime,
      counts: innerReport?.counts ?? { commands: commands.length },
      durationMs: Date.now() - started.getTime(),
      innerReportUnavailable: phase === "assertions" && !innerReport,
      secondaryErrors: [
        ...(innerReport?.secondaryErrors ?? []),
        ...secondaryErrors,
      ],
    });
  const publish = async (report) => {
    // Summary is emitted even when writing public/private evidence fails.
    console.log(
      `${safeReportSummary(report)} evidence=public/check-report.json`,
    );
    await save(join(evidence, "public/check-report.json"), report);
  };
  await save(join(evidence, "public/check-report.json"), makeReport());
  const record = {
    owner,
    taskId,
    sessionId,
    name,
    startedUtc: started.toISOString(),
    hostNode: process.version,
    cwd: repository,
    evidence,
  };
  await save(join(evidence, "ownership.json"), record);
  async function call(
    args,
    {
      input,
      prerequisite = false,
      fetch = false,
      log = true,
      retention = false,
    } = {},
  ) {
    const before = Date.now();
    const result = await execute("docker", args, {
      input,
      ...(signal && !retention ? { signal } : {}),
    });
    const entry = {
      command: ["docker", ...args],
      cwd: repository,
      startedUtc: new Date(before).toISOString(),
      durationMs: Date.now() - before,
      exit: result.status,
    };
    commands.push(entry);
    entry.closeObserved = result.closeObserved;
    if (result.cleanupUnverified)
      secondaryErrors.push("PROCESS_CLEANUP_UNVERIFIED");
    const commandFailure =
      result.status !== 0 || result.signal || result.processCode;
    const output = Buffer.concat([result.stdout, result.stderr]).toString();
    const fetchFailure = classifyEnvironmentFailure({ fetch, output });
    if (commandFailure)
      processFailure = {
        code:
          result.processCode ??
          (fetchFailure
            ? fetchFailure
            : prerequisite
              ? "REHEARSAL_PREREQUISITE"
              : "REHEARSAL_COMMAND"),
        exitCode: result.status,
        signal: result.signal,
      };
    if (log) {
      // No application commands/credentials run through this logger.
      await writeFile(
        join(evidence, `outer-${commands.length}.log`),
        Buffer.concat([result.stdout, result.stderr]),
      );
    }
    await save(join(evidence, "outer-commands.json"), commands);
    if (commandFailure) {
      throw failure(processFailure.code);
    }
    return result.stdout.toString().trim();
  }
  const inspect = async (retention = false) =>
    JSON.parse(
      await call(["inspect", expected.id], { log: false, retention }),
    )[0];
  // Session labels make even duplicate task UUIDs produce distinct configs.
  // No mutable image reference is ever acquired, executed or removed here.
  const derivedImages = [];
  record.derivedImages = derivedImages;
  const admitImage = async (image, cleanup = false) => {
    const actual = JSON.parse(
      await call(["image", "inspect", image.id], {
        log: false,
        retention: cleanup,
      }),
    )[0];
    if (
      actual?.Id !== image.id ||
      !Object.entries(image.labels).every(
        ([key, value]) => actual.Config?.Labels?.[key] === value,
      ) ||
      (cleanup &&
        (!Array.isArray(actual.RepoTags) ||
          actual.RepoTags.length ||
          !Array.isArray(actual.RepoDigests) ||
          actual.RepoDigests.length))
    )
      throw failure("REHEARSAL_OWNERSHIP");
    if (`${actual.Os}/${actual.Architecture}` !== image.platform)
      throw failure("ENVIRONMENT_PLATFORM");
    return actual;
  };
  const buildImage = async (role, setup, platform) => {
    const labels = {
      "com.mkw.owner": owner,
      "com.mkw.task": taskId,
      "com.mkw.session": sessionId,
      "com.mkw.role": role,
      "com.mkw.lock": environmentLockSha256,
      "com.mkw.dockerfile": hash(await readFile(join(setup, "Dockerfile"))),
    };
    const iid = join(evidence, `${role}-image.id`);
    const image = { role, id: null, labels, platform };
    derivedImages.push(image);
    await save(join(evidence, "ownership.json"), record);
    try {
      await call(
        [
          "build",
          "--platform",
          platform,
          ...Object.entries(labels).flatMap(([key, value]) => [
            "--label",
            `${key}=${value}`,
          ]),
          "--iidfile",
          iid,
          setup,
        ],
        { prerequisite: true, fetch: true },
      );
    } finally {
      // The daemon may have produced an image before a client/logging failure.
      // Record any exact IID without authorizing deletion or masking that failure.
      const id = await readFile(iid, "utf8").catch(() => "");
      if (/^sha256:[a-f0-9]{64}$/.test(id.trim())) image.id = id.trim();
      await save(join(evidence, "ownership.json"), record).catch(() =>
        secondaryErrors.push("REPORT_WRITE"),
      );
    }
    if (!image.id) throw failure("ENVIRONMENT_IMAGE");
    const inspection = await admitImage(image);
    return { image, inspection };
  };
  async function verify(retention = false) {
    const inspection = await inspect(retention);
    const marker = JSON.parse(
      await call(["exec", expected.id, "cat", "/mkw-local-owned.json"], {
        log: false,
        retention,
      }),
    );
    const daemon = await call(
      ["exec", expected.id, "docker", "info", "--format", "{{.Name}}"],
      { log: false, retention },
    );
    validateEngineOwnership({ expected, inspection, marker, daemon });
    await save(join(evidence, "owned-engine.json"), {
      expected,
      inspection: {
        Id: inspection.Id,
        Name: inspection.Name,
        Image: inspection.Image,
        Mounts: inspection.Mounts,
        Config: {
          Hostname: inspection.Config.Hostname,
          Labels: inspection.Config.Labels,
        },
      },
      marker,
      daemon,
    });
  }
  try {
    if (sourceSnapshot !== undefined) {
      phase = "snapshot";
      stepId = "source-snapshot";
      snapshot = await verifySourceSnapshotHandoff(sourceSnapshot);
      snapshotRoot = resolve(sourceSnapshot.root);
      phase = "prerequisite";
      stepId = "prerequisite";
    }
    const controlRoot =
      sourceSnapshot === undefined ? repository : join(snapshotRoot, "source");
    const environmentLockPath = join(
      controlRoot,
      "scripts/ci/environment-lock.json",
    );
    const environmentLockBytes = await readFile(environmentLockPath);
    environmentLockSha256 = hash(environmentLockBytes);
    const environmentLock = await readEnvironmentLock(environmentLockPath);
    const storage = await statfs(evidence);
    await save(join(evidence, "storage-prerequisite.json"), {
      availableBytes: storage.bavail * storage.bsize,
      requiredBytes: 12 * 1024 ** 3,
    });
    assertRehearsalStorage(storage);
    try {
      assertLinuxEngine({
        OSType: JSON.parse(
          await call(["info", "--format", "{{json .OSType}}"], {
            prerequisite: true,
          }),
        ),
      });
    } catch {
      throw failure("REHEARSAL_PREREQUISITE");
    }
    record.dockerVersion = await call(
      ["version", "--format", "{{.Server.Version}}"],
      { prerequisite: true, fetch: true },
    );
    record.dockerPlatform = await call(
      ["version", "--format", "{{.Server.Os}}/{{.Server.Arch}}"],
      { prerequisite: true, fetch: true },
    );
    if (record.dockerPlatform !== environmentLock.platform)
      throw failure("ENVIRONMENT_PLATFORM");
    runtime.docker = publicRuntimeVersion(record.dockerVersion);
    if (await call(["ps", "-aq", "--filter", `name=^/${name}$`]))
      throw failure("REHEARSAL_OWNERSHIP");
    phase = "snapshot";
    stepId = "source-snapshot";
    snapshot ??= await createSourceSnapshot(repository, evidence);
    phase = "setup";
    stepId = "engine-setup";
    await save(join(evidence, "public/check-report.json"), makeReport());
    const images = {};
    const imageInputs = [
      ["docker:29.9.3-dind", environmentLock.images.dind],
      ["node:24.22.1-alpine", environmentLock.images.nodeAlpine],
      ["node:24.22.1-bookworm", environmentLock.images.worker],
    ];
    for (const [tag, input] of imageInputs) {
      await save(join(evidence, "acquisition.json"), {
        ...record,
        requested: tag,
        images,
      });
      await call(
        ["pull", "--platform", environmentLock.platform, input.reference],
        {
          prerequisite: true,
          fetch: true,
        },
      );
      const image = JSON.parse(
        await call(["image", "inspect", input.reference], { log: false }),
      )[0];
      const digest = image.RepoDigests?.find((value) =>
        value.endsWith(`@${input.digest}`),
      );
      const imagePlatform = `${image.Os ?? ""}/${image.Architecture ?? ""}`;
      if (!digest) throw failure("ENVIRONMENT_IMAGE");
      if (imagePlatform !== environmentLock.platform)
        throw failure("ENVIRONMENT_PLATFORM");
      images[tag] = {
        id: image.Id,
        digest: input.digest,
        resolvedDigest: digest,
        platform: imagePlatform,
      };
    }
    record.images = images;
    const setup = join(evidence, "engine-setup");
    await mkdir(setup);
    await writeFile(
      join(setup, "Dockerfile"),
      await readFile(
        join(controlRoot, "scripts/ci/Dockerfile.rehearsal"),
        "utf8",
      ),
    );
    const workerSetup = join(evidence, "worker-setup");
    await mkdir(workerSetup);
    await writeFile(
      join(workerSetup, "Dockerfile"),
      await readFile(join(controlRoot, "scripts/ci/Dockerfile"), "utf8"),
    );
    const { image: workerImage, inspection: workerInspection } =
      await buildImage("worker", workerSetup, environmentLock.platform);
    if (workerInspection.Config?.User !== "node")
      throw failure("ENVIRONMENT_UID");
    const workerUid = Number(
      await call(
        [
          "run",
          "--rm",
          "--platform",
          environmentLock.platform,
          workerImage.id,
          "id",
          "-u",
        ],
        { prerequisite: true, log: false },
      ),
    );
    if (workerUid !== environmentLock.uid) throw failure("ENVIRONMENT_UID");
    record.workerImage = {
      sessionId,
      id: workerInspection.Id,
      user: workerInspection.Config.User,
      uid: workerUid,
      platform: `${workerInspection.Os ?? ""}/${workerInspection.Architecture ?? ""}`,
    };
    await save(join(evidence, "acquisition.json"), record);
    const { image: engineImage } = await buildImage(
      "engine",
      setup,
      environmentLock.platform,
    );
    record.engineImage = engineImage.id;
    await save(join(evidence, "ownership.json"), record);
    // No host socket/directory/secret mounts. Anonymous Docker data belongs to this engine.
    const id = await call([
      "run",
      "-d",
      "--privileged",
      "--name",
      name,
      "--hostname",
      name,
      "--label",
      `com.mkw.owner=${owner}`,
      "--label",
      `com.mkw.task=${taskId}`,
      "--label",
      `com.mkw.session=${sessionId}`,
      "-e",
      "DOCKER_TLS_CERTDIR=",
      record.engineImage,
      "--storage-driver=overlay2",
      "--log-level=error",
    ]);
    expected = { id, name, taskId, sessionId, imageId: engineImage.id };
    await save(join(evidence, "acquired-engine.json"), expected);
    // First inspect authorizes marker creation, never copy/cleanup. Full validation follows.
    const inspection = await inspect();
    const marker = { owner, ...expected };
    validateEngineOwnership({ expected, inspection, marker, daemon: name });
    await call(
      [
        "exec",
        "-i",
        id,
        "sh",
        "-c",
        "umask 077; test ! -e /mkw-local-owned.json && cat > /mkw-local-owned.json",
      ],
      { input: JSON.stringify(marker), log: false },
    );
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      const probe = await execute(
        "docker",
        ["exec", id, "docker", "info", "--format", "{{.Name}}"],
        { signal },
      );
      if (probe.processCode) throw processOutcomeError(probe);
      if (probe.status === 0 && !probe.signal) {
        ready = true;
        break;
      }
      await readinessPause(1000, signal);
    }
    if (!ready) throw failure("REHEARSAL_PREREQUISITE");
    const innerDockerPlatform = await call(
      [
        "exec",
        id,
        "docker",
        "version",
        "--format",
        "{{.Server.Os}}/{{.Server.Arch}}",
      ],
      { prerequisite: true, log: false },
    );
    if (innerDockerPlatform !== record.dockerPlatform)
      throw failure("ENVIRONMENT_PLATFORM");
    const versionOf = (value, pattern, code = "ENVIRONMENT_VERSION") => {
      void code;
      const match = value.match(pattern);
      return match?.[1] ?? "unknown";
    };
    const packageFacts = {};
    for (const [key, expectedVersion] of Object.entries(
      environmentLock.packages,
    )) {
      if (key === "procps-package") continue;
      const packageName =
        key === "procps" ? environmentLock.packages["procps-package"] : key;
      let packageOutput;
      try {
        packageOutput = await call(
          ["exec", id, "apk", "info", "-e", "-v", packageName],
          {
            log: false,
          },
        );
      } catch {
        throw failure("ENVIRONMENT_PACKAGE");
      }
      if (
        !packageOutput
          .split(/\r?\n/)
          .some((line) => line.endsWith(expectedVersion))
      ) {
        throw failure("ENVIRONMENT_PACKAGE");
      }
      packageFacts[key] = expectedVersion;
    }
    const dindUid = Number(
      await call(["exec", id, "id", "-u"], { log: false }),
    );
    const environmentActual = {
      platform: innerDockerPlatform,
      uid: workerUid,
      workerUid,
      dindUid,
      executables: {
        node: await call(["exec", id, "node", "--version"], { log: false }),
        pnpm: await call(["exec", id, "pnpm", "--version"], { log: false }),
        docker: versionOf(
          await call(["exec", id, "docker", "--version"], { log: false }),
          /Docker version ([^,]+)/,
        ),
        compose: versionOf(
          await call(["exec", id, "docker", "compose", "version"], {
            log: false,
          }),
          /(v\d+\.\d+\.\d+)/,
        ),
        flock: versionOf(
          await call(["exec", id, "flock", "--version"], { log: false }),
          /([0-9]+\.[0-9]+\.[0-9]+)/,
        ),
        ps: versionOf(
          await call(["exec", id, "ps", "--version"], { log: false }),
          /([0-9]+\.[0-9]+\.[0-9]+)/,
        ),
        bash: versionOf(
          await call(["exec", id, "bash", "--version"], { log: false }),
          /version ([0-9]+\.[0-9]+\.[0-9]+)/,
        ),
        openssl: versionOf(
          await call(["exec", id, "openssl", "version"], { log: false }),
          /OpenSSL ([0-9]+\.[0-9]+\.[0-9]+)/,
        ),
        jq: versionOf(
          await call(["exec", id, "jq", "--version"], { log: false }),
          /jq-([0-9]+\.[0-9]+\.[0-9]+)/,
        ),
        git: versionOf(
          await call(["exec", id, "git", "--version"], { log: false }),
          /git version ([0-9]+\.[0-9]+\.[0-9]+)/,
        ),
        tar: versionOf(
          await call(["exec", id, "tar", "--version"], { log: false }),
          /([0-9]+\.[0-9]+)/,
        ),
      },
      images: {
        worker: images["node:24.22.1-bookworm"],
        dind: images["docker:29.9.3-dind"],
        nodeAlpine: images["node:24.22.1-alpine"],
      },
      packages: packageFacts,
    };
    if (environmentActual.dindUid !== 0) throw failure("ENVIRONMENT_UID");
    if (environmentActual.workerUid !== environmentLock.uid)
      throw failure("ENVIRONMENT_UID");
    assertEnvironment(environmentActual, environmentLock, {
      imageKeys: ["worker", "dind", "nodeAlpine"],
      packageKeys: Object.keys(packageFacts),
    });
    record.environment = environmentActual;
    await save(join(evidence, "environment-inventory.json"), environmentActual);
    await verify();
    await call(["exec", id, "node", "--version"], { prerequisite: true });
    phase = "copy";
    stepId = "source-copy";
    // Re-admit retained bytes immediately before copying to the owned engine.
    await verifySourceSnapshot(snapshotRoot);
    await call(["cp", join(snapshotRoot, "source.tar"), `${id}:/source.tar`]);
    await call([
      "cp",
      join(snapshotRoot, "source-snapshot.json"),
      `${id}:/source-snapshot.json`,
    ]);
    await call([
      "exec",
      id,
      "sh",
      "-ceu",
      "test ! -e /workspace; mkdir /workspace; tar --no-same-owner --same-permissions -xf /source.tar -C /workspace",
    ]);
    phase = "assertions";
    stepId = "driver";
    const result = await execute(
      "docker",
      [
        "exec",
        "-w",
        "/workspace",
        id,
        "node",
        "scripts/product/local-rehearsal-driver.mjs",
      ],
      { signal },
    );
    if (result.cleanupUnverified)
      secondaryErrors.push("PROCESS_CLEANUP_UNVERIFIED");
    // Driver emits only an assertion ID/count; raw errors/SQL/credentials stay memory-only.
    await writeFile(
      join(evidence, "driver-output.log"),
      Buffer.concat([result.stdout, result.stderr]),
    ).catch(() => secondaryErrors.push("REPORT_WRITE"));
    // Read a small, schema-validated public terminal before export/cleanup can
    // fail. Never use the private legacy result or parse an assertion message.
    const terminal = await execute(
      "docker",
      ["exec", id, "cat", "/local-evidence/check-report.json"],
      { signal: signal?.aborted ? undefined : signal },
    );
    try {
      if (
        terminal.processCode ||
        terminal.status !== 0 ||
        terminal.stdout.length > 65536
      )
        throw failure("REPORT_INCOMPLETE");
      innerReport = admitInnerReport(JSON.parse(terminal.stdout.toString()), {
        runId: taskId,
        sourceSha256: snapshot.sourceSha256,
        baseSha: snapshot.base,
        status: result.status,
        signal: result.signal,
        processCode: result.processCode,
      });
    } catch {
      secondaryErrors.push("REPORT_INCOMPLETE");
    }
    // Capture driver failure first. A missing/malformed terminal is itself a
    // failure even if the process exit was zero.
    const primaryCode =
      innerReport?.result !== "Passed"
        ? (innerReport?.primary.code ??
          result.processCode ??
          terminal.processCode ??
          "REPORT_INCOMPLETE")
        : null;
    const failureResult =
      result.status !== 0 || result.signal || result.processCode
        ? result
        : terminal.processCode
          ? terminal
          : result;
    const driverFailure = primaryCode
      ? {
          code: primaryCode,
          exitCode: failureResult.status,
          signal: failureResult.signal,
        }
      : undefined;
    if (!innerReport) processFailure = driverFailure;
    phase = "export";
    stepId = "export";
    try {
      await verify(true);
      await call(["cp", `${id}:/local-evidence`, join(evidence, "inner")], {
        retention: true,
      });
    } catch (error) {
      secondaryErrors.push("REHEARSAL_EVIDENCE_EXPORT");
      if (error.code === "REHEARSAL_OWNERSHIP")
        secondaryErrors.push("REHEARSAL_CLEANUP");
      if (!primaryCode) throw error;
      await save(join(evidence, "export-failure.json"), {
        code: "REHEARSAL_EVIDENCE_EXPORT",
        primaryDriverExit: result.status,
      }).catch(() => {});
    }
    if (primaryCode) {
      processFailure = driverFailure;
      phase = "assertions";
      stepId = "driver";
      throw failure(primaryCode);
    }
    const acceptance = innerReport;
    phase = "cleanup";
    stepId = "cleanup";
    // A successful query is required before any deletion. Unknown aliases or
    // sharing retain the whole engine for inspection rather than guessing.
    const sessionImages = await call([
      "image",
      "ls",
      "--all",
      "--quiet",
      "--no-trunc",
      "--filter",
      `label=com.mkw.session=${sessionId}`,
    ]);
    if (
      JSON.stringify([...new Set(sessionImages.split(/\s+/))].sort()) !==
      JSON.stringify(derivedImages.map((image) => image.id).sort())
    )
      throw failure("REHEARSAL_OWNERSHIP");
    for (const image of derivedImages) await admitImage(image, true);
    await verify(); // exact ID/name/labels/marker/mounts/daemon immediately before deletion
    const mounts = (await inspect()).Mounts;
    await call(["rm", "-f", "-v", id]);
    if (await call(["ps", "-aq", "--filter", `id=${id}`]))
      throw failure("REHEARSAL_CLEANUP");
    for (const mount of mounts)
      if (
        mount.Name &&
        (await call(["volume", "ls", "-q", "--filter", `name=^${mount.Name}$`]))
      )
        throw failure("REHEARSAL_CLEANUP");
    for (const image of derivedImages.toReversed()) {
      await admitImage(image, true);
      // Never force removal or prune unowned parent layers. Docker rejects
      // images still in use; failures leave exact retained IDs in ownership.json.
      await call(["image", "rm", "--no-prune", image.id]);
    }
    if (
      await call([
        "image",
        "ls",
        "--all",
        "--quiet",
        "--no-trunc",
        "--filter",
        `label=com.mkw.session=${sessionId}`,
      ])
    )
      throw failure("REHEARSAL_CLEANUP");
    await save(join(evidence, "result.json"), {
      result: "passed",
      taskId,
      sourceSha256: snapshot.sourceSha256,
      durationMs: Date.now() - started.getTime(),
      cleanup: "verified",
      assertions: acceptance.counts.assertions,
      assertionCountUnit: "completed scenario groups",
      live: "Not run",
    });
    phase = "complete";
    stepId = "complete";
    processFailure = undefined;
    await publish(
      projectPublicReport({
        ...innerReport,
        environmentLockSha256,
        result: "Passed",
        primary: { phase, stepId, code: "OK", exitCode: 0 },
        durationMs: Date.now() - started.getTime(),
        secondaryErrors: [...innerReport.secondaryErrors, ...secondaryErrors],
      }),
    );
    console.log("LOCAL_REHEARSAL_OK evidence=public/check-report.json");
  } catch (e) {
    if (phase === "cleanup") secondaryErrors.push("REHEARSAL_CLEANUP");
    if (e.processOutcome) {
      processFailure = e.processOutcome.primary;
      if (e.processOutcome.cleanupUnverified)
        secondaryErrors.push("PROCESS_CLEANUP_UNVERIFIED");
    }
    const code = e.code ?? "REHEARSAL_INTERNAL";
    const environmentFailure = code.startsWith("ENVIRONMENT_");
    let report;
    if (innerReport && innerReport.result !== "Passed")
      report = projectPublicReport({
        ...innerReport,
        environmentLockSha256,
        secondaryErrors: [...innerReport.secondaryErrors, ...secondaryErrors],
        durationMs: Date.now() - started.getTime(),
      });
    else {
      // Export/cleanup command errors must not overwrite a driver failure.
      if (code === "REPORT_INCOMPLETE")
        processFailure = {
          code,
          exitCode: processFailure?.exitCode ?? null,
          signal: processFailure?.signal ?? null,
        };
      try {
        report = makeReport(
          [
            "REHEARSAL_PREREQUISITE",
            "REHEARSAL_STORAGE",
            "PROCESS_SPAWN",
          ].includes(code) || environmentFailure
            ? "Blocked"
            : "Failed",
          code,
        );
      } catch {
        processFailure = undefined;
        report = makeReport("Failed", "REHEARSAL_INTERNAL");
      }
    }
    await publish(report).catch(() => {
      console.error("CHECK_REPORT secondary=REPORT_WRITE");
    });
    await save(join(evidence, "result.json"), {
      result:
        ["REHEARSAL_PREREQUISITE", "REHEARSAL_STORAGE"].includes(e.code) ||
        environmentFailure
          ? "Blocked"
          : "Failed",
      phase: report.primary.phase,
      stepId: report.primary.stepId,
      scenarioId: report.primary.scenarioId,
      code: report.primary.code,
      taskId,
      engine: expected ?? null,
      sessionId,
      derivedImages,
      cleanup: expected
        ? phase === "cleanup"
          ? "cleanup incomplete; inspect owned resources before further action"
          : "retained; no cleanup attempted after failure"
        : secondaryErrors.includes("PROCESS_CLEANUP_UNVERIFIED")
          ? "engine acquisition/cleanup unverified; inspect only owned UUID resources"
          : derivedImages.length
            ? "images retained; no engine acquired; inspect exact session IDs"
            : "no engine acquired",
      durationMs: Date.now() - started.getTime(),
    }).catch(() => {});
    throw failure(report.primary.code);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [evidencePath, taskId] = process.argv.slice(2);
  runOwnedRehearsal({ evidencePath, taskId }).catch((e) => {
    console.error(e.code);
    process.exitCode = 1;
  });
}
