# Blockers and constraints

## Active implementation blocker
- **FOUNDATION-002 runtime verification:** `docker compose config --quiet` passes, but Docker commands cannot connect to `unix:///Users/newuser/.docker/run/docker.sock`; the Docker daemon is not running. The Compose files cannot be marked complete until all service health checks are confirmed. Start the configured Docker engine and run the exact commands in `docs/progress/next-session.md`.
- **FOUNDATION-006 database runtime:** Prisma 7.10.1, matching Prisma Client/PG adapter, provider/module, identity schema and offline SQL migration are present; schema validation/client generation pass and startup executes a database probe. Docker is unavailable, so migration application and PostgreSQL-backed lifecycle/concurrency behavior are unverified.
- **FOUNDATION-007 database runtime:** Organization/membership/invitation schema, additive SQL migration and tenant-scoped API are implemented and Prisma validates. Docker is unavailable, so the migration has not been applied and invitation consumption, concurrent acceptance, membership updates and cross-tenant isolation are not verified against PostgreSQL. Current tests use fake persistence only.
- **FOUNDATION-006 email delivery:** an interface and in-memory development/test adapter exist. No production provider is configured; production startup fails closed until one is supplied. Never log verification/reset tokens.
- **FOUNDATION-006 rate limiting:** authentication has bounded process-local rolling windows. This protects a single process but does not coordinate limits across replicas; use shared Redis-backed throttling before horizontal production operation.
- **Dependency audit:** npm install reported moderate advisories; rerun full and production audits against the current lockfile. Do not use Prisma 8 RC for transaction-critical work.

## Active planning constraints
- **REA CDP unavailable:** `list_browser_targets` to `127.0.0.1:9222` returned endpoint unreachable. This blocks REA live DOM/screenshot/network evidence. Public official pages and visible browser homepage provided fallback; no Chrome reconfiguration was done.
- **Material decisions still pending:** target segment/brand, tax and statutory invoice scope, subscription pricing/limits, production data residency/hosting commitments, MFA enforcement, RLS and support access. Owner's approved defaults are recorded as provisional assumptions, not validated customer requirements.
- **Interview evidence deferred:** the protocol is ready, but 5–8 interviews across at least two segments have not occurred. Owner directed phase closure and deferred these interviews to pilot validation; no participant findings are claimed.
