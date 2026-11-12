# Rollback runbook (manual incident route)

Normal push-main has no automatic application rollback or database restore. A
failed build, backup, migration, health or smoke stage stops and reports its
stage/SHA/digests/backup identity. Use this route only with the protected
`production-recovery` environment, required approval and `refs/heads/main`.

1. Stop a new release or place traffic in maintenance under the incident decision. Create a fresh restore-verified `BACKUP` of the current database for the exact target. Never substitute `INITIAL_EMPTY_DEPLOYMENT`.
2. Dispatch `rollback.yml` from current `main` with the exact old release SHA, producing run and artifact IDs, plus the new current-database backup IDs. The trusted resolver validates producer ownership, manifest SHA/repository, archive checksum, backup freshness/retention and target identity.
3. Confirm the old API/Web images are compatible with the current schema. The remote lock checks the running PostgreSQL identity and digest before any mutation; a mismatch stops the route.
4. Redeploy only exact old API/Web digests with `--no-deps`, keep the existing PostgreSQL container and run forward `prisma migrate deploy` only when the approved route requires it. Do not reset, down-migrate, change the database image, remove a volume or restore over the running database.
5. Recheck image IDs/digests, health and smoke; keep runner and server receipts. The result is `application-only` with `databaseRecovery: false`.
6. If data or schema compatibility is uncertain, stop this route. Restore into a new database, verify and cut over under a separate approval/runbook; this workflow never performs that restore.

Keep correlation, exact artifact IDs/digests and operator reason. Do not retry while a remote `flock` is active, and do not infer a successful rollback from a missing receipt. The superseded automatic-rollback/current-state/LKG design remains only in historical reports for audit.
