#!/usr/bin/env bash
# Read-only evidence from the actual running database, never migration files.
set -Eeuo pipefail
set +x
: "${MKW_PROJECT_NAME:?}" "${MKW_POSTGRES_IMAGE:?}"
compose_file="$1"
compose() { docker compose -p "$MKW_PROJECT_NAME" -f "$compose_file" "$@"; }
mapfile -t ids < <(compose ps -q db)
[[ ${#ids[@]} == 1 && "${ids[0]}" =~ ^[a-f0-9]{12,64}$ ]] || exit 78
db="${ids[0]}"
[[ "$(docker inspect "$db" --format '{{.State.Running}} {{.Config.Image}}')" == "true $MKW_POSTGRES_IMAGE" ]] || exit 78
image_id="$(docker inspect "$db" --format '{{.Image}}')"
[[ "$image_id" =~ ^sha256:[a-f0-9]{64}$ ]] || exit 78
# Schema dump is hashed in memory/pipe only. Strip pg_dump's random restrict key
# and header comments, which otherwise differ for identical schemas.
schema_hash="$(docker exec -i "$db" sh -ceu 'export PGOPTIONS="-c default_transaction_read_only=on"; exec pg_dump --schema-only --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' 2>/dev/null | sed '/^--/d; /^\\restrict /d; /^\\unrestrict /d' | sha256sum | cut -d' ' -f1)"
# Hash the full authoritative migration identity/status, excluding diagnostic
# logs which could include sensitive data. Missing table/read failure is unknown.
history_hash="$(docker exec -i "$db" sh -ceu 'export PGOPTIONS="-c default_transaction_read_only=on"; exec psql -X -v ON_ERROR_STOP=1 -At -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL' | sha256sum | cut -d' ' -f1
SELECT coalesce(json_agg(row_to_json(m) ORDER BY m.id), '[]'::json)::text FROM (SELECT id, checksum, migration_name, started_at, finished_at, rolled_back_at, applied_steps_count FROM public._prisma_migrations) m;
SQL
)"
failed_count="$(docker exec -i "$db" sh -ceu 'export PGOPTIONS="-c default_transaction_read_only=on"; exec psql -X -v ON_ERROR_STOP=1 -At -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;
SQL
)"
[[ "$schema_hash" =~ ^[a-f0-9]{64}$ && "$history_hash" =~ ^[a-f0-9]{64}$ && "$failed_count" =~ ^[0-9]+$ ]] || exit 78
pending=true; failed=true
[[ "$failed_count" == 0 ]] && failed=false
# An unavailable/failed status read is conservatively pending, never permission
# to roll back. The actual schema/history hashes still come from the DB above.
if compose run --rm --no-deps api node node_modules/prisma/build/index.js migrate status >/dev/null 2>&1; then pending=false; fi
printf '{"known":true,"schemaFingerprint":"sha256:%s","migrationFingerprint":"sha256:%s","pending":%s,"failed":%s,"postgresContainerId":"%s","postgresImage":"%s","postgresImageId":"%s"}\n' "$schema_hash" "$history_hash" "$pending" "$failed" "$db" "$MKW_POSTGRES_IMAGE" "$image_id"
