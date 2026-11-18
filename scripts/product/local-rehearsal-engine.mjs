// Outer lifecycle only. Production resource names are isolated by a fresh daemon.
// Admission/snapshot -> image acquisition -> exact ownership -> export -> cleanup.
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  lstat,
  realpath,
  chmod,
  statfs,
  rename,
  unlink,
} from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

function execute(bin, args, options = {}) {
  return new Promise((resolveResult) => {
    const child = spawn(bin, args, {
      cwd: repository,
      stdio: "pipe",
      timeout: 2700000,
      ...options,
    });
    const stdout = [],
      stderr = [];
    child.stdout.on("data", (b) => stdout.push(b));
    child.stderr.on("data", (b) => stderr.push(b));
    child.on("error", () =>
      resolveResult({
        status: 69,
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
      }),
    );
    child.on("close", (status) =>
      resolveResult({
        status,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      }),
    );
    child.stdin.end(options.input);
  });
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
  { attempts = 60, intervalMs = 500 } = {},
) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = await command("docker", [
      "exec",
      container,
      "pg_isready",
      "-h",
      "127.0.0.1",
      "-U",
      "mkw",
      "-d",
      "mkw",
    ]);
    // The official image's temporary init server accepts only local sockets.
    if (result.status === 0) return;
    await new Promise((done) => setTimeout(done, intervalMs));
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

export async function createSourceSnapshot(root, evidence) {
  const listing = await execute(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root },
  );
  if (listing.status !== 0) throw failure("REHEARSAL_SOURCE");
  const files = [];
  const source = join(evidence, "source");
  await mkdir(source);
  for (const path of [
    ...new Set(listing.stdout.toString("utf8").split("\0").filter(Boolean)),
  ].sort()) {
    if (
      /(^|\/)(node_modules|dist|\.git|\.agent-runs|\.superpowers|\.pnpm-store)(\/|$)/.test(
        path,
      ) ||
      (/(^|\/)\.env(?:\.|$)/.test(path) && !path.endsWith(".example")) ||
      path.startsWith("deploy/shared/")
    )
      continue;
    if (
      path.startsWith("/") ||
      path.split("/").some((p) => p === ".." || p === ".") ||
      /[\r\n\0]/.test(path)
    )
      throw failure("REHEARSAL_SOURCE");
    const full = join(root, path);
    const info = await lstat(full).catch((e) => {
      if (e.code === "ENOENT") return null;
      throw e;
    });
    if (!info) continue; // tracked deletions are part of the current workspace
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      resolve(await realpath(full)) !== resolve(full)
    )
      throw failure("REHEARSAL_SOURCE");
    const bytes = await readFile(full);
    const destination = join(source, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
    await chmod(destination, info.mode & 0o777);
    files.push({ path, size: bytes.length, sha256: hash(bytes) });
  }
  const base = await execute("git", ["rev-parse", "HEAD"], { cwd: root });
  const snapshot = {
    schemaVersion: "1",
    base: base.status === 0 ? base.stdout.toString().trim() : null,
    files,
  };
  snapshot.sourceSha256 = hash(JSON.stringify(files));
  // Tar reads the retained copy, never live workspace bytes after hashing.
  const list = join(evidence, "source-files.txt");
  await writeFile(list, `${files.map((f) => f.path).join("\n")}\n`);
  const tar = await execute("tar", [
    "-cf",
    join(evidence, "source.tar"),
    "-C",
    source,
    "-T",
    list,
  ]);
  if (tar.status !== 0) throw failure("REHEARSAL_SOURCE");
  snapshot.archiveSha256 = hash(await readFile(join(evidence, "source.tar")));
  await save(join(evidence, "source-snapshot.json"), snapshot);
  return snapshot;
}

