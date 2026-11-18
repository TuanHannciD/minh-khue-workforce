import test from "node:test";
import assert from "node:assert/strict";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { writeBundleInventory } from "../../scripts/product/release/release-bundle.mjs";
import { writeOperationEvent } from "../../scripts/product/release/operation-receipts.mjs";
import { runBash } from "./fixtures/deploy-account.mjs";

// File map: fixture owns actual release/control inventories and operation receipt;
// Docker double replaces only the engine/CLI boundary, executes real Node helpers
// and actual Compose parser, and records no private stdin. Tests assert shell effects.
const ROOT = resolve(import.meta.dirname, "../..");
const SHA = "a".repeat(40),
  CONTROL = "c".repeat(40),
  ID = "d".repeat(64);
const IMAGE_ID = `sha256:${"f".repeat(64)}`;
const API = `ghcr.io/example/api@sha256:${"1".repeat(64)}`;
const WEB = `ghcr.io/example/web@sha256:${"2".repeat(64)}`;
const PG = `postgres@sha256:${"3".repeat(64)}`;
const USERNAME = "Đội-😀";
const PASSWORD =
  '  MkwFixture-ế😀"\\\t  ' +
  String.fromCharCode(
    ...Array.from({ length: 31 }, (_, i) => i + 1).filter((n) => n !== 10),
  );
const linux =
  process.platform === "win32" || spawnSync("flock", ["--version"]).status !== 0
    ? "Not run: requires real Linux flock; no lock substitute"
    : false;

