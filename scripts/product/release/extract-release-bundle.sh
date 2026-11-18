#!/usr/bin/env bash
set -Eeuo pipefail
export LC_ALL=C
fail() { printf '%s\n' "$1" >&2; exit 78; }
[[ $# == 2 ]] || { echo 'usage: extract-release-bundle.sh <archive> <empty-staging>' >&2; exit 64; }
command -v tar >/dev/null && tar --version | head -1 | grep -q 'GNU tar' || { echo 'GNU tar is required' >&2; exit 69; }
archive=$1 staging=$2
[[ -f "$archive" && ! -L "$archive" ]] || fail 'archive must be a regular file'
[[ -d "$staging" && ! -L "$staging" ]] || fail 'staging must be a private directory'
[[ "$(realpath -e -- "$staging")" == "$(realpath -ms -- "$staging")" ]] || fail 'staging symlink ancestors are forbidden'
[[ -z "$(find "$staging" -mindepth 1 -maxdepth 1 -print -quit)" ]] || fail 'staging must be empty'
helper_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
if ! declare -F run_node >/dev/null; then
  command -v node >/dev/null || { echo 'Node runtime or caller run_node is required' >&2; exit 69; }
  run_node() { node "$@"; }
fi
temporary=$(mktemp -d)
trap 'rm -rf -- "$temporary"' EXIT
# Snapshot the archive so listing and extraction read the same bytes.
cp -- "$archive" "$temporary/archive.tar"
tar --list --absolute-names --quoting-style=escape -f "$temporary/archive.tar" >"$temporary/names" || fail 'archive listing failed'
tar --list --verbose --numeric-owner --absolute-names --quoting-style=escape -f "$temporary/archive.tar" >"$temporary/types" || fail 'archive type listing failed'
mapfile -t names <"$temporary/names"
mapfile -t types <"$temporary/types"
[[ ${#names[@]} -gt 0 && ${#names[@]} == ${#types[@]} ]] || fail 'archive listing is inconsistent'
declare -A seen=()
for index in "${!names[@]}"; do
  name=${names[$index]}
  type=${types[$index]:0:1}
  [[ "$type" == '-' || "$type" == d ]] || fail 'archive links and special files are forbidden'
  [[ "$name" =~ ^[A-Za-z0-9._/-]+$ && "$name" != /* ]] || fail 'unsafe or escaped archive name'
  [[ "$type" != d || "$name" == */ ]] || fail 'invalid directory name'
  name=${name%/}
  [[ "$name" != '' && "/$name/" != *'//'* && "/$name/" != *'/./'* && "/$name/" != *'/../'* ]] || fail 'unsafe archive components'
  [[ "$name" == release || "$name" == release/* || "$name" == controls || "$name" == controls/* || "$name" == operation || "$name" == operation/* ]] || fail 'unexpected archive root'
  [[ ! -v 'seen[$name]' ]] || fail 'duplicate archive member'
  seen[$name]=1
done
tar --extract --no-same-owner --no-same-permissions -f "$temporary/archive.tar" -C "$staging" || fail 'archive extraction failed'
for part in release controls operation; do
  [[ -d "$staging/$part" && ! -L "$staging/$part" ]] || fail 'bundle part missing'
  run_node "$helper_dir/release-bundle.mjs" verify "$staging/$part" || fail 'extracted bundle inventory failed'
done
