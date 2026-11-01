# Current state

**Updated:** 2026-11-01 (Africa/Lagos)

## Repository and roadmap

- Workspace: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; milestone commit `080a4fc feat(authz): add organization roles and warehouse scope`.
- Roadmap completed: 10/47 — DOC-001, PROD-001, FOUNDATION-001 through FOUNDATION-008.
- Next eligible task: FOUNDATION-009, branch and warehouse management. It has not started yet; dependencies FOUNDATION-007 and FOUNDATION-008 are satisfied.
- Preserve existing untracked `.vscode/` and `apps/web/AGENTS.md`. `.env` is ignored; never display or stage it. Build-generated `apps/web/next-env.d.ts` and `apps/web/tsconfig.tsbuildinfo` remain modified in the worktree; inspect before cleanup because they were already modified at session start.

## Completed this session

- FOUNDATION-006/007/008 code and acceptance evidence verified. Added/applied additive migration `20261101120000_rbac_warehouse_scope` to the existing `inventory_dev` database; no reset or existing user data deletion.
- Authentication PostgreSQL integration coverage: refresh race and family revocation, transaction rollback on injected successor failure, logout revocation, expiry.
- Organization PostgreSQL coverage: membership and cross-tenant selection isolation, concurrent one-time invitation acceptance, email binding, expiry, and deactivation.
- RBAC: role/capability deny-by-default matrix, role assignment, organization capability guards, warehouse grant APIs/UI, grant-filtered warehouse list, and an active scoped warehouse detail endpoint.
- Warehouse PostgreSQL coverage: cross-organization grant rejected, granted warehouse visible, valid grant passes scope guard, foreign and archived warehouse denied.
- Fixed session restore deduplication for development Strict Mode effect replay; browser reload was not re-verified because browser automation is unavailable. Same-origin HTTP auth lifecycle was verified in the previous checkpoint.

## Verification

- Passed: Prisma schema validation and migration deployment (three total migrations found; RBAC migration applied).
- Passed: `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/postgres.integration.test.mjs` — 8/8 tests.
- Passed: `npm test` — 22 passed, 1 opt-in PostgreSQL suite skipped by default.
- Passed: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build` (Next Webpack production build).
- The first sandboxed API test run failed because local port binding was denied. The approved elevated rerun passed. Docker socket access was denied during a non-escalated `docker compose ps` attempt; container health was not rechecked this session. PostgreSQL integration tests did connect and pass.
- No interactive browser E2E was available. Do not claim the role/grant settings UI has been browser-verified.

## Outstanding

- FOUNDATION-009: branch/warehouse CRUD, tenant-safe constraints, location UI and route/scope tests.
- Production email provider, distributed rate limiting, interactive browser E2E and production hardening remain open; see `blockers.md` and `decisions.md`.
- PROD-002 and ARCH-001/002 remain in progress with provisional owner defaults and unresolved product/security decisions. Do not build inventory accounting/ledger behavior beyond approved boundaries.

See `docs/progress/next-session.md` for exact next implementation steps and `session-log.md` for the activity record.
