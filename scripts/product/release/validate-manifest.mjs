import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;
const DIGEST = /^[^@\s]+@sha256:[a-f0-9]{64}$/i;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export function parseJsonStrict(text) {
  let index = 0;
  const skip = () => { while (/\s/.test(text[index] ?? '')) index += 1; };
  const string = () => {
    const start = index;
    if (text[index] !== '"') throw new Error('invalid JSON');
    index += 1;
    while (index < text.length) {
      if (text[index] === '\\') { index += 2; continue; }
      if (text[index] === '"') { index += 1; return JSON.parse(text.slice(start, index)); }
      index += 1;
    }
    throw new Error('invalid JSON string');
  };
  const value = () => {
    skip();
    if (text[index] === '{') {
      index += 1; skip(); const keys = new Set();
      if (text[index] === '}') { index += 1; return; }
      while (true) {
        skip(); const key = string();
        if (keys.has(key)) throw new Error(`duplicate JSON field: ${key}`);
        keys.add(key); skip(); if (text[index++] !== ':') throw new Error('invalid JSON object');
        value(); skip();
        if (text[index] === '}') { index += 1; return; }
        if (text[index++] !== ',') throw new Error('invalid JSON object');
      }
    }
    if (text[index] === '[') {
      index += 1; skip(); if (text[index] === ']') { index += 1; return; }
      while (true) { value(); skip(); if (text[index] === ']') { index += 1; return; } if (text[index++] !== ',') throw new Error('invalid JSON array'); }
    }
    if (text[index] === '"') { string(); return; }
    const start = index;
    while (index < text.length && !/[\s,}\]]/.test(text[index])) index += 1;
    if (start === index) throw new Error('invalid JSON value');
  };
  value(); skip(); if (index !== text.length) throw new Error('invalid JSON trailing content');
  return JSON.parse(text);
}

function checkObject(value, path, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { errors.push(`${path} must be an object`); return; }
  const allowed = new Set(['schemaVersion', 'releaseSha', 'sourceRepository', 'createdAt', 'apiImage', 'webImage', 'postgresImage', 'artifacts']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${path}.${key} is unknown`);
  for (const key of ['schemaVersion', 'releaseSha', 'sourceRepository', 'createdAt', 'apiImage', 'webImage', 'postgresImage', 'artifacts']) if (!(key in value)) errors.push(`${path}.${key} is required`);
  if (value.schemaVersion !== '1') errors.push('schemaVersion must be "1"');
  if (typeof value.releaseSha !== 'string' || !SHA.test(value.releaseSha)) errors.push('releaseSha must be a full hexadecimal commit SHA');
  if (typeof value.sourceRepository !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(value.sourceRepository)) errors.push('sourceRepository is invalid');
  if (typeof value.createdAt !== 'string' || !UTC.test(value.createdAt) || Number.isNaN(Date.parse(value.createdAt))) errors.push('createdAt must be a UTC timestamp');
  for (const key of ['apiImage', 'webImage']) if (typeof value[key] !== 'string' || !DIGEST.test(value[key])) errors.push(`${key} must be an immutable sha256 image reference`);
  if (typeof value.postgresImage !== 'string' || !/^postgres[^@\s]*@sha256:[a-f0-9]{64}$/i.test(value.postgresImage)) errors.push('postgresImage must be an immutable postgres sha256 image reference');
  const artifacts = value.artifacts;
  if (!artifacts || typeof artifacts !== 'object' || Array.isArray(artifacts)) { errors.push('artifacts must be an object'); return; }
  for (const key of Object.keys(artifacts)) if (!['sbom', 'provenance'].includes(key)) errors.push(`artifacts.${key} is unknown`);
  for (const key of ['sbom', 'provenance']) {
    const artifact = artifacts[key];
    if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) { errors.push(`artifacts.${key} must be an object`); continue; }
    for (const field of Object.keys(artifact)) if (!['sha256', 'size'].includes(field)) errors.push(`artifacts.${key}.${field} is unknown`);
    if (typeof artifact.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(artifact.sha256)) errors.push(`artifacts.${key}.sha256 is invalid`);
    if (!Number.isInteger(artifact.size) || artifact.size < 0) errors.push(`artifacts.${key}.size must be a non-negative integer`);
  }
}

export function validateManifest(value) {
  const errors = [];
  checkObject(value, 'manifest', errors);
  return { ok: errors.length === 0, errors };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [inputPath] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  if (!inputPath) { console.error('usage: node validate-manifest.mjs <manifest> [--schema <schema>]'); process.exitCode = 2; }
  else try {
    const result = validateManifest(parseJsonStrict(await readFile(inputPath, 'utf8')));
    if (!result.ok) { console.error(result.errors.join('\n')); process.exitCode = 1; }
    else console.log('valid release manifest');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
