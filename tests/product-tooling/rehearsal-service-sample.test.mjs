// Scoped sampler contract. Pure/read decision tests do not establish tree
// settlement; the Linux fixture below observes actual inherited identities.
// Map: processFixture/identity/dead own test-only process barriers/cleanup;
// supervisor tables cover lifetime, owner loss, containment and protocol;
// fragmented READY table writes native A pipe chunks and records GO/query gates;
// queryDouble covers fixed query admission, categories and decision budgets.
import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawn, spawnSync } from "node:child_process";
import {
  mkdtemp,
  writeFile,
  readFile,
  readdir,
  rm,
  chmod,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  classifyServiceSample,
  readServiceCategory,
} from "../../scripts/product/release/rehearsal-service-sample.mjs";

const services = ["db", "api", "gateway"];
const ids = services.map((_, i) => String(i + 1).repeat(64));
const input = {
  project: "fixture",
  composePath: "/home/deploy/current/compose.rendered.yml",
};
const rows = () =>
  services.map((service) => ({
    service,
    presence: "present",
    state: "running",
    health: "healthy",
  }));

test("sample_classifies_complete_three_service_observation", () => {
  assert.equal(classifyServiceSample(rows()), "healthy");
  for (let i = 0; i < 3; i++) {
    for (const patch of [
      { presence: "absent", state: null, health: null },
      { health: "unhealthy" },
      ...["created", "restarting", "exited", "dead", "paused", "removing"].map(
        (state) => ({ state }),
      ),
    ]) {
      const r = rows();
      Object.assign(r[i], patch);
      assert.equal(classifyServiceSample(r), `${services[i]}-bad`);
    }
  }
  const allAbsent = rows().map((r) => ({
    ...r,
    presence: "absent",
    state: null,
    health: null,
  }));
  assert.equal(classifyServiceSample(allAbsent), "multiple-bad");
  for (const patch of [
    { health: "starting" },
    { health: "none" },
    { health: "private-health-canary" },
    { state: "unknown" },
    { extra: "canary" },
  ]) {
    const r = rows();
    r[0] = allAbsent[0];
    Object.assign(r[1], patch);
    assert.equal(classifyServiceSample(r), "unknown");
  }
  for (const invalid of [null, [], rows().reverse(), [...rows(), rows()[0]]])
    assert.equal(classifyServiceSample(invalid), "unknown");
});

const helper = resolve(
  import.meta.dirname,
  "../../scripts/product/release/rehearsal-service-sample.mjs",
);
const delay = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function identity(pid) {
  try {
    const text = await readFile(`/proc/${pid}/stat`, "utf8");
    const f = text.slice(text.lastIndexOf(")") + 2).split(" ");
    return {
      pid,
      state: f[0],
      ppid: +f[1],
      pgid: +f[2],
      sid: +f[3],
      start: f[19],
    };
  } catch (e) {
    if (e.code === "ENOENT" || e.code === "ESRCH") return null;
    throw e;
  }
}
async function dead(original) {
  const current = await identity(original.pid);
  return (
    !current ||
    current.start !== original.start ||
    ["Z", "X"].includes(current.state)
  );
}
async function waitFor(read, budget = 1500) {
  const end = performance.now() + budget;
  while (performance.now() < end) {
    const value = await read();
    if (value) return value;
    await delay(10);
  }
  assert.fail("owned fixture barrier timed out");
}
async function processFixture(t, mode, supervisorSource, outer = false) {
  assert.equal(process.platform, "linux", "required Linux gate cannot skip");
  assert.equal(
    spawnSync("timeout", ["--version"], { encoding: "utf8" }).stdout.includes(
      "GNU coreutils",
    ),
    true,
  );
  assert.equal(spawnSync("setsid", ["--version"]).status, 0);
  const dir = await mkdtemp(join(tmpdir(), "mkw-sampler-"));
  const config = join(dir, "compose.yml"),
    observations = join(dir, "identities");
  const token = randomUUID();
  await writeFile(config, "services: {}\n");
  const model = join(dir, "docker");
  await writeFile(
    model,
    `#!${process.execPath}
import {spawn} from 'node:child_process';import {readFileSync,appendFileSync,writeFileSync} from 'node:fs';
const dir=${JSON.stringify(dir)},mode=${JSON.stringify(mode)},token=${JSON.stringify(token)};
const mark=(role)=>{const s=readFileSync('/proc/self/stat','utf8'),f=s.slice(s.lastIndexOf(')')+2).split(' ');appendFileSync(dir+'/identities',JSON.stringify({role,token,boot:readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),pid:process.pid,state:f[0],ppid:+f[1],pgid:+f[2],sid:+f[3],start:f[19],nonce:process.env.MKW_REHEARSAL_DIAGNOSTIC_NONCE??null})+'\\n');};
if(process.argv[2]==='grandchild'){mark('grandchild');process.send('READY');setInterval(()=>{},1000);}
else {mark('docker');const c=spawn(process.execPath,[import.meta.filename,'grandchild'],{detached:false,stdio:['ignore',mode.includes('closed')?'ignore':'inherit',mode.includes('closed')?'ignore':'inherit','ipc']});c.on('message',()=>{writeFileSync(dir+'/ready',token);if(mode.startsWith('overflow'))process.stdout.write('x'.repeat(1025));if(mode.startsWith('stderr'))process.stderr.write('x'.repeat(4097));if(mode.startsWith('worker-death'))process.kill(process.ppid,'SIGKILL');if(mode.startsWith('worker-hang'))process.kill(process.ppid,'SIGSTOP');if(mode.startsWith('healthy')){const svc=process.argv.at(-1),i=['db','api','gateway'].indexOf(svc);process.stdout.write(process.argv[2]==='compose'?String(i+1).repeat(64)+'\\n':process.argv.at(-1)+'|fixture|'+['db','api','gateway'][Number(process.argv.at(-1)[0])-1]+'|running|healthy\\n');}if(mode.startsWith('unknown'))process.stdout.write('private SQL argv env password cookie key health-output\\n');if(!mode.startsWith('hang')&&!mode.startsWith('worker-hang'))process.exit(/^(healthy|unknown|success)/.test(mode)?0:1);});}
`,
  );
  await chmod(model, 0o755);
  let executable = helper;
  if (supervisorSource) {
    executable = join(dir, "supervisor.mjs");
    await writeFile(
      executable,
      `import {superviseServiceSample} from ${JSON.stringify(helper)};import {open} from 'node:fs/promises';${supervisorSource}`,
    );
  }
  const command = outer ? "timeout" : "setsid";
  const argv = [
    "--wait",
    process.execPath,
    executable,
    "--supervise",
    "fixture",
    config,
  ];
  if (outer) argv.unshift("--signal=KILL", "4s", "setsid");
  const child = spawn(command, argv, {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "",
    stderr = "",
    finished = false;
  child.stdout.on("data", (b) => {
    stdout += b;
  });
  child.stderr.on("data", (b) => {
    stderr += b;
  });
  const start = performance.now();
  const result = new Promise((ok, fail) => {
    child.on("error", fail);
    child.on("close", (code, signal) => {
      finished = true;
      ok({ code, signal, stdout, stderr, elapsed: performance.now() - start });
    });
  });
  const records = async () =>
    (await readFile(observations, "utf8").catch(() => ""))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(JSON.parse);
  const owned = new Map();
  async function owners() {
    const r = (await records()).find((r) => r.role === "grandchild");
    if (!r) return null;
    const docker = (await records()).find((r) => r.role === "docker");
    const w = await identity(docker.ppid),
      a = w && (await identity(w.ppid)),
      watchdog = a && (await identity(a.ppid));
    if (!w || !a || !watchdog) return null;
    for (const p of [w, a, watchdog]) owned.set(p.pid, p);
    return { w, a, watchdog };
  }
  t.after(async () => {
    // Target only original identities observed by this owned fixture. Preserve
    // files if a process does not settle; no name/global process cleanup.
    const known = [...(await records()), ...owned.values()];
    const own = await identity(child.pid);
    if (own) known.push(own);
    for (const record of known)
      if (!(await dead(record))) process.kill(record.pid, "SIGKILL");
    await result;
    for (const record of known) await waitFor(() => dead(record), 1000);
    await rm(dir, { recursive: true });
  });
  return {
    child,
    result,
    records,
    owners,
    dir,
    token,
    config,
    start,
    finished: () => finished,
    output: () => stdout,
  };
}

for (const pipes of ["open", "closed"]) {
  test(`sample_supervisor_settles_child_grandchild_with_${pipes}_pipes`, async (t) => {
    const f = await processFixture(t, `parent-death-${pipes}`);
    const records = await waitFor(async () => {
      const r = await f.records();
      return r.length === 2 && r;
    });
    const grandchild = records.find((r) => r.role === "grandchild");
    assert.equal(grandchild.token, f.token);
    assert.match(grandchild.boot, /^[a-f0-9-]{36}$/);
    assert.equal(await dead(grandchild), false);
    assert.equal(grandchild.nonce, null);
    await delay(350);
    assert.equal(
      f.finished(),
      false,
      "direct parent close cannot settle a live grandchild",
    );
    assert.equal(f.output(), "", "candidate must wait for group settlement");
    const r = await f.result;
    assert.equal(r.code, 0);
    assert.equal(r.signal, null);
    assert.equal(r.stdout, "unavailable\n");
    assert.equal(r.stderr, "");
    assert.ok(
      r.elapsed >= 2900 && r.elapsed <= 3800,
      `3300ms target +500ms scheduler tolerance: ${r.elapsed}`,
    );
    for (const record of records) assert.equal(await dead(record), true);
    const members = [];
    for (const name of await readdir("/proc"))
      if (/^\d+$/.test(name)) {
        const p = await identity(+name);
        if (
          p &&
          (p.sid === grandchild.sid || p.pgid === grandchild.pgid) &&
          !["Z", "X"].includes(p.state)
        )
          members.push(p);
      }
    assert.deepEqual(members, [], "complete post-KILL census, not pipe EOF");
  });
}

for (const mode of [
  "hang-open",
  "hang-closed",
  "overflow-open",
  "overflow-closed",
  "stderr-open",
  "worker-death-closed",
  "worker-hang-closed",
  "healthy-closed",
  "unknown-closed",
]) {
  test(`sample_supervisor_cancellation_routes_keep_watchdog_armed: ${mode}`, async (t) => {
    const f = await processFixture(t, mode);
    const records = await waitFor(async () => {
      const r = await f.records();
      return r.length >= 2 && r;
    });
    await delay(400);
    const grandchild = records.find((r) => r.role === "grandchild");
    const group = [];
    for (const name of await readdir("/proc"))
      if (/^\d+$/.test(name)) {
        const p = await identity(+name);
        if (p?.sid === grandchild.sid && !["Z", "X"].includes(p.state))
          group.push(p);
      }
    const watchdog = group.find((p) => p.pid === grandchild.pgid);
    assert.ok(watchdog, "T stays alive after W outcome");
    assert.ok(
      group.some((p) => p.ppid === watchdog.pid),
      "A remains alive independently of W",
    );
    assert.equal(f.output(), "");
    const r = await f.result;
    assert.equal(r.code, 0);
    assert.equal(r.stderr, "");
    assert.equal(
      r.stdout,
      mode.startsWith("healthy")
        ? "healthy\n"
        : mode.startsWith("unknown")
          ? "unknown\n"
          : "unavailable\n",
    );
    assert.ok(r.elapsed >= 2900 && r.elapsed <= 3800, String(r.elapsed));
    for (const record of await f.records())
      assert.equal(await dead(record), true);
    const queries = (await f.records()).filter(
      (r) => r.role === "docker",
    ).length;
    assert.ok(queries <= 6);
    if (!/^(healthy|unknown)/.test(mode))
      assert.equal(queries, 1, "no query after unavailable latch");
  });
}

test("sample_supervisor_parent_and_owner_death_routes: S death leaves independent T armed", async (t) => {
  const f = await processFixture(t, "hang-closed");
  const owners = await waitFor(f.owners);
  process.kill(f.child.pid, "SIGKILL");
  await f.result;
  await delay(350);
  assert.equal(await dead(owners.a), false, "S EOF does not exit A");
  assert.equal(
    await dead(owners.watchdog),
    false,
    "T still armed after S death",
  );
  for (const record of [owners.a, owners.watchdog, ...(await f.records())])
    await waitFor(() => dead(record), 3300);
});

test("sample_supervisor_parent_and_owner_death_routes: O four-second emergency after stalled S", async (t) => {
  const f = await processFixture(
    t,
    "hang-closed",
    `
import {spawn} from 'node:child_process';
const result=await superviseServiceSample({project:'fixture',composePath:process.argv[4]}, {spawn:(...args)=>{
const child=spawn(...args);setTimeout(()=>{while(true){}},100);return child;
}});process.stdout.write(result.category+'\\n');`,
    true,
  );
  const records = await waitFor(async () => {
    const r = await f.records();
    return r.length >= 2 && r;
  });
  const r = await f.result;
  assert.equal(r.code, null);
  assert.equal(r.signal, "SIGKILL");
  assert.equal(r.stdout, "");
  assert.ok(r.elapsed >= 3900 && r.elapsed <= 4500, String(r.elapsed));
  for (const record of records)
    assert.equal(
      await dead(record),
      true,
      "T kills inherited descendants independently before O",
    );
});

test("sample_supervisor_group_identity_fd9_and_primary: missing native prerequisites admit no GO", async (t) => {
  const f = await processFixture(
    t,
    "hang-closed",
    `
process.env.PATH=import.meta.dirname;
const result=await superviseServiceSample({project:'fixture',composePath:process.argv[4]});process.stdout.write(JSON.stringify(result)+'\\n');`,
  );
  const r = await f.result;
  assert.deepEqual(JSON.parse(r.stdout), {
    category: "unavailable",
    settlement: "unverified",
  });
  assert.deepEqual(await f.records(), []);
});

for (const role of ["a", "watchdog"]) {
  test(`sample_supervisor_parent_and_owner_death_routes: unexpected ${role} death`, async (t) => {
    const f = await processFixture(t, "hang-closed");
    const owners = await waitFor(f.owners);
    process.kill(owners[role].pid, "SIGKILL");
    const r = await f.result;
    assert.equal(r.stdout, "unavailable\n");
    assert.equal(r.code, 0);
    // Explicit unverified route: cleanup below owns the surviving identities.
    assert.equal(
      await dead((await f.records()).find((p) => p.role === "grandchild")),
      false,
    );
  });
}

test("sample_supervisor_group_identity_fd9_and_primary: isolated groups and unrelated sentinel", async (t) => {
  const sentinel = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
    stdio: "ignore",
  });
  const original = await waitFor(() => identity(sentinel.pid));
  t.after(async () => {
    if (!(await dead(original))) sentinel.kill("SIGKILL");
    await waitFor(() => dead(original));
  });
  const f = await processFixture(t, "hang-closed");
  const owners = await waitFor(f.owners),
    s = await identity(f.child.pid);
  assert.equal(s.pgid, s.pid);
  assert.equal(s.sid, s.pid);
  assert.equal(owners.watchdog.pgid, owners.watchdog.pid);
  assert.notEqual(s.pgid, owners.watchdog.pgid);
  assert.notEqual(original.pgid, s.pgid);
  await f.result;
  assert.equal(
    await dead(original),
    false,
    "sampling KILL cannot target deployment group",
  );
});

test("sample_supervisor_parent_and_owner_death_routes: S output EPIPE waits for T", async (t) => {
  const f = await processFixture(t, "hang-closed");
  const owners = await waitFor(f.owners);
  f.child.stdout.destroy();
  await f.result;
  for (const p of [owners.a, owners.watchdog, ...(await f.records())])
    assert.equal(await dead(p), true);
});

for (const fault of [
  "proc-error",
  "proc-identity",
  "proc-survivor",
  "proc-reused-start",
  "worker-exception",
]) {
  test(`sample_supervisor_parent_and_owner_death_routes: ${fault}`, async (t) => {
    const source = `
import {readFile,writeFile} from 'node:fs/promises';import {spawn} from 'node:child_process';
let group;const cache=new Map(),counts=new Map();
const read=async(path)=>{let text;try{text=await readFile(path,'utf8');cache.set(path,text);}catch(error){if(${JSON.stringify(fault)}==='proc-survivor'&&cache.has(path))text=cache.get(path).replace(/\\) [A-Z] /,') S ');else throw error;}if(path.endsWith('/stat')&&path!=='/proc/'+process.pid+'/stat'){
const f=text.slice(text.lastIndexOf(')')+2).split(' ');group??=+f[2];
counts.set(path,(counts.get(path)??0)+1);
if(${JSON.stringify(fault)}==='proc-error')throw new Error('private canary');
if(${JSON.stringify(fault)}==='proc-identity')return text.replace(/^(\\d+) /,'999999 ');
if(${JSON.stringify(fault)}==='proc-reused-start'&&text.startsWith(group+' ')&&counts.get(path)>1){f[19]=String(BigInt(f[19])+1n);return text.slice(0,text.lastIndexOf(')')+2)+f.join(' ');}
if(${JSON.stringify(fault)}==='proc-survivor'&&text.startsWith(group+' ')&&['Z','X'].includes(f[0]))return text.replace(') '+f[0]+' ',') S ');
}return text;};
const preload=import.meta.dirname+'/fault.mjs';await writeFile(preload,"if(process.argv.includes('--worker'))throw new Error('private internal SQL env canary');");
const result=await superviseServiceSample({project:'fixture',composePath:process.argv[4]}, {read,spawn:(bin,args,options)=>spawn(bin,args,${JSON.stringify(fault)}==='worker-exception'?{...options,env:{...process.env,NODE_OPTIONS:'--import='+preload}}:options)});
process.stdout.write(JSON.stringify(result)+'\\n');`;
    const f = await processFixture(t, "hang-closed", source);
    const r = await f.result;
    const outcome = JSON.parse(r.stdout);
    assert.equal(outcome.category, "unavailable");
    assert.equal(
      outcome.settlement,
      fault === "worker-exception" ? "settled" : "unverified",
    );
    if (
      [
        "proc-error",
        "proc-identity",
        "proc-reused-start",
        "worker-exception",
      ].includes(fault)
    )
      assert.deepEqual(
        await f.records(),
        [],
        "no Docker after invalid admission/worker exception",
      );
    for (const record of await f.records())
      assert.equal(await dead(record), true);
  });
}