async function fixture(t) {
  const root = await mkdtemp("/home/mkw-task8-");
  t.after(() => rm(root, { recursive: true, force: true }));
  const release = join(root, "releases", SHA),
    controls = join(root, "controls", CONTROL);
  for (const p of [
    "bin",
    "current",
    "shared",
    "operations/op-8",
    `releases/${SHA}/scripts/product`,
    `controls/${CONTROL}/scripts/product`,
  ])
    await mkdir(join(root, p), { recursive: true });
  await cp(
    join(ROOT, "scripts/product/release"),
    join(controls, "scripts/product/release"),
    { recursive: true },
  );
  const script = join(release, "scripts/product/manage-production-account.sh");
  await cp(join(ROOT, "scripts/product/manage-production-account.sh"), script);
  const manifest = {
    schemaVersion: "1",
    releaseSha: SHA,
    sourceRepository: "example/project",
    createdAt: "2026-11-15T00:00:00Z",
    apiImage: API,
    webImage: WEB,
    postgresImage: PG,
    artifacts: {
      sbom: { sha256: "4".repeat(64), size: 1 },
      provenance: { sha256: "5".repeat(64), size: 1 },
    },
  };
  const compose = {
    name: "mkw",
    services: {
      api: { image: API },
      gateway: { image: WEB },
      db: { image: PG },
    },
  };
  await writeFile(
    join(release, "release-manifest.json"),
    JSON.stringify(manifest),
  );
  await writeFile(
    join(root, "current/compose.rendered.yml"),
    JSON.stringify(compose),
  );
  await writeFile(
    join(root, "shared/deploy-operation.json"),
    JSON.stringify({
      operationId: "op-8",
      releaseSha: SHA,
      controlSha: CONTROL,
    }),
  );
  const event = {
    schemaVersion: 1,
    operationId: "op-8",
    eventId: "12345678-1234-4123-8123-123456789abc",
    sequence: 1,
    operation: "release",
    releaseSha: SHA,
    imageDigests: { api: API, web: WEB, postgres: PG },
    status: "ok",
    phase: "smoke-complete",
    utc: "2026-11-17T00:00:00Z",
    mutationStarted: true,
    registry: { host: "ghcr.io", auth: "public", pull: "verified" },
    attestationVerification: "verified",
    rollbackScope: "application-only",
    databaseRecovery: false,
    backupId: "fixture",
    targetIdentity: `fixture-host/${root}/mkw`,
    controlSha: CONTROL,
  };
  const receipt = await writeOperationEvent(
    join(root, "operations/op-8"),
    event,
  );
  await writeBundleInventory(release);
  await writeBundleInventory(controls);
  const state = {
    ids: [ID],
    project: "mkw",
    service: "api",
    status: "running",
    health: "healthy",
    image: API,
    imageId: IMAGE_ID,
    cliExit: 0,
    capability: true,
  };
  const runtime = join(root, "app");
  await mkdir(join(runtime, "dist/ops"), { recursive: true });
  await writeFile(
    join(runtime, "dist/ops/account-cli.js"),
    "// fixture image capability\n",
  );
  const stateFile = join(root, "state.json"),
    log = join(root, "boundary.jsonl");
  const save = () => writeFile(stateFile, JSON.stringify(state));
  await save();
  // Run real Compose config without an engine. Never log private stdin.
  await writeFile(
    join(root, "bin/docker"),
    `#!${process.execPath}
const fs=require('node:fs'),cp=require('node:child_process');
const a=process.argv.slice(2), state=JSON.parse(fs.readFileSync(${JSON.stringify(stateFile)}));
const secret=${JSON.stringify(PASSWORD)}, marker='MkwFixture-';
const leak=JSON.stringify([a,process.env]).includes(marker);
fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({args:a,env:JSON.stringify(process.env).replaceAll(secret,'[REDACTED]'),secretLeak:leak})+'\\n');
const out=v=>console.log(v), exit=c=>process.exit(c);
if(a[0]==='compose') {
 if(a.includes('config')) { const r=cp.spawnSync('/usr/local/bin/docker',a,{encoding:'utf8',env:process.env});process.stdout.write(r.stdout??'');process.stderr.write(r.stderr??'');exit(r.status??69); }
 if(a.includes('ps')) { if(state.changeOnResolve){state.service='gateway';fs.writeFileSync(${JSON.stringify(stateFile)},JSON.stringify(state));}out(state.ids.join('\\n'));exit(0); }
}
if(a[0]==='inspect') {
 const format=a[a.indexOf('--format')+1];
 const data={Id:${JSON.stringify(ID)},Config:{Image:state.image,Labels:{'com.docker.compose.project':state.project,'com.docker.compose.service':state.service}},Image:state.imageId,State:{Status:state.status,Running:state.status==='running',Health:{Status:state.health}}};
 if(!format) {out(JSON.stringify([data]));exit(0);}
 if(format==='{{json .}}') {out(JSON.stringify(data));exit(0);}
 if(format==='{{.Id}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}|{{.State.Status}}|{{.State.Health.Status}}|{{.Config.Image}}|{{.Image}}') {out([data.Id,state.project,state.service,state.status,state.health,state.image,state.imageId].join('|'));exit(0);}
 const values={'{{.Config.Image}}':state.image,'{{.Image}}':state.imageId,'{{.Id}}':data.Id,'{{.State.Status}}|{{.State.Health.Status}}':state.status+'|'+state.health,'{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}|{{.State.Health.Status}}':state.project+'|'+state.service+'|'+state.health};
 if(Object.hasOwn(values,format)){out(values[format]);exit(0);}exit(98);
}
if(a[0]==='image' && a[1]==='inspect'){out(${JSON.stringify(IMAGE_ID)});exit(0);}
if(a[0]==='run') {
 if(!a.includes('--read-only') || !a.includes('--network=none') || a.some(v=>v.endsWith(':rw')))exit(98);
 const n=a.indexOf('--entrypoint');if(a[n+1]!=='node'||a[n+2]!==${JSON.stringify(API)})exit(98);
 if(a.includes('dist/ops/account-cli.js'))exit(98);
 if(!state.capability)exit(69);
 const input=fs.readFileSync(0);const r=cp.spawnSync(process.execPath,a.slice(n+3),{input,encoding:'utf8',cwd:${JSON.stringify(runtime)}});
 process.stdout.write(r.stdout??'');process.stderr.write(r.stderr??'');exit(r.status??69);
}
if(a[0]==='exec') {
 if(state.vanish){console.error('No such container');exit(1);}
 if(JSON.stringify(a)!==JSON.stringify(['exec','-i','-w','/app',${JSON.stringify(ID)},'node','dist/ops/account-cli.js']))exit(98);
 let value;try{value=JSON.parse(fs.readFileSync(0,'utf8'));}catch{exit(64);}
 const privateInputExact=value.operation==='list'?Object.keys(value).join(',')==='operation':value.username===${JSON.stringify(USERNAME)}&&value.password===secret&&Object.keys(value).sort().join(',')==='operation,password,username';
 const lockHeld=cp.spawnSync('/usr/bin/flock',['-n',${JSON.stringify(join(root, ".deploy.lock"))},'true']).status===1;
 fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({privateInputExact,lockHeld})+'\\n');
 if(!privateInputExact)exit(64);
 if(state.cliExit){console.error('{"error":{"code":"OPERATION_FAILED"}}');exit(state.cliExit);}
 if(value.operation==='list')out(JSON.stringify({operation:'list',usernames:['Alpha','Đội-😀']}));else out(JSON.stringify({operation:value.operation,username:value.username}));exit(0);
}
exit(98);
`,
  );
  await chmod(join(root, "bin/docker"), 0o755);
  const env = {
    PATH: `${root}/bin:${process.env.PATH}`,
    MKW_DEPLOY_PATH: root,
    MKW_PROJECT_NAME: "mkw",
  };
  const calls = async () =>
    (await readFile(log, "utf8").catch(() => ""))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((s) => JSON.parse(s));
  const run = (
    op = "add",
    input = `${USERNAME}\n${PASSWORD}\n${PASSWORD}\n`,
    extra = {},
  ) => runBash(script, [op], { cwd: "/", env: { ...env, ...extra }, input });
  return {
    root,
    release,
    controls,
    script,
    manifest,
    compose,
    event,
    receipt,
    state,
    save,
    calls,
    run,
    env,
    runtime,
  };
}

