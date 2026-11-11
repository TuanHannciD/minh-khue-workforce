#!/usr/bin/env bash
# Restore verification and encryption on an isolated CI/local runner, never VPS.
set -Eeuo pipefail
umask 077
: "${BACKUP_DIR:?}" "${BACKUP_ENCRYPTION_KEY:?}" "${GITHUB_RUN_ID:?}" "${GITHUB_RUN_ATTEMPT:?}"
[[ "$GITHUB_RUN_ID" =~ ^[0-9]+$ && "$GITHUB_RUN_ATTEMPT" =~ ^[0-9]+$ ]] || exit 64
test ! -e "$BACKUP_DIR"
mkdir -m 700 -p "$BACKUP_DIR"
restore_container="mkw-backup-restore-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
created=false
cleanup() {
  status=$?
  if [[ "$created" == true ]]; then docker rm -fv "$restore_container" >/dev/null || status=1; fi
  rm -f -- "$BACKUP_DIR/database.dump" "$BACKUP_DIR/source-counts.txt" "$BACKUP_DIR/restored-counts.txt" "$BACKUP_DIR/migrations.txt" "$BACKUP_DIR/decrypted.dump"
  if (( status != 0 )); then rm -f -- "$BACKUP_DIR/database.dump.enc" "$BACKUP_DIR/database.dump.enc.sha256"; fi
  exit "$status"
}
trap cleanup EXIT
tar -xf - -C "$BACKUP_DIR" database.dump source-counts.txt
test -s "$BACKUP_DIR/database.dump"
[[ "$(wc -l < "$BACKUP_DIR/source-counts.txt")" -eq 5 ]]
postgres_image="$(awk -F= '$1 == "MKW_POSTGRES_IMAGE" { value=$2; count++ } END { if (count == 1) print value }' deploy/postgres-image.env)"
[[ "$postgres_image" =~ ^postgres@sha256:[0-9a-f]{64}$ ]]
restore_password="$(openssl rand -hex 32)"
# No network or host ports. PGDATA is ephemeral and removed with this container.
docker run --detach --name "$restore_container" --network none \
  --env "POSTGRES_PASSWORD=$restore_password" --env PGDATA=/tmp/mkw-pgdata "$postgres_image" >/dev/null
created=true
for attempt in {1..60}; do
  docker exec "$restore_container" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$restore_container" pg_isready -U postgres >/dev/null
docker exec "$restore_container" createdb -U postgres mkw_restore
docker exec -i "$restore_container" pg_restore -U postgres --dbname=mkw_restore --single-transaction --exit-on-error --no-owner --no-privileges < "$BACKUP_DIR/database.dump"
query() { docker exec "$restore_container" psql -X -U postgres -d mkw_restore -v ON_ERROR_STOP=1 -Atqc "$1"; }
query "SELECT CASE WHEN count(*) = 6 THEN 'ok' ELSE 'bad' END FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('User','Session','AuthThrottle','Employee','AttendanceCell','_prisma_migrations')" | grep -qx ok
query "SELECT CASE WHEN count(*) = 2 THEN 'ok' ELSE 'bad' END FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE c.contype = 'f' AND n.nspname = 'public'" | grep -qx ok
query 'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name' > "$BACKUP_DIR/migrations.txt"
test -s "$BACKUP_DIR/migrations.txt"
query 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL' | grep -qx 0
# The source may legitimately precede the release's new forward migrations.
find apps/api/prisma/migrations -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort | head -n "$(wc -l < "$BACKUP_DIR/migrations.txt")" | cmp -s - "$BACKUP_DIR/migrations.txt"
query 'SELECT '\''User'\'', count(*) FROM "User" UNION ALL SELECT '\''Session'\'', count(*) FROM "Session" UNION ALL SELECT '\''AuthThrottle'\'', count(*) FROM "AuthThrottle" UNION ALL SELECT '\''Employee'\'', count(*) FROM "Employee" UNION ALL SELECT '\''AttendanceCell'\'', count(*) FROM "AttendanceCell" ORDER BY 1' > "$BACKUP_DIR/restored-counts.txt"
cmp -s "$BACKUP_DIR/source-counts.txt" "$BACKUP_DIR/restored-counts.txt"
printf '%s' "$BACKUP_ENCRYPTION_KEY" | openssl enc -aes-256-cbc -pbkdf2 -salt -pass stdin -in "$BACKUP_DIR/database.dump" -out "$BACKUP_DIR/database.dump.enc"
printf '%s' "$BACKUP_ENCRYPTION_KEY" | openssl enc -d -aes-256-cbc -pbkdf2 -pass stdin -in "$BACKUP_DIR/database.dump.enc" -out "$BACKUP_DIR/decrypted.dump"
cmp -s "$BACKUP_DIR/database.dump" "$BACKUP_DIR/decrypted.dump"
(cd "$BACKUP_DIR" && sha256sum database.dump.enc > database.dump.enc.sha256 && sha256sum --check database.dump.enc.sha256)
echo BACKUP_RESTORE_ENCRYPTION_OK