// A stream chunk is not a frame. Removing the complete-first-frame guard
// must fail these real S/T/A/W tests before any GO or Docker query is allowed.
for (const [name, chunks, valid] of [
  ...[1, 2, 3, 4, 5].map((at) => [
    `valid-boundary-${at}`,
    ["READY\n".slice(0, at), "READY\n".slice(at)],
    true,
  ]),
  ["valid-bytewise", ["R", "E", "A", "D", "Y", "\n"], true],
  ["ascii-suffix", ["READY", "x\n"], false],
  ["highbit-suffix", ["READY", "\x80\n"], false],
  ["duplicate-frame", ["READY", "\nREADY\n"], false],
  ["extra-frame", ["READY", "\nhealthy\n"], false],
  ["malformed-split-lf", ["READYx", "\n"], false],
  ["malformed-cannot-recover", ["WRONG\n", "READY\n"], false],
  ["cap32-split-lf", ["READY" + "x".repeat(27), "\n"], false],
  ["cap32-with-lf", ["READY", "x".repeat(26) + "\n"], false],
]) {
  test(`sample_supervisor fragmented READY: ${name}`, async (t) => {
    const preload = `
import {appendFileSync,readFileSync} from 'node:fs';
if(process.argv.includes('--anchor')){
  const chunks=${JSON.stringify(chunks)};let go=0;
  process.stdin.on('data',b=>{if(b.toString()==='GO\\n')go++;});
  const write=process.stdout.write.bind(process.stdout);
  process.stdout.write=(b,...rest)=>{
    if(b!=='READY\\n')return write(b,...rest);
    (async()=>{
      for(let i=0;i<chunks.length;i++){
        if(i){
          await new Promise(ok=>setTimeout(ok,4));
          let records='';try{records=readFileSync(import.meta.dirname+'/identities','utf8');}catch{}
          const queries=records.split('\\n').filter(Boolean).map(JSON.parse).filter(r=>r.role==='docker').length;
          appendFileSync(import.meta.dirname+'/frame-barriers',JSON.stringify({go,queries})+'\\n');
        }
        write(Buffer.from(chunks[i],'latin1'));
      }
    })().catch(e=>{throw e;});return true;
  };
}`;
    const f = await processFixture(
      t,
      "healthy-closed",
      `
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
let go=0;const received=[];
const preload=import.meta.dirname+'/fragment-writer.mjs';
await writeFile(preload,${JSON.stringify(preload)});
const queries=async()=> (await readFile(import.meta.dirname+'/identities','utf8').catch(()=>''))
  .split('\\n').filter(Boolean).map(JSON.parse).filter(r=>r.role==='docker').length;
const result=await superviseServiceSample({project:'fixture',composePath:process.argv[4]}, {spawn:(bin,args,options)=>{
  const child=spawn(bin,args,{...options,env:{...process.env,NODE_OPTIONS:'--import='+preload}}),write=child.stdin.write.bind(child.stdin);
  child.stdin.write=(b,...rest)=>{if(b==='GO\\n')go++;return write(b,...rest);};
  child.stdout.on('data',b=>received.push(b.toString('hex')));
  return child;
}});
const barriers=(await readFile(import.meta.dirname+'/frame-barriers','utf8')).trim().split('\\n').map(JSON.parse);
await writeFile(import.meta.dirname+'/framing-proof.json',JSON.stringify({barriers,go,queries:await queries(),received}));
process.stdout.write(JSON.stringify(result)+'\\n');`,
    );
    const r = await f.result;
    assert.equal(r.code, 0);
    assert.equal(r.signal, null);
    assert.equal(r.stderr, "");
    assert.ok(r.elapsed >= 2900 && r.elapsed <= 3800, String(r.elapsed));
    const proof = JSON.parse(
      await readFile(join(f.dir, "framing-proof.json"), "utf8"),
    );
    t.diagnostic(JSON.stringify({ name, ...proof }));
    assert.deepEqual(
      proof.received.slice(0, chunks.length),
      chunks.map((chunk) => Buffer.from(chunk, "latin1").toString("hex")),
      "separate native pipe chunks reached the unchanged S data handler",
    );
    assert.equal(proof.barriers.length, chunks.length - 1);
    assert.deepEqual(
      proof.barriers,
      Array.from({ length: chunks.length - 1 }, () => ({ go: 0, queries: 0 })),
      "zero GO and query at every incomplete first-frame barrier",
    );
    assert.equal(proof.go, valid ? 1 : 0);
    assert.equal(proof.queries, valid ? 6 : 0);
    assert.deepEqual(JSON.parse(r.stdout), {
      category: valid ? "healthy" : "unavailable",
      settlement: "settled",
    });
    for (const record of await f.records())
      assert.equal(await dead(record), true, "exact native query tree settled");
  });
}