test(
  "production_manager_executes_pinned_compiled_cli with exact Unicode/private JSON",
  { skip: linux },
  async (t) => {
    const f = await fixture(t);
    const r = await f.run();
    assert.equal(r.code, 0, r.stderr);
    const calls = await f.calls(),
      execs = calls.filter((c) => c.args?.[0] === "exec");
    assert.deepEqual(
      execs.map((c) => c.args),
      [["exec", "-i", "-w", "/app", ID, "node", "dist/ops/account-cli.js"]],
    );
    assert.equal(
      calls.find((c) => c.privateInputExact !== undefined)?.privateInputExact,
      true,
    );
    assert.equal(calls.find((c) => c.lockHeld !== undefined)?.lockHeld, true);
    assert.ok(calls.every((c) => !c.secretLeak));
    assert.ok(!JSON.stringify([calls, r]).includes("MkwFixture-"));
  },
);

for (const [name, change] of [
  [
    "wrong manifest SHA",
    async (f) => {
      f.manifest.releaseSha = "b".repeat(40);
      await writeFile(
        join(f.release, "release-manifest.json"),
        JSON.stringify(f.manifest),
      );
      await writeBundleInventory(f.release);
    },
  ],
  [
    "release inventory tamper",
    (f) => writeFile(join(f.release, "extra"), "bad"),
  ],
  [
    "wrong project",
    (f) => {
      f.state.project = "other";
    },
  ],
  [
    "wrong service",
    (f) => {
      f.state.service = "gateway";
    },
  ],
  [
    "wrong digest",
    (f) => {
      f.state.image = WEB;
    },
  ],
  [
    "wrong image ID",
    (f) => {
      f.state.imageId = "sha256:" + "e".repeat(64);
    },
  ],
  [
    "unhealthy",
    (f) => {
      f.state.health = "unhealthy";
    },
  ],
  [
    "stopped",
    (f) => {
      f.state.status = "exited";
    },
  ],
  [
    "zero APIs",
    (f) => {
      f.state.ids = [];
    },
  ],
  [
    "two APIs",
    (f) => {
      f.state.ids = [ID, "e".repeat(64)];
    },
  ],
  [
    "failed receipt",
    async (f) => {
      f.event.status = "failed";
      await writeFile(f.receipt, JSON.stringify(f.event));
    },
  ],
  [
    "incomplete receipt",
    async (f) => {
      f.event.status = "in-progress";
      await writeFile(f.receipt, JSON.stringify(f.event));
    },
  ],
  ["missing receipt", (f) => rm(f.receipt)],
  [
    "wrong receipt target",
    async (f) => {
      f.event.targetIdentity = "fixture-host//other/mkw";
      await writeFile(f.receipt, JSON.stringify(f.event));
    },
  ],
  [
    "wrong pointer SHA",
    (f) =>
      writeFile(
        join(f.root, "shared/deploy-operation.json"),
        JSON.stringify({
          operationId: "op-8",
          releaseSha: "b".repeat(40),
          controlSha: CONTROL,
        }),
      ),
  ],
  [
    "wrong pointer operation",
    (f) =>
      writeFile(
        join(f.root, "shared/deploy-operation.json"),
        JSON.stringify({
          operationId: "other",
          releaseSha: SHA,
          controlSha: CONTROL,
        }),
      ),
  ],
  [
    "wrong Compose project",
    async (f) => {
      f.compose.name = "other";
      await writeFile(
        join(f.root, "current/compose.rendered.yml"),
        JSON.stringify(f.compose),
      );
    },
  ],
  [
    "Compose swap",
    async (f) => {
      f.compose.services.api.image = WEB;
      await writeFile(
        join(f.root, "current/compose.rendered.yml"),
        JSON.stringify(f.compose),
      );
    },
  ],
  [
    "duplicate YAML",
    (f) =>
      writeFile(
        join(f.root, "current/compose.rendered.yml"),
        `services:\n  api:\n    image: ${API}\n  api:\n    image: ${WEB}\n`,
      ),
  ],
  [
    "control inventory tamper",
    (f) => writeFile(join(f.controls, "extra"), "bad"),
  ],
  [
    "identity changes during selection",
    (f) => {
      f.state.changeOnResolve = true;
    },
  ],
])
  test(
    `target_preflight_rejects_before_input_and_exec: ${name}`,
    { skip: linux },
    async (t) => {
      const f = await fixture(t);
      await change(f);
      await f.save();
      const r = await f.run();
      assert.equal(r.code, 78, r.stderr);
      assert.doesNotMatch(r.stdout + r.stderr, /Username:|Password:/);
      assert.equal(
        (await f.calls()).filter((c) => c.args?.[0] === "exec").length,
        0,
      );
    },
  );

