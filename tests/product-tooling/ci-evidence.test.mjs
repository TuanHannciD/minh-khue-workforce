import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { validatePublicReport } from "../../scripts/ci/evidence.mjs";

// File map: projection/collector tests; driverProbe and its failure cases;
// engineProbe (including watchdog diagnostics) and outer lifecycle cases;
// workflow transport regression. Keep probe setup/settlement together so the
// same boundary doubles exercise all primary/secondary process assertions.

const runId = "00112233-4455-4677-8899-aabbccddeeff";
const otherId = "10112233-4455-4677-8899-aabbccddeeff";
const canary =
  "SELECT password FROM users; cookie=hostile; -----BEGIN PRIVATE KEY-----";
const root = resolve(import.meta.dirname, "../..");
const facts = () => ({
  runId,
  profile: "rehearsal",
  result: "Failed",
  primary: {
    phase: "build",
    stepId: "build-api-a",
    scenarioId: null,
    code: "REHEARSAL_ASSERTION",
    exitCode: 1,
    signal: null,
  },
});
async function api() {
  return import("../../scripts/ci/evidence.mjs");
}
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "mkw-public-evidence-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const evidenceRoot = join(directory, "private");
  const outputRoot = join(directory, "public");
  await mkdir(join(evidenceRoot, runId, "public"), { recursive: true });
  return { directory, evidenceRoot, outputRoot };
}

test("R1-1 shared adapter observes an actual owned child close after deadline", async () => {
  const { executeRehearsalProcess } =
    await import("../../scripts/product/local-rehearsal-engine.mjs");
  const result = await executeRehearsalProcess(
    process.execPath,
    ["--input-type=module", "-e", "setInterval(() => {}, 1000)"],
    { timeout: 200 },
  );
  assert.equal(result.processCode, "PROCESS_TIMEOUT");
  assert.equal(result.closeObserved, true);
  assert.equal(result.cleanupUnverified, false);
});

test("shared process adapter classifies explicit caller abort as signal and observes close", async () => {
  const { executeRehearsalProcess } =
    await import("../../scripts/product/local-rehearsal-engine.mjs");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 200);
  try {
    const result = await executeRehearsalProcess(
      process.execPath,
      ["-e", "setInterval(()=>{},1000)"],
      { signal: controller.signal },
    );
    assert.equal(result.processCode, "PROCESS_SIGNAL");
    assert.equal(result.closeObserved, true);
    assert.equal(result.cleanupUnverified, false);
  } finally {
    clearTimeout(timer);
  }
});

test("R1-3 native spawn error uses fixed diagnostics without raw dependency content", async (t) => {
  const f = await fixture(t);
  const { executeRehearsalProcess } =
    await import("../../scripts/product/local-rehearsal-engine.mjs");
  const result = await executeRehearsalProcess(
    join(f.directory, "absent-executable"),
    [],
    { timeout: 200 },
  );
  assert.equal(result.processCode, "PROCESS_SPAWN");
  assert.equal(result.status, null);
  assert.equal(result.closeObserved, true);
  assert.equal(result.cleanupUnverified, false);
});

test("public projection excludes private dependency content; validator rejects unknown fields and unsafe values", async () => {
  const { projectPublicReport, validatePublicReport } = await api();
  const report = projectPublicReport({
    ...facts(),
    message: canary,
    argv: [canary],
    env: { password: canary },
    primary: {
      ...facts().primary,
      actual: canary,
      expected: canary,
      stack: canary,
    },
  });
  assert.equal(report.schemaVersion, "1");
  assert.equal(report.primary.stepId, "build-api-a");
  assert.equal(report.sourceSha256, null);
  assert.equal(report.environmentLockSha256, null);
  assert.equal(JSON.stringify(report).includes(canary), false);
  validatePublicReport(report);
  for (const value of [
    { ...report, password: canary },
    { ...report, primary: { ...report.primary, message: canary } },
    { ...report, primary: { ...report.primary, scenarioId: canary } },
    { ...report, result: "passed" },
    { ...report, primary: { ...report.primary, exitCode: "1" } },
    { ...report, runtime: { ...report.runtime, node: canary } },
  ])
    assert.throws(() => validatePublicReport(value), {
      code: "REPORT_INVALID",
    });
});

test("collector copies only validated matching public report and never private bytes", async (t) => {
  const { projectPublicReport } = await api();
  const { collectPublicReports } =
    await import("../../scripts/ci/collect-evidence.mjs");
  const f = await fixture(t);
  await writeFile(join(f.evidenceRoot, runId, "commands.json"), canary);
  await writeFile(
    join(f.evidenceRoot, runId, "public/check-report.json"),
    JSON.stringify(projectPublicReport(facts())),
  );
  const result = await collectPublicReports({ ...f, runId });
  assert.equal(result.status, "Failed");
  assert.equal(result.files.length, 1);
  const report = JSON.parse(await readFile(result.files[0], "utf8"));
  assert.equal(report.primary.stepId, "build-api-a");
  assert.equal(JSON.stringify(report).includes(canary), false);
});

test("collector fails closed for missing, malformed, foreign, unknown and nonterminal reports", async (t) => {
  const { projectPublicReport } = await api();
  const { collectPublicReports } =
    await import("../../scripts/ci/collect-evidence.mjs");
  const f = await fixture(t);
  for (const value of [
    null,
    "{",
    JSON.stringify(projectPublicReport({ ...facts(), runId: otherId })),
    JSON.stringify({ ...projectPublicReport(facts()), sql: canary }),
    JSON.stringify(
      projectPublicReport({
        ...facts(),
        result: "Not run",
        primary: { ...facts().primary, code: "REPORT_INCOMPLETE" },
      }),
    ),
  ]) {
    const path = join(f.evidenceRoot, runId, "public/check-report.json");
    if (value === null) await rm(path, { force: true });
    else await writeFile(path, value);
    const outputRoot = join(f.directory, `out-${Math.random()}`);
    const result = await collectPublicReports({
      evidenceRoot: f.evidenceRoot,
      outputRoot,
      runId,
    });
    const report = JSON.parse(await readFile(result.files[0], "utf8"));
    assert.equal(result.status, "Failed");
    assert.equal(report.primary.code, "REPORT_INCOMPLETE");
    assert.equal(report.innerReportUnavailable, true);
    assert.equal(JSON.stringify(report).includes(canary), false);
  }
});

test("collector rejects path traversal and symlink report ancestry", async (t) => {
  const { collectPublicReports } =
    await import("../../scripts/ci/collect-evidence.mjs");
  const f = await fixture(t);
  await assert.rejects(collectPublicReports({ ...f, runId: `../${runId}` }), {
    code: "REPORT_INVALID",
  });
  const linked = join(f.directory, "linked");
  await symlink(
    f.evidenceRoot,
    linked,
    process.platform === "win32" ? "junction" : "dir",
  );
  const result = await collectPublicReports({
    evidenceRoot: linked,
    outputRoot: f.outputRoot,
    runId,
  });
  const report = JSON.parse(await readFile(result.files[0], "utf8"));
  assert.equal(report.primary.code, "REPORT_INCOMPLETE");
});

