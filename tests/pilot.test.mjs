import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startPilot } from '../pilot/server.mjs';

async function sandbox(t) {
  const directory = await mkdtemp(join(tmpdir(), 'mkw-pilot-'));
  let app = await startPilot({ dbPath: join(directory, 'notes.sqlite') });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true }); });
  return {
    get app() { return app; },
    async restart() { await app.close(); app = await startPilot({ dbPath: join(directory, 'notes.sqlite') }); },
  };
}
const save = (app, text, key, headers = {}) => fetch(`${app.url}/api/notes`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': key, ...headers }, body: JSON.stringify({ text }),
});

test('real SQLite keeps a note across server restart and replays the same operation', async t => {
  const box = await sandbox(t);
  const first = await save(box.app, 'Ghi chú giả', 'restart-1');
  assert.equal(first.status, 201);
  const stored = (await first.json()).note;
  await box.restart();
  const replay = await save(box.app, 'Ghi chú giả', 'restart-1');
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).note.id, stored.id);
  assert.equal((await (await fetch(`${box.app.url}/api/notes`)).json()).notes.length, 1);
});

test('concurrent retries are deduplicated and key reuse with different content is rejected', async t => {
  const { app } = await sandbox(t);
  const replies = await Promise.all(Array.from({ length: 6 }, () => save(app, 'Một thao tác', 'same-1')));
  assert.equal(replies.filter(r => r.status === 201).length, 1);
  assert.equal(replies.filter(r => r.status === 200).length, 5);
  assert.equal((await save(app, 'Nội dung khác', 'same-1')).status, 409);
});

test('simulated HTTP error writes nothing and a retry succeeds', async t => {
  const { app } = await sandbox(t);
  assert.equal((await save(app, 'Thử lỗi', 'failure-1', { 'x-pilot-simulate-failure': '1' })).status, 503);
  assert.equal((await (await fetch(`${app.url}/api/notes`)).json()).notes.length, 0);
  assert.equal((await save(app, 'Thử lỗi', 'failure-1')).status, 201);
});

test('invalid payload, missing key, foreign Origin and oversize request cannot mutate data', async t => {
  const { app } = await sandbox(t);
  assert.equal((await save(app, ' ', 'empty')).status, 400);
  assert.equal((await save(app, 'x'.repeat(201), 'long')).status, 400);
  assert.equal((await fetch(`${app.url}/api/notes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"text":"x"}' })).status, 400);
  assert.equal((await save(app, 'Forbidden', 'origin', { origin: 'https://example.invalid' })).status, 403);
  assert.equal((await save(app, 'x'.repeat(5000), 'large')).status, 413);
  assert.equal((await (await fetch(`${app.url}/api/notes`)).json()).notes.length, 0);
});

test('static files have CSP and unknown paths do not expose filesystem', async t => {
  const { app } = await sandbox(t);
  const page = await fetch(app.url);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await fetch(`${app.url}/AGENTS.md`)).status, 404);
  assert.equal((await fetch(`${app.url}/api/notes`, { method: 'DELETE' })).status, 405);
});
