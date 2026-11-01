# Current state

**Updated:** 2026-11-01 (Africa/Lagos)

## Repository and roadmap

- Workspace: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; HEAD `c415989 organisation flow`. The code, UI, and progress changes in this work session remain uncommitted. Preserve pre-existing generated changes in `apps/web/next-env.d.ts` and `apps/web/tsconfig.tsbuildinfo`; do not stage `.env` or secrets.
- Completed roadmap count: **11/47**. FOUNDATION-009 is COMPLETED after its migration and live PostgreSQL suite passed.
- Current local services: Docker Compose PostgreSQL, Redis, and S3Mock are healthy; API is running in development mode on port 4000; existing Next.js frontend is available on port 3000.

## FOUNDATION-009 and local account

- Branch and warehouse schema, tenant-scoped APIs, role/location scope checks, transactional audit events, lifecycle controls, edit forms, pagination/search, and location page are implemented.
- Applied additive migration `20261101150000_branches_and_location_audit` to existing `inventory_dev`; no reset or deletion occurred. PostgreSQL integration suite passed 9/9.
- Chrome surfaced an authorization UI bug: session restoration loaded the selected organization without its membership role, hiding management controls. Fixed `apps/web/src/features/auth/session-provider.tsx` by joining the active organization to the loaded membership role. A screenshot also exposed cramped location forms; added responsive location-specific filters, field, form, and list styles in `apps/web/src/app/globals.css` and `apps/web/src/app/locations/page.tsx`.
- Manual Chrome workflow passed: register, read local verification message, verify email, sign in, reach dashboard, create/select organization, create branch and warehouse, and reload locations while retaining the selected organization and saved records.
- Development account email: `inventory.owner.20261101@example.test`. Its password was shared with the user in the chat and is intentionally not stored here. The local demo organization is `Local Demo Workspace` (`local-demo-workspace-20261101`) with `Main Branch` and `Main Warehouse` (`MAIN-01`).

## Verification

- `npm run validate:env`, `npm run db:validate --workspace=@inventory/api`, and `npm run db:migrate:deploy --workspace=@inventory/api` passed; migration deploy reported no pending migrations on the final check.
- `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/postgres.integration.test.mjs`: 9 passed, 0 failed.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run build` passed.
- `npm test`: 27 passed, 0 failed, 1 opt-in PostgreSQL suite skipped (run separately as noted above).
- API readiness direct and through the web proxy returned HTTP 200; frontend `/login` returned HTTP 200. Docker Compose showed all three containers healthy.
- After final role and location styling changes, typecheck, lint, format check, and production build passed. Production build temporarily interrupted the API watch process because build and dev share `apps/api/dist`; API was restarted and readiness returned 200. Recheck after future builds.

## Exact next steps

1. Check `git status --short --branch` and preserve uncommitted user/codegen changes; review the `session-provider.tsx` fix and documentation diff before staging or committing.
2. Keep services available at `http://localhost:3000` (web) and `http://localhost:4000/api/v1/health/ready` (API). If the API stops after a production build, restart with `NODE_ENV=development npm run dev:api`; the existing frontend already runs on port 3000.
3. Resume the first eligible roadmap gate: ARCH-001 transaction/inventory semantics, documenting the provisional defaults (weighted average, no negative available stock, confirmation-time reservations, immutable ledger) as assumptions. Do not begin stock-ledger implementation until invariants and applicable product/security gates are recorded.
4. Continue PROD-002 and ARCH-002 material decisions before any customer commitments or security boundary changes. INV-001 depends on FOUNDATION-009 and ARCH-001.
5. Keep production email, distributed rate limiting, and automated browser E2E as hardening follow-ups. Do not claim full browser E2E; only the recorded manual Chrome path was exercised.
6. Run the relevant checks after further code changes, update `task-breakdown.md`, `completed-tasks.md`, `pending-tasks.md`, `blockers.md`, `current-state.md`, `next-session.md`, and `session-log.md`; make a descriptive commit only after reviewing staged files. Do not push.