// Run the actual driver with only OS/filesystem/process boundaries doubled.
// No Docker, listener, database, or production-only fault flag is acquired.
function driverProbe(directory, fault = "build") {
  return spawnSync(
    process.execPath,
    [
      "--experimental-test-module-mocks",
      "--input-type=module",
      "-e",
      `
    import { mock } from 'node:test';
    import * as fs from 'node:fs/promises';
    import * as os from 'node:os';
    import * as childProcess from 'node:child_process';
    import * as path from 'node:path';
    import { EventEmitter } from 'node:events';
    import { PassThrough } from 'node:stream';
    import { createHash } from 'node:crypto';
    import { join } from 'node:path';
    const directory=${JSON.stringify(directory)}, runId=${JSON.stringify(runId)};
    const fault=${JSON.stringify(fault)};
    let pendingBuild=false;
    const actualSetTimeout=globalThis.setTimeout;
    const deadlineFault=['deadline','deadline-zero','ignore-term','ignore-all','stdin-deadline-first'].includes(fault);
    globalThis.setTimeout=(callback,ms,...args)=>deadlineFault&&pendingBuild&&ms===900000?actualSetTimeout(callback,0,...args):actualSetTimeout(callback,ms,...args);
    const name='mkw-deploy-account-'+runId;
    const hash=b=>createHash('sha256').update(b).digest('hex');
    const named=m=>Object.fromEntries(Object.entries(m).filter(([k])=>k!=='default'));
    const fixtureBytes=Buffer.from('fixture\\n');
    const fixtureEntry={path:'fixture.txt',size:fixtureBytes.length,sha256:hash(fixtureBytes),mode:0o644};
    const header=Buffer.alloc(512);
    header.write(fixtureEntry.path,0,'utf8');
    header.write('0000644\\0',100,'ascii');
    header.write('0000000\\0',108,'ascii');
    header.write('0000000\\0',116,'ascii');
    header.write(fixtureBytes.length.toString(8).padStart(11,'0')+'\\0',124,'ascii');
    header.write('00000000000\\0',136,'ascii');
    header.fill(32,148,156);
    header[156]=48;
    header.write('ustar\\0',257,'ascii');
    header.write('00',263,'ascii');
    header.write(header.reduce((sum,value)=>sum+value,0).toString(8).padStart(6,'0')+'\\0 ',148,'ascii');
    const archive=Buffer.concat([header,fixtureBytes,Buffer.alloc(512-fixtureBytes.length),Buffer.alloc(1024)]);
    const snapshot={schemaVersion:'2',base:'a'.repeat(40), files:[fixtureEntry], sourceSha256:hash(JSON.stringify([fixtureEntry])),archiveSha256:hash(archive)};
    await fs.mkdir(join(directory,'workspace'));
    await fs.writeFile(join(directory,'workspace/fixture.txt'),fixtureBytes);
    await fs.chmod(join(directory,'workspace/fixture.txt'),0o644);
    await fs.writeFile(join(directory,'source.tar'),archive);
    await fs.writeFile(join(directory,'source-snapshot.json'),JSON.stringify(snapshot));
    const map=p=>typeof p==='string'&&p.startsWith('/')?join(directory,p):p;
    const readFile=async(p,...args)=>p==='/mkw-local-owned.json'?JSON.stringify({owner:'MKW-DEPLOY-ACCOUNT-001',taskId:runId,name,id:'a'.repeat(64)}):p==='deploy/postgres-image.env'?'MKW_POSTGRES_IMAGE=postgres@sha256:'+ 'a'.repeat(64):fs.readFile(map(p),...args);
    mock.module('node:fs/promises',{namedExports:{...named(fs),readFile,
      mkdir:(p,o)=>fs.mkdir(map(p),o),writeFile:(p,...a)=>fs.writeFile(map(p),...a),
      lstat:async p=>{const s=await fs.lstat(map(p));if(p==='/workspace/fixture.txt')Object.defineProperty(s,'mode',{value:(s.mode&~0o777)|0o644});return s;},readdir:p=>fs.readdir(map(p)),realpath:async p=>{await fs.realpath(map(p));return p;},
      rename:(p,q)=>fs.rename(map(p),map(q)),unlink:p=>fs.unlink(map(p)),
      cp:async()=>{},appendFile:async()=>{}}});
    mock.module('node:os',{namedExports:{...named(os),hostname:()=>name}});
    // The simulated Linux driver needs POSIX paths even on the Windows host.
    mock.module('node:path',{namedExports:{...path.posix},defaultExport:path.posix});
    mock.module(${JSON.stringify(new URL("./fixtures/deploy-account.mjs", import.meta.url).href)}, {namedExports:{
      installRehearsalAudit:async()=>{},runRealRestoreReadinessScenario:async f=>f.scenario('restore_waits_for_final_postgres_server',async()=>{}),
      runRealAccountScenarios:async()=>{},makeRehearsalArtifact:async()=>({sha:'b'.repeat(64),manifest:{apiImage:'fixture-api',webImage:'fixture-web',postgresImage:'fixture-pg'},operationId:'fixture',runId:'123',id:'123',digest:'fixture'}),runRealReleaseScenarios:async()=>{}}});
    mock.module('node:child_process',{namedExports:{...named(childProcess),spawn:(bin,args)=>{
      const c=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();c.stdin=new PassThrough();
      pendingBuild=args[0]==='build';
      let finished=false;
      c.kill=(signal)=>{
        fs.appendFile(join(directory,'process-events.jsonl'),JSON.stringify(signal)+'\\n');
        if(fault==='ignore-all'||fault==='stdin-close-absent'||(signal==='SIGTERM'&&['ignore-term','stdin-first-timeout'].includes(fault)))return false;
        if(fault==='stdin-deadline-first')c.stdin.emit('error',Object.assign(new Error(${JSON.stringify(canary)}),{code:'EPIPE'}));
        finished=true;c.stderr.end(${JSON.stringify(canary)});c.emit('close',fault==='deadline-zero'||fault==='stdin-deadline-first'?0:null,fault==='deadline-zero'||fault==='stdin-deadline-first'?null:signal);
        return true;
      };
      if(pendingBuild&&fault.startsWith('stdin-'))c.stdin.end=()=>{
        if(fault==='stdin-premature-close')c.stdin.emit('close');
        if(['stdin-before-close','stdin-close-absent','stdin-first-timeout'].includes(fault))c.stdin.emit('error',Object.assign(new Error(${JSON.stringify(canary)}),{code:'EPIPE'}));
        if(fault==='stdin-first-timeout')process.nextTick(()=>c.emit('error',Object.assign(new Error(${JSON.stringify(canary)}),{code:'ETIMEDOUT'})));
      };
      process.nextTick(()=>{
        const build=args[0]==='build';
        if(finished)return;
        if(build&&(deadlineFault||['stdin-close-absent','stdin-first-timeout'].includes(fault)))return;
        if(build&&${JSON.stringify(fault)}==='spawn'){c.emit('error',Object.assign(new Error(${JSON.stringify(canary)}),{code:'ENOENT'}));c.emit('close',null,null);return;}
        if(build&&${JSON.stringify(fault)}==='timeout'){c.emit('error',Object.assign(new Error(${JSON.stringify(canary)}),{code:'ETIMEDOUT'}));c.emit('close',null,'SIGTERM');return;}
        let out='';if(args[0]==='info')out=name;
        if(args[0]==='version')out='29.0.0';if(args[0]==='compose')out='2.40.0';
        if(args[0]==='image')out=JSON.stringify([{Id:'b'.repeat(64),Config:{Labels:{}},RepoDigests:[args.at(-1).split(':')[0]+'@sha256:'+'b'.repeat(64)]}]);
        if(args[0]==='inspect')out=JSON.stringify([{Config:{Labels:{'com.mkw.task':runId}}}]);
        if(args[0]==='run')out='b'.repeat(64);
        const restoreFault=fault==='backup-cleanup'&&args.includes('SELECT value FROM local_rehearsal_probe WHERE id=1;');
        const cleanupFault=fault==='backup-cleanup'&&args[0]==='rm';
        const status=restoreFault?2:cleanupFault?1:build&&fault!=='backup-cleanup'&&!fault.startsWith('stdin-')?1:0;
        c.stdout.end(out);c.stderr.end(restoreFault?'database "'+${JSON.stringify(canary)}+'" does not exist':status?${JSON.stringify(canary)}:'');c.emit('close',status,build&&${JSON.stringify(fault)}==='signal'?'SIGKILL':null);
        if(build&&fault==='stdin-after-close')actualSetTimeout(()=>c.stdin.emit('error',Object.assign(new Error(${JSON.stringify(canary)}),{code:'EPIPE'})),1);
      });return c;}}});
    Object.defineProperty(process,'platform',{value:'linux'});process.cwd=()=>'/workspace';
    delete process.env.DOCKER_HOST;delete process.env.DOCKER_CONTEXT;
    await import(${JSON.stringify(new URL("../../scripts/product/local-rehearsal-driver.mjs", import.meta.url).href)});
  `,
    ],
    { cwd: root, encoding: "utf8", timeout: 4000 },
  );
}
test("actual driver build failure clears passed scenario and emits safe step/code before exit", async (t) => {
  const f = await fixture(t);
  const result = driverProbe(f.directory);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /step=build-api-a/, result.stderr);
  const report = JSON.parse(
    await readFile(
      join(f.directory, "local-evidence/check-report.json"),
      "utf8",
    ),
  );
  assert.deepEqual(report.primary, {
    phase: "build",
    stepId: "build-api-a",
    scenarioId: null,
    code: "REHEARSAL_ASSERTION",
    exitCode: 1,
    signal: null,
  });
  assert.match(result.stderr, /step=build-api-a/);
  assert.equal(report.runtime.docker, "29.0.0");
  assert.equal(report.runtime.compose, "2.40.0");
  assert.equal(
    (JSON.stringify(report) + result.stdout + result.stderr).includes(canary),
    false,
  );
});
for (const [fault, code, signal] of [
  // The boundary double now closes on the adapter's owned SIGTERM request;
  // preserve that observed signal instead of the old fabricated null value.
  ["spawn", "PROCESS_SPAWN", "SIGTERM"],
  ["timeout", "PROCESS_TIMEOUT", "SIGTERM"],
  ["signal", "PROCESS_SIGNAL", "SIGKILL"],
  ["deadline", "PROCESS_TIMEOUT", "SIGTERM"],
]) {
  test(`actual driver identifies ${fault} without exposing dependency message`, async (t) => {
    const f = await fixture(t);
    const result = driverProbe(f.directory, fault);
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(
      await readFile(
        join(f.directory, "local-evidence/check-report.json"),
        "utf8",
      ),
    );
    assert.equal(report.primary.code, code);
    assert.equal(report.primary.signal, signal);
    assert.equal(
      (JSON.stringify(report) + result.stdout + result.stderr).includes(canary),
      false,
    );
  });
}

