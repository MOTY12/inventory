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

### Worker interruption rehearsal

The opt-in inventory PostgreSQL suite runs this against a random PostgreSQL schema, a unique BullMQ queue, and a unique export ID. A child worker is killed with `SIGKILL` after the export reaches `PROCESSING` and before its object upload completes. A replacement worker with a shortened test-only lock interval reclaims the stalled job, revalidates the requester and tenant scope, regenerates the CSV, and writes the deterministic object key. The test then lists the export-specific object prefix and verifies one artifact, the persisted completion state, and authenticated download. A separate startup case creates a durable `PENDING` row without a Redis job and confirms that a newly started service dispatches and completes it.

For an incident, restart one worker/service instance and let BullMQ stalled-job recovery and the database-backed pending dispatcher run. Do not `FLUSHDB`, delete queue keys, change export statuses manually, or use a non-unique queue for a drill. Confirm pending/processing rows settle, failed jobs and safe error fields are visible, completed exports have exactly one deterministic artifact, and retries/downloads use current membership and warehouse authorization.

## S3-compatible object recovery

### Protection and backup policy

- Keep source and recovery buckets private with public access blocks enabled. Use a dedicated least-privilege service role restricted to the export prefix and a separate recovery role for backup/restore.
- Enable bucket versioning and configure cross-account/cross-region replication to an independently administered recovery bucket. Encrypt with managed KMS keys and ensure the recovery role cannot delete backup versions. Select key region, retention, replication timing, and any object-lock policy only after the owner approves hosting, residency, retention, and budget requirements.
- For an operator-initiated additional copy, use a short-lived role and an isolated timestamped destination prefix. The command is additive and deliberately omits `--delete`:

```sh
aws s3 sync "s3://$SOURCE_BUCKET/report-exports/" \
  "s3://$RECOVERY_BUCKET/inventory/report-exports/$BACKUP_ID/" \
  --sse aws:kms --sse-kms-key-id "$RECOVERY_KMS_KEY_ARN"
```

Write a manifest containing source key, destination key, object size, checksum, timestamp, and backup ID. Store the manifest with the backup under the same private policy. Never put credentials in shell history or manifests.

### Restore and verification

1. Restore a selected object to a unique quarantine prefix first; never sync a backup over live objects.
2. Compare object size and a trusted checksum manifest. Check metadata/content type and confirm the recovered bytes with an authorized test reader.
3. For generated report exports, the database remains authoritative and exports are reproducible. A confirmed missing object is marked `FAILED` with a safe diagnostic and no stale object key; an authorized retry regenerates the CSV. Do not repair database pointers with manual SQL. The isolated integration drill backs up one generated artifact to a random private prefix, removes only that test artifact, verifies the safe missing-object response, restores the bytes, compares SHA-256, and deletes both temporary objects.
4. For an uploaded/source object, use the application's documented resource workflow or a reviewed operator promotion from quarantine after verifying its tenant/resource mapping. Keep the original key untouched until the owner approves the cutover. Record actor, reason, source backup ID, checksums, and audit reference.
5. Confirm API health, export state, authorized download, tenant denial for a second test tenant, bucket privacy/encryption, and cleanup of the temporary prefix. If any check fails, leave the source untouched, stop promotion, and escalate.

### Retention recommendation (not approved)

Before pilot, define a written retention schedule covering daily recovery points, weekly/monthly archives, object versions, deletion requests, legal holds, and backup expiry. A short daily plus weekly/monthly rotation is a reasonable proposal to review with the owner and privacy counsel; no duration or policy is selected here. Retention must match approved data-residency, statutory, privacy, and customer-contract requirements.

## Incident response and recovery checklist

1. Declare the incident, name an incident lead, record start time and affected environment, and page the database, queue/storage, security, and privacy contacts as relevant.
2. Contain access or writes only through the approved operator/change process. Preserve logs, audit events, checksums, and service error state. Do not expose secrets or customer data in incident notes.
3. Determine whether PostgreSQL, Redis/BullMQ, object storage, or the application is the failed dependency. Preserve the source state and record the last known-good backup/replication point.
4. Recover PostgreSQL into a fresh database using the existing checksum-verified restore procedure; verify migrations and ledger reconciliation before directing traffic.
5. Restore Redis/worker service without flushing shared data. Let durable pending exports dispatch and stalled jobs recover. Check bounded retry/failure visibility and ensure no duplicate completed artifacts.
6. Restore objects into quarantine and verify checksums. Regenerate missing report exports through the supported retry path; do not overwrite live customer objects.
7. Verify readiness, tenant and warehouse authorization, critical inventory ledger/balance totals, report downloads, audit continuity, and monitoring. Document measured recovery times and any data gap.
8. Incident lead/security owner decides rollback or controlled traffic return. Notify privacy/legal contacts if personal-data exposure or statutory notification may apply. Record follow-up actions and customer communication through approved channels.

Escalate suspected cross-tenant access, credential exposure, unexplained ledger differences, backup checksum mismatch, missing audit data, or any recovery that would overwrite source/live objects. Keep the source environment read-only/unchanged until an authorized rollback or promotion decision is recorded.

## Scope and limitations

- Local drills cover PostgreSQL and generated report-export objects/queue paths. Email delivery state, uploaded source files, production replication, independent-account access, and other external services still require policy and production validation.
- The local restore script and drill do not establish off-site backup durability, encryption-at-rest, point-in-time recovery, RPO, RTO, or production recoverability.
- Record source environment, archive checksum, backup/restore durations, restored migration state, reconciliation results, and cleanup of the disposable target for each drill. Keep secrets and data samples out of the run log.
- QUALITY-003 cannot be marked complete until an approved RPO/RTO target is demonstrated and object storage/queue recovery scope is covered.
