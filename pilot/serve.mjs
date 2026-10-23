import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { startPilot } from './server.mjs';

// The Git common directory locates the primary checkout even inside a worktree.
const common = resolve(execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim());
const root = resolve(common, '..', '.agent-runs', 'MKW-AGENT-002');
await mkdir(root, { recursive: true });
const runDir = await mkdtemp(join(root, 'interactive-'));
const app = await startPilot({ dbPath: join(runDir, 'notes.sqlite') });
const record = { task: 'MKW-AGENT-002', pid: process.pid, runDir, url: app.url, state: 'running', startedAt: new Date().toISOString() };
const recordPath = join(runDir, 'owner.json');
await writeFile(recordPath, JSON.stringify(record, null, 2));
console.log(JSON.stringify(record));
let stopping = false;
const control = setInterval(async () => {
  try { if ((await readFile(join(runDir, 'stop.request'), 'utf8')).trim() === 'stop') await stop(); }
  catch (error) { if (error.code !== 'ENOENT') console.error('Control request failed:', error.message); }
}, 250);
async function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(control);
  await app.close();
  await writeFile(recordPath, JSON.stringify({ ...record, state: 'released', stoppedAt: new Date().toISOString() }, null, 2));
  console.log('Released owned server, port and DB; evidence retained.');
  process.stdin.pause();
}
process.on('SIGINT', () => stop().catch(error => { console.error(error); process.exitCode = 1; }));
process.on('SIGTERM', () => stop().catch(error => { console.error(error); process.exitCode = 1; }));
// Tool-managed sessions can stop cleanly through stdin without PID-based killing.
process.stdin.setEncoding('utf8');
process.stdin.on('data', text => { if (text.trim() === 'stop') stop().then(() => process.stdin.pause()); });