test("actual driver keeps restore primary when its owned restore cleanup also fails", async (t) => {
  const f = await fixture(t),
    result = driverProbe(f.directory, "backup-cleanup");
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(
    await readFile(
      join(f.directory, "local-evidence/check-report.json"),
      "utf8",
    ),
  );
  assert.equal(report.primary.phase, "backup", result.stderr);
  assert.equal(report.primary.code, "PG_DATABASE_MISSING", result.stderr);
  assert.equal(report.primary.exitCode, 2);
  assert.ok(report.secondaryErrors.includes("REHEARSAL_CLEANUP"));
  assert.match(report.sourceSha256, /^[a-f0-9]{64}$/);
  assert.equal(
    (JSON.stringify(report) + result.stdout + result.stderr).includes(canary),
    false,
  );
});

function engineProbe(directory, fault, handoff = false) {
  const started = performance.now();
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-test-module-mocks",
      "--input-type=module",
      "-e",
      `
    import { mock } from 'node:test';import * as fs from 'node:fs/promises';import * as childProcess from 'node:child_process';
    import { EventEmitter } from 'node:events';import { PassThrough } from 'node:stream';
    import { createHash } from 'node:crypto';import { join } from 'node:path';
    import { promisify } from 'node:util';
    import { appendFileSync } from 'node:fs';
    const directory=${JSON.stringify(directory)}, runId=${JSON.stringify(runId)},fault=${JSON.stringify(fault)},handoff=${JSON.stringify(handoff)};
    const probeStarted=performance.now();
    const boundary=(stage)=>appendFileSync(join(directory,'probe-boundaries.jsonl'),JSON.stringify({stage,elapsedMs:performance.now()-probeStarted})+'\\n');
    boundary('fixture-start');
    const name='mkw-deploy-account-'+runId,id='a'.repeat(64),hash=b=>createHash('sha256').update(b).digest('hex');
    let driverSeen=false, publicWrites=0;
    const imageCalls=[], imageTags=new Map(), builtImages=new Map(), removedImages=[];
    const foreignImage='sha256:'+'f'.repeat(64);
    if(['images-prior','images-prior-owner'].includes(fault))for(const role of ['worker','engine'])imageTags.set(name+':'+role,foreignImage);
    let containerImage,containerLabels;
    const abortController=new AbortController();
    let pendingBoundary=false;
    const actualSetTimeout=globalThis.setTimeout;
    const deadlineFault=['deadline-zero','deadline','ignore-term','ignore-all','stdin-deadline-first'].includes(fault);
    globalThis.setTimeout=(callback,ms,...args)=>deadlineFault&&pendingBoundary&&ms===2700000?actualSetTimeout(callback,0,...args):actualSetTimeout(callback,ms,...args);
    const named=m=>Object.fromEntries(Object.entries(m).filter(([k])=>k!=='default'));
    const snapshotGit=join(directory,'snapshot-git');await fs.mkdir(snapshotGit);
    childProcess.spawnSync('git',['init','--quiet',snapshotGit]);
    boundary('fixture-git-init-complete');
    for(const p of ['scripts/ci/Dockerfile','scripts/ci/Dockerfile.rehearsal','scripts/ci/environment-lock.json']) {
      await fs.mkdir(join(snapshotGit,p,'..'),{recursive:true});await fs.writeFile(join(snapshotGit,p),await fs.readFile(p));
    }
    childProcess.spawnSync('git',['-C',snapshotGit,'add','.']);
    boundary('fixture-git-add-complete');
    const fixtureExecFile=(bin,args,options,callback)=>childProcess.execFile(bin,args,{...options,cwd:snapshotGit},callback);
    fixtureExecFile[Symbol.for('nodejs.util.promisify.custom')]=async(bin,args,options)=>{boundary('snapshot-git-start');const result=await promisify(childProcess.execFile)(bin,args,{...options,cwd:snapshotGit});boundary('snapshot-git-complete');return result;};
    mock.module('node:fs/promises',{namedExports:{...named(fs),statfs:async()=>({bavail:20*1024**3,bsize:1}),
      rename:async(a,b)=>{if(String(b).endsWith('public/check-report.json')&&++publicWrites>1&&driverSeen&&fault==='write')throw new Error(${JSON.stringify(canary)});return fs.rename(a,b);}}});
    const {projectPublicReport}=await import(${JSON.stringify(new URL("../../scripts/ci/evidence.mjs", import.meta.url).href)});
    const passed=fault==='cleanup'||fault==='false-pass'||fault==='passed-export'||fault==='abort-terminal'||fault.startsWith('images-')&&fault!=='images-primary';
    const terminal=projectPublicReport({runId,sourceSha256:hash('[]'),baseSha:null, result:passed?'Passed':'Failed',
      primary:passed?{phase:'complete',stepId:'complete',code:'OK',exitCode:0}:{phase:'build',stepId:'build-api-a',code:'REHEARSAL_ASSERTION',exitCode:1},counts:{assertions:7,commands:93},runtime:{node:'v24.22.1',docker:'29.7.4',compose:'2.44.3',platform:'linux',arch:'x64',uid:1000}});
    mock.module('node:child_process',{namedExports:{...named(childProcess),execFile:fixtureExecFile,spawn:(bin,args,options={})=>{
      const abortTarget=fault==='abort-driver'&&args.includes('scripts/product/local-rehearsal-driver.mjs')||fault==='abort-readiness'&&args[0]==='exec'&&args.includes('{{.Name}}')||fault==='abort-terminal'&&args.includes('/local-evidence/check-report.json');
      if(abortTarget){
        const child=childProcess.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],options);
        const observed={signalForwarded:options.signal===abortController.signal,closed:false,fallbackKilled:false};
        boundary('actual-'+fault+'-start');
        const abortTimer=actualSetTimeout(()=>abortController.abort(),50);
        const fallback=actualSetTimeout(()=>{observed.fallbackKilled=true;child.kill('SIGTERM');},500);
        child.on('error',e=>{observed.error=e.code;});
        child.on('close',(status,signal)=>{clearTimeout(abortTimer);clearTimeout(fallback);Object.assign(observed,{closed:true,status,signal});boundary('actual-'+fault+'-complete');fs.writeFile(join(directory,'actual-abort.json'),JSON.stringify(observed));});
        return child;
      }
      // Fixed operation names only: never retain full argv or dependency output.
      const operation=['info','version','ps','pull','image','build','run','inspect','exec','cp','rm','volume'].includes(args[0])?args[0]:'other';
      boundary('process-'+operation+'-start');
      const c=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();c.stdin=new PassThrough();
      pendingBoundary=bin==='docker'&&args[0]==='version';
      let finished=false;
      c.kill=signal=>{
        fs.appendFile(join(directory,'process-events.jsonl'),JSON.stringify(signal)+'\\n');
        if(fault==='ignore-all'||fault==='stdin-close-absent'||(signal==='SIGTERM'&&['ignore-term','stdin-first-timeout'].includes(fault)))return false;
        if(fault==='stdin-deadline-first')c.stdin.emit('error',Object.assign(new Error(${JSON.stringify(canary)}),{code:'EPIPE'}));
        finished=true;c.emit('close',fault==='deadline-zero'||fault==='stdin-deadline-first'?0:null,fault==='deadline-zero'||fault==='stdin-deadline-first'?null:signal);return true;
      };
      if(pendingBoundary&&fault.startsWith('stdin-'))c.stdin.end=()=>{
        if(fault==='stdin-premature-close')c.stdin.emit('close');
        if(['stdin-before-close','stdin-close-absent','stdin-first-timeout'].includes(fault))c.stdin.emit('error',Object.assign(new Error(${JSON.stringify(canary)}),{code:'EPIPE'}));
        if(fault==='stdin-first-timeout')process.nextTick(()=>c.emit('error',Object.assign(new Error(${JSON.stringify(canary)}),{code:'ETIMEDOUT'})));
      };
      process.nextTick(async()=>{let out='',status=0;
        if(finished)return;
        if(pendingBoundary&&(deadlineFault||['stdin-close-absent','stdin-first-timeout'].includes(fault)))return;
        if(bin==='git')out=args[0]==='rev-parse'?'b'.repeat(40):'';
        else if(bin==='tar')await fs.writeFile(args[1],'fixture');
        else if(bin==='docker'){
          imageCalls.push(args);
          if(args[0]==='info')out='"linux"';
          if(args[0]==='version')out=args.includes('{{.Server.Os}}/{{.Server.Arch}}')?'linux/amd64':'29.0.0';
          if(args[0]==='build'){
            const role=args.at(-1).endsWith('worker-setup')?'worker':'engine',image='sha256:'+(role==='worker'?'b':'c').repeat(64);
            const labels=Object.fromEntries(args.flatMap((a,i)=>a==='--label'?[args[i+1].split('=')]:[]));
            builtImages.set(image,{Id:image,Os:'linux',Architecture:'amd64',RepoTags:[],RepoDigests:[],Config:{User:role==='worker'?'node':'',Labels:labels}});
            if(args.includes('-t'))imageTags.set(args[args.indexOf('-t')+1],image);
            if(args.includes('--iidfile'))await fs.writeFile(args[args.indexOf('--iidfile')+1],image);
            if(fault==='images-build-fail')status=45;
          }
          if(args[0]==='image'&&args[1]==='inspect'){
            const ref=args.at(-1),image=structuredClone(builtImages.get(imageTags.get(ref)??ref));
            if(image){
              image.RepoTags=[...imageTags].filter(([,v])=>v===image.Id).map(([k])=>k);
              if(driverSeen&&image.Id==='sha256:'+'b'.repeat(64)){
                if(fault==='images-worker-id')image.Id=foreignImage;
                if(fault==='images-worker-label')image.Config.Labels['com.mkw.session']='foreign';
                if(fault==='images-alias')image.RepoTags=['foreign/shared:keep'];
              }
              out=JSON.stringify([image]);
            }else out=JSON.stringify([{Id:id,Os:'linux',Architecture:'amd64',RepoDigests:[ref],Config:{Labels:{}}}]);
          }
          if(args[0]==='image'&&args[1]==='ls'){
            if(driverSeen&&fault==='images-query')status=51;
            const filter=args[args.indexOf('--filter')+1]??'';
            if(args.includes('--all')&&filter.startsWith('label=com.mkw.session='))out=[...builtImages.values()].filter(i=>i.Config.Labels['com.mkw.session']===filter.slice('label=com.mkw.session='.length)).map(i=>i.Id).join('\\n');
          }
          if(args[0]==='image'&&args[1]==='rm'){
            const ref=args.at(-1),image=imageTags.get(ref)??ref;removedImages.push({ref,image});
            if(imageTags.has(ref))imageTags.delete(ref);
            else{builtImages.delete(image);for(const [tag,v]of imageTags)if(v===image)imageTags.delete(tag);}
          }
          if(args[0]==='run'&&args.includes('id')&&args.includes('-u'))out='1000';
          else if(args[0]==='run'){
            containerImage=args.at(-3);containerLabels=Object.fromEntries(args.flatMap((a,i)=>a==='--label'?[args[i+1].split('=')]:[]));out=id;
          }
          if(args[0]==='inspect')out=JSON.stringify([{Id:id,Image:containerImage,Name:'/'+name,Mounts:[],Config:{Hostname:name,Labels:{...containerLabels,'com.mkw.task':driverSeen&&fault==='ownership'?${JSON.stringify(otherId)}:runId}}}]);
          if(args[0]==='exec'&&args.includes('/mkw-local-owned.json')&&!args.includes('sh'))out=JSON.stringify({owner:'MKW-DEPLOY-ACCOUNT-001',taskId:runId,name,id,sessionId:containerLabels?.['com.mkw.session'],imageId:containerImage});
          if(args[0]==='exec'&&args.includes('{{.Name}}')){
            out=name;
            if(fault==='abort-readiness-wait') {status=1; actualSetTimeout(()=>abortController.abort(),10);}
          }
          if(args[0]==='exec'&&args.includes('{{.Server.Os}}/{{.Server.Arch}}'))out=fault==='inner-platform'?'linux/arm64':'linux/amd64';
          if(args[0]==='exec'&&args[2]==='apk'){const p=args.at(-1),v={'bash':'5.3.9-r1','coreutils':'9.11-r0','util-linux':'2.42.3-r1','curl':'8.23.0-r0','openssl':'3.5.9-r1','git':'2.54.1-r0','jq':'1.8.2-r0','tar':'1.35-r5','libstdc++':'15.2.0-r5','procps-ng':'4.0.6-r0'}[p];out=v?p+'-'+v:'';}
          if(args[0]==='exec'&&args.includes('id')&&args.at(-1)==='-u')out='0';
          if(args[0]==='exec'&&args[2]==='node'&&args.at(-1)==='--version')out='v24.22.1';
          if(args[0]==='exec'&&args[2]==='pnpm')out='12.15.0';
          if(args[0]==='exec'&&args[2]==='docker'&&args.includes('--version'))out='Docker version 29.9.3, build fixture';
          if(args[0]==='exec'&&args[2]==='docker'&&args.includes('compose'))out='Docker Compose version v5.7.1';
          if(args[0]==='exec'&&args[2]==='flock')out='flock from util-linux 2.42.3';
          if(args[0]==='exec'&&args[2]==='ps')out='ps from procps-ng 4.0.6';
          if(args[0]==='exec'&&args[2]==='bash')out='GNU bash, version 5.3.9(1)-release';
          if(args[0]==='exec'&&args[2]==='openssl')out='OpenSSL 3.5.9 29 Sep 2026';
          if(args[0]==='exec'&&args[2]==='jq')out='jq-1.8.2';
          if(args[0]==='exec'&&args[2]==='git')out='git version 2.54.1';
          if(args[0]==='exec'&&args[2]==='tar')out='tar (GNU tar) 1.35';
          if(args.includes('scripts/product/local-rehearsal-driver.mjs')){driverSeen=true;
            const manifest=JSON.parse(await fs.readFile(join(directory,handoff?'shared':'run','source-snapshot.json'),'utf8'));
            terminal.sourceSha256=manifest.sourceSha256;terminal.baseSha=manifest.base;
            status=fault==='driver-137'?137:fault.endsWith('-zero')?0:fault==='false-pass'?1:passed?0:1;out=${JSON.stringify(canary)};}
          if(args.includes('/local-evidence/check-report.json')){out=fault==='driver-137'?'':fault.startsWith('malformed')?'{':fault==='unknown'?JSON.stringify({...terminal,sql:${JSON.stringify(canary)}}):fault==='foreign'?JSON.stringify({...terminal,runId:${JSON.stringify(otherId)}}):fault.startsWith('missing')?'':JSON.stringify(terminal);if(fault==='driver-137'||fault.startsWith('missing'))status=1;}
          if(args[0]==='cp'&&args[1]===id+':/local-evidence'){if(fault==='export'||fault==='passed-export'||fault==='driver-137')status=1;else {await fs.mkdir(args[2]);}if(fault==='images-retag')for(const role of ['worker','engine'])imageTags.set(name+':'+role,foreignImage);}
          if(args[0]==='rm'&&fault==='cleanup')status=1;
        }else throw new Error('unexpected process');
        c.stdout.end(out);c.stderr.end(status?${JSON.stringify(canary)}:'');boundary('process-'+operation+'-complete');c.emit('close',status,null);
        if(pendingBoundary&&fault==='stdin-after-close')actualSetTimeout(()=>c.stdin.emit('error',Object.assign(new Error(${JSON.stringify(canary)}),{code:'EPIPE'})),1);
      });return c;}}});
    const {runOwnedRehearsal}=await import(${JSON.stringify(new URL("../../scripts/product/local-rehearsal-engine.mjs", import.meta.url).href)});
    boundary('engine-import-complete');
    let sourceSnapshot;
    if(handoff){
      const {createSourceSnapshot,verifySourceSnapshot}=await import(${JSON.stringify(new URL("../../scripts/ci/source-snapshot.mjs", import.meta.url).href)});
      const root=join(directory,'shared');await fs.mkdir(root);
      await fs.writeFile(join(snapshotGit,'scripts/ci/Dockerfile'),'# retained handoff worker\\nUSER node\\n');
      await fs.copyFile(${JSON.stringify(join(root, "scripts/ci/environment-lock.json"))},join(snapshotGit,'scripts/ci/environment-lock.json'));
      await fs.copyFile(${JSON.stringify(join(root, "scripts/ci/Dockerfile.rehearsal"))},join(snapshotGit,'scripts/ci/Dockerfile.rehearsal'));
      await createSourceSnapshot(snapshotGit,root);
      sourceSnapshot={root,manifest:await verifySourceSnapshot(root)};
      await fs.writeFile(join(snapshotGit,'scripts/ci/Dockerfile'),'# later live mutation\\n');
    }
    await runOwnedRehearsal({taskId:runId,evidencePath:join(directory,'run'),sourceSnapshot,signal:abortController.signal}).catch(e=>{console.error('OUTER_CODE='+e.code);process.exitCode=1;});
    await fs.writeFile(join(directory,'image-effects.json'),JSON.stringify({calls:imageCalls,tags:[...imageTags],live:[...builtImages.keys()],removed:removedImages}));
    boundary('engine-settled');
  `,
    ],
    { cwd: root, encoding: "utf8", timeout: 4000 },
  );
  const readDiagnostic = (path, parse) => {
    try {
      return parse(readFileSync(join(directory, path), "utf8"));
    } catch {
      return null;
    }
  };
  const boundaries = readDiagnostic("probe-boundaries.jsonl", (text) =>
    text.trim().split("\n").map(JSON.parse),
  );
  const childReport = readDiagnostic("run/public/check-report.json", (text) => {
    const report = JSON.parse(text);
    validatePublicReport(report);
    return report;
  });
  result.diagnostics = {
    elapsedMs: performance.now() - started,
    watchdogMs: 4000,
    status: result.status,
    signal: result.signal,
    error: result.error
      ? {
          code: result.error.code,
          errno: result.error.errno,
          syscall: "spawnSync",
        }
      : null,
    boundaries,
    lastCompletedBoundary:
      boundaries?.findLast(
        ({ stage }) => stage.endsWith("complete") || stage === "engine-settled",
      ) ?? null,
    childReport,
  };
  // Include only schema-validated report and fixed boundary facts on failures.
  result.stderr += "\nPROBE_DIAGNOSTICS=" + JSON.stringify(result.diagnostics);
  return result;
}

