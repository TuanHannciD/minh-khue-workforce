import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { writeSync, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import test from "node:test";
import { createGithubApi } from "../../scripts/product/release/github-actions.mjs";

const exec = promisify(execFile);
const unzip =
  process.platform === "win32"
    ? "C:/Program Files/Git/usr/bin/unzip.exe"
    : "unzip";
const zips = [
  "UEsDBBQAAAAAACuGa10LAbnCJAAAACQAAAARAAAAYmFja3VwLXJlYWR5Lmpzb257InJlbGVhc2VTaGEiOiJhYWEiLCJraW5kIjoiQkFDS1VQIn1QSwECFAAUAAAAAAArhmtdCwG5wiQAAAAkAAAAEQAAAAAAAAAAAAAAgAEAAAAAYmFja3VwLXJlYWR5Lmpzb25QSwUGAAAAAAEAAQA/AAAAUwAAAAAA",
  "UEsDBBQAAAAAACuGa11KuFWSMwAAADMAAAARAAAAYmFja3VwLXJlYWR5Lmpzb257ImtpbmQiOiJCQUNLVVAiLCJraW5kIjoiSU5JVElBTF9FTVBUWV9ERVBMT1lNRU5UIn1QSwECFAAUAAAAAAArhmtdSrhVkjMAAAAzAAAAEQAAAAAAAAAAAAAAgAEAAAAAYmFja3VwLXJlYWR5Lmpzb25QSwUGAAAAAAEAAQA/AAAAYgAAAAAA",
  "UEsDBBQAAAAAACuGa11Dv6ajAgAAAAIAAAARAAAAYmFja3VwLXJlYWR5Lmpzb257fVBLAwQUAAAAAAArhmtdQ7+mowIAAAACAAAAGAAAAG5lc3RlZC9iYWNrdXAtcmVhZHkuanNvbnt9UEsBAhQAFAAAAAAAK4ZrXUO/pqMCAAAAAgAAABEAAAAAAAAAAAAAAIABAAAAAGJhY2t1cC1yZWFkeS5qc29uUEsBAhQAFAAAAAAAK4ZrXUO/pqMCAAAAAgAAABgAAAAAAAAAAAAAAIABMQAAAG5lc3RlZC9iYWNrdXAtcmVhZHkuanNvblBLBQYAAAAAAgACAIUAAABpAAAAAAA=",
];

test("ZIP fixture reads exact ID without extracting source or passing a token to unzip", async () => {
  assert.ok(existsSync(unzip) || process.platform !== "win32");
  for (const [index, zip] of zips.entries()) {
    let tempFile;
    const api = createGithubApi({
      repository: "org/repo",
      token: "fixture-write-token",
      spawnCommand(command, args, options) {
        assert.equal(command, "gh");
        assert.equal(args.at(-1), "/repos/org/repo/actions/artifacts/201/zip");
        assert.equal(options.env.GH_TOKEN, "fixture-write-token");
        writeSync(options.stdio[1], Buffer.from(zip, "base64"));
        const child = new EventEmitter();
        child.stderr = new PassThrough();
        queueMicrotask(() => child.emit("close", 0));
        return child;
      },
      async exec(command, args, options) {
        if (command === "gh") {
          assert.equal(args.at(-1), "/repos/org/repo/actions/artifacts/201");
          assert.equal(options.env.GH_TOKEN, "fixture-write-token");
          return {
            stdout: JSON.stringify([
              {
                id: "201",
                digest: `sha256:${createHash("sha256").update(Buffer.from(zip, "base64")).digest("hex")}`,
              },
            ]),
          };
        }
        assert.equal(command, "unzip");
        assert.equal(options?.env?.GH_TOKEN, undefined);
        tempFile = args[1];
        return exec(unzip, args, {
          env: {
            ...process.env,
            GH_TOKEN: "",
            GITHUB_TOKEN: "",
            GH_TOKEN_VALUE: "",
          },
        });
      },
    });
    if (index === 0)
      assert.deepEqual(await api.jsonFromArtifact("201", "backup-ready.json"), {
        releaseSha: "aaa",
        kind: "BACKUP",
      });
    else
      await assert.rejects(
        () => api.jsonFromArtifact("201", "backup-ready.json"),
        /duplicate JSON field|ambiguous/,
      );
    assert.equal(existsSync(tempFile), false);
  }
});

test("API fixture paginates artifacts and obtains workflow path from owning workflow identity", async () => {
  const requested = [];
  const api = createGithubApi({
    repository: "org/repo",
    token: "fixture-token",
    async exec(command, args, options) {
      assert.equal(command, "gh");
      assert.equal(options.env.GH_TOKEN, "fixture-token");
      assert.deepEqual(args.slice(0, 3), ["api", "--paginate", "--slurp"]);
      const path = args.at(-1);
      requested.push(path);
      const response = path.includes("/artifacts?")
        ? [{ artifacts: [{ id: 101 }] }, { artifacts: [{ id: 102 }] }]
        : path.endsWith("/runs/10")
          ? [
              {
                id: 10,
                workflow_id: 100,
                head_sha: "b".repeat(40),
                event: "workflow_run",
              },
            ]
          : [{ id: 100, path: ".github/workflows/build-release.yml" }];
      return { stdout: JSON.stringify(response) };
    },
  });
  assert.deepEqual(
    (await api.listArtifacts("mkw-release-a")).map((a) => a.id),
    [101, 102],
  );
  const run = await api.run("10");
  assert.equal(run.path, ".github/workflows/build-release.yml");
  assert.ok(requested.includes("/repos/org/repo/actions/workflows/100"));
});

test("M-01: cancellation uses bounded POST and accepts an empty successful response", async () => {
  const api = createGithubApi({
    repository: "org/repo",
    token: "fixture-token",
    async exec(command, args, options) {
      assert.equal(command, "gh");
      assert.ok(args.includes("POST"));
      assert.equal(args.at(-1), "/repos/org/repo/actions/runs/30/cancel");
      assert.equal(options.timeout, 30000);
      return { stdout: "" };
    },
  });
  await api.cancelRun("30");
});
