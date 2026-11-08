import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyManifest } from '../scripts/check-skills.mjs';

test('skill verifier rejects tampering, missing files, traversal and unmanifested files', async t => {
  const root = await mkdtemp(join(tmpdir(), 'mkw-skills-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.agents/skills/example'), { recursive: true });
  const path = '.agents/skills/example/SKILL.md';
  const body = '---\nname: example\ndescription: Example\n---\n';
  await writeFile(join(root, path), body);
  const manifest = { skills: ['example'], sha256: { [path]: createHash('sha256').update(body).digest('hex') } };
  assert.deepEqual(await verifyManifest(root, manifest), []);
  await writeFile(join(root, path), 'tampered');
  assert.match((await verifyManifest(root, manifest)).join(), /hash/i);
  await rm(join(root, path));
  assert.match((await verifyManifest(root, manifest)).join(), /missing/i);
  assert.match((await verifyManifest(root, { ...manifest, sha256: { '../outside': 'a'.repeat(64) } })).join(), /unsafe/i);
  await writeFile(join(root, path), body);
  await writeFile(join(root, '.agents/skills/example/extra.js'), 'extra');
  assert.match((await verifyManifest(root, manifest)).join(), /unmanifested/i);
});

test('skill verifier preserves generated Python cache while rejecting extra source', async t => {
  const root = await mkdtemp(join(tmpdir(), 'mkw-skills-cache-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = '.agents/skills/example';
  await mkdir(join(root, dir, '__pycache__'), { recursive: true });
  const body = '---\nname: example\ndescription: Example\n---\n';
  await writeFile(join(root, dir, 'SKILL.md'), body);
  await writeFile(join(root, dir, '__pycache__/core.cpython-314.pyc'), 'generated');
  const manifest = { skills: ['example'], sha256: { [`${dir}/SKILL.md`]: createHash('sha256').update(body).digest('hex') } };
  assert.deepEqual(await verifyManifest(root, manifest), []);
  await writeFile(join(root, dir, '__pycache__/extra.py'), 'unreviewed source');
  assert.match((await verifyManifest(root, manifest)).join(), /unmanifested/i);
});