for (const fault of [
  "images-prior",
  "images-prior-owner",
  "images-retag",
  "images-normal",
]) {
  test(`I1 engine preserves prior/foreign references and cleans only immutable session images: ${fault}`, async (t) => {
    const f = await fixture(t),
      result = engineProbe(f.directory, fault);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const effects = JSON.parse(
      await readFile(join(f.directory, "image-effects.json")),
    );
    if (fault !== "images-normal")
      assert.deepEqual(
        effects.tags,
        ["worker", "engine"].map((role) => [
          "mkw-deploy-account-" + runId + ":" + role,
          "sha256:" + "f".repeat(64),
        ]),
      );
    assert.deepEqual(effects.live, []);
    assert.equal(effects.removed.length, 2);
    assert.ok(
      effects.removed.every((v) => /^sha256:[a-f0-9]{64}$/.test(v.ref)),
    );
    assert.ok(
      effects.calls
        .filter((c) => c[0] === "build")
        .every((c) => !c.includes("-t")),
    );
    assert.ok(
      effects.calls
        .filter((c) => c[0] === "image" && c[1] === "rm")
        .every((c) => !c.includes("--force") && !c.includes("-f")),
    );
  });
}
for (const fault of [
  "images-worker-id",
  "images-worker-label",
  "images-alias",
  "images-query",
]) {
  test(`I1 engine retains images when cleanup proof is unavailable: ${fault}`, async (t) => {
    const f = await fixture(t),
      result = engineProbe(f.directory, fault);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const report = JSON.parse(
      await readFile(join(f.directory, "run/public/check-report.json")),
    );
    const effects = JSON.parse(
      await readFile(join(f.directory, "image-effects.json")),
    );
    assert.equal(report.result, "Failed");
    assert.equal(report.primary.phase, "cleanup");
    assert.ok(report.secondaryErrors.includes("REHEARSAL_CLEANUP"));
    assert.equal(effects.removed.length, 0);
  });
}
test("I1 engine retains failed driver resources and its original primary", async (t) => {
  const f = await fixture(t),
    result = engineProbe(f.directory, "images-primary");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const report = JSON.parse(
    await readFile(join(f.directory, "run/public/check-report.json")),
  );
  assert.deepEqual(report.primary, {
    phase: "build",
    stepId: "build-api-a",
    scenarioId: null,
    code: "REHEARSAL_ASSERTION",
    exitCode: 1,
    signal: null,
  });
  const effects = JSON.parse(
    await readFile(join(f.directory, "image-effects.json")),
  );
  assert.equal(effects.removed.length, 0);
  assert.equal(effects.live.length, 2);
});
test("I1 engine records the exact image even when build exits nonzero after acquisition", async (t) => {
  const f = await fixture(t),
    result = engineProbe(f.directory, "images-build-fail");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const report = JSON.parse(
    await readFile(join(f.directory, "run/public/check-report.json")),
  );
  assert.equal(report.primary.exitCode, 45);
  assert.equal(report.primary.phase, "setup");
  const owned = JSON.parse(
    await readFile(join(f.directory, "run/ownership.json")),
  );
  assert.equal(owned.derivedImages.length, 1);
  assert.match(owned.derivedImages[0].id, /^sha256:[a-f0-9]{64}$/);
  const resultRecord = JSON.parse(
    await readFile(join(f.directory, "run/result.json")),
  );
  assert.match(resultRecord.cleanup, /images retained/);
});

