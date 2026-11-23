# PostgreSQL backup and restore runbook

**Status:** Initial local operational runbook for QUALITY-003. RPO/RTO targets are not approved; do not treat local measurements as customer commitments.

## Backup

Use a private directory with sufficient capacity. The script creates a PostgreSQL custom-format archive, validates that `pg_restore` can read it, writes a SHA-256 manifest, uses restrictive permissions, and refuses to overwrite an existing timestamped artifact.

```sh
mkdir -p "$HOME/inventory-backups"
chmod 700 "$HOME/inventory-backups"
DATABASE_URL="$DATABASE_URL" ./scripts/backup-postgres.sh "$HOME/inventory-backups"
```

Supply `DATABASE_URL` through the operator's approved secret environment; do not place credentials in shell history, logs, source control or the backup directory. Copy verified archives and manifests to an approved encrypted off-host destination. These scripts do not encrypt archives themselves.

The database CLI must match the server major version. The configured local server is PostgreSQL 18; the host client here is version 16. For this Compose setup use the PostgreSQL container client and pass a service-reachable URL:

```sh
PG_CLIENT_COMPOSE_SERVICE=postgres \
PG_CLIENT_DATABASE_URL="$PG_CONTAINER_DATABASE_URL" \
DATABASE_URL="$DATABASE_URL" \
./scripts/backup-postgres.sh "$HOME/inventory-backups"
```

## Restore drill

Create a fresh, separate PostgreSQL database first. Never point the restore command at the source database or a database with existing application objects. The restore script validates the checksum and archive, compares source/target database identities, rejects a non-empty target, and uses one transaction without `--clean` or `--create`.

```sh
DATABASE_URL="$SOURCE_DATABASE_URL" \
RESTORE_DATABASE_URL="$FRESH_EMPTY_DATABASE_URL" \
PG_CLIENT_COMPOSE_SERVICE=postgres \
PG_CLIENT_RESTORE_URL="$PG_CONTAINER_FRESH_TARGET_URL" \
./scripts/restore-postgres.sh "$HOME/inventory-backups/inventory-<timestamp>.dump"
```

After restoration, verify migration state, run application-level tenant and ledger reconciliation checks, and confirm API readiness before considering traffic cutover. Any cutover/rollback is a separate operator action. Never restore into production without the approved change process.

## Redis/BullMQ recovery

The PostgreSQL `ReportExport` row is durable job state; Redis/BullMQ holds dispatch state only. On API startup, the dispatcher re-enqueues rows still `PENDING` using deterministic export ID/retry generation. After a Redis restore/restart, verify Redis health and inspect pending export rows; allow the dispatcher to recover them and confirm no completed export was duplicated. Do not edit statuses directly to simulate recovery.

## Scope and limitations

- This covers PostgreSQL archives and the report-export queue recovery path only. S3-compatible export objects, uploaded source files, email delivery state, and other external services need their own approved backup/retention policy.
- The local restore script and drill do not establish off-site backup durability, encryption-at-rest, point-in-time recovery, RPO, RTO, or production recoverability.
- Record source environment, archive checksum, backup/restore durations, restored migration state, reconciliation results, and cleanup of the disposable target for each drill. Keep secrets and data samples out of the run log.
- QUALITY-003 cannot be marked complete until an approved RPO/RTO target is demonstrated and object storage/queue recovery scope is covered.