export async function runOwnedRehearsal({
  evidencePath,
  taskId = randomUUID(),
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
  const started = new Date();
  let phase = "prerequisite",
    expected,
    snapshot;
  const commands = [];
  const record = {
    owner,
    taskId,
    name,
    startedUtc: started.toISOString(),
    hostNode: process.version,
    cwd: repository,
    evidence,
  };
  await save(join(evidence, "ownership.json"), record);
  async function call(args, { input, prerequisite = false, log = true } = {}) {
    const before = Date.now();
    const result = await execute("docker", args, { input });
    const entry = {
      command: ["docker", ...args],
      cwd: repository,
      startedUtc: new Date(before).toISOString(),
      durationMs: Date.now() - before,
      exit: result.status,
    };
    commands.push(entry);
    if (log) {
      // No application commands/credentials run through this logger.
      await writeFile(
        join(evidence, `outer-${commands.length}.log`),
        Buffer.concat([result.stdout, result.stderr]),
      );
    }
    await save(join(evidence, "outer-commands.json"), commands);
    if (result.status !== 0)
      throw failure(
        prerequisite ? "REHEARSAL_PREREQUISITE" : "REHEARSAL_COMMAND",
      );
    return result.stdout.toString().trim();
  }
  const inspect = async () =>
    JSON.parse(await call(["inspect", expected.id], { log: false }))[0];
  async function verify() {
    const inspection = await inspect();
    const marker = JSON.parse(
      await call(["exec", expected.id, "cat", "/mkw-local-owned.json"], {
        log: false,
      }),
    );
    const daemon = await call(
      ["exec", expected.id, "docker", "info", "--format", "{{.Name}}"],
      { log: false },
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
      { prerequisite: true },
    );
    if (await call(["ps", "-aq", "--filter", `name=^/${name}$`]))
      throw failure("REHEARSAL_OWNERSHIP");
    phase = "snapshot";
    snapshot = await createSourceSnapshot(repository, evidence);
    phase = "setup";
    const images = {};
    for (const tag of ["docker:29-dind", "node:24.22.1-alpine"]) {
      await save(join(evidence, "acquisition.json"), {
        ...record,
        requested: tag,
        images,
      });
      await call(["pull", tag], { prerequisite: true });
      const image = JSON.parse(
        await call(["image", "inspect", tag], { log: false }),
      )[0];
      images[tag] = { id: image.Id, digest: image.RepoDigests[0] };
      if (!/@sha256:[a-f0-9]{64}$/.test(images[tag].digest))
        throw failure("REHEARSAL_PREREQUISITE");
    }
    record.images = images;
    const setup = join(evidence, "engine-setup");
    await mkdir(setup);
    await writeFile(
      join(setup, "Dockerfile"),
      `FROM ${images["docker:29-dind"].digest}\nRUN apk add --no-cache bash coreutils util-linux curl openssl git jq tar libstdc++ procps\nCOPY --from=${images["node:24.22.1-alpine"].digest} /usr/local/bin/node /usr/local/bin/node\nRUN ps -eo pid,args >/dev/null && node --version | grep -x v24.22.1\n`,
    );
    const engineTag = `${name}:engine`;
    await save(join(evidence, "acquisition.json"), { ...record, engineTag });
    await call(
      [
        "build",
        "--label",
        `com.mkw.owner=${owner}`,
        "--label",
        `com.mkw.task=${taskId}`,
        "-t",
        engineTag,
        setup,
      ],
      { prerequisite: true },
    );
    record.engineImage = JSON.parse(
      await call(["image", "inspect", engineTag], { log: false }),
    )[0].Id;
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
      "-e",
      "DOCKER_TLS_CERTDIR=",
      record.engineImage,
      "--storage-driver=overlay2",
      "--log-level=error",
    ]);
    expected = { id, name, taskId };
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
      const probe = await execute("docker", [
        "exec",
        id,
        "docker",
        "info",
        "--format",
        "{{.Name}}",
      ]);
      if (probe.status === 0) {
        ready = true;
        break;
      }
      await new Promise((done) => setTimeout(done, 1000));
    }
    if (!ready) throw failure("REHEARSAL_PREREQUISITE");
    await verify();
    await call(["exec", id, "node", "--version"], { prerequisite: true });
    phase = "copy";
    await call(["cp", join(evidence, "source.tar"), `${id}:/source.tar`]);
    await call([
      "cp",
      join(evidence, "source-snapshot.json"),
      `${id}:/source-snapshot.json`,
    ]);
    await call([
      "exec",
      id,
      "sh",
      "-ceu",
      "test ! -e /workspace; mkdir /workspace; tar -xf /source.tar -C /workspace",
    ]);
    phase = "assertions";
    const result = await execute("docker", [
      "exec",
      "-w",
      "/workspace",
      id,
      "node",
      "scripts/product/local-rehearsal-driver.mjs",
    ]);
    // Driver emits only an assertion ID/count; raw errors/SQL/credentials stay memory-only.
    await writeFile(
      join(evidence, "driver-output.log"),
      Buffer.concat([result.stdout, result.stderr]),
    );
    await verify();
    try {
      await call(["cp", `${id}:/local-evidence`, join(evidence, "inner")]);
    } catch (error) {
      if (result.status === 0) throw error;
      await save(join(evidence, "export-failure.json"), {
        code: "REHEARSAL_EVIDENCE_EXPORT",
        primaryDriverExit: result.status,
      });
    }
    if (result.status !== 0) throw failure("REHEARSAL_ASSERTION");
    const acceptance = JSON.parse(
      await readFile(join(evidence, "inner/result.json"), "utf8"),
    );
    if (acceptance.result !== "passed") throw failure("REHEARSAL_ASSERTION");
    phase = "cleanup";
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
    const built = JSON.parse(
      await call(["image", "inspect", record.engineImage], { log: false }),
    )[0];
    if (
      built.Config.Labels?.["com.mkw.task"] !== taskId ||
      built.Config.Labels?.["com.mkw.owner"] !== owner
    )
      throw failure("REHEARSAL_OWNERSHIP");
    await call(["image", "rm", engineTag]);
    await save(join(evidence, "result.json"), {
      result: "passed",
      taskId,
      sourceSha256: snapshot.sourceSha256,
      durationMs: Date.now() - started.getTime(),
      cleanup: "verified",
      assertions: acceptance.assertions,
      assertionCountUnit: acceptance.assertionCountUnit,
      live: "Not run",
    });
    console.log(`LOCAL_REHEARSAL_OK evidence=${evidence}`);
  } catch (e) {
    await save(join(evidence, "result.json"), {
      result: ["REHEARSAL_PREREQUISITE", "REHEARSAL_STORAGE"].includes(e.code)
        ? "Blocked"
        : "Failed",
      phase,
      code: /^REHEARSAL_[A-Z_]+$/.test(e.code ?? "")
        ? e.code
        : "REHEARSAL_INTERNAL",
      taskId,
      engine: expected ?? null,
      cleanup: expected
        ? "retained; no cleanup attempted after failure"
        : "no engine acquired",
      durationMs: Date.now() - started.getTime(),
    });
    throw failure(
      e.code?.startsWith("REHEARSAL_") ? e.code : "REHEARSAL_INTERNAL",
    );
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
