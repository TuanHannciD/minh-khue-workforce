import { readFile, mkdir, mkdtemp } from "node:fs/promises";
import { resolve, join } from "node:path";

const value = (name) =>
  process.argv.includes(name)
    ? process.argv[process.argv.indexOf(name) + 1]
    : undefined;
const root = resolve(value("--root") ?? ".");
let candidate = value("--candidate-dir");
// Explicit candidate-dir supports isolated negative fixtures; the normal gate
// always regenerates from the compiled Nest source in a fresh retained directory.
if (!candidate) {
  const runs = resolve(".agent-runs/MKW-PRODUCT-001/task3-auth/contracts");
  await mkdir(runs, { recursive: true });
  candidate = await mkdtemp(join(runs, "generation-"));
  const { generateContract } = await import("./generate-contract.mjs");
  await generateContract(candidate);
}
for (const file of [
  "contracts/openapi.json",
  "apps/web/src/shared/api/generated/schema.d.ts",
]) {
  let actual;
  try {
    actual = await readFile(resolve(root, file));
  } catch {
    actual = Buffer.alloc(0);
  }
  const expected = await readFile(resolve(candidate, file));
  if (!actual.equals(expected)) {
    console.error(
      `Contract drift: ${file}. Run pnpm run product:contract:generate and review the diff.`,
    );
    process.exitCode = 1;
  }
}
if (!process.exitCode)
  console.log("Verified contract snapshot and generated web types.");