test(
  "list preflights and prints only ordered usernames",
  { skip: linux },
  async (t) => {
    const f = await fixture(t);
    const r = await f.run("list", "");
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout, "Alpha\nĐội-😀\n");
    assert.doesNotMatch(r.stdout, /passwordHash|Session/);
    assert.equal(
      (await f.calls()).filter((c) => c.args?.[0] === "exec").length,
      1,
    );
  },
);
test(
  "reset-password requires matching repeat before CLI",
  { skip: linux },
  async (t) => {
    const f = await fixture(t);
    const r = await f.run(
      "reset-password",
      `${USERNAME}\n${PASSWORD}\nwrong\n`,
    );
    assert.equal(r.code, 64, r.stderr);
    assert.equal(
      (await f.calls()).filter((c) => c.args?.[0] === "exec").length,
      0,
    );
  },
);
for (const code of [1, 64, 69, 78, 137])
  test(
    `CLI/runtime exit ${code} propagates without success or ID retry`,
    { skip: linux },
    async (t) => {
      const f = await fixture(t);
      f.state.cliExit = code;
      await f.save();
      const r = await f.run();
      assert.equal(r.code, code, r.stderr);
      assert.doesNotMatch(r.stdout, /created|reset|operation|usernames/i);
      const calls = await f.calls();
      assert.equal(calls.filter((c) => c.args?.[0] === "exec").length, 1);
      assert.equal(
        calls.filter((c) => c.args?.[0] === "compose" && c.args.includes("ps"))
          .length,
        1,
      );
    },
  );
