import { mkdir, mkdtemp } from "node:fs/promises";
import { dirname } from "node:path";
export async function createEvidenceRun(prefix) {
  await mkdir(dirname(prefix), { recursive: true });
  return mkdtemp(prefix);
}
