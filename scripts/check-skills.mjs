import { readFile, readdir, lstat } from 'node:fs/promises';
import { resolve, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

async function files(root, dir, errors) {
  const result = [];
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isSymbolicLink()) errors.push(`Unsafe symlink: ${path}`);
    else if (entry.isDirectory()) result.push(...await files(root, path, errors));
    else if (dir.endsWith('/__pycache__') && /^[\w.-]+\.pyc$/.test(entry.name)) continue;
    else result.push(path);
  }
  return result;
}

export async function verifyManifest(root, manifest) {
  const errors = [];
  if (!Array.isArray(manifest.skills) || !manifest.sha256) return ['Missing manifest structure'];
  const paths = Object.keys(manifest.sha256);
  for (const [path, hash] of Object.entries(manifest.sha256)) {
    if (!/^\.agents\/[a-zA-Z0-9_./-]+$/.test(path) || path.split('/').some(p => p === '..' || p === '.') || !/^[a-f0-9]{64}$/.test(hash)) {
      errors.push(`Unsafe manifest entry: ${path}`); continue;
    }
    try {
      let current = root;
      for (const part of path.split('/')) {
        current = join(current, part);
        if ((await lstat(current)).isSymbolicLink()) throw new Error('Unsafe symlink');
      }
      const bytes = await readFile(current);
      if (createHash('sha256').update(bytes).digest('hex') !== hash) errors.push(`Hash mismatch: ${path}`);
    } catch (error) { errors.push(`${error.code === 'ENOENT' ? 'Missing' : error.message}: ${path}`); }
  }
  for (const skill of manifest.skills) {
    if (!/^[a-z0-9-]+$/.test(skill)) { errors.push(`Unsafe skill name: ${skill}`); continue; }
    const dir = `.agents/skills/${skill}`;
    try {
      if ((await lstat(join(root, dir))).isSymbolicLink()) { errors.push(`Unsafe symlink: ${dir}`); continue; }
      for (const path of await files(root, dir, errors)) if (!paths.includes(path)) errors.push(`Unmanifested: ${path}`);
      const entry = `${dir}/SKILL.md`;
      if (!paths.includes(entry)) errors.push(`Missing manifest SKILL.md: ${skill}`);
      const body = await readFile(join(root, entry), 'utf8');
      if (!/^---\r?\n[\s\S]*?\bname:\s*\S+[\s\S]*?\bdescription:\s*\S+[\s\S]*?\r?\n---/.test(body)) errors.push(`Missing metadata: ${skill}`);
    } catch (error) { errors.push(`Missing package ${skill}: ${error.message}`); }
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve('.');
  const all = [];
  for (const name of ['superpowers-source.json', 'ui-skills-source.json']) {
    const manifest = JSON.parse(await readFile(join(root, '.agents', name), 'utf8'));
    all.push(...await verifyManifest(root, manifest));
    if (name === 'superpowers-source.json' && (manifest.commit !== '8ca22dba9a94f28898bbce59f2537ff4d87c747d' || manifest.skills.length !== 15)) all.push('Superpowers pin/count mismatch');
    if (name === 'ui-skills-source.json' && manifest.skills.length !== 2) all.push('UI package count mismatch');
  }
  for (const path of ['.agents/SUPERPOWERS-LICENSE', '.agents/UI-LICENSES']) {
    const stat = await lstat(path);
    if (!stat.isFile() && !stat.isDirectory()) all.push(`Invalid license: ${path}`);
  }
  if (all.length) { console.error(all.join('\n')); process.exitCode = 1; }
  else console.log(`Verified 15 Superpowers + 2 UI packages; hashes, inventory, metadata and license paths (${relative(root, root) || '.'}${sep}).`);
}
