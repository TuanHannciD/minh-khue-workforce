#!/usr/bin/env bash
# Source from validated trusted controls. Caller owns reservation, one continuous
# flock, phase tracking and failure traps. No lock or traps are installed here.
# Required: operation_dir, MKW_OPERATION_ID, release_sha (or MKW_RELEASE_SHA),
# MKW_{API,WEB,POSTGRES}_IMAGE, MKW_CONTROL_SHA, backup_id (or MKW_BACKUP_ID),
# backup_expected_target_identity (or MKW_TARGET_IDENTITY). Sequence advances
# only after a successful write; a reporting failure must not mask caller error.
record_operation_event() {
  [[ $# == 2 ]] || return 78
  declare -F run_node >/dev/null || return 69
  local helper_dir sequence
  helper_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P) || return 78
  sequence=$((${operation_event_sequence:-0} + 1))
  if ! run_node --input-type=module - "$helper_dir/operation-receipts.mjs" \
    "${operation_dir:-}" "${MKW_OPERATION_ID:-}" "$sequence" "$1" "$2" \
    "${MKW_OPERATION_KIND:-release}" "${release_sha:-${MKW_RELEASE_SHA:-}}" \
    "${MKW_API_IMAGE:-}" "${MKW_WEB_IMAGE:-}" "${MKW_POSTGRES_IMAGE:-}" \
    "${MKW_REGISTRY_HOST:-ghcr.io}" "${registry_auth_status:-not-run}" "${registry_pull_status:-not-run}" \
    "${mutation_started:-false}" "${MKW_ATTESTATION_STATUS:-not-applicable}" \
    "${backup_id:-${MKW_BACKUP_ID:-}}" "${backup_expected_target_identity:-${MKW_TARGET_IDENTITY:-}}" "${MKW_CONTROL_SHA:-}" <<'NODE'
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
try {
  const [helper, directory, operationId, sequence, status, phase, operation, releaseSha,
    api, web, postgres, host, auth, pull, mutation, attestationVerification,
    backupId, targetIdentity, controlSha] = process.argv.slice(2);
  if (!['true', 'false'].includes(mutation)) throw new Error();
  const { writeOperationEvent } = await import(pathToFileURL(helper).href);
  await writeOperationEvent(directory, {
    schemaVersion: 1, operationId, eventId: randomUUID(), sequence: Number(sequence),
    operation, releaseSha, imageDigests: { api, web, postgres }, status, phase,
    utc: new Date().toISOString(), mutationStarted: mutation === 'true',
    registry: { host, auth, pull }, attestationVerification,
    rollbackScope: 'application-only', databaseRecovery: false,
    backupId, targetIdentity, controlSha,
  });
} catch {
  console.error('operation receipt rejected');
  process.exitCode = 78;
}
NODE
  then return 78; fi
  operation_event_sequence=$sequence
}
