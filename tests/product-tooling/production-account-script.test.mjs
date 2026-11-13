import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("production account manager is reusable and keeps credentials off argv", async () => {
  const source = await readFile(
    "scripts/product/manage-production-account.sh",
    "utf8",
  );
  const program = await readFile(
    "scripts/product/manage-production-account.mjs",
    "utf8",
  );
  assert.match(source, /add\|reset-password\|list/);
  assert.match(source, /read -r -s/);
  assert.match(source, /docker exec -i "\$container"/);
  assert.match(
    source,
    /index \.Config\.Labels "com\.docker\.compose\.project"/,
  );
  assert.match(
    source,
    /index \.Config\.Labels "com\.docker\.compose\.service"/,
  );
  assert.match(source, /\$project\|api\|healthy/);
  assert.match(program, /argon2id/i);
  assert.match(program, /passwordHash/);
  assert.match(program, /BEGIN|client\.query\(['"]BEGIN/);
  assert.match(program, /revokedAt/);
  assert.doesNotMatch(source, /password=.*\$|--password|PASSWORD=/i);
});

test("deploy bundle carries the reusable production account manager", async () => {
  const workflow = await readFile(".github/workflows/deploy.yml", "utf8");
  assert.match(workflow, /manage-production-account\.sh/);
});