test(
  "canonical symlink path ignores cwd/current alias and rejects conflicting deploy root",
  { skip: linux },
  async (t) => {
    const f = await fixture(t);
    const alias = join(f.root, "operator");
    await symlink(f.script, alias);
    const good = await runBash(alias, ["list"], {
      cwd: "/",
      env: f.env,
      input: "",
    });
    assert.equal(good.code, 0, good.stderr);
    const bad = await f.run("list", "", { MKW_DEPLOY_PATH: "/other" });
    assert.equal(bad.code, 78, bad.stderr);
  },
);
test(
  "real lock contention is75 and keeps credentials unread",
  { skip: linux },
  async (t) => {
    const f = await fixture(t);
    const child = spawn(
      "bash",
      [
        "-c",
        'exec 9>"$1/.deploy.lock"; flock -n 9; echo ready; read -r ignored',
        "holder",
        f.root,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    t.after(() => {
      child.stdin.end("done\n");
    });
    await new Promise((r) => child.stdout.once("data", r));
    const r = await f.run();
    assert.equal(r.code, 75, r.stderr);
    assert.equal((await f.calls()).length, 0);
    child.stdin.end("done\n");
    await new Promise((r) => child.once("close", r));
  },
);
test(
  "lock rechecks identity changed immediately before actual acquisition",
  { skip: linux },
  async (t) => {
    const f = await fixture(t);
    // Scheduling fault at the flock process boundary. Both the preceding owner and
    // operator use real Linux flock; no fake lock or production fault flag.
    await writeFile(
      join(f.root, "bin/flock"),
      `#!/usr/bin/env bash
set -Eeuo pipefail
exec 8>"${f.root}/.deploy.lock"
/usr/bin/flock -n 8
"${process.execPath}" -e 'const fs=require("node:fs"),p=process.argv[1],v=JSON.parse(fs.readFileSync(p));v.service="gateway";fs.writeFileSync(p,JSON.stringify(v));' "${f.root}/state.json"
/usr/bin/flock -u 8
exec /usr/bin/flock "$@"
`,
    );
    await chmod(join(f.root, "bin/flock"), 0o755);
    const r = await f.run();
    assert.equal(r.code, 78, r.stderr);
    assert.doesNotMatch(r.stderr, /Username:|Password:/);
    assert.equal(
      (await f.calls()).filter((c) => c.args?.[0] === "exec").length,
      0,
    );
  },
);

test("exactly one operation argument is required", async () => {
  const r = await runBash(
    "scripts/product/manage-production-account.sh",
    ["list", "extra"],
    { cwd: ROOT, input: "" },
  );
  assert.equal(r.code, 64, r.stderr);
});

test(
  "reset-password preserves private JSON and confirms password on success",
  { skip: linux },
  async (t) => {
    const f = await fixture(t);
    const r = await f.run("reset-password");
    assert.equal(r.code, 0, r.stderr);
    assert.equal(
      (await f.calls()).filter((c) => c.privateInputExact === true).length,
      1,
    );
  },
);
test(
  "missing compiled capability rejects69 before prompting or account exec",
  { skip: linux },
  async (t) => {
    const f = await fixture(t);
    await rm(join(f.runtime, "dist/ops/account-cli.js"));
    const r = await f.run();
    assert.equal(r.code, 69, r.stderr);
    assert.match(r.stderr, /Compiled account/);
    assert.doesNotMatch(r.stderr, /Username:|Password:/);
    assert.equal(
      (await f.calls()).filter((c) => c.args?.[0] === "exec").length,
      0,
    );
  },
);
test(
  "xtrace and allexport cannot leak private input into Docker argv/env/output",
  { skip: linux },
  async (t) => {
    const f = await fixture(t);
    const r = await runBash("-ax", [f.script, "add"], {
      env: f.env,
      input: `${USERNAME}\n${PASSWORD}\n${PASSWORD}\n`,
    });
    assert.equal(r.code, 0, r.stderr);
    const calls = await f.calls();
    assert.ok(calls.every((c) => !c.secretLeak));
    assert.ok(!JSON.stringify([calls, r]).includes("MkwFixture-"));
  },
);
test(
  "container vanishes after pin and cannot be reselected",
  { skip: linux },
  async (t) => {
    const f = await fixture(t);
    f.state.vanish = true;
    await f.save();
    const r = await f.run();
    assert.equal(r.code, 1, r.stderr);
    const calls = await f.calls();
    assert.equal(calls.filter((c) => c.args?.[0] === "exec").length, 1);
    assert.equal(
      calls.filter((c) => c.args?.[0] === "compose" && c.args.includes("ps"))
        .length,
      1,
    );
    assert.equal(r.stdout, "");
  },
);
test(
  "TERM during hidden password read restores actual terminal echo",
  { skip: linux },
  async (t) => {
    const f = await fixture(t);
    const program = `import os,pty,termios,subprocess,select,time,json,signal,sys
master,slave=pty.openpty()
initial=termios.tcgetattr(slave)
p=subprocess.Popen(['bash',sys.argv[1],'add'],stdin=slave,stdout=slave,stderr=slave,env=os.environ)
def wait_for(marker):
 data=b'';deadline=time.monotonic()+8
 while marker not in data and time.monotonic()<deadline:
  if select.select([master],[],[],0.2)[0]: data+=os.read(master,4096)
 return marker in data
try:
 ready=wait_for(b'Username: ')
 os.write(master,b'Fixture\\n')
 ready=ready and wait_for(b'Password: ')
 deadline=time.monotonic()+2
 while termios.tcgetattr(slave)[3]&termios.ECHO and time.monotonic()<deadline: time.sleep(0.01)
 hidden=not bool(termios.tcgetattr(slave)[3]&termios.ECHO)
 p.send_signal(signal.SIGTERM)
 code=p.wait(timeout=4)
 restored=termios.tcgetattr(slave)[3]==initial[3]
 print(json.dumps(dict(ready=ready,hidden=hidden,restored=restored,code=code)))
finally:
 if p.poll() is None: p.kill();p.wait()
 os.close(master);os.close(slave)
`;
    const r = await new Promise((resolveResult, reject) => {
      const child = spawn("python3", ["-c", program, f.script], {
        env: { ...process.env, ...f.env },
      });
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (b) => (stdout += b));
      child.stderr.on("data", (b) => (stderr += b));
      child.on("error", reject);
      child.on("close", (code) => resolveResult({ code, stdout, stderr }));
    });
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), {
      ready: true,
      hidden: true,
      restored: true,
      code: 143,
    });
  },
);
