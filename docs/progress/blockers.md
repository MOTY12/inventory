# Blockers and constraints

## Active implementation blocker
- **FOUNDATION-002 runtime verification:** `docker compose config --quiet` passes, but Docker commands cannot connect to `unix:///Users/newuser/.docker/run/docker.sock`; the Docker daemon is not running. The Compose files cannot be marked complete until all service health checks are confirmed. Start the configured Docker engine and run the exact commands in `docs/progress/next-session.md`.
- **FOUNDATION-006 database runtime:** Prisma 7.10.1, matching Prisma Client/PG adapter, identity schema and offline SQL migration are present; schema validation and client generation pass. Docker is unavailable, so migrations have not been applied and PostgreSQL-backed lifecycle behavior is unverified. Auth endpoints/repositories are not implemented yet.
- **FOUNDATION-006 email delivery:** no mail transport is configured. Verification token persistence can be implemented, but production account verification needs a provider/configuration boundary; never expose tokens in logs.
- **Dependency audit:** npm install reported moderate advisories; rerun full and production audits against the current lockfile. Do not use Prisma 8 RC for transaction-critical work.

## Active planning constraints
- **REA CDP unavailable:** `list_browser_targets` to `127.0.0.1:9222` returned endpoint unreachable. This blocks REA live DOM/screenshot/network evidence. Public official pages and visible browser homepage provided fallback; no Chrome reconfiguration was done.
- **Material decisions still pending:** target segment/brand, tax and statutory invoice scope, subscription pricing/limits, production data residency/hosting commitments, MFA enforcement, RLS and support access. Owner's approved defaults are recorded as provisional assumptions, not validated customer requirements.
- **Interview evidence deferred:** the protocol is ready, but 5–8 interviews across at least two segments have not occurred. Owner directed phase closure and deferred these interviews to pilot validation; no participant findings are claimed.
