import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { openSandboxTarget } from "../../../scripts/product/sandbox-target.mjs";

export async function freshSandbox() {
  if (process.env.MKW_ATTENDANCE_CLUSTER_OWNER) {
    const { attendanceSandbox, migrate, root } =
      await import("./attendance-sandbox.mjs");
    const db = await attendanceSandbox();
    try {
      await migrate(db);
      return { ...db, root };
    } catch (error) {
      await db.pool.end();
      throw error;
    }
  }
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
  const {
    maxOutputBytes,
    drainMs = 1500,
    timeout,
    signal,
    onOwner,
    ...spawnOptions
  } = options;
  const limit =
    Number.isFinite(maxOutputBytes) && maxOutputBytes >= 0
      ? maxOutputBytes
      : Infinity;
  if (signal?.aborted) {
    const error = new Error("Command was aborted before spawn");
    error.code = "COMMAND_ABORTED";
    throw error;
  }
  return new Promise((resolvePromise, rejectPromise) => {
    let child;
    let markDrained;
    const owner = {
      state: "starting",
      stdioClosed: false,
      descendants: "unverified",
      drained: new Promise((done) => (markDrained = done)),
      snapshot() {
        return {
          state: owner.state,
          stdioClosed: owner.stdioClosed,
          descendants: owner.descendants,
          pid: child?.pid,
        };
      },
    };
    onOwner?.(owner);
    try {
      child = spawn(executable, args, {
        ...spawnOptions,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      owner.state = "drained";
      markDrained();
      const error = new Error("Command could not start");
      error.code = "COMMAND_PROCESS_ERROR";
      error.drained = true;
      rejectPromise(error);
      return;
    }
    owner.state = "running";
    let bytes = 0;
    const chunks = [];
    let failure;
    let settled = false;
    let closed = false;
    let drainTimer;
    let timeoutTimer;
    let abortListener;
    const cleanup = () => {
      child.removeListener("error", onError);
      child.removeListener("close", onClose);
      child.stdout?.removeListener("data", onOutput);
      child.stderr?.removeListener("data", onOutput);
      if (abortListener) signal?.removeEventListener("abort", abortListener);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (drainTimer) clearTimeout(drainTimer);
    };
    const settle = () => {
      if (settled) return;
      settled = true;
      cleanup();
      owner.state = "drained";
      markDrained();
      if (failure) {
        failure.drained = true;
        rejectPromise(failure);
      } else
        resolvePromise({
          code: childExitCode,
          output: Buffer.concat(chunks).toString(),
        });
    };
    const pending = (code, cause) => {
      if (failure) return;
      failure = new Error(
        code === "COMMAND_PROCESS_ERROR"
          ? "Command process failed"
          : `Command ${code.slice("COMMAND_".length).toLowerCase()}`,
      );
      failure.code = code;
      failure.cause = cause;
      owner.state = "stopping";
      try {
        child.kill();
      } catch {
        /* owned child termination is best effort */
      }
      drainTimer = setTimeout(
        () => {
          if (closed || settled) return;
          owner.state = "pending";
          const undrained = new Error(
            "Command descendants or stdio remain pending",
          );
          undrained.code = "COMMAND_DRAIN_PENDING";
          undrained.drained = false;
          undrained.owner = owner;
          settled = true;
          if (timeoutTimer) clearTimeout(timeoutTimer);
          if (abortListener)
            signal?.removeEventListener("abort", abortListener);
          // Retain the owned child's error/close and stream drain handlers. A
          // timeout is not a close event, especially for pnpm descendants on Windows.
          rejectPromise(undrained);
        },
        Math.max(0, drainMs),
      );
    };
    let childExitCode;
    const onOutput = (chunk) => {
      if (failure) return;
      const bytesInChunk = Buffer.byteLength(chunk);
      bytes += bytesInChunk;
      if (bytes > limit) {
        pending("COMMAND_OUTPUT_LIMIT");
        return;
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    };
    const onError = () => pending("COMMAND_PROCESS_ERROR");
    const onClose = (code) => {
      closed = true;
      childExitCode = code;
      owner.stdioClosed = true;
      if (
        failure &&
        process.platform === "win32" &&
        Number.isInteger(child.pid)
      ) {
        // No Windows job/tree owner exists in spawn. Parent/stdio close after
        // termination cannot attest descendants. Keep this invocation owned and
        // FAILED pending identity-checked recovery; never kill a discovered PID.
        cleanup();
        owner.state = "pending";
        failure.code = "COMMAND_DRAIN_PENDING";
        failure.drained = false;
        failure.owner = owner;
        settled = true;
        rejectPromise(failure);
        return;
      }
      owner.descendants = failure ? "stdio-drained" : "normal-exit";
      if (settled) {
        cleanup();
        owner.state = "drained";
        markDrained();
      } else settle();
    };
    child.stdout?.on("data", onOutput);
    child.stderr?.on("data", onOutput);
    child.on("error", onError);
    child.on("close", onClose);
    if (signal) {
      abortListener = () => pending("COMMAND_ABORTED");
      signal.addEventListener("abort", abortListener, { once: true });
      if (signal.aborted) abortListener();
    }
    if (Number.isFinite(timeout) && timeout >= 0)
      timeoutTimer = setTimeout(() => pending("COMMAND_TIMEOUT"), timeout);
    child.stdin.end(input);
  });
}
