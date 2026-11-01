# Next session handoff

## Checkpoint (2026-11-01, Africa/Lagos)

Workspace: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`. This session did not commit. Start by running `git status --short --branch` and `git log -5 --oneline`. Preserve `.vscode/` and `apps/web/AGENTS.md`; `.env` is ignored and secret-bearing. Build-generated `apps/web/next-env.d.ts` and `apps/web/tsconfig.tsbuildinfo` were already modified at session start; inspect their diffs before touching them.

## Completed tasks

- Completed count is 10/47: DOC-001, PROD-001, FOUNDATION-001 through FOUNDATION-008.
- FOUNDATION-006/007 acceptance work was checked against the task ledger; database migrations and concurrency/isolation tests now pass. Pending production email, distributed rate limiting and browser reload E2E are hardening follow-ups.
- FOUNDATION-008 delivers role capability mapping and guards, member role assignment, per-warehouse grant persistence and UI, grant-filtered warehouse list and scope-guarded warehouse detail. Additive migration `20261101120000_rbac_warehouse_scope` was applied to the existing local database without reset.

## Files changed in this session

- API: `apps/api/prisma/schema.prisma`, migration `apps/api/prisma/migrations/20261101120000_rbac_warehouse_scope/`, organization context/controller/DTO/module/service, new `apps/api/src/organizations/access-policy.ts`.
- API tests: new `apps/api/test/access-policy.test.mjs`, expanded `apps/api/test/postgres.integration.test.mjs`, updated `apps/api/test/organization.test.mjs`.
- Web: organization role and warehouse-grant management in `apps/web/src/app/organizations/page.tsx`; session restore de-duplication and PUT method support in `apps/web/src/features/auth/session-provider.tsx`.
- Progress: task ledger and progress status/checkpoint files.
- Existing untracked `.vscode/`, `apps/web/AGENTS.md` and build-generated changes were preserved.

## Verification results

- `npm run db:validate --workspace=@inventory/api`: passed.
- `npm run db:migrate:deploy --workspace=@inventory/api`: passed; applied the additive RBAC migration.
- `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/postgres.integration.test.mjs`: 8/8 passed against PostgreSQL.
- `npm test`: 22 passed, 1 opt-in integration suite skipped by default.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run build`: passed.
- Docker daemon health could not be inspected without Docker socket permission during this session. Browser automation is unavailable; no browser verification of the new controls is claimed.

## Exact next implementation steps — FOUNDATION-009

1. Read `AGENTS.md`, then `docs/progress/current-state.md`, this file, `docs/implementation/master-plan.md`, `docs/implementation/task-breakdown.md`, and relevant location/database/tenancy docs in that order.
2. Verify worktree, current HEAD, local Compose/PostgreSQL availability, and applied migrations. Do not reset or delete data.
3. Inspect existing `Warehouse`/grant schema and approved database design. Design the additive `Branch` and branch-to-warehouse relationship with composite organization-scoped constraints before coding.
4. Implement tenant-scoped branch and warehouse CRUD APIs, DTO validation, RBAC capability checks, active/archive behavior, and safe uniqueness/integrity constraints. Avoid touching inventory document references until those models exist.
5. Implement the locations settings UI and connect it to the API; show errors and empty states.
6. Add automated API/service and PostgreSQL tests for tenant isolation, uniqueness, role denial, branch/warehouse relationship integrity, archive behavior, and unauthorized warehouse scope.
7. Apply additive migration with Prisma deploy (never reset), then run the real integration tests, full tests, lint, typecheck, format check, and production build.
8. Update task statuses, completed/pending/blockers, current state, this handoff and session log with observed results. Commit only a verified milestone after reviewing staged files; do not stage `.env`, `.vscode/`, or `apps/web/AGENTS.md`.

## Open blockers and decisions

- Production email provider and shared/distributed rate limiter are not configured.
- Browser refresh/reload E2E and role/grant UI E2E remain unverified.
- Docker health requires Docker socket access; PostgreSQL integration did pass during this session.
- Target segment/brand, tax and statutory invoice requirements, pricing, MFA enforcement, RLS/support access, and production residency/hosting remain open in `docs/progress/decisions.md`. Treat the owner's defaults as provisional assumptions only.
