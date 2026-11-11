import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const read = (name) => readFile(`.github/workflows/${name}`, "utf8");
const readScript = (name) => readFile(`scripts/product/${name}`, "utf8");
const exists = async (name) => {
  try {
    await access(`.github/workflows/${name}`);
    return true;
  } catch {
    return false;
  }
};

test("backup workflow is scheduled/manual, encrypted, identity-aware, and emits validated metadata", async () => {
  const workflow = await read("backup.yml");
  const source = await readScript("backup-source.sh");
  const runner = await readScript("backup-runner.sh");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /schedule:/);
  assert.match(source, /pg_dump/);
  assert.match(runner, /openssl\s+enc|age\s+/i);
  assert.match(workflow, /sha256sum/);
  assert.match(workflow, /databaseIdentity/);
  assert.match(workflow, /restoreVerified/);
  assert.match(workflow, /INITIAL_EMPTY_DEPLOYMENT/);
  assert.match(workflow, /upload-artifact/);
  assert.match(workflow, /validate-backup-ready/);
  assert.match(runner, /pg_restore/);
  assert.match(runner, /createdb/);
  assert.match(runner, /information_schema\.tables/);
  assert.match(runner, /pg_constraint|foreign key/i);
  assert.match(runner, /source-counts|restored-counts/);
  assert.match(workflow, /TARGET_HOST|databaseIdentity/);
  assert.match(workflow, /Upload initial-empty readiness gate/);
  assert.match(workflow, /if: env\.BACKUP_KIND == 'INITIAL_EMPTY_DEPLOYMENT'/);
  assert.match(workflow, /BACKUP_OUTPUT=.*backup-ready\.json/);
});

test("initial-empty backup does not require a production database URL", async () => {
  const workflow = await read("backup.yml");
  assert.match(workflow, /if \[\[ "\$BACKUP_KIND" == BACKUP \]\]/);
  assert.doesNotMatch(workflow, /MKW_DATABASE_URL/);
  assert.match(workflow, /INITIAL_EMPTY_DEPLOYMENT/);
  assert.match(workflow, /TARGET_DATABASE='mkw'/);
});

test("production backup reads the database inside the VPS over pinned SSH", async () => {
  const workflow = await read("backup.yml");
  const source = await readScript("backup-source.sh");
  const runner = await readScript("backup-runner.sh");
  assert.match(workflow, /MKW_SSH_PRIVATE_KEY/);
  assert.match(workflow, /ssh-keyscan/);
  assert.match(source, /docker exec[^\n]*pg_dump/);
  assert.doesNotMatch(workflow, /MKW_DATABASE_URL is required for BACKUP/);
  assert.doesNotMatch(
    workflow,
    /DATABASE_URL:\s*\$\{\{\s*secrets\.MKW_DATABASE_URL/,
  );
  assert.match(runner, /pg_restore/);
  assert.match(runner, /docker (run|create)/);
});

test("deploy consumes only the SHA-named build artifact and never resolves GHCR tags", async () => {
  const workflow = await read("deploy.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /actions\/download-artifact@/);
  assert.match(workflow, /mkw-release-\$\{\{\s*inputs\.release_sha\s*\}\}/);
  assert.match(workflow, /release-manifest\.sha256/);
  assert.match(workflow, /backup-ready/);
  assert.match(workflow, /if: inputs\.mode == 'release'/);
  assert.match(workflow, /backup-ready\.json\.sha256/);
  assert.match(
    workflow,
    /sha256sum\s+--check.*backup-ready|backup-ready.*sha256sum\s+--check/s,
  );
  assert.match(workflow, /scripts\/product\/release/);
  assert.match(
    workflow,
    /bash '\$remote_dir\/scripts\/product\/deploy-entrypoint\.sh'/,
  );
  assert.doesNotMatch(workflow, /remote_env '.*bash -s/);
  assert.match(workflow, /ssh-keyscan/);
  assert.match(workflow, /db:deploy|migrate/i);
  assert.match(workflow, /health|smoke/i);
  assert.doesNotMatch(
    workflow,
    /imagetools\s+inspect|resolve_digest|docker\s+pull|:latest/,
  );
});

test("post-deploy verification records receipt, digests, schema, gateway, and startup failures", async () => {
  assert.equal(await exists("post-deploy-verify.yml"), true);
  const workflow = await read("post-deploy-verify.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /receipt/i);
  assert.match(workflow, /digest/i);
  assert.match(workflow, /schema|migration/i);
  assert.match(workflow, /gateway|smoke|health/i);
  assert.match(workflow, /startup|error/i);
  assert.match(workflow, /rollback/i);
  assert.match(workflow, /release_run_id/);
  assert.match(workflow, /scripts\/product\/post-deploy-verify\.sh/);
  const verifier = await readFile(
    "scripts/product/post-deploy-verify.sh",
    "utf8",
  );
  assert.match(verifier, /docker inspect/);
  assert.match(verifier, /docker image inspect/);
  assert.match(verifier, /migrate\s+status|information_schema/i);
  assert.match(verifier, /State\.Health\.Status/);
  assert.match(
    workflow,
    /failure\(\).*rollback_on_failure|rollback_on_failure.*failure\(\)/s,
  );
  assert.match(workflow, /rollback-signal\.json|rollback-requested/);
});

test("rollback is protected/manual, verifies old manifest and backup, and redeploys exact digests without down migration", async () => {
  assert.equal(await exists("rollback.yml"), true);
  const workflow = await read("rollback.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /old.*manifest|manifest.*old/i);
  assert.match(workflow, /backup-ready/);
  assert.match(workflow, /sha256/);
  assert.match(workflow, /deploy-entrypoint\.sh/);
  assert.match(workflow, /rollback-receipt\.json/);
  assert.match(workflow, /upload-artifact/);
  assert.match(workflow, /steps\.[A-Za-z0-9_-]+\.outcome|job\.status/);
  assert.doesNotMatch(workflow, /db:rollback|migrate\s+down|down\s+migration/i);
});
