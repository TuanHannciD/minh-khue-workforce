// Test-only Compose/plugin model. Private identity barrier precedes parent exit.
import { spawn } from "node:child_process";
import {
  appendFileSync,
  readFileSync,
  readdirSync,
  readlinkSync,
} from "node:fs";

const log = process.env.SAMPLE_PROCESS_LOG;
function mark(role) {
  const text = readFileSync("/proc/self/stat", "utf8");
  const fields = text.slice(text.lastIndexOf(")") + 2).split(" ");
  if (process.env.MKW_REHEARSAL_DIAGNOSTIC_NONCE !== undefined)
    process.exit(98);
  for (const fd of readdirSync("/proc/self/fd")) {
    let target;
    try {
      target = readlinkSync(`/proc/self/fd/${fd}`);
    } catch {
      continue;
    }
    if (target === `${process.env.MKW_DEPLOY_PATH}/.deploy.lock`)
      process.exit(98);
  }
  appendFileSync(
    log,
    JSON.stringify({
      role,
      pid: process.pid,
      ppid: +fields[1],
      pgid: +fields[2],
      sid: +fields[3],
      start: fields[19],
    }) + "\n",
  );
}
if (process.argv[2] === "grandchild") {
  mark("grandchild");
  process.send("READY");
  setInterval(() => {}, 1000);
} else {
  mark("docker");
  const child = spawn(process.execPath, [import.meta.filename, "grandchild"], {
    detached: false,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  child.on("message", () => {
    if (process.env.SAMPLE_PROCESS_MODE === "worker-death") {
      process.kill(process.ppid, "SIGKILL");
      process.exit(1);
    }
    if (process.env.SAMPLE_PROCESS_MODE === "hang") return;
    const last = process.argv.at(-1);
    if (process.argv[2] === "compose")
      process.stdout.write(
        String(["db", "api", "gateway"].indexOf(last) + 1).repeat(64) + "\n",
      );
    else
      process.stdout.write(
        `${last}|fixture|${["db", "api", "gateway"][Number(last[0]) - 1]}|running|healthy\n`,
      );
    process.stdout.end(() => process.exit(0));
  });
}
