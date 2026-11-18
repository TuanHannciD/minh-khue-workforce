#!/usr/bin/env bash
# Caller holds the deployment flock continuously through publish and mutations.
# No lock acquisition here: nested flock would deadlock the lifecycle owner.
publish_release() {
  [[ $# == 2 ]] || return 64
  local candidate=$1 destination=$2 parent helper_dir
  helper_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P) || return 78
  if ! declare -F run_node >/dev/null; then
    command -v node >/dev/null || return 69
    run_node() { node "$@"; }
  fi
  [[ -d "$candidate" && ! -L "$candidate" ]] || return 78
  [[ "$(realpath -e -- "$candidate")" == "$(realpath -ms -- "$candidate")" ]] || return 78
  parent=$(dirname -- "$destination")
  [[ -d "$parent" && "$(realpath -e -- "$parent")" == "$(realpath -ms -- "$parent")" ]] || return 78
  [[ "$(basename -- "$destination")" != . && "$(basename -- "$destination")" != .. ]] || return 78
  run_node "$helper_dir/release-bundle.mjs" verify "$candidate" || return 78
  if [[ -e "$destination" || -L "$destination" ]]; then
    run_node "$helper_dir/release-bundle.mjs" compare "$destination" "$candidate" || return 78
    return 0
  fi
  # The helper rechecks absence under the caller-held flock and uses only the OS
  # rename primitive: EXDEV is a failure, never a copy/delete fallback. run_node
  # may use the validated image; both paths must share one writable deploy mount.
  run_node "$helper_dir/release-bundle.mjs" rename "$candidate" "$destination" || return 78
}
