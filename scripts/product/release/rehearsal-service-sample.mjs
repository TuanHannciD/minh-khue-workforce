// Rehearsal-only read decisions. No CI imports: deployed controls inventory
// owns this file. Read cancellation is separate from inherited tree settlement.
// Map: classifyServiceSample/readServiceCategory own fixed observations;
// superviseServiceSample owns S/T admission, bounded census and settlement;
// anchor/main own the private READY/GO/W protocol and CLI token transport.
// These modes share one lifecycle: A must outlive every worker outcome until T.
import { spawn } from "node:child_process";
import { open, opendir, realpath, lstat, access } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, join } from "node:path";
import { pathToFileURL } from "node:url";

/** @typedef {'healthy'|'db-bad'|'api-bad'|'gateway-bad'|'multiple-bad'|'unknown'|'unavailable'} ServiceCategory */
/** @typedef {'created'|'running'|'restarting'|'exited'|'dead'|'paused'|'removing'} State */
/** @typedef {'healthy'|'unhealthy'|'starting'|'none'} Health */
/** @typedef {{service:'db'|'api'|'gateway',presence:'absent'|'present',state:null|State,health:null|Health}} SampleRow */
const services = ["db", "api", "gateway"];
const states = [
  "created",
  "running",
  "restarting",
  "exited",
  "dead",
  "paused",
  "removing",
];
const healths = ["healthy", "unhealthy", "starting", "none"];
const categories = [
  "healthy",
  "db-bad",
  "api-bad",
  "gateway-bad",
  "multiple-bad",
  "unknown",
  "unavailable",
];
const template =
  '{{.Id}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}|{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}';
const validInput = (input) =>
  input &&
  /^[a-z0-9][a-z0-9_-]*$/.test(input.project) &&
  typeof input.composePath === "string" &&
  input.composePath.startsWith("/") &&
  !/[\0\r\n]/.test(input.composePath);

/** @param {readonly SampleRow[]} rows @returns {ServiceCategory} */
export function classifyServiceSample(rows) {
  if (!Array.isArray(rows) || rows.length !== 3) return "unknown";
  const bad = [];
  for (const [i, row] of rows.entries()) {
    if (
      !row ||
      Object.keys(row).sort().join() !== "health,presence,service,state" ||
      row.service !== services[i]
    )
      return "unknown";
    if (row.presence === "absent") {
      if (row.state !== null || row.health !== null) return "unknown";
      bad.push(row.service);
    } else if (
      row.presence === "present" &&
      states.includes(row.state) &&
      healths.includes(row.health)
    ) {
      if (row.state !== "running" || row.health === "unhealthy")
        bad.push(row.service);
      else if (row.health !== "healthy") return "unknown";
    } else return "unknown";
  }
  return bad.length > 1
    ? "multiple-bad"
    : bad.length === 1
      ? `${bad[0]}-bad`
      : "healthy";
}

/** Fixed queries only; timeout decides observations, never proves child death.
 * @returns {Promise<ServiceCategory>} */
