#!/usr/bin/env bash
# Read-only API/PG process identities; no API process or migration is started.
set -Eeuo pipefail
: "${MKW_PROJECT_NAME:?}" "${MKW_POSTGRES_IMAGE:?}" "${MKW_API_IMAGE:=unknown}"
compose_file="$1"
printf '{'
separator=''
for service in api db; do
  id="$(docker compose -p "$MKW_PROJECT_NAME" -f "$compose_file" ps -q "$service")"
  [[ "$id" =~ ^[a-f0-9]{12,64}$ ]] || exit 78
  if [[ "$service" == api ]]; then expected="$MKW_API_IMAGE"; else expected="$MKW_POSTGRES_IMAGE"; fi
  [[ "$(docker inspect "$id" --format '{{.Config.Image}}')" == "$expected" ]] || exit 78
  [[ "$(docker inspect "$id" --format '{{.Image}}')" == "$(docker image inspect "$expected" --format '{{.Id}}')" ]] || exit 78
  [[ "$(docker inspect "$id" --format '{{.State.Status}}|{{.State.Health.Status}}')" == 'running|healthy' ]] || exit 78
  value="$(docker inspect "$id" --format '{"containerId":"{{.Id}}","image":"{{.Config.Image}}","imageId":"{{.Image}}","startedAt":"{{.State.StartedAt}}","restartCount":{{.RestartCount}}}')"
  printf '%s"%s":%s' "$separator" "$service" "$value"
  separator=','
done
printf '}\n'
