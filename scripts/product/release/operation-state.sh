#!/usr/bin/env bash
# Source after script_root/MKW_DEPLOY_PATH/API image are validated.
: "${MKW_OPERATION_ID:=unknown}"
state_path="$MKW_DEPLOY_PATH/shared/current-state.json"
write_state() {
  local state_tmp
  state_tmp="$(mktemp "$MKW_DEPLOY_PATH/shared/.current-state.XXXXXX")"
  if ! run_node "$script_root/scripts/product/release/operation-state.mjs" "$@" > "$state_tmp"; then rm -f "$state_tmp"; return 78; fi
  chmod 640 "$state_tmp"; mv -f "$state_tmp" "$state_path"
}
capture_database() {
  if ! MKW_POSTGRES_IMAGE="$MKW_POSTGRES_IMAGE" MKW_PROJECT_NAME="$MKW_PROJECT_NAME" bash "$script_root/scripts/product/release/database-evidence.sh" "$rendered" "${MKW_DATABASE_EVIDENCE_MODE:-with-api-status}" > "$1" 2>/dev/null; then
    printf '{"known":false}\n' > "$1"
  fi
  chmod 640 "$1"
}