export async function readServiceCategory(input, adapters = {}) {
  if (!validInput(input)) return "unavailable";
  const launch = adapters.spawn ?? spawn,
    now = adapters.now ?? (() => performance.now());
  const deadline = Math.min(now() + 1500, adapters.deadline ?? Infinity);
  if (!Number.isFinite(deadline)) return "unavailable";
  let total = 0,
    cancelled = false;
  const cancel = () => {
    cancelled = true;
  };
  adapters.signal?.addEventListener("abort", cancel, { once: true });
  async function query(args) {
    const remaining = deadline - now();
    if (cancelled || adapters.signal?.aborted || remaining <= 0) return null;
    return new Promise((resolve) => {
      let child,
        size = 0,
        buffers = [],
        done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        // Destroy pipes to stop accepting bytes. A/T retain process ownership.
        child?.stdout?.destroy();
        child?.stderr?.destroy();
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), Math.min(250, remaining));
      try {
        child = launch("docker", args, {
          detached: false,
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
        });
        child.on("error", () => finish(null));
        child.stdout.on("error", () => finish(null));
        child.stderr.on("error", () => finish(null));
        child.stdout.on("data", (b) => {
          if (done) return;
          if (size + b.length > 1024 || total + b.length > 4096) {
            finish(null);
            return;
          }
          size += b.length;
          total += b.length;
          buffers.push(b);
        });
        child.stderr.on("data", (b) => {
          if (done) return;
          if (total + b.length > 4096) {
            finish(null);
            return;
          }
          total += b.length;
        });
        child.on("close", (code, signal) =>
          finish(
            code === 0 && signal === null
              ? Buffer.concat(buffers).toString("utf8")
              : null,
          ),
        );
      } catch {
        finish(null);
      }
    });
  }
  const rows = [],
    seen = new Set();
  try {
    for (const service of services) {
      const output = await query([
        "compose",
        "-p",
        input.project,
        "-f",
        input.composePath,
        "ps",
        "--all",
        "--quiet",
        service,
      ]);
      if (output === null) return "unavailable";
      if (output === "" || output === "\n") {
        rows.push({ service, presence: "absent", state: null, health: null });
        continue;
      }
      if (!/^[a-f0-9]{64}\n?$/.test(output)) {
        rows.push(null);
        continue;
      }
      const id = output.replace(/\n$/, "");
      if (seen.has(id)) {
        rows.push(null);
        continue;
      }
      seen.add(id);
      const inspected = await query([
        "container",
        "inspect",
        "--format",
        template,
        id,
      ]);
      if (inspected === null) return "unavailable";
      const fields = inspected.replace(/\n$/, "").split("|");
      if (
        fields.length !== 5 ||
        fields[0] !== id ||
        fields[1] !== input.project ||
        fields[2] !== service ||
        /[\r\n]/.test(fields.join(""))
      )
        rows.push(null);
      else
        rows.push({
          service,
          presence: "present",
          state: fields[3],
          health: fields[4],
        });
    }
    return classifyServiceSample(rows);
  } catch {
    return "unavailable";
  } finally {
    adapters.signal?.removeEventListener("abort", cancel);
  }
}

const helper = import.meta.filename;
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function boundedRead(path) {
  const file = await open(path, "r");
  try {
    const buffer = Buffer.alloc(4097);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 4096) throw new Error("bound");
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await file.close();
  }
}
async function procIdentity(pid, read = boundedRead) {
  try {
    const text = await read(`/proc/${pid}/stat`);
    const fields = text
      .slice(text.lastIndexOf(")") + 2)
      .trim()
      .split(/\s+/);
    if (!/^\d+$/.test(fields[19]) || Number(text.split(" ", 1)[0]) !== pid)
      throw new Error("identity");
    return {
      pid,
      state: fields[0],
      ppid: +fields[1],
      pgid: +fields[2],
      sid: +fields[3],
      start: fields[19],
    };
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ESRCH") return null;
    throw error;
  }
}
async function executable(name) {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!directory.startsWith("/")) continue;
    const path = join(directory, name);
    try {
      await access(path, constants.X_OK);
      if ((await lstat(await realpath(path))).isFile()) return path;
    } catch {
      /* Try next explicit PATH entry. */
    }
  }
  throw new Error("prerequisite");
}