for (const fault of [
  "ready-high-bit",
  "category-high-bit",
  "duplicate-ready",
  "malformed-ready",
  "oversized",
  "duplicate-category",
  "early-eof",
]) {
  test(`sample_supervisor strict bounded protocol: ${fault}`, async (t) => {
    const f = await processFixture(
      t,
      "healthy-closed",
      `
import {spawn} from 'node:child_process';
const fault=${JSON.stringify(fault)};
const result=await superviseServiceSample({project:'fixture',composePath:process.argv[4]}, {spawn:(...args)=>{
const child=spawn(...args),emit=child.stdout.emit.bind(child.stdout);
child.stdout.emit=(event,...values)=>{if(event==='data'){
const b=values[0],ready=b.toString().includes('READY');
if(fault==='ready-high-bit'&&ready){values[0]=Buffer.from(b);values[0][0]|=128;}
if(fault==='category-high-bit'&&!ready){values[0]=Buffer.from(b);values[0][0]|=128;}
if(fault==='duplicate-ready'&&ready)values[0]=Buffer.from('READY\\nREADY\\n');
if(fault==='malformed-ready'&&ready)values[0]=Buffer.from('WRONG\\n');
if(fault==='oversized')values[0]=Buffer.alloc(33,120);
if(fault==='duplicate-category'&&!ready)values[0]=Buffer.concat([b,b]);
if(fault==='early-eof'&&ready){child.stdout.destroy();return true;}
}return emit(event,...values);};return child;}});
process.stdout.write(JSON.stringify(result)+'\\n');`,
    );
    const r = await f.result;
    assert.deepEqual(JSON.parse(r.stdout), {
      category: "unavailable",
      settlement: "settled",
    });
    for (const record of await f.records())
      assert.equal(await dead(record), true);
  });
}
test("sample_worker startup consumes the shared GO read deadline", async (t) => {
  const f = await processFixture(
    t,
    "healthy-closed",
    `
import {writeFile} from 'node:fs/promises';import {spawn} from 'node:child_process';
const preload=import.meta.dirname+'/worker-start.mjs';
await writeFile(preload,"if(process.argv.includes('--worker')){const end=process.hrtime.bigint()+1600000000n;while(process.hrtime.bigint()<end){}}");
const result=await superviseServiceSample({project:'fixture',composePath:process.argv[4]}, {spawn:(bin,args,options)=>spawn(bin,args,{...options,env:{...process.env,NODE_OPTIONS:'--import='+preload}})});
process.stdout.write(JSON.stringify(result)+'\\n');`,
  );
  const r = await f.result;
  assert.deepEqual(JSON.parse(r.stdout), {
    category: "unavailable",
    settlement: "settled",
  });
  assert.deepEqual(
    await f.records(),
    [],
    "expired GO budget forbids every Docker launch",
  );
});

