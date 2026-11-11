#!/usr/bin/env bash
# Runs over SSH. Only DB reads; private temporary files are removed on exit.
set -Eeuo pipefail
umask 077
[[ "${MKW_DEPLOY_PATH:-}" == /home/deploy/mkw && "${MKW_PROJECT_NAME:-}" == mkw ]] || exit 64
container=mkw-db-1
[[ "$(docker inspect -f '{{.Config.Labels.com.docker.compose.project}}|{{.Config.Labels.com.docker.compose.service}}|{{.State.Running}}' "$container")" == 'mkw|db|true' ]] || exit 78
[[ "$(docker inspect -f '{{range .Mounts}}{{if eq .Name "mkw_pgdata"}}{{.Destination}}{{end}}{{end}}' "$container")" == /var/lib/postgresql/data ]] || exit 78
identity="$(docker exec "$container" psql -X -qAt -v ON_ERROR_STOP=1 -U mkw -d mkw -c "SELECT current_database() || '|' || current_user || '|' || current_setting('server_version_num')::int / 10000")"
[[ "$identity" == 'mkw|mkw|17' ]] || exit 78
work="$(mktemp -d)"
source_pid=''
cleanup() {
  if [[ -n "$source_pid" ]]; then kill "$source_pid" 2>/dev/null || true; wait "$source_pid" 2>/dev/null || true; fi
  rm -rf -- "$work"
}
trap cleanup EXIT
# Keep the exporting read-only transaction alive while pg_dump imports its snapshot.
coproc SOURCE { docker exec -i "$container" psql -X -qAt -v ON_ERROR_STOP=1 -U mkw -d mkw; }
source_pid=$SOURCE_PID
exec {source_in}>&"${SOURCE[1]}" {source_out}<&"${SOURCE[0]}"
printf '%s\n' 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' 'SELECT pg_export_snapshot();' >&"$source_in"
IFS= read -r snapshot <&"$source_out"
[[ "$snapshot" =~ ^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+$ ]] || exit 78
printf '%s\n' 'SELECT '\''User'\'', count(*) FROM "User" UNION ALL SELECT '\''Session'\'', count(*) FROM "Session" UNION ALL SELECT '\''AuthThrottle'\'', count(*) FROM "AuthThrottle" UNION ALL SELECT '\''Employee'\'', count(*) FROM "Employee" UNION ALL SELECT '\''AttendanceCell'\'', count(*) FROM "AttendanceCell" ORDER BY 1;' "SELECT 'COUNTS_END';" >&"$source_in"
while IFS= read -r line <&"$source_out"; do
  [[ "$line" == COUNTS_END ]] && break
  [[ "$line" =~ ^(User|Session|AuthThrottle|Employee|AttendanceCell)\|[0-9]+$ ]] || exit 78
  printf '%s\n' "$line" >> "$work/source-counts.txt"
done
[[ "${line:-}" == COUNTS_END && "$(wc -l < "$work/source-counts.txt")" -eq 5 ]] || exit 78
docker exec "$container" pg_dump --snapshot="$snapshot" --format=custom --no-owner --no-privileges -U mkw -d mkw > "$work/database.dump"
printf '%s\n' 'COMMIT;' '\q' >&"$source_in"
exec {source_in}>&-
wait "$source_pid"
source_pid=''
test -s "$work/database.dump"
tar -C "$work" -cf - database.dump source-counts.txt