test("R1 I3 full engine abort interrupts readiness wait before another probe", async (t) => {
  const f = await fixture(t),
    result = engineProbe(f.directory, "abort-readiness-wait");
  t.diagnostic(JSON.stringify(result.diagnostics));
  assert.equal(result.error, undefined, result.stderr);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.diagnostics.childReport.primary.code, "PROCESS_SIGNAL");
  assert.equal(result.diagnostics.childReport.primary.phase, "setup");
  const boundaries = result.diagnostics.boundaries;
  assert.equal(
    boundaries.filter((b) => b.stage === "process-exec-start").length,
    2,
  );
});

for (const boundary of ["driver", "readiness", "terminal"]) {
  test(`R1 I3 full engine abort closes actual owned ${boundary} child and retains failed engine`, async (t) => {
    const f = await fixture(t),
      result = engineProbe(f.directory, `abort-${boundary}`);
    t.diagnostic(JSON.stringify(result.diagnostics));
    assert.equal(result.error, undefined, result.stderr);
    assert.equal(result.status, 1, result.stderr);
    const observed = JSON.parse(
      await readFile(join(f.directory, "actual-abort.json"), "utf8"),
    );
    t.diagnostic(JSON.stringify({ boundary, observed }));
    assert.equal(observed.signalForwarded, true);
    assert.equal(observed.closed, true);
    assert.equal(observed.fallbackKilled, false);
    assert.equal(observed.error, "ABORT_ERR");
    const report = JSON.parse(
      await readFile(join(f.directory, "run/public/check-report.json"), "utf8"),
    );
    assert.notEqual(report.result, "Passed");
    const retained = JSON.parse(
      await readFile(join(f.directory, "run/result.json"), "utf8"),
    );
    assert.match(retained.cleanup, /retained/);
  });
}