test("sample_anchor malformed GO latches cancellation before any worker", async (t) => {
  const f = await processFixture(
    t,
    "healthy-closed",
    `
import {spawn} from 'node:child_process';
const result=await superviseServiceSample({project:'fixture',composePath:process.argv[4]}, {spawn:(...args)=>{
const child=spawn(...args),write=child.stdin.write.bind(child.stdin);
child.stdin.write=()=>{write('xxxx');setTimeout(()=>write('GO\\n'),30);return true;};return child;}});
process.stdout.write(JSON.stringify(result)+'\\n');`,
  );
  const r = await f.result;
  assert.equal(JSON.parse(r.stdout).category, "unavailable");
  assert.deepEqual(
    await f.records(),
    [],
    "malformed control permanently cancels worker admission",
  );
});

test("sample_supervisor detects unexpected owned group without collateral kill", async (t) => {
  const f = await processFixture(
    t,
    "healthy-closed",
    `
import {readFile} from 'node:fs/promises';
let original,reads=0;
const result=await superviseServiceSample({project:'fixture',composePath:process.argv[4]}, {read:async(path)=>{
const text=await readFile(path,'utf8');if(path.endsWith('/stat')&&path!=='/proc/'+process.pid+'/stat'){
original??=path;if(path===original&&++reads>3){const end=text.lastIndexOf(')')+2,f=text.slice(end).split(' ');f[2]=String(+f[2]+1);return text.slice(0,end)+f.join(' ');}}
return text;}});process.stdout.write(JSON.stringify(result)+'\\n');`,
  );
  const r = await f.result;
  assert.deepEqual(JSON.parse(r.stdout), {
    category: "unavailable",
    settlement: "unverified",
  });
  for (const record of await f.records())
    assert.equal(await dead(record), true);
});

