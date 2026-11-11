// External Docker boundary for real Bash recovery/snapshot scripts. No daemon.
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
const args = process.argv.slice(2),
  env = process.env;
const root = env.TEST_ROOT_NATIVE;
appendFileSync(root + "/docker.log", args.join(" ") + "\n");
const out = (s) => process.stdout.write(s + "\n");
const fail = () => process.exit(99);
const digest = (ref) => ref.split("@").at(-1);
if (args[0] === "pull") process.exit(env.MODE === "pull-failed" ? 1 : 0);
if (args[0] === "image" && args[1] === "inspect") {
  const ref = args.find((arg) => arg.includes("@sha256:"));
  out(args.join(" ").includes("RepoDigests") ? ref : digest(ref));
} else if (args[0] === "inspect") {
  const subject = args[1],
    format = args.at(-1);
  let ref;
  if (subject.startsWith("c")) {
    ref =
      env.MODE === "pg-mismatch"
        ? "postgres@sha256:" + "9".repeat(64)
        : env.PG_IMAGE;
    out(
      format.includes("Running")
        ? "true " + ref
        : format.includes("Config.Image")
          ? ref
          : env.PG_ID,
    );
  } else {
    ref = subject.startsWith("a")
      ? existsSync(root + "/applied")
        ? env.OLD_API
        : env.NEW_API
      : existsSync(root + "/applied")
        ? env.OLD_WEB
        : env.NEW_WEB;
    if (format.includes("Health")) {
      if (env.MODE === "unhealthy") process.exit(1);
      out("running|healthy");
    } else out(format.includes("Config.Image") ? ref : digest(ref));
  }
} else if (args[0] === "exec") {
  // Both schema/history evidence MUST use read-only connections. Any mutation
  // or missing -i on psql is rejected instead of being hidden by the fixture.
  if (
    !args.includes("-i") ||
    !args.join(" ").includes("default_transaction_read_only=on")
  )
    fail();
  if (args.join(" ").includes("pg_dump"))
    out(
      "-- header\n\\restrict random\nCREATE TABLE fixture (id integer);\n\\unrestrict random",
    );
  else {
    const sql = readFileSync(0, "utf8");
    if (!sql.startsWith("SELECT ") || /UPDATE|DELETE|INSERT|DROP/.test(sql))
      fail();
    out(sql.includes("count(*)") ? "0" : "[]");
  }
} else if (args[0] === "compose") {
  const rest = args.slice(1);
  while (["-p", "-f"].includes(rest[0])) rest.splice(0, 2);
  const action = rest.shift();
  if (action === "ps")
    out({ db: "c", api: "a", gateway: "b" }[rest.at(-1)]?.repeat(64) ?? "");
  else if (action === "run") {
    if (
      rest.join(" ") !==
      "--rm --no-deps api node node_modules/prisma/build/index.js migrate status"
    )
      fail();
  } else if (action === "up") {
    if (rest.join(" ") !== "-d --wait --no-deps api gateway") fail();
    writeFileSync(root + "/applied", "yes");
    if (env.MODE === "apply-failed") process.exit(1);
  } else fail();
} else fail();