test("optional same-run snapshot is verified/reused for rehearsal tar and build controls without recapture", async (t) => {
  const f = await fixture(t),
    result = engineProbe(f.directory, "none", true);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(
    result.stdout,
    /phase=build step=build-api-a/,
    result.stdout + result.stderr,
  );
  const captured = JSON.parse(
    await readFile(join(f.directory, "shared/source-snapshot.json"), "utf8"),
  );
  const report = JSON.parse(
    await readFile(join(f.directory, "run/public/check-report.json"), "utf8"),
  );
  assert.equal(report.sourceSha256, captured.sourceSha256);
  assert.equal(
    await readFile(join(f.directory, "run/worker-setup/Dockerfile"), "utf8"),
    "# retained handoff worker\nUSER node\n",
  );
  assert.equal(
    await readFile(
      join(f.directory, "shared/source/scripts/ci/Dockerfile"),
      "utf8",
    ),
    "# retained handoff worker\nUSER node\n",
  );
  await assert.rejects(
    readFile(join(f.directory, "run/source-snapshot.json")),
    { code: "ENOENT" },
  );
  const commands = JSON.parse(
    await readFile(join(f.directory, "run/outer-commands.json"), "utf8"),
  );
  assert.ok(
    commands.some(
      (c) =>
        c.command[1] === "cp" &&
        c.command[2] === join(f.directory, "shared/source.tar"),
    ),
  );
});

test("old rehearsal caller still captures a fresh v2 snapshot in its own evidence", async (t) => {
  const f = await fixture(t),
    result = engineProbe(f.directory, "none");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(
    result.stdout,
    /phase=build step=build-api-a/,
    result.stdout + result.stderr,
  );
  const manifest = JSON.parse(
    await readFile(join(f.directory, "run/source-snapshot.json"), "utf8"),
  );
  assert.equal(manifest.schemaVersion, "2");
  assert.equal(manifest.files.length, 3);
});

