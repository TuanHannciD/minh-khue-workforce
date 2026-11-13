#!/usr/bin/env bash
set -Eeuo pipefail
repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
if [[ "${MKW_SKIP_PARITY:-}" == "1" ]]; then
  echo "MKW_SKIP_PARITY=1: skipping Docker CI parity gate" >&2
  exit 0
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for the CI parity gate. Start Docker Desktop or set MKW_SKIP_PARITY=1 for an explicitly local-only commit." >&2
  exit 1
fi
corepack pnpm run ci:parity