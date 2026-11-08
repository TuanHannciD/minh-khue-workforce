import { createHash, randomUUID } from "node:crypto";
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

export function readbackOwner(identity, observed) {
  const base = {
    descendants: "tree-unverified",
    releaseClaim: false,
  };
  if (observed === null) return { state: "observed-absent", ...base };
  // Only an explicit absent observation proves absence. Spawn metadata and
  // acquisition timestamps cannot verify a current PID or distinguish reuse.
  const verified = (value) =>
    Number.isSafeInteger(value?.pid) &&
    value.pid > 0 &&
    ["executable", "path", "startTime"].every(
      (key) => typeof value[key] === "string" && value[key].length > 0,
    ) &&
    Number.isFinite(Date.parse(value.startTime)) &&
    value.startTimeSource === "os" &&
    value.startTimeState === "verified";
  if (!verified(identity) || !verified(observed))
    return { state: "identity-unverified", ...base };
  const same = ["pid", "executable", "path", "startTime"].every(
    (key) => observed[key] === identity[key],
  );
  return {
    state: same ? "observed-present" : "identity-reused",
    ...base,
  };
}

export async function command(executable, args, options = {}, input) {
  const {
    maxOutputBytes,
    drainMs = 1500,
    timeout,
    signal,
    onOwner,
    onIdentity,
    role = "command",
    line = null,
    executablePath,
    knownDescendants = null,
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
    const startedAt = new Date().toISOString();
    const lifecycle = {
      role,
      line,
      acquiredAt: startedAt,
      exitTime: null,
      closeTime: null,
      timeout: false,
      abort: false,
      outputLimit: false,
      exitCode: null,
      signal: null,
      causeCode: null,
      stdoutBytes: 0,
      stderrBytes: 0,
      stdoutHash: createHash("sha256"),
      stderrHash: createHash("sha256"),
      events: [],
    };
    const finishLifecycle = () => {
      const stdoutHash = lifecycle.stdoutHash.copy().digest("hex");
      const stderrHash = lifecycle.stderrHash.copy().digest("hex");
      return {
        ...lifecycle,
        outputHash: createHash("sha256")
          .update(`${stdoutHash}${stderrHash}`)
          .digest("hex"),
        stdoutHash,
        stderrHash,
      };
    };
    const event = (name, details = {}) =>
      lifecycle.events.push({ name, at: new Date().toISOString(), ...details });
    const owner = {
      state: "starting",
      stdioClosed: false,
      descendants: "unverified",
      identity: null,
      knownDescendants: Array.isArray(knownDescendants)
        ? [...knownDescendants]
        : null,
      drained: new Promise((done) => (markDrained = done)),
      snapshot() {
        return {
          state: owner.state,
          stdioClosed: owner.stdioClosed,
          descendants: owner.descendants,
          identity: owner.identity,
          knownDescendants: owner.knownDescendants
            ? [...owner.knownDescendants]
            : null,
          lifecycle: finishLifecycle(),
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
      event("start");
      owner.state = "drained";
      markDrained();
      const error = new Error("Command could not start");
      error.code = "COMMAND_PROCESS_ERROR";
      lifecycle.causeCode = error.code;
      error.lifecycle = finishLifecycle();
      error.drained = true;
      rejectPromise(error);
      return;
    }
    owner.identity = {
      pid: child.pid ?? null,
      executable: String(executable),
      path: String(executablePath ?? executable),
      executableSource: "spawn-request",
      pathSource: "spawn-request",
      acquiredAt: new Date().toISOString(),
      startTime: null,
      startTimeSource: null,
      startTimeState: "unverified",
    };
    event("start", { identity: owner.identity });
    owner.state = "running";
    const chunks = [];
    let failure;
    let settled = false;
    let closed = false;
    let drainTimer;
    let timeoutTimer;
    let abortListener;
    const cleanup = () => {
      child.removeListener("error", onError);
      child.removeListener("exit", onExit);
      child.removeListener("close", onClose);
      child.stdout?.removeListener("data", onStdout);
      child.stderr?.removeListener("data", onStderr);
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
        failure.lifecycle = finishLifecycle();
        rejectPromise(failure);
      } else {
        const result = {
          code: childExitCode,
          output: Buffer.concat(chunks).toString(),
        };
        if (role !== "command" || line !== null) {
          result.lifecycle = finishLifecycle();
          result.identity = owner.identity;
          result.knownDescendants = owner.knownDescendants;
        }
        resolvePromise(result);
      }
    };
    const pending = (code) => {
      // Every observed trigger is evidence, even after termination has started.
      lifecycle.causeCode ??= code;
      lifecycle.timeout ||= code === "COMMAND_TIMEOUT";
      lifecycle.abort ||= code === "COMMAND_ABORTED";
      lifecycle.outputLimit ||= code === "COMMAND_OUTPUT_LIMIT";
      event("trigger", { triggerCode: code, causeCode: lifecycle.causeCode });
      if (failure) return;
      failure = new Error(
        code === "COMMAND_PROCESS_ERROR"
          ? "Command process failed"
          : `Command ${code.slice("COMMAND_".length).toLowerCase()}`,
      );
      failure.code = code;
      event("cause", { causeCode: lifecycle.causeCode });
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
          undrained.lifecycle = finishLifecycle();
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
    const onOutput = (chunk, stream) => {
      const bytesInChunk = Buffer.byteLength(chunk);
      if (stream === "stdout") {
        lifecycle.stdoutBytes += bytesInChunk;
        lifecycle.stdoutHash.update(chunk);
      } else {
        lifecycle.stderrBytes += bytesInChunk;
        lifecycle.stderrHash.update(chunk);
      }
      if (lifecycle.stdoutBytes + lifecycle.stderrBytes > limit) {
        pending("COMMAND_OUTPUT_LIMIT");
        return;
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    };
    const onError = () => pending("COMMAND_PROCESS_ERROR");
    const onExit = (code, signalName) => {
      lifecycle.exitTime = new Date().toISOString();
      lifecycle.exitCode = code;
      lifecycle.signal = signalName ?? null;
      event("exit", { exitCode: code, signal: lifecycle.signal });
      if (
        Number.isInteger(code) &&
        code !== 0 &&
        lifecycle.causeCode === null
      ) {
        lifecycle.causeCode = "COMMAND_NONZERO";
        event("cause", { causeCode: lifecycle.causeCode });
      }
    };
    const onClose = (code, signalName) => {
      closed = true;
      childExitCode = code;
      lifecycle.exitCode ??= code;
      lifecycle.signal ??= signalName ?? null;
      lifecycle.closeTime = new Date().toISOString();
      event("close", {
        exitCode: lifecycle.exitCode,
        signal: lifecycle.signal,
      });
      if (
        Number.isInteger(lifecycle.exitCode) &&
        lifecycle.exitCode !== 0 &&
        lifecycle.causeCode === null
      ) {
        lifecycle.causeCode = "COMMAND_NONZERO";
        event("cause", { causeCode: lifecycle.causeCode });
      }
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
        failure.lifecycle = finishLifecycle();
        settled = true;
        rejectPromise(failure);
        return;
      }
      owner.descendants = "unverified";
      if (settled) {
        cleanup();
        owner.state = "drained";
        markDrained();
      } else settle();
    };
    const onStdout = (chunk) => onOutput(chunk, "stdout");
    const onStderr = (chunk) => onOutput(chunk, "stderr");
    child.stdout?.on("data", onStdout);
    child.stderr?.on("data", onStderr);
    child.on("error", onError);
    child.on("exit", onExit);
    child.on("close", onClose);
    if (signal) {
      abortListener = () => pending("COMMAND_ABORTED");
      signal.addEventListener("abort", abortListener, { once: true });
      if (signal.aborted) abortListener();
    }
    if (Number.isFinite(timeout) && timeout >= 0)
      timeoutTimer = setTimeout(() => pending("COMMAND_TIMEOUT"), timeout);
    // Ownership is published before spawn; native-handle metadata is published
    // after spawn and handler attachment. No OS creation time is available here.
    onIdentity?.({ ...owner.identity });
    child.stdin.end(input);
  });
}
