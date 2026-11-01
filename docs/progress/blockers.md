# Blockers and constraints

## Active implementation blocker
- **FOUNDATION-006/007 database security verification:** Docker and PostgreSQL are now available and both additive migrations are applied. The auth lifecycle has passed a live PostgreSQL API smoke flow. Automated database-backed concurrency/reuse and organization invitation/tenant-isolation tests are still absent; existing organization guard tests use fake persistence. Keep these tasks IN_PROGRESS.
- **Browser session restoration:** Registration, verification and dashboard login worked in the browser previously, but a full browser reload redirected to login. The API auth lifecycle now passes through the same-origin frontend proxy using a cookie-preserving HTTP smoke test. A final interactive browser reload check is pending because browser automation is disabled in current Work settings.
- **Local development mode:** `npm run dev:api` alone does not set `NODE_ENV=development`; the guarded verification mailbox returns 404 in that mode. Use `NODE_ENV=development npm run dev:api` as documented. Do not weaken the mailbox's environment or loopback checks.
- **Runtime availability:** The current API and frontend were restarted for this session and verified during the session. Their processes may stop when the Codex execution session ends; if ports 3000/4000 are unavailable, rerun the documented start commands.
- **FOUNDATION-006 email delivery:** an interface and in-memory development/test adapter exist. No production provider is configured; production startup fails closed until one is supplied. Never log verification/reset tokens.
- **FOUNDATION-006 rate limiting:** authentication has bounded process-local rolling windows. This protects a single process but does not coordinate limits across replicas; use shared Redis-backed throttling before horizontal production operation.
- **Dependency audit:** npm install reported moderate advisories; rerun full and production audits against the current lockfile. Do not use Prisma 8 RC for transaction-critical work.

## Active planning constraints
- **REA CDP unavailable:** `list_browser_targets` to `127.0.0.1:9222` returned endpoint unreachable. This blocks REA live DOM/screenshot/network evidence. Public official pages and visible browser homepage provided fallback; no Chrome reconfiguration was done.
- **Material decisions still pending:** target segment/brand, tax and statutory invoice scope, subscription pricing/limits, production data residency/hosting commitments, MFA enforcement, RLS and support access. Owner's approved defaults are recorded as provisional assumptions, not validated customer requirements.
- **Interview evidence deferred:** the protocol is ready, but 5–8 interviews across at least two segments have not occurred. Owner directed phase closure and deferred these interviews to pilot validation; no participant findings are claimed.
