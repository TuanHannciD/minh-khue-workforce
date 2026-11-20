import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, cp, rm } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import { spawnSync as original } from "node:child_process";
import {
  projectPublicReport,
  validatePublicReport,
} from "../../../scripts/ci/evidence.mjs";
const root = resolve(import.meta.dirname, "../../..");
const imageId = "sha256:" + "a".repeat(64),
  containerId = "b".repeat(64);
export const canary = "private-env=NEVER_PUBLISH_THIS";
export async function fixture(t, fault = "none") {
  const directory = await mkdtemp(join(tmpdir(), "mkw parity dấu "));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repoRoot = join(directory, "repo có dấu"),
    evidenceRoot = join(directory, "evidence");
  await mkdir(join(repoRoot, "scripts/ci"), { recursive: true });
  for (const path of [
    "scripts/ci/Dockerfile",
    "scripts/ci/environment-lock.json",
    "package.json",
  ])
    await cp(join(root, path), join(repoRoot, path));
  assert.equal(original("git", ["init", "--quiet", repoRoot]).status, 0);
  const lock = JSON.parse(
    await readFile(join(repoRoot, "scripts/ci/environment-lock.json"), "utf8"),
  );
  const runId = randomUUID(),
    calls = [],
    profiles = [];
  const beforeImageCleanup = [];
  let labels, profile, reportId, source, inspection, outerRunRoot;
  const execute = async (bin, args) => {
    if (["--context", "--host"].includes(args[0])) args = args.slice(2);
    calls.push({ bin, args });
    if (args[0] === "image" && args[1] === "rm")
      beforeImageCleanup.push(
        JSON.parse(
          await readFile(
            join(outerRunRoot, "public/check-report.json"),
            "utf8",
          ),
        ),
      );
    let out = "",
      status = 0,
      signal = null,
      processCode = null;
    if (args[0] === "context")
      out =
        args[1] === "show"
          ? "fixture-context"
          : JSON.stringify([
              {
                Name: "fixture-context",
                Endpoints: { docker: { Host: "unix:///fixture" } },
              },
            ]);
    else if (args[0] === "info")
      out = JSON.stringify({
        OSType: fault === "daemon" ? "windows" : "linux",
        Architecture: "x86_64",
        ID: "fixture-daemon",
        Name: "fixture",
      });
    else if (args[0] === "build") {
      outerRunRoot = dirname(args[args.indexOf("--iidfile") + 1]);
      labels = Object.fromEntries(
        args.flatMap((x, i) =>
          x === "--label" ? [args[i + 1].split("=")] : [],
        ),
      );
      await writeFile(args[args.indexOf("--iidfile") + 1], imageId);
      if (fault === "fetch") {
        status = 1;
        out = "registry connection refused " + canary;
      }
    } else if (args[0] === "image" && args[1] === "inspect") {
      const pinned = Object.values(lock.images).find(
        (x) => x.reference === args[2],
      );
      out = JSON.stringify([
        pinned
          ? {
              Id: fault === "manifest-id" ? pinned.digest : pinned.configDigest,
              Os: "linux",
              Architecture: "amd64",
              RepoDigests: [pinned.reference],
              RootFS: { Layers: ["base-layer"] },
            }
          : {
              Id: imageId,
              Os: "linux",
              Architecture: fault === "image-platform" ? "arm64" : "amd64",
              Config: {
                User: "node",
                Labels: fault === "provenance" ? {} : labels,
              },
              RootFS: { Layers: ["base-layer", "worker-layer"] },
            },
      ]);
    } else if (args[0] === "create") {
      profile = args[args.indexOf("--name") + 1].includes("-release-tooling")
        ? "release-tooling"
        : "quality";
      inspection = {
        Id: containerId,
        Image: imageId,
        Name: `/${args[args.indexOf("--name") + 1]}`,
        Config: {
          User: "1000:1000",
          Labels: labels,
          Env: args.flatMap((a, i) => (a === "--env" ? [args[i + 1]] : [])),
        },
        HostConfig: { Privileged: false, Binds: [], NetworkMode: "bridge" },
        Mounts:
          fault === "mount"
            ? [{ Type: "bind", Destination: "/workspace", RW: true }]
            : [],
      };
      out = containerId;
    } else if (args[0] === "inspect") out = JSON.stringify([inspection]);
    else if (args[0] === "cp" && args[1].endsWith("source-snapshot.json"))
      source = JSON.parse(await readFile(args[1], "utf8"));
    else if (args[0] === "exec" && args.includes("--profile")) {
      reportId = args[args.indexOf("--run-id") + 1];
      profiles.push({
        profile: args[args.indexOf("--profile") + 1],
        source: source.sourceSha256,
      });
      if (fault === "exit") status = 17;
      if (fault === "admission") status = 1;
      if (fault === "signal") {
        status = null;
        signal = "SIGTERM";
        processCode = "PROCESS_SIGNAL";
      }
    } else if (args[0] === "exec" && args.includes("cat")) {
      const failed = ["exit", "signal"].includes(fault);
      out = JSON.stringify(
        projectPublicReport({
          runId: reportId,
          sourceSha256: source.sourceSha256,
          baseSha: source.base,
          profile,
          environmentLockSha256: labels["com.mkw.lock"],
          result: failed ? "Failed" : "Passed",
          primary: failed
            ? {
                phase: "assertions",
                stepId: "tooling-release",
                code:
                  fault === "signal" ? "PROCESS_SIGNAL" : "REHEARSAL_COMMAND",
                exitCode: fault === "exit" ? 17 : null,
                signal: fault === "signal" ? "SIGTERM" : null,
              }
            : {
                phase: "complete",
                stepId: "complete",
                code: "OK",
                exitCode: 0,
              },
          runtime: {
            node: "v24.22.1",
            pnpm: "12.15.0",
            platform: "linux",
            arch: "x64",
            uid: 1000,
          },
        }),
      );
      if (fault === "missing") {
        out = "";
        status = 1;
      }
      if (fault === "foreign") out = out.replace(reportId, randomUUID());
      if (fault === "admission") {
        const report = JSON.parse(out);
        report.sourceSha256 = null;
        report.baseSha = null;
        report.environmentLockSha256 = null;
        report.runtime.pnpm = null;
        report.result = "Failed";
        report.primary = {
          phase: "prerequisite",
          stepId: "prerequisite",
          scenarioId: null,
          code: "REHEARSAL_SOURCE",
          exitCode: 1,
          signal: null,
        };
        out = JSON.stringify(report);
      }
    } else if (args[0] === "rm" && fault === "cleanup") {
      status = 1;
      out = canary;
    }
    return {
      status,
      signal,
      processCode,
      stdout: Buffer.from(out),
      stderr: Buffer.alloc(0),
      closeObserved: true,
      cleanupUnverified: false,
    };
  };
  const rehearsals = [];
  const rehearse = async ({ taskId, evidencePath, sourceSnapshot }) => {
    rehearsals.push(sourceSnapshot);
    await mkdir(join(evidencePath, "public"), { recursive: true });
    await writeFile(
      join(evidencePath, "public/check-report.json"),
      JSON.stringify(
        projectPublicReport({
          runId: taskId,
          profile: "rehearsal",
          sourceSha256: sourceSnapshot.manifest.sourceSha256,
          baseSha: sourceSnapshot.manifest.base,
          environmentLockSha256: createHash("sha256")
            .update(
              await readFile(
                join(
                  sourceSnapshot.root,
                  "source/scripts/ci/environment-lock.json",
                ),
              ),
            )
            .digest("hex"),
          runtime: {
            node: "v24.22.1",
            platform: "linux",
            arch: "x64",
            uid: 0,
            docker: "29.9.3",
            compose: "v5.7.1",
          },
          result: "Passed",
          primary: {
            phase: "complete",
            stepId: "complete",
            code: "OK",
            exitCode: 0,
          },
        }),
      ),
    );
  };
  const output = [];
  return {
    repoRoot,
    evidenceRoot,
    runId,
    calls,
    beforeImageCleanup,
    profiles,
    rehearsals,
    output,
    adapters: {
      execute,
      rehearse,
      findDocker: async () => process.execPath,
      output: (x) => output.push(x),
    },
    report: async () =>
      validatePublicReport(
        JSON.parse(
          await readFile(
            join(evidenceRoot, runId, "public/check-report.json"),
            "utf8",
          ),
        ),
      ),
  };
}