for (const [adapter, probe, reportFile, commandFile] of [
  [
    "driver",
    driverProbe,
    "local-evidence/check-report.json",
    "local-evidence/commands.json",
  ],
  [
    "outer",
    engineProbe,
    "run/public/check-report.json",
    "run/outer-commands.json",
  ],
]) {
  for (const [fault, signal, kills] of [
    ["deadline-zero", null, ["SIGTERM"]],
    ["deadline", "SIGTERM", ["SIGTERM"]],
    ["ignore-term", "SIGKILL", ["SIGTERM", "SIGKILL"]],
    ["ignore-all", null, ["SIGTERM", "SIGKILL"]],
  ]) {
    test(`R1-1 ${adapter} ${fault} stops at deadline boundary with bounded settlement`, async (t) => {
      const f = await fixture(t),
        result = probe(f.directory, fault);
      assert.equal(result.error, undefined, "adapter required test watchdog");
      assert.equal(result.status, 1, result.stdout + result.stderr);
      const report = JSON.parse(
        await readFile(join(f.directory, reportFile), "utf8"),
      );
      assert.equal(
        report.primary.code,
        "PROCESS_TIMEOUT",
        result.stdout + result.stderr,
      );
      assert.equal(report.primary.signal, signal);
      if (fault === "deadline-zero") assert.equal(report.primary.exitCode, 0);
      assert.equal(
        report.primary.phase,
        adapter === "driver" ? "build" : "prerequisite",
      );
      assert.equal(
        report.primary.stepId,
        adapter === "driver" ? "build-api-a" : "prerequisite",
      );
      const journal = JSON.parse(
        await readFile(join(f.directory, commandFile), "utf8"),
      );
      const args =
        adapter === "driver"
          ? journal.at(-1).args
          : journal.at(-1).command.slice(1);
      assert.equal(args[0], adapter === "driver" ? "build" : "version");
      const events = (
        await readFile(join(f.directory, "process-events.jsonl"), "utf8")
      )
        .trim()
        .split("\n")
        .map(JSON.parse);
      assert.deepEqual(events, kills);
      if (fault === "ignore-all") {
        assert.ok(
          report.secondaryErrors.includes("PROCESS_CLEANUP_UNVERIFIED"),
        );
        assert.equal(report.primary.exitCode, null);
      }
      assert.equal(
        (JSON.stringify(report) + result.stdout + result.stderr).includes(
          canary,
        ),
        false,
      );
    });
  }
  for (const [fault, code] of [
    ["stdin-before-close", "PROCESS_STDIN"],
    ["stdin-after-close", "PROCESS_STDIN"],
    ["stdin-deadline-first", "PROCESS_TIMEOUT"],
    ["stdin-first-timeout", "PROCESS_STDIN"],
    ["stdin-close-absent", "PROCESS_STDIN"],
    ["stdin-premature-close", "PROCESS_STDIN"],
  ]) {
    test(`R1-3 ${adapter} ${fault} settles safely and preserves first boundary failure`, async (t) => {
      const f = await fixture(t),
        result = probe(f.directory, fault);
      assert.equal(result.error, undefined, "adapter required test watchdog");
      assert.equal(result.status, 1, result.stdout + result.stderr);
      const report = JSON.parse(
        await readFile(join(f.directory, reportFile), "utf8"),
      );
      assert.equal(report.primary.code, code, result.stdout + result.stderr);
      assert.equal(
        report.primary.stepId,
        adapter === "driver" ? "build-api-a" : "prerequisite",
      );
      const journal = JSON.parse(
        await readFile(join(f.directory, commandFile), "utf8"),
      );
      const args =
        adapter === "driver"
          ? journal.at(-1).args
          : journal.at(-1).command.slice(1);
      assert.equal(args[0], adapter === "driver" ? "build" : "version");
      if (fault === "stdin-close-absent")
        assert.ok(
          report.secondaryErrors.includes("PROCESS_CLEANUP_UNVERIFIED"),
        );
      assert.doesNotMatch(
        result.stdout + result.stderr,
        /Unhandled 'error'|Error: SELECT|\bat file:/,
      );
      assert.equal(
        (JSON.stringify(report) + result.stdout + result.stderr).includes(
          canary,
        ),
        false,
      );
    });
  }
}
for (const fault of ["none", "export", "ownership", "write"]) {
  test(`actual outer preserves driver primary through ${fault} secondary boundary`, async (t) => {
    const f = await fixture(t),
      result = engineProbe(f.directory, fault);
    t.diagnostic(JSON.stringify({ fault, probe: result.diagnostics }));
    assert.equal(result.status, 1, result.stderr);
    assert.match(
      result.stdout,
      /phase=build step=build-api-a scenario=none code=REHEARSAL_ASSERTION/,
      result.stdout + result.stderr,
    );
    assert.match(result.stderr, /OUTER_CODE=REHEARSAL_ASSERTION/);
    if (fault !== "write") {
      const report = JSON.parse(
        await readFile(
          join(f.directory, "run/public/check-report.json"),
          "utf8",
        ),
      );
      assert.equal(report.primary.stepId, "build-api-a");
      if (["export", "ownership"].includes(fault))
        assert.ok(report.secondaryErrors.includes("REHEARSAL_EVIDENCE_EXPORT"));
      if (fault === "ownership")
        assert.ok(report.secondaryErrors.includes("REHEARSAL_CLEANUP"));
      assert.equal(JSON.stringify(report).includes(canary), false);
    }
    assert.equal((result.stdout + result.stderr).includes(canary), false);
  });
}
for (const fault of [
  "missing",
  "malformed",
  "unknown",
  "foreign",
  "missing-zero",
  "malformed-zero",
  "false-pass",
]) {
  test(`actual outer fails closed for ${fault} inner terminal`, async (t) => {
    const f = await fixture(t),
      result = engineProbe(f.directory, fault);
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(
      await readFile(join(f.directory, "run/public/check-report.json"), "utf8"),
    );
    assert.equal(report.primary.code, "REPORT_INCOMPLETE");
    assert.equal(report.innerReportUnavailable, true);
    assert.equal(
      (JSON.stringify(report) + result.stdout + result.stderr).includes(canary),
      false,
    );
  });
}
test("actual outer admits the inner dind platform instead of assuming amd64", async (t) => {
  const f = await fixture(t),
    result = engineProbe(f.directory, "inner-platform");
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(
    await readFile(join(f.directory, "run/public/check-report.json"), "utf8"),
  );
  assert.equal(report.primary.code, "ENVIRONMENT_PLATFORM");
  assert.equal(report.primary.phase, "setup");
});

test("environment inventory records worker UID admission separately from dind root", async (t) => {
  const f = await fixture(t),
    result = engineProbe(f.directory, "none");
  assert.equal(result.status, 1, result.stderr);
  const inventory = JSON.parse(
    await readFile(join(f.directory, "run/environment-inventory.json"), "utf8"),
  );
  assert.equal(inventory.uid, 1000);
  assert.equal(inventory.dindUid, 0);
});

