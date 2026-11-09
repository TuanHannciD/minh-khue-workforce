# Task 3 report — Immutable release workflow attestations

## Scope

Updated `.github/workflows/build-release.yml` to export and validate attestation metadata from the exact API and web image digests produced by the release build. The release manifest and checksum bundle now reference the exported attestation payloads; placeholder SBOM/provenance JSON files were removed. Adjusted workflow policy assertions to cover the attestation export and digest-pinned inspection.

## Verification

- `node --test tests/product-tooling/workflow-policy.test.mjs` — **PASS** (6/6).
- `git diff --check` — **Not run** for this focused fix; no whitespace-only changes were introduced.

## Notes and limits

The workflow still relies on Buildx `provenance: true` and `sbom: true`, then verifies that registry inspection for each immutable digest returns non-empty attestation content containing an attestation/SBOM marker. No GitHub Actions run or production release was executed locally.