test("sampler private worker refuses unowned CLI and external tuning", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "mkw-unowned-sample-"));
  t.after(() => rm(dir, { recursive: true }));
  const config = join(dir, "compose.yml");
  await writeFile(config, "services: {}\n");
  await writeFile(
    join(dir, "docker"),
    `#!${process.execPath}\nimport {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(join(dir, "unexpected-query"))},'queried');process.exit(1);\n`,
  );
  await chmod(join(dir, "docker"), 0o755);
  const r = spawnSync(
    process.execPath,
    [helper, "--worker", "fixture", config],
    {
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
      encoding: "utf8",
      timeout: 1000,
    },
  );
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "unavailable\n");
  assert.equal(r.stderr, "");
  assert.equal(
    await readFile(join(dir, "unexpected-query")).catch(() => null),
    null,
    "unowned private mode cannot query",
  );
  const tuned = spawnSync(
    process.execPath,
    [helper, "--supervise", "fixture", config, "--timeout", "10000"],
    { encoding: "utf8", timeout: 1000 },
  );
  assert.equal(tuned.status, 0);
  assert.equal(tuned.stdout, "unavailable\n");
});

function queryDouble(reply) {
  const calls = [];
  const spawn = (bin, args, options) => {
    calls.push({ bin, args, options });
    const c = new EventEmitter();
    c.stdout = new PassThrough();
    c.stderr = new PassThrough();
    queueMicrotask(() => reply(c, args, calls.length));
    return c;
  };
  return { calls, spawn };
}
function good(c, args) {
  const service = args.at(-1);
  if (args[0] === "compose")
    c.stdout.end(ids[services.indexOf(service)] + "\n");
  else {
    const i = ids.indexOf(args.at(-1));
    c.stdout.end(`${ids[i]}|fixture|${services[i]}|running|healthy\n`);
  }
  c.stderr.end();
  c.emit("close", 0, null);
}

