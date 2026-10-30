# Deployment and operations design

## Environments
Local Docker Compose: web, API, PostgreSQL, Redis, S3-compatible local object storage. CI: ephemeral database and deterministic fixtures. Staging: production-like isolated accounts, masked data. Production: managed PostgreSQL/Redis, container runtime, private object bucket, secrets manager, TLS/WAF, log/metrics/trace service. AWS-compatible approach; choose exact provider/region after data residency and budget decisions.

## Delivery
GitHub Actions: install locked dependencies, lint/typecheck, unit/integration checks, build, dependency/security scanning, generate/check OpenAPI, migration validation. Deploy immutable container images. Use expand/contract schema migrations; backup before risky migration; health-gated rollout; rollback procedure includes code and forward-compatible schema.

## Reliability
Encrypted automated backups + point-in-time recovery where available; daily logical snapshot retention; periodic restore rehearsal with measured RPO/RTO. Queue retry with backoff, bounded attempts, dead-letter inspection and replay. Readiness includes DB/Redis/object-store dependency state; liveness does not.

## Monitoring
Structured logs with tenant ID only where safe, request ID, operation and duration; metrics for request error/latency, DB pool, deadlocks, queue lag/failures, ledger reconciliation, backup age, auth anomalies. Alerts page on SLO breach, backup stale, reconciliation mismatch and sustained job failure.

## Cost and data handling decisions
Choose region, expected tenant/data scale, availability budget, object retention, email provider, monitoring vendor, and support access model before production provisioning. No credentials or cloud resource creation during planning.
