import { execFile, spawn } from "node:child_process";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { parseJsonStrict } from "./validate-manifest.mjs";

export function createGithubApi({
  repository,
  token,
  exec = promisify(execFile),
  spawnCommand = spawn,
}) {
  const call = async (args, options = {}) => {
    const { stdout } = await exec(
      "gh",
      ["api", "--paginate", "--slurp", ...args],
      {
        env: { ...process.env, GH_TOKEN: token },
        timeout: 30000,
        ...options,
      },
    );
    return JSON.parse(stdout);
  };
  const pages = (value) =>
    value.flatMap((page) => page.workflow_runs ?? page.artifacts ?? page);
  const api = {
    // Actions does not expose a trustworthy migration boundary. A missing
    // receipt or a queued/running job cannot prove cancellation is safe.
    async canCancelRun() {
      return false;
    },
    async currentSourceSha() {
      const [ref] = await call([`/repos/${repository}/git/ref/heads/main`]);
      const sha = ref?.object?.sha;
      if (!/^[a-f0-9]{40}$/.test(String(sha)))
        throw new Error("canonical main ref did not return a full SHA");
      return sha;
    },
    async artifact(id) {
      return (await call([`/repos/${repository}/actions/artifacts/${id}`]))[0];
    },
    async cancelRun(id) {
      await exec(
        "gh",
        [
          "api",
          "--method",
          "POST",
          `/repos/${repository}/actions/runs/${id}/cancel`,
        ],
        {
          env: { ...process.env, GH_TOKEN: token },
          timeout: 30000,
        },
      );
    },
    async listArtifacts(name) {
      return pages(
        await call([
          `/repos/${repository}/actions/artifacts?name=${encodeURIComponent(name)}&per_page=100`,
        ]),
      );
    },
    async run(id, attempt) {
      if (attempt !== undefined && !/^[1-9][0-9]*$/.test(String(attempt)))
        throw new Error("invalid Actions run attempt");
      const route = `/repos/${repository}/actions/runs/${id}${attempt === undefined ? "" : `/attempts/${attempt}`}`;
      const run = (await call([route]))[0];
      const workflow = (
        await call([
          `/repos/${repository}/actions/workflows/${run.workflow_id}`,
        ])
      )[0];
      if (String(workflow.id) !== String(run.workflow_id))
        throw new Error("workflow identity mismatch");
      return { ...run, path: workflow.path };
    },
    async runArtifacts(id) {
      return pages(
        await call([
          `/repos/${repository}/actions/runs/${id}/artifacts?per_page=100`,
        ]),
      );
    },
    async runJobs(id, attempt) {
      const result = await call([
        `/repos/${repository}/actions/runs/${id}/attempts/${attempt}/jobs?per_page=100`,
      ]);
      return result.flatMap((page) => page.jobs ?? []);
    },
    async jsonFromArtifact(id, entry) {
      const dir = await mkdtemp(join(tmpdir(), "mkw-coordinator-"));
      try {
        const zip = join(dir, "artifact.zip");
        const file = await open(zip, "w", 0o600);
        try {
          await new Promise((resolve, reject) => {
            const child = spawnCommand(
              "gh",
              [
                "api",
                "-H",
                "Accept: application/zip",
                `/repos/${repository}/actions/artifacts/${id}/zip`,
              ],
              {
                env: { ...process.env, GH_TOKEN: token },
                stdio: ["ignore", file.fd, "pipe"],
                timeout: 30000,
              },
            );
            child.stderr.resume();
            child.once("error", reject);
            child.once("close", (code) =>
              code === 0
                ? resolve()
                : reject(new Error(`artifact ${id} download failed`)),
            );
          });
        } finally {
          await file.close();
        }
        const artifact = await api.artifact(id);
        if (!/^sha256:[a-f0-9]{64}$/.test(artifact.digest ?? ""))
          throw new Error("artifact archive digest is missing or invalid");
        const hash = createHash("sha256");
        for await (const bytes of createReadStream(zip)) hash.update(bytes);
        if (`sha256:${hash.digest("hex")}` !== artifact.digest)
          throw new Error(
            "artifact archive checksum does not match trusted digest",
          );
        const { stdout: names } = await exec("unzip", ["-Z1", zip], {
          timeout: 30000,
        });
        const matches = names
          .trim()
          .split(/\r?\n/)
          .filter((name) => name === entry || name.endsWith(`/${entry}`));
        if (matches.length !== 1)
          throw new Error(`artifact entry ${entry} is ambiguous`);
        const { stdout: value } = await exec("unzip", ["-p", zip, matches[0]], {
          timeout: 30000,
        });
        return parseJsonStrict(value);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    async runs(workflow) {
      const definition = (
        await call([`/repos/${repository}/actions/workflows/${workflow}`])
      )[0];
      return pages(
        await call([
          `/repos/${repository}/actions/workflows/${workflow}/runs?per_page=100`,
        ]),
      ).map((run) => {
        if (String(run.workflow_id) !== String(definition.id))
          throw new Error("workflow identity mismatch");
        return { ...run, path: definition.path };
      });
    },
    async dispatch(workflow, ref, fields) {
      await exec(
        "gh",
        [
          "workflow",
          "run",
          workflow,
          "--repo",
          repository,
          "--ref",
          ref,
          ...Object.entries(fields).flatMap(([key, value]) => [
            "--field",
            `${key}=${value}`,
          ]),
        ],
        { env: { ...process.env, GH_TOKEN: token }, timeout: 30000 },
      );
    },
    async pause() {
      await new Promise((resolve) => setTimeout(resolve, 5000));
    },
    now() {
      return Date.now();
    },
  };

  return api;
}