/** Internal settlement is memory/test-only, never part of the public report. */
export async function superviseServiceSample(input, adapters = {}) {
  const unavailable = { category: "unavailable", settlement: "unverified" };
  const now = adapters.now ?? (() => performance.now()),
    started = now();
  const read = adapters.read ?? boundedRead,
    launch = adapters.spawn ?? spawn;
  try {
    if (process.platform !== "linux" || !validInput(input)) return unavailable;
    if (
      (await realpath(input.composePath)) !== input.composePath ||
      !(await lstat(input.composePath)).isFile()
    )
      return unavailable;
    const boot = (await read("/proc/sys/kernel/random/boot_id")).trim();
    if (!/^[a-f0-9-]{36}$/.test(boot)) return unavailable;
    const self = await procIdentity(process.pid, read);
    if (!self || self.sid !== process.pid || self.pgid !== process.pid)
      return unavailable;
    const timeout = await executable("timeout");
    await executable("setsid");
    if (now() - started >= 100) return unavailable;
    const tree = launch(
      timeout,
      [
        "--signal=KILL",
        "3s",
        process.execPath,
        helper,
        "--anchor",
        input.project,
        input.composePath,
      ],
      {
        detached: true,
        shell: false,
        stdio: ["pipe", "pipe", "ignore"],
      },
    );
    const treeStarted = now();
    let buffer = "",
      candidate = null,
      ready = false,
      go = false,
      failed = false,
      closed = false;
    const known = new Map();
    let proof = true;
    tree.on("error", () => {
      failed = true;
    });
    tree.stdin.on("error", () => {
      failed = true;
    });
    tree.stdout.on("error", () => {
      failed = true;
    });
    const terminated = new Promise((resolve) => {
      tree.once("exit", (code, signal) => resolve({ code, signal }));
      tree.once("error", () => resolve(null));
    });
    tree.once("close", () => {
      closed = true;
    });
    async function census() {
      let count = 0,
        live = false;
      const directory = await (adapters.opendir ?? opendir)("/proc");
      for await (const entry of directory) {
        if (!/^\d+$/.test(entry.name)) continue;
        if (++count > 4096) throw new Error("census bound");
        const record = await procIdentity(+entry.name, read);
        if (!record) continue;
        if (record.sid === tree.pid || record.pgid === tree.pid) {
          const key = `${boot}:${record.pid}:${record.start}`;
          if (!known.has(key) && known.size >= 64)
            throw new Error("identity bound");
          known.set(key, record);
          if (record.sid !== tree.pid || record.pgid !== tree.pid)
            throw new Error("containment");
          if (!["Z", "X"].includes(record.state)) live = true;
        }
      }
      for (const record of known.values()) {
        const current = await procIdentity(record.pid, read);
        if (
          current?.start === record.start &&
          !["Z", "X"].includes(current.state)
        ) {
          if (current.sid !== tree.pid || current.pgid !== tree.pid)
            throw new Error("escape");
          live = true;
        }
      }
      return !live;
    }
    const observations = [];
    const observe = () => {
      const previous = observations.at(-1) ?? Promise.resolve();
      observations.push(
        previous.then(census).catch(() => {
          proof = false;
        }),
      );
    };
    let owner;
    try {
      owner = await procIdentity(tree.pid, read);
    } catch {
      failed = true;
      proof = false;
    }
    if (
      !owner ||
      owner.ppid !== process.pid ||
      owner.pgid !== tree.pid ||
      owner.sid !== tree.pid ||
      owner.pgid === self.pgid
    )
      failed = true;
    else known.set(`${boot}:${owner.pid}:${owner.start}`, owner);
    tree.stdout.on("data", (chunk) => {
      if (failed) return;
      if (Buffer.byteLength(buffer) + chunk.length > 32) {
        failed = true;
        return;
      }
      buffer += chunk.toString("latin1");
      const lines = buffer.split("\n");
      if (!ready) {
        if (lines.length === 1) return;
        // Only a complete, exact first frame authorizes identity admission.
        // A cannot send a category (or another frame) before receiving GO.
        if (buffer !== "READY\n") {
          failed = true;
          return;
        }
        ready = true;
        // Re-admit the original leader identity at the actual GO boundary.
        // A stale/reused PID is never authority to start a worker or signal.
        procIdentity(tree.pid, read)
          .then((current) => {
            if (
              !current ||
              current.start !== owner?.start ||
              current.ppid !== process.pid ||
              current.pgid !== tree.pid ||
              current.sid !== tree.pid ||
              ["Z", "X"].includes(current.state)
            ) {
              failed = true;
              proof = false;
            }
            if (now() - started > 100) failed = true;
            if (!failed) {
              observe();
              go = true;
              try {
                tree.stdin.write("GO\n");
              } catch {
                failed = true;
              }
            }
          })
          .catch(() => {
            failed = true;
            proof = false;
          });
      } else if (!go) {
        failed = true;
        return;
      }
      if (lines.length >= 3) {
        if (
          !go ||
          lines.length !== 3 ||
          lines[2] !== "" ||
          !categories.includes(lines[1]) ||
          candidate
        )
          failed = true;
        else candidate = lines[1];
        observe();
      }
    });
    const outcome = await terminated;
    tree.stdin.destroy();
    // exit can precede close when an inherited pipe survives. Never await that
    // pipe indefinitely; missing close prevents category admission.
    const settlementDeadline = now() + 200;
    await Promise.all(observations);
    let settled = false;
    for (let pass = 0; pass < 4 && now() < settlementDeadline; pass++) {
      try {
        if (await census()) {
          settled = true;
          break;
        }
      } catch {
        proof = false;
        break;
      }
      await pause(Math.min(20, Math.max(0, settlementDeadline - now())));
    }
    if (!closed)
      await pause(Math.min(10, Math.max(0, settlementDeadline - now())));
    tree.stdout.destroy();
    const normalDeadline =
      outcome?.signal === "SIGKILL" && now() - treeStarted >= 3000;
    if (!proof || !settled || !normalDeadline || now() > settlementDeadline)
      return unavailable;
    return {
      category:
        !failed && ready && candidate && closed ? candidate : "unavailable",
      settlement: "settled",
    };
  } catch {
    return unavailable;
  }
}
export async function sampleServiceCategory(input, adapters = {}) {
  const result = await superviseServiceSample(input, adapters);
  return result.settlement === "settled" ? result.category : "unavailable";
}

