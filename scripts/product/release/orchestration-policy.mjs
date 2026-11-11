import { validateBackupReady } from "./validate-backup-ready.mjs";

export const MAX_BACKUP_AGE_MS = 24 * 60 * 60 * 1000;

export function validateBackupReadyFreshness(
  value,
  {
    expectedSha,
    expectedKind,
    now = Date.now(),
    maxAgeMs = MAX_BACKUP_AGE_MS,
  } = {},
) {
  const base = validateBackupReady(value);
  const errors = [...base.errors];
  if (value?.releaseSha !== expectedSha)
    errors.push("backup release SHA mismatch");
  if (value?.kind !== expectedKind) errors.push("backup kind mismatch");
  if (!Number.isFinite(now) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0)
    errors.push("freshness policy is invalid");
  const created = Date.parse(value?.createdAt ?? "");
  const retention = Date.parse(value?.retentionUntil ?? "");
  const checked = Date.parse(value?.emptyEvidence?.checkedAt ?? "");
  if (Number.isFinite(now) && Number.isFinite(maxAgeMs)) {
    if (!Number.isFinite(created) || created > now)
      errors.push("backup createdAt is in the future");
    else if (now - created > maxAgeMs)
      errors.push("backup is older than the freshness policy");
    if (!Number.isFinite(retention) || retention <= now)
      errors.push("backup retention has expired");
    if (value?.kind === "INITIAL_EMPTY_DEPLOYMENT") {
      if (!Number.isFinite(checked) || checked > now)
        errors.push("empty evidence checkedAt is in the future");
      else if (now - checked > maxAgeMs)
        errors.push("empty evidence is older than the freshness policy");
    }
  }
  return { ok: errors.length === 0, errors };
}
