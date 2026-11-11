#!/usr/bin/env bash
set -Eeuo pipefail
# Destructive teardown is restricted to a fresh GitHub-hosted runner fixture.
[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_ENVIRONMENT:-}" == github-hosted ]] || { echo 'rehearsal requires a GitHub-hosted runner'; exit 78; }
docker info >/dev/null
if docker volume inspect mkw_pgdata >/dev/null 2>&1 || docker network inspect mkw-internal >/dev/null 2>&1; then
  echo 'runner already has MKW resources; refusing rehearsal'; exit 78
fi
export MKW_DEPLOY_PATH
MKW_DEPLOY_PATH="$(mktemp -d /home/runner/mkw-rehearsal.XXXXXX)"
export MKW_PROJECT_NAME=mkw-rehearsal MKW_GATEWAY_PORT=3200 MKW_VALIDATOR_RUNTIME=container
export MKW_BACKUP_MAX_AGE_SECONDS=86400 MKW_BACKUP_EXPECTED_KIND=INITIAL_EMPTY_DEPLOYMENT
export MKW_RELEASE_SHA MKW_API_IMAGE MKW_WEB_IMAGE MKW_POSTGRES_IMAGE
MKW_RELEASE_SHA="$(jq -r .releaseSha release-manifest.json)"
MKW_API_IMAGE="$(jq -r .apiImage release-manifest.json)"
MKW_WEB_IMAGE="$(jq -r .webImage release-manifest.json)"
MKW_POSTGRES_IMAGE="$(jq -r .postgresImage release-manifest.json)"
mkdir -p "$MKW_DEPLOY_PATH/shared"
cleanup() {
  if [[ -f "$MKW_DEPLOY_PATH/current/compose.rendered.yml" ]]; then
    docker compose -p mkw-rehearsal -f "$MKW_DEPLOY_PATH/current/compose.rendered.yml" down -v
  fi
}
trap cleanup EXIT
umask 077
password="$(openssl rand -hex 32)"
printf 'POSTGRES_DB=mkw\nPOSTGRES_USER=mkw\nPOSTGRES_PASSWORD=%s\n' "$password" > "$MKW_DEPLOY_PATH/shared/db.env"
printf 'DATABASE_URL=postgresql://mkw:%s@db:5432/mkw\nAUTH_THROTTLE_SECRET=%s\nWEB_ORIGIN=https://mkw-rehearsal.example\nTLS_TERMINATED=true\n' "$password" "$(openssl rand -hex 32)" > "$MKW_DEPLOY_PATH/shared/api.env"
node --input-type=module - <<'NODE'
import { writeFile } from 'node:fs/promises';
const now = new Date().toISOString();
await writeFile(`${process.env.MKW_DEPLOY_PATH}/shared/backup-ready.json`, JSON.stringify({
  schemaVersion:'1', kind:'INITIAL_EMPTY_DEPLOYMENT', backupId:'runner-rehearsal',
  releaseSha:process.env.MKW_RELEASE_SHA, createdAt:now, restoreVerified:false,
  retentionUntil:new Date(Date.now()+86400000).toISOString(), storageLocation:'github-actions-artifact:rehearsal',
  databaseVerifiedEmpty:true, emptyEvidence:{targetIdentity:'github-hosted-runner/mkw-rehearsal',databaseIdentity:'mkw',checkedAt:now}
}));
NODE
# Run from a different working directory, like a remote SSH session.
repo_root="$PWD"
cd /home/runner
bash "$repo_root/scripts/product/deploy-entrypoint.sh" --release \
  --manifest "$repo_root/release-manifest.json" --compose "$repo_root/deploy/compose.production.yml" \
  --backup-ready "$MKW_DEPLOY_PATH/shared/backup-ready.json"
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3200/api/health
test -n "$(find "$MKW_DEPLOY_PATH/receipts" -name '*-ok.json' -print -quit)"
echo 'RELEASE_REHEARSAL_OK: container Node, migrations, DB/API/gateway health, receipt'
