import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { openSandboxTarget } from "../../../scripts/product/sandbox-target.mjs";

export async function freshSandbox() {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const owner = process.env.MKW_TEST_CLUSTER_OWNER;
  if (!owner)
    throw new Error(
      "MKW_TEST_CLUSTER_OWNER must name the verified Task3 cluster owner record",
    );
  const cluster = await openSandboxTarget(owner, "task3-auth");
  const name = `mkw_auth_${randomUUID().replaceAll("-", "_")}`;
  const evidence = resolve(
    root,
    ".agent-runs/MKW-PRODUCT-001/task3-auth",
    name,
  );
  const target = {
    ...cluster.target,
    database: name,
    state: "retained",
    runId: name,
  };
  const targetFile = resolve(evidence, "target.json");
  try {
    await mkdir(evidence);
    await writeFile(targetFile, JSON.stringify(target, null, 2));
    await cluster.pool.query(`CREATE DATABASE "${name}"`);
  } finally {
    await cluster.pool.end();
  }
  const db = await openSandboxTarget(targetFile, "task3-auth");
  try {
    const migration = await command(
      process.platform === "win32" ? "pnpm.exe" : "pnpm",
      ["--filter", "@mkw/api", "db:deploy"],
      { cwd: root, env: { ...process.env, DATABASE_URL: db.connectionString } },
    );
    await writeFile(resolve(evidence, "migration.log"), migration.output);
    if (migration.code !== 0)
      throw new Error(
        "Sandbox migration failed; inspect retained migration.log",
      );
    return { ...db, root, evidence, targetFile };
  } catch (error) {
    await db.pool.end();
    throw error;
  }
}

export async function command(executable, args, options = {}, input) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, {
      ...options,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, output }));
    child.stdin.end(input);
  });
}
