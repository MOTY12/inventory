# Next session handoff

## Checkpoint (2026-11-01, Africa/Lagos)

Workspace: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; latest milestone commit `e4028a9 chore(dev): verify local stack and auth flow`; verify `git status --short --branch` and `git log -5 --oneline` before work. Preserve untracked `.vscode/` and `apps/web/AGENTS.md`.

## Completed and current tasks

- Completed: DOC-001, PROD-001, FOUNDATION-001, FOUNDATION-002, FOUNDATION-003, FOUNDATION-004, FOUNDATION-005 (7/47).
- FOUNDATION-002 closed based on runtime evidence: Docker Compose PostgreSQL/Redis/S3Mock all healthy; migrations applied; env validated; API readiness is 200. Docker PostgreSQL uses host port 5433 because the existing host PostgreSQL is on 5432. No reset or volume deletion.
- FOUNDATION-006 remains IN_PROGRESS. Live database auth lifecycle passed directly and through the same-origin web proxy. Browser signup/verify/login/dashboard navigation passed in the previous continuation, but reload went to login. Current browser automation is disabled, so repeat browser reload is outstanding. Database concurrency/security tests, production email and distributed rate limits remain outstanding.
- FOUNDATION-007 remains IN_PROGRESS. Migration is applied; database-backed invitation-consumption/concurrency, membership and cross-tenant isolation tests remain outstanding. Do not start FOUNDATION-008 before this security boundary is verified.
- PROD-002, ARCH-001 and ARCH-002 remain IN_PROGRESS. Treat decisions in `decisions.md` as provisional assumptions; do not treat them as validated business requirements.

## Changed files from this continuation

- `apps/api/package.json`: Prisma commands use root Prisma config.
- `apps/api/src/main.ts`, `prisma.config.ts`: load root `.env` relative to source/config, including when commands run from a workspace.
- `apps/web/next.config.ts`, `apps/web/src/features/auth/session-provider.tsx`: browser API calls default to same-origin `/api/v1`; Next rewrites to the API origin.
- `docs/implementation/task-breakdown.md`, `docs/implementation/local-development.md`, `docs/progress/{blockers.md,current-state.md,next-session.md}`. Append to session log and task ledger as appropriate.
- Local ignored `.env` now points to Docker PostgreSQL on 5433; it contains secrets and must not be printed, staged or committed.
- Preserve unrelated untracked `.vscode/` and `apps/web/AGENTS.md`.

## Verification evidence

- `docker compose ps`: all three configured services healthy (PostgreSQL 5433, Redis 6379, S3Mock 9090).
- `npm run validate:env`: passed. `npm run db:migrate:deploy --workspace=@inventory/api`: both identity and organizations migrations found, no pending migrations. `npm run db:validate --workspace=@inventory/api`: passed.
- HTTP: API readiness 200; web `/login` 200; web-proxied API readiness 200.
- Real PostgreSQL auth smoke, direct and proxied: register 202 → dev mailbox 200 → verify 200 → login 200 → `/me` 200 → refresh 200 → logout 204.
- Passed `npm test` (21/21; required escalated rerun due sandbox port denial), `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build` (Webpack production web build).
- No interactive browser end-to-end verification on the current run; browser automation is disabled. Previous browser reload redirected to login. API-level cookie rotation does not prove browser cookie persistence.

## Exact next steps

1. Recheck Git status and live container/process health; start with `docker compose ps` and `curl -i http://localhost:4000/api/v1/health/ready`.
2. For developer mailbox support, start API with `NODE_ENV=development npm run dev:api`; start web with `npm run dev:web`. Do not loosen mailbox loopback/development guards.
3. If browser controls are available, use a synthetic account to repeat register → verification mailbox → verify → login → authenticated dashboard → reload → refresh/session restore → logout. Diagnose cookie path, CSRF and proxy behavior without weakening SameSite/CSRF.
4. Add and run real PostgreSQL integration coverage for persisted auth lifecycle and refresh concurrency/reuse revocation, then for organization creation/owner membership, invitation email binding/expiry/one-time and competing acceptance, deactivation and cross-tenant access.
5. Fix any observed defects and rerun tests, lint, typecheck, format, Prisma validation, migration check and production build. Keep FOUNDATION-006/007 IN_PROGRESS until their stated acceptance criteria pass.
6. After organization tenant isolation is verified, advance to FOUNDATION-008 RBAC, then FOUNDATION-009 branches/warehouses. Follow task ledger dependencies; catalog begins after location/RBAC foundations.
7. Update `task-breakdown.md`, `completed-tasks.md`, `pending-tasks.md`, `blockers.md`, `current-state.md`, this handoff and `session-log.md` with evidence. Commit only verified project changes; never stage `.env`, `.vscode/`, or generated build artifacts.

## Open hardening and product gates

- Production email provider is not configured; dev mailbox is memory-only.
- Auth rate limiter is process-local and must be backed by shared storage for multi-replica deployment.
- Tax/statutory invoice scope, pricing, target segment/brand, MFA enforcement, RLS/support access and production data-residency commitments remain unresolved as described in `decisions.md`.
