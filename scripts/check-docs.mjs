import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';

async function collect(dir) {
  const paths = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (['.git', '.agents', '.worktrees', 'node_modules', '.agent-runs', '.superpowers'].includes(item.name)) continue;
    const path = join(dir, item.name);
    if (item.isDirectory()) paths.push(...await collect(path));
    else if (path.endsWith('.md')) paths.push(path);
  }
  return paths;
}
const errors = [];
let checked = 0;
for (const path of await collect('.')) {
  const bytes = await readFile(path);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { errors.push(`Invalid UTF-8: ${path}`); continue; }
  // Historical audits and templates may contain example paths; preserve them.
  if (/[\\/]reports[\\/]|[\\/]templates[\\/]/.test(path)) continue;
  const fences = text.match(/^\s*```/gm) ?? [];
  if (fences.length % 2) errors.push(`Unbalanced fences: ${path}`);
  text = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]+`/g, '');
  for (const match of text.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '');
    if (/^(https?:|mailto:|app:|skill:|t3-thread:)/.test(target)) continue;
    const [file, anchor] = target.split('#');
    const absolute = file ? resolve(dirname(path), decodeURIComponent(file)) : resolve(path);
    try {
      await stat(absolute);
      if (anchor && absolute.endsWith('.md')) {
        const body = await readFile(absolute, 'utf8');
        const slugs = [...body.matchAll(/^#{1,6}\s+(.+)$/gm)].map(m => m[1].trim().toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-'));
        if (!slugs.includes(decodeURIComponent(anchor))) errors.push(`Missing anchor: ${path} -> ${target}`);
      }
    } catch { errors.push(`Missing link: ${path} -> ${target}`); }
  }
  checked++;
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Verified UTF-8 in project Markdown; links/anchors/fences in ${checked} current documents (historical reports/templates: UTF-8 only).`);
