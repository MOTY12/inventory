# Next session handoff

## Current checkpoint (2026-10-31, Africa/Lagos)
Branch `develop`; latest implementation commit is `0b0ee43 feat(auth): add persisted identity lifecycle foundation`, followed by a progress-only checkpoint commit. The branch is ahead of `origin/develop`. This session began at `12bf2d0` with a clean worktree. A local untracked `.vscode/settings.json` appeared during tooling and was preserved; do not remove it without checking with the owner. Verify current status and exact docs checkpoint commit with `git status --short --branch` and `git log -5 --oneline`.

## Task state
- Completed: DOC-001, PROD-001 (interviews deferred to pilot), FOUNDATION-001, FOUNDATION-003, FOUNDATION-004, FOUNDATION-005.
- Blocked: FOUNDATION-002 runtime health; Docker daemon socket `/Users/newuser/.docker/run/docker.sock` is unavailable.
- In progress: FOUNDATION-006, PROD-002, ARCH-001 and ARCH-002. Owner provisional assumptions remain in DEC-007/008.
- Remaining: 36 not started. Roadmap: 6/47 complete, 1 blocked, 4 in progress.

## Current FOUNDATION-006 implementation
- Prisma 7.10.1 and matching PostgreSQL adapter/schema/migration are committed in `447ee2d`. Prisma service/module constructs one client, probes `SELECT 1` at startup, exposes readiness and disconnects on shutdown. API starts without DB only when `DATABASE_CONNECT_ON_STARTUP=false` (test setting).
- Auth routes: register, login, refresh, logout, me, verify-email, resend-verification, forgot-password, reset-password. Refresh tokens and recovery tokens are stored as SHA-256 digests; rotation atomically revokes an old row and creates the next token inside a Prisma transaction; replay revokes the token family. Password reset revokes all active user sessions.
- Browser auth: access token held in memory; refresh token in HttpOnly/SameSite Strict cookie; double-submit CSRF with a credentialed CSRF bootstrap endpoint for refresh/logout; login/register/email verify/forgot/reset pages and dashboard guard.
- Development/testing mail adapter stores outgoing messages in process memory. Production module fails closed without a configured provider. Throttling is process-local, not suitable as shared rate enforcement across replicas.
- No migration has been applied to PostgreSQL. Auth unit tests use an in-memory fake Prisma adapter and do not verify real transaction isolation/concurrent refresh behavior. Organization-scoped auth claims are not yet implemented because organization membership is a subsequent roadmap task.

## Verification this continuation
- Passed: `prisma validate`, `prisma generate`, offline SQL migration generation, full `npm run build`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate:env`.
- Passed: full test suite 19/19 on approved rerun; includes auth service fakes, invalid/expired JWT, guard logout revocation, DB startup failure mapping, DTO rejection, CSRF endpoint, OpenAPI endpoints and live HTTP smoke.
- Last dependency audit (before this continuation's source-only changes): 17 moderate development advisories, 0 high/critical, 0 production vulnerabilities.
- Docker health and PostgreSQL migration/application remain unverified because Docker is unavailable. Prisma engine lifecycle scripts were not explicitly approved by npm, although CLI/schema validation/generation work in this environment.

## Exact next implementation steps
1. Start Docker, then `docker compose up -d` and `docker compose ps`; verify health for PostgreSQL, Redis and S3Mock. At last check Docker socket was unavailable; keep FOUNDATION-002 blocked if unchanged.
2. Run `npm run db:migrate:deploy --workspace=@inventory/api` against the disposable local PostgreSQL and verify tables/indexes; add CI/service integration test setup or a documented local DB test target.
3. Add real PostgreSQL tests for registration uniqueness, verification one-time use, reset/session revocation, two concurrent refresh requests and reuse-family revocation. Resolve any transaction-isolation races based on observed tests.
4. Implement/configure a production mail provider (AWS SES or another approved provider) and a delivery-safe dev/test transport that does not persist raw tokens. Add delivery failure/retry behavior.
5. Move auth throttling to shared Redis-backed storage before multi-instance deployment; add browser E2E for login/refresh/logout and verification/recovery flows.
6. Re-run full checks and update progress files. FOUNDATION-006 can be marked complete only after database-backed lifecycle, integration/concurrency/security tests, usable email delivery and browser workflow checks pass.
7. Then start FOUNDATION-007 organizations/memberships, FOUNDATION-008 scoped RBAC, and FOUNDATION-009 branches/warehouses in dependency order.

## Provisional decisions / open items
Owner-authorized provisional defaults are in DEC-007/008: email/password; short-lived JWT access and rotating refresh; MFA enforcement deferred; strict organization isolation/RBAC; weighted-average costing; no negative stock by default; reserve on sales-order confirmation; immutable movement ledger; configurable cloud region/storage. These are assumptions, not validated requirements. Tax/invoice compliance, pricing/segment, production residency commitments, RLS/support access remain review gates. Email delivery provider/credentials and production cookie origins are not configured.