test("actual outer preserves driver exit when export verification also fails", async (t) => {
  const f = await fixture(t),
    result = engineProbe(f.directory, "driver-137");
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(
    await readFile(join(f.directory, "run/public/check-report.json"), "utf8"),
  );
  assert.equal(report.primary.code, "REPORT_INCOMPLETE");
  assert.equal(report.primary.exitCode, 137);
  const exportFailure = JSON.parse(
    await readFile(join(f.directory, "run/export-failure.json"), "utf8"),
  );
  assert.equal(exportFailure.primaryDriverExit, 137);
});

test("actual outer cleanup failure after a passed driver is nonzero and never Passed", async (t) => {
  const f = await fixture(t),
    result = engineProbe(f.directory, "cleanup");
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(
    await readFile(join(f.directory, "run/public/check-report.json"), "utf8"),
  );
  assert.equal(report.result, "Failed");
  assert.equal(report.primary.phase, "cleanup");
  assert.equal(report.primary.stepId, "cleanup");
  assert.deepEqual(report.counts, { assertions: 7, commands: 93 });
  assert.equal(report.runtime.platform, "linux");
  assert.equal(report.runtime.uid, 1000);
  assert.equal(report.runtime.docker, "29.7.4");
  assert.equal(report.runtime.compose, "2.44.3");
  assert.equal(
    (JSON.stringify(report) + result.stdout + result.stderr).includes(canary),
    false,
  );
});

test("R1-2 passed driver export failure preserves admitted facts and reports export stage", async (t) => {
  const f = await fixture(t),
    result = engineProbe(f.directory, "passed-export");
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(
    await readFile(join(f.directory, "run/public/check-report.json"), "utf8"),
  );
  assert.equal(report.result, "Failed");
  assert.equal(report.primary.phase, "export");
  assert.equal(report.primary.stepId, "export");
  assert.deepEqual(report.counts, { assertions: 7, commands: 93 });
  assert.equal(report.runtime.platform, "linux");
  assert.equal(report.runtime.uid, 1000);
  assert.equal(report.runtime.docker, "29.7.4");
  assert.equal(report.runtime.compose, "2.44.3");
});

test("workflow always collects only public evidence and upload success cannot mask a failed rehearsal", async (t) => {
  const require = createRequire(import.meta.url);
  const { load, JSON_SCHEMA } = createRequire(
    require.resolve("eslint/package.json"),
  )("js-yaml");
  const workflow = load(
    await readFile(
      join(root, ".github/workflows/release-validation.yml"),
      "utf8",
    ),
    { schema: JSON_SCHEMA },
  );
  const job = workflow.jobs["release-validation"],
    steps = job.steps;
  const rehearsal = steps.find((s) => s.id === "rehearsal");
  const collect = steps.find((s) => s.id === "collect-evidence");
  const upload = steps.find((s) => s.id === "upload-evidence");
  const summary = steps.find((s) => s.id === "evidence-summary");
  assert.ok(rehearsal && collect && upload && summary);
  assert.equal(collect.if, "always()");
  assert.equal(upload.if, "always()");
  assert.equal(summary.if, "always()");
  assert.equal(upload.with["retention-days"], 7);
  assert.equal(upload.with["if-no-files-found"], "error");
  assert.equal(
    upload.with.path,
    "${{ env.MKW_PUBLIC_EVIDENCE }}/check-report.json",
  );
  assert.match(upload.uses, /^actions\/upload-artifact@[a-f0-9]{40}$/);
  assert.equal(upload.with["include-hidden-files"], undefined);
  assert.match(collect.run, /scripts\/ci\/collect-evidence.mjs/);
  assert.match(rehearsal.run, /scripts\/ci\/parity.mjs --release/);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  for (const step of steps) assert.equal(step["continue-on-error"], undefined);
  assert.equal(job["continue-on-error"], undefined);
  // Execute the YAML's shell commands. Double only the expensive engine
  // process, record its actual argv, and keep collector/summary code real.
  const f = await fixture(t),
    { projectPublicReport } = await api();
  const normalize = (p) => p.replaceAll("\\", "/");
  const summaryFile = join(f.directory, "summary.txt"),
    argsFile = join(f.directory, "args.txt");
  const env = {
    ...process.env,
    MKW_REHEARSAL_RUN_ID: runId,
    MKW_PARITY_EVIDENCE_ROOT: normalize(f.evidenceRoot),
    MKW_PUBLIC_EVIDENCE: normalize(f.outputRoot),
    GITHUB_STEP_SUMMARY: normalize(summaryFile),
    PROBE_NODE: normalize(process.execPath),
    PROBE_ARGS: normalize(argsFile),
  };
  const bash =
    process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  const shell = (script, extra = {}) =>
    spawnSync(bash, ["-ceu", script], {
      cwd: root,
      encoding: "utf8",
      env: { ...env, ...extra },
    });
  const failed = shell(
    `node() { printf '%s\\n' "$@" > "$PROBE_ARGS"; return 1; }\n${rehearsal.run}`,
  );
  assert.equal(failed.status, 1, failed.stderr);
  assert.equal(
    await readFile(argsFile, "utf8"),
    `scripts/ci/parity.mjs\n--release\n--evidence-root\n${normalize(f.evidenceRoot)}\n--run-id\n${runId}\n`,
  );
  // The workflow passes the actual runner output root, independent of cwd.
  const cliId = randomUUID();
  const cliEvidence = join(f.evidenceRoot, cliId);
  await mkdir(join(cliEvidence, "public"), { recursive: true });
  t.after(() => rm(cliEvidence, { recursive: true, force: true }));
  await writeFile(
    join(cliEvidence, "public/check-report.json"),
    JSON.stringify(projectPublicReport({ ...facts(), runId: cliId })),
  );
  const collected = shell(`node() { "$PROBE_NODE" "$@"; }\n${collect.run}`, {
    MKW_REHEARSAL_RUN_ID: cliId,
  });
  assert.equal(collected.status, 1, collected.stderr); // gate failed, artifact still written
  const publicReport = JSON.parse(
    await readFile(join(f.outputRoot, "check-report.json"), "utf8"),
  );
  assert.equal(publicReport.primary.stepId, "build-api-a");
  assert.ok(
    !rehearsal.if && !rehearsal["continue-on-error"] && failed.status !== 0,
  );
  for (const outcome of ["success", "failure"]) {
    assert.equal(
      summary.env.REHEARSAL_OUTCOME,
      "${{ steps.rehearsal.outcome }}",
    );
    assert.equal(
      summary.env.UPLOAD_OUTCOME,
      "${{ steps.upload-evidence.outcome }}",
    );
    await writeFile(summaryFile, "");
    const summarized = shell(`node() { "$PROBE_NODE" "$@"; }\n${summary.run}`, {
      REHEARSAL_OUTCOME: "failure",
      COLLECT_OUTCOME: "failure",
      UPLOAD_OUTCOME: outcome,
    });
    assert.equal(summarized.status, 0, summarized.stderr);
    const text = await readFile(summaryFile, "utf8");
    assert.match(text, /Rehearsal gate: failure/);
    assert.ok(text.includes(`Artifact upload: ${outcome}`));
    assert.match(
      text,
      /phase=build step=build-api-a scenario=none code=REHEARSAL_ASSERTION/,
    );
    assert.equal(text.includes(canary), false);
  }
});