async function anchor(input) {
  // The lifetime owner deliberately survives W outcomes and S pipe loss.
  process.stdout.on("error", () => {});
  process.stdin.on("error", () => {});
  const self = await procIdentity(process.pid),
    parent = self && (await procIdentity(self.ppid));
  if (!self || !parent || self.sid !== parent.pid || self.pgid !== parent.pid)
    return;
  setInterval(() => {}, 1000);
  process.stdout.write("READY\n");
  let control = "",
    worker,
    cancelled = false;
  const cancel = () => {
    cancelled = true;
    try {
      worker?.send("CANCEL", () => {});
    } catch {
      /* Anchor stays alive. */
    }
  };
  process.stdin.on("end", cancel);
  process.stdin.on("data", (chunk) => {
    if (cancelled) return;
    if (control.length + chunk.length > 3) {
      cancel();
      return;
    }
    control += chunk.toString("latin1");
    if (control !== "GO\n" || worker) return;
    // hrtime shares the Linux monotonic clock across A/W. Worker bootstrap
    // consumes this budget; it cannot start a fresh 1500ms window after GO.
    const readDeadline = process.hrtime.bigint() + 1500000000n;
    worker = spawn(
      process.execPath,
      [helper, "--worker", input.project, input.composePath],
      {
        detached: false,
        shell: false,
        stdio: ["ignore", "pipe", "ignore", "ipc"],
      },
    );
    let result = "",
      invalid = false;
    worker.on("error", () => {
      invalid = true;
    });
    worker.stdout.on("error", () => {
      invalid = true;
    });
    worker.stdout.on("data", (chunk) => {
      if (invalid) return;
      if (Buffer.byteLength(result) + chunk.length > 16) {
        invalid = true;
        worker.stdout.destroy();
        return;
      }
      result += chunk.toString("latin1");
    });
    worker.once("close", (code, signal) => {
      const token = result.endsWith("\n") ? result.slice(0, -1) : null;
      process.stdout.write(
        `${!invalid && code === 0 && signal === null && categories.includes(token) ? token : "unavailable"}\n`,
      );
    });
    try {
      worker.send(
        { type: "START", deadline: String(readDeadline) },
        (error) => {
          if (error) invalid = true;
        },
      );
    } catch {
      invalid = true;
    }
  });
}
async function main(args) {
  const [mode, project, composePath] = args;
  const input = { project, composePath };
  if (args.length !== 3 || !validInput(input)) {
    process.stdout.write("unavailable\n");
    return;
  }
  if (mode === "--anchor") {
    await anchor(input);
    return;
  }
  if (mode === "--worker") {
    if (!process.send || !process.connected) {
      process.stdout.write("unavailable\n");
      return;
    }
    const controller = new AbortController();
    process.on("message", (message) => {
      if (message === "CANCEL") controller.abort();
    });
    const start = await new Promise((resolve) => {
      const timer = setTimeout(() => finish(null), 1500);
      const finish = (value) => {
        clearTimeout(timer);
        process.off("message", receive);
        resolve(value);
      };
      const receive = (message) => finish(message);
      process.once("message", receive);
    });
    let result = "unavailable";
    if (
      start &&
      Object.keys(start).sort().join() === "deadline,type" &&
      start.type === "START" &&
      /^[0-9]{1,24}$/.test(start.deadline)
    ) {
      const remaining =
        Number(BigInt(start.deadline) - process.hrtime.bigint()) / 1000000;
      if (remaining > 0 && remaining <= 1500)
        result = await readServiceCategory(input, {
          signal: controller.signal,
          deadline: performance.now() + remaining,
        });
    }
    process.stdout.write(`${result}\n`, () => {
      process.disconnect?.();
      process.exit(0);
    });
    // Direct Docker handles may survive read cancellation. A/T own their tree.
    return;
  }
  const result =
    mode === "--supervise" ? await sampleServiceCategory(input) : "unavailable";
  process.stdout.on("error", () => {});
  process.stdout.write(`${result}\n`);
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  main(process.argv.slice(2)).catch(() => {
    process.stdout.write("unavailable\n");
  });
