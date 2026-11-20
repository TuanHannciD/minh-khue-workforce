// Run the real same-SHA assertion body; only filesystem/transport are doubled.
import { mock } from "node:test";
import * as fs from "node:fs/promises";

const fault = process.argv[2];
let deployed = false,
  site;
const named = Object.fromEntries(
  Object.entries(fs).filter(([k]) => k !== "default"),
);
await mock.module("node:fs/promises", {
  namedExports: {
    ...named,
    readdir: async () => [
      { name: "file", isDirectory: () => false },
      ...(deployed && fault === "identity"
        ? [{ name: "extra", isDirectory: () => false }]
        : []),
      ...(deployed && fault === "absence"
        ? [{ name: "backup-ready.json", isDirectory: () => false }]
        : []),
    ],
    stat: async () => ({
      ino: deployed && fault === "inode" ? 2n : 1n,
      mtimeNs: deployed && fault === "mtime" ? 2n : 1n,
    }),
    readFile: async (path) => {
      if (path.includes("/operations/"))
        return JSON.stringify({
          backupId: fault === "operation" ? "wrong" : "new-backup",
        });
      if (path.includes("/shared/"))
        return JSON.stringify({
          backupId: fault === "shared" ? "wrong" : "new-backup",
        });
      return deployed && fault === "bytes" ? "changed" : "original";
    },
  },
});
// Import after the filesystem replacement; all assertions stay at their owner.
const actual = await import("./deploy-account.mjs");
try {
  await actual.runRealReleaseScenarios(
    {
      target: "/fixture",
      snapshot: {},
      scenario: async (id, body) => {
        if (id === "same_sha_new_backup_preserves_release_inode_bytes")
          await body();
      },
      backup: async () => ({ backupId: "new-backup" }),
      stage: async () => "/stage",
      deploy: async () => {
        deployed = true;
        return { status: 0 };
      },
      releaseInvariant: (value) => {
        site = value;
      },
      verify: async () => {
        throw new Error("must fail before verify");
      },
    },
    { sha: "a".repeat(40) },
  );
  throw new Error("expected an actual invariant failure");
} catch (error) {
  console.log(JSON.stringify({ site, code: error.code ?? null }));
  if (error.code !== "ERR_ASSERTION") process.exitCode = 1;
}