test("sample_admits_exact_ids_and_project_service", async () => {
  const d = queryDouble(good);
  assert.equal(await readServiceCategory(input, d), "healthy");
  assert.equal(d.calls.length, 6);
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(d.calls[i * 2].args, [
      "compose",
      "-p",
      "fixture",
      "-f",
      input.composePath,
      "ps",
      "--all",
      "--quiet",
      services[i],
    ]);
    assert.equal(d.calls[i * 2 + 1].args[0], "container");
    assert.equal(d.calls[i * 2 + 1].args.at(-1), ids[i]);
    assert.equal(d.calls[i * 2].options.detached, false);
    assert.equal(d.calls[i * 2].options.shell, false);
  }
  for (const output of [
    ids[0] + "\n" + ids[0],
    "ABC".repeat(22),
    "1".repeat(12),
    ids[0] + " ",
    ids[0] + "\n\n",
  ]) {
    const x = queryDouble((c, args) => {
      if (args[0] === "compose") {
        c.stdout.end(output);
        c.emit("close", 0, null);
      } else good(c, args);
    });
    assert.equal(await readServiceCategory(input, x), "unknown");
    assert.equal(x.calls.length, 3, "ambiguous IDs never inspected");
  }
  for (const bad of [
    "wrong-project",
    "wrong-service",
    "duplicate-id",
    "extra-line",
  ]) {
    const x = queryDouble((c, args) => {
      if (args[0] === "compose" && bad === "duplicate-id") {
        c.stdout.end(ids[0]);
        c.emit("close", 0, null);
      } else if (args[0] === "container" && bad !== "duplicate-id") {
        const i = ids.indexOf(args.at(-1));
        c.stdout.end(
          `${ids[i]}|${bad === "wrong-project" ? "foreign" : "fixture"}|${bad === "wrong-service" ? "foreign" : services[i]}|running|healthy${bad === "extra-line" ? "\nprivate" : ""}\n`,
        );
        c.emit("close", 0, null);
      } else good(c, args);
    });
    assert.equal(await readServiceCategory(input, x), "unknown");
  }
  const empty = queryDouble((c) => {
    c.stdout.end();
    c.emit("close", 0, null);
  });
  assert.equal(await readServiceCategory(input, empty), "multiple-bad");
  const invalid = queryDouble(good);
  assert.equal(
    await readServiceCategory({ ...input, project: "x;private" }, invalid),
    "unavailable",
  );
  assert.equal(invalid.calls.length, 0);
});

test("sample_query_failure_and_budget_are_unavailable", async () => {
  for (const fault of [
    "nonzero",
    "signal",
    "spawn",
    "deadline",
    "stdout",
    "stderr",
  ]) {
    const d = queryDouble((c) => {
      if (fault === "spawn")
        c.emit("error", new Error("private SQL password canary"));
      if (fault === "nonzero") c.emit("close", 1, null);
      if (fault === "signal") c.emit("close", null, "SIGTERM");
      if (fault === "stdout") c.stdout.write(Buffer.alloc(1025, 120));
      if (fault === "stderr") c.stderr.write(Buffer.alloc(4097, 120));
      // deadline deliberately has no close, including open streams.
    });
    const started = performance.now();
    assert.equal(await readServiceCategory(input, d), "unavailable", fault);
    assert.equal(d.calls.length, 1);
    assert.ok(
      performance.now() - started < 750,
      "read decision only, not descendant lifetime",
    );
  }
  const d = queryDouble(good);
  let ticks = 0;
  assert.equal(
    await readServiceCategory(input, { ...d, now: () => ticks++ * 1501 }),
    "unavailable",
  );
  assert.equal(d.calls.length, 0);
  const cumulative = queryDouble((c, args) => {
    c.stderr.write(Buffer.alloc(900));
    good(c, args);
  });
  assert.equal(await readServiceCategory(input, cumulative), "unavailable");
  assert.equal(
    cumulative.calls.length,
    5,
    "cumulative stderr stops subsequent fixed queries",
  );
});
