import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { createServer } from 'node:http';

test('CLI accepts its run-local stop request when interactive stdin is unavailable', { timeout: 10000 }, async t => {
  const child = spawn(process.execPath, ['--experimental-sqlite', 'pilot/serve.mjs'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  const owner = await new Promise((resolve, reject) => {
    child.stdout.on('data', data => {
      output += data;
      const line = output.split('\n').find(value => value.startsWith('{'));
      if (line) { try { resolve(JSON.parse(line)); } catch { /* incomplete chunk */ } }
    });
    child.on('error', reject);
  });
  t.after(() => { if (child.exitCode === null) child.stdin.end('stop\n'); });
  await writeFile(`${owner.runDir}/stop.request`, 'stop', { flag: 'wx' });
  const code = await Promise.race([once(child, 'exit').then(([value]) => value), new Promise(resolve => setTimeout(() => resolve('timed out'), 1800))]);
  assert.equal(code, 0, 'owned file stop should exit without stdin command');
  assert.equal(JSON.parse(await readFile(`${owner.runDir}/owner.json`, 'utf8')).state, 'released');
});

test('owned CLI stops its port, records release and preserves unrelated resources/evidence', { timeout: 15000 }, async t => {
  const unrelated = createServer((req, res) => res.end('unrelated'));
  await new Promise(resolve => unrelated.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => unrelated.close(resolve)));
  const child = spawn(process.execPath, ['--experimental-sqlite', 'pilot/serve.mjs'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  const owner = await new Promise((resolve, reject) => {
    child.stdout.on('data', data => {
      output += data;
      const line = output.split('\n').find(value => value.startsWith('{'));
      if (line) { try { resolve(JSON.parse(line)); } catch { /* incomplete chunk */ } }
    });
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`Exited before ready: ${code}`)));
  });
  t.after(() => { if (child.exitCode === null) child.stdin.end('stop\n'); });
  assert.match(owner.runDir, /\.agent-runs[\\/]MKW-AGENT-002[\\/]interactive-/);
  assert.equal(new URL(owner.url).hostname, '127.0.0.1');
  const marker = `${owner.runDir}/preserve.txt`;
  await writeFile(marker, 'preserve evidence');
  assert.equal((await fetch(`${owner.url}/api/notes`)).status, 200);
  const exited = once(child, 'exit');
  child.stdin.end('stop\n');
  assert.equal((await exited)[0], 0);
  assert.equal(JSON.parse(await readFile(`${owner.runDir}/owner.json`, 'utf8')).state, 'released');
  await assert.rejects(fetch(owner.url));
  assert.equal(await (await fetch(`http://127.0.0.1:${unrelated.address().port}`)).text(), 'unrelated');
  assert.equal(await readFile(marker, 'utf8'), 'preserve evidence');
  // Only the synthetic marker is removed; run DB/owner/evidence are retained.
  await unlink(marker);
});
