// Docker boundary: actual client/context/image admission, private worker tree,
// validated public terminal and exact owned cleanup. No host mounts.
import { access, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join, delimiter, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  executeRehearsalProcess,
  writeRehearsalEvidence,
} from "../product/local-rehearsal-engine.mjs";
import { classifyEnvironmentFailure } from "./environment.mjs";
import { admitParityTerminal, projectPublicReport } from "./evidence.mjs";

const owner = "MKW-CI-PARITY-001";
const fail = (code) => {
  throw Object.assign(new Error(code), { code });
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export async function findDockerClient({
  path = process.env.PATH,
  platform = process.platform,
} = {}) {
  for (const directory of (path ?? "").split(delimiter).filter(Boolean)) {
    const candidate = resolve(
      directory.replace(/^"|"$/g, ""),
      platform === "win32" ? "docker.exe" : "docker",
    );
    try {
      await access(
        candidate,
        platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK,
      );
      return candidate;
    } catch {
      /* next PATH component */
    }
  }
  fail("ENVIRONMENT_EXECUTABLE");
}
export async function createWorkerSession(context, adapters = {}) {
  const {
    runRoot,
    runId,
    snapshotRoot,
    manifest,
    lock,
    environmentLockSha256,
    signal,
  } = context;
  const execute = adapters.execute ?? executeRehearsalProcess;
  let docker, imageId, container;
  let connectionArgs = [];
  let phase = "prerequisite",
    stepId = "prerequisite";
  const tag = `mkw-ci-parity:${runId}`;
  // Never build/retag a mutable run tag. Distinct sessions with an explicit
  // duplicate run UUID have distinct image configs and atomic container names.
  const sessionId = randomUUID();
  const labels = {
    "com.mkw.owner": owner,
    "com.mkw.task": runId,
    "com.mkw.session": sessionId,
    "com.mkw.lock": environmentLockSha256,
    "com.mkw.dockerfile": hash(
      await readFile(join(snapshotRoot, "source/scripts/ci/Dockerfile")),
    ),
  };
  const labelArgs = Object.entries(labels).flatMap(([k, v]) => [
    "--label",
    `${k}=${v}`,
  ]);
  let sequence = 0;
  const call = async (
    args,
    {
      fetch = false,
      cleanup = false,
      allowFailure = false,
      observe,
      ...options
    } = {},
  ) => {
    const result = await execute(docker, [...connectionArgs, ...args], {
      cwd: context.repoRoot,
      windowsHide: true,
      ...(!cleanup ? { signal } : {}),
      ...options,
    });
    observe?.(result); // before logging, export, or any other fallible await
    const failed = result.status !== 0 || result.signal || result.processCode;
    if (result.cleanupUnverified) fail("REHEARSAL_CLEANUP");
    await writeFile(
      join(runRoot, `worker-${++sequence}.log`),
      Buffer.concat([
        result.stdout ?? Buffer.alloc(0),
        result.stderr ?? Buffer.alloc(0),
      ]),
      { mode: 0o600, flag: "wx" },
    );
    if (failed && !allowFailure) {
      const code =
        result.processCode ??
        (result.signal
          ? "PROCESS_SIGNAL"
          : (classifyEnvironmentFailure({
              fetch,
              output: Buffer.concat([result.stdout, result.stderr]).toString(),
            }) ?? "REHEARSAL_COMMAND"));
      throw Object.assign(new Error(code), {
        code,
        primary: {
          phase: cleanup ? "cleanup" : phase,
          stepId: cleanup ? "cleanup" : stepId,
          code,
          exitCode: result.status,
          signal: result.signal,
        },
      });
    }
    return result;
  };
  const text = async (args, options) =>
    (await call(args, options)).stdout.toString().trim();
  const inspect = async (args, options) =>
    JSON.parse(await text(args, options))[0];
  const checkLabels = (actual) =>
    Object.entries(labels).every(([k, v]) => actual?.[k] === v);
  const admitImage = async (cleanup = false) => {
    const image = await inspect(["image", "inspect", imageId], { cleanup });
    if (image.Id !== imageId || !checkLabels(image.Config?.Labels))
      fail("ENVIRONMENT_IMAGE");
    if (image.Os !== "linux" || image.Architecture !== "amd64")
      fail("ENVIRONMENT_PLATFORM");
    return image;
  };
  const admitContainer = async (cleanup = false) => {
    if (!container) fail("REHEARSAL_OWNERSHIP");
    const actual = await inspect(["inspect", container.id], { cleanup });
    if (
      actual.Id !== container.id ||
      actual.Name !== `/${container.name}` ||
      actual.Image !== imageId ||
      !checkLabels(actual.Config?.Labels) ||
      actual.Config.User !== "1000:1000" ||
      !actual.Config.Env?.includes(
        "npm_config_store_dir=/home/node/.pnpm-store",
      ) ||
      actual.HostConfig?.Privileged !== false ||
      (actual.HostConfig.Binds?.length ?? 0) ||
      !Array.isArray(actual.Mounts) ||
      actual.Mounts.length
    )
      fail("REHEARSAL_OWNERSHIP");
    return actual;
  };
  const removeContainer = async () => {
    if (!container) return;
    await admitContainer(true);
    await call(["rm", "-f", "-v", container.id], { cleanup: true });
    if (
      await text(["ps", "-aq", "--filter", `id=${container.id}`], {
        cleanup: true,
      })
    )
      fail("REHEARSAL_CLEANUP");
    container = undefined;
  };
  return {
    async prepare() {
      docker = await (adapters.findDocker ?? findDockerClient)();
      const name = await text(["context", "show"]);
      const dockerContext = await inspect(["context", "inspect", name]);
      connectionArgs =
        process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT
          ? ["--host", process.env.DOCKER_HOST]
          : ["--context", name];
      const daemon = JSON.parse(await text(["info", "--format", "{{json .}}"]));
      if (
        daemon.OSType !== "linux" ||
        !["x86_64", "amd64"].includes(daemon.Architecture)
      )
        fail("ENVIRONMENT_PLATFORM");
      if (
        !daemon.ID ||
        dockerContext.Name !== name ||
        !dockerContext.Endpoints?.docker?.Host
      )
        fail("REHEARSAL_PREREQUISITE");
      await writeRehearsalEvidence(join(runRoot, "docker-context.json"), {
        client: docker,
        context: dockerContext,
        daemon: {
          id: daemon.ID,
          name: daemon.Name,
          os: daemon.OSType,
          architecture: daemon.Architecture,
        },
      });
      // A successful empty listing proves absence; transport/parse failure is
      // never interpreted as absent. Preserve legacy/prior same-owner runs too.
      if (
        await text(["image", "ls", "--quiet", "--filter", `reference=${tag}`])
      )
        fail("REHEARSAL_OWNERSHIP");
      for (const profile of ["quality", "release-tooling"])
        if (
          await text([
            "ps",
            "-aq",
            "--filter",
            `name=^/mkw-ci-parity-${runId}-${profile}$`,
          ])
        )
          fail("REHEARSAL_OWNERSHIP");
      const inputs = {};
      for (const key of ["worker", "cli"]) {
        const expected = lock.images[key];
        let image;
        const found = await call(["image", "inspect", expected.reference], {
          allowFailure: true,
        });
        if (found.status === 0 && !found.signal && !found.processCode)
          image = JSON.parse(found.stdout)[0];
        else {
          await call(
            ["pull", "--platform", lock.platform, expected.reference],
            { fetch: true },
          );
          image = await inspect(["image", "inspect", expected.reference]);
        }
        if (image.Os !== "linux" || image.Architecture !== "amd64")
          fail("ENVIRONMENT_PLATFORM");
        if (
          ![
            expected.configDigest,
            expected.platformDigest,
            expected.digest,
          ].includes(image.Id) ||
          !image.RepoDigests?.some((x) => x.endsWith(`@${expected.digest}`))
        )
          fail("ENVIRONMENT_IMAGE");
        inputs[key] = image;
      }
      const dockerfile = await readFile(
        join(snapshotRoot, "source/scripts/ci/Dockerfile"),
        "utf8",
      );
      const froms = [...dockerfile.matchAll(/^FROM\s+(\S+)/gm)].map(
        (x) => x[1],
      );
      if (
        JSON.stringify(froms) !==
        JSON.stringify([
          lock.images.cli.reference,
          lock.images.worker.reference,
        ])
      )
        fail("ENVIRONMENT_IMAGE");
      const iid = join(runRoot, "worker-image.id");
      phase = "setup";
      stepId = "engine-setup";
      await call(
        [
          "build",
          "--platform",
          lock.platform,
          ...labelArgs,
          "--iidfile",
          iid,
          join(snapshotRoot, "source/scripts/ci"),
        ],
        { fetch: true },
      );
      imageId = (await readFile(iid, "utf8")).trim();
      if (!/^sha256:[a-f0-9]{64}$/.test(imageId)) fail("ENVIRONMENT_IMAGE");
      const image = await admitImage();
      if (
        image.Config.User !== "node" ||
        !inputs.worker.RootFS?.Layers?.length ||
        !inputs.worker.RootFS.Layers.every(
          (layer, i) => image.RootFS?.Layers?.[i] === layer,
        )
      )
        fail("ENVIRONMENT_IMAGE");
      await writeRehearsalEvidence(join(runRoot, "worker-image.json"), {
        id: imageId,
        platform: lock.platform,
        labels: image.Config.Labels,
        inputs,
      });
    },
    async run(profile) {
      phase = "copy";
      stepId = "source-copy";
      await admitImage();
      const name = `mkw-ci-parity-${runId}-${profile}-${sessionId}`;
      const id = await text([
        "create",
        "--init",
        "--name",
        name,
        ...labelArgs,
        "--user",
        "1000:1000",
        "--workdir",
        "/workspace",
        "--env",
        "npm_config_store_dir=/home/node/.pnpm-store",
        imageId,
        "sleep",
        "infinity",
      ]);
      if (!/^[a-f0-9]{64}$/.test(id)) fail("REHEARSAL_OWNERSHIP");
      container = { id, name };
      await admitContainer();
      await call(["start", id]);
      await call([
        "exec",
        "--user",
        "0:0",
        id,
        "mkdir",
        "-p",
        "/input",
        "/workspace",
        "/reports",
      ]);
      for (const file of ["source.tar", "source-snapshot.json"])
        await call(["cp", join(snapshotRoot, file), `${id}:/input/${file}`]);
      await call([
        "exec",
        "--user",
        "0:0",
        id,
        "bash",
        "-Eeuo",
        "pipefail",
        "-c",
        "chmod 0555 /input; chmod 0444 /input/source.tar /input/source-snapshot.json; tar -xf /input/source.tar -C /workspace; chown -R 1000:1000 /workspace /reports",
      ]);
      await admitContainer();
      await call([
        "exec",
        "--user",
        "1000:1000",
        "--workdir",
        "/workspace",
        id,
        "node",
        "--input-type=module",
        "-e",
        "import {verifySourceSnapshot} from './scripts/ci/source-snapshot.mjs'; await verifySourceSnapshot('/input',{sourceRoot:'/workspace'});",
      ]);
      phase = "setup";
      stepId = "engine-setup";
      await call(
        [
          "exec",
          "--user",
          "1000:1000",
          "--workdir",
          "/workspace",
          "--env",
          "HOME=/home/node",
          id,
          "pnpm",
          "install",
          "--frozen-lockfile",
          "--store-dir",
          "/home/node/.pnpm-store",
        ],
        { fetch: true },
      );
      let result,
        processPrimary,
        report,
        writing = false;
      try {
        await call(
          [
            "exec",
            "--user",
            "1000:1000",
            "--workdir",
            "/workspace",
            "--env",
            "HOME=/home/node",
            "--env",
            "MKW_CI_SNAPSHOT_ROOT=/input",
            "--env",
            `MKW_CI_SOURCE_SHA256=${manifest.sourceSha256}`,
            id,
            "node",
            "scripts/ci/run-checks.mjs",
            "--profile",
            profile,
            "--workspace",
            "/workspace",
            "--report-root",
            "/reports",
            "--run-id",
            runId,
          ],
          {
            allowFailure: true,
            observe: (observed) => {
              result = observed;
              if (
                observed.status !== 0 ||
                observed.signal ||
                observed.processCode
              )
                processPrimary = {
                  phase: "assertions",
                  stepId: "driver",
                  code:
                    observed.processCode ??
                    (observed.signal ? "PROCESS_SIGNAL" : "REHEARSAL_COMMAND"),
                  exitCode: observed.status,
                  signal: observed.signal,
                };
            },
          },
        );
        // Export one validated JSON before teardown, never an arbitrary output tree.
        phase = "export";
        stepId = "export";
        await admitContainer(true);
        const exported = await call(
          [
            "exec",
            "--user",
            "1000:1000",
            id,
            "cat",
            `/reports/${runId}/public/check-report.json`,
          ],
          { allowFailure: true, cleanup: true },
        );
        if (
          exported.status !== 0 ||
          exported.signal ||
          exported.processCode ||
          exported.stdout.length > 65536
        )
          fail("REPORT_INCOMPLETE");
        report = admitParityTerminal(
          JSON.parse(exported.stdout),
          {
            runId,
            profile,
            sourceSha256: manifest.sourceSha256,
            baseSha: manifest.base,
            environmentLockSha256,
            lock,
          },
          result,
        );
        writing = true;
        await writeRehearsalEvidence(
          join(runRoot, `${profile}-report.json`),
          report,
        );
      } catch (error) {
        const primary =
          report && report.result !== "Passed"
            ? report.primary
            : (processPrimary ?? {
                phase: "export",
                stepId: "export",
                code: "REPORT_INCOMPLETE",
                exitCode: 1,
              });
        const fallback = projectPublicReport({
          ...report,
          runId,
          profile,
          sourceSha256: manifest.sourceSha256,
          baseSha: manifest.base,
          environmentLockSha256,
          result: "Failed",
          primary,
          innerReportUnavailable: report?.innerReportUnavailable || !report,
          secondaryErrors: [
            ...(report?.secondaryErrors ?? []),
            ...(result?.cleanupUnverified
              ? ["PROCESS_CLEANUP_UNVERIFIED"]
              : []),
            writing ? "REPORT_WRITE" : "REHEARSAL_EVIDENCE_EXPORT",
            ...(!report ? ["REPORT_INCOMPLETE"] : []),
          ],
        });
        throw Object.assign(error, { primary, report: fallback });
      }
      if (report.result === "Passed") {
        try {
          await removeContainer();
        } catch (error) {
          error.report = report;
          throw error;
        }
      }
      return report;
    },
    async cleanup() {
      await removeContainer();
      if (imageId) {
        await admitImage(true);
        await call(["image", "rm", imageId], { cleanup: true });
        if (
          await text(
            [
              "image",
              "ls",
              "--quiet",
              "--no-trunc",
              "--filter",
              `label=com.mkw.session=${sessionId}`,
            ],
            { cleanup: true },
          )
        )
          fail("REHEARSAL_CLEANUP");
      }
    },
  };
}
