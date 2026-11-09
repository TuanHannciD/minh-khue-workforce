import { rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateBackupReady } from '../release/validate-backup-ready.mjs';

export async function createBackupReady(input) {
  const { outputPath, ...value } = input ?? {};
  const result = validateBackupReady(value);
  if (!result.ok) throw new Error(result.errors.join('; '));
  if (outputPath) {
    const temporaryPath = join(dirname(outputPath), `.${randomUUID()}.tmp`);
    try { await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 }); await rename(temporaryPath, outputPath); }
    finally { try { await import('node:fs/promises').then(({ unlink }) => unlink(temporaryPath)); } catch {} }
  }
  return value;
}
