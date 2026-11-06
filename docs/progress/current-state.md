# Current state

**Updated:** 2026-11-06 (Africa/Lagos) — PROCUREMENT-001 supplier directory implemented; verification in progress

## Repository and roadmap

- Workspace: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; supplier implementation is committed in `2185c43` based on `d09a2b9`. A documentation checkpoint commit follows it. No push. Worktree is clean.
- Roadmap: **14/47 completed**. INV-005/006 are complete. INV-001/002/003/007 and PROCUREMENT-001 remain IN_PROGRESS; other tasks are as recorded in `docs/implementation/task-breakdown.md`.
- Work this execution adds supplier schema/service/controller/UI, an additive migration, test schema isolation support, integration and DTO validation tests, and API documentation. Do not discard uncommitted changes.

## Database and test-data audit

- Applied `20261106190000_supplier_directory` to local `inventory_dev` with `npm run db:migrate:deploy --workspace=@inventory/api`. This migration only creates the supplier table/indexes/check/FK. No reset or deletion. `npx prisma migrate status --config prisma.config.ts` reports all 10 migrations applied.
- Corrected the inventory PostgreSQL suite isolation. `?schema=` alone did not select the schema for Prisma's PostgreSQL driver adapter. `PrismaService` now supports the adapter's explicit `schema` option through `DATABASE_SCHEMA`; the suite also sets PostgreSQL `search_path` and asserts `current_schema()` before seeding. The corrected suite passed and dropped its generated schema.
- **Data preservation issue:** before the isolation fix, earlier inventory integration test runs inserted synthetic fixtures into `inventory_dev.public`. A read-only audit found 12 organizations/memberships named with the suite's `tenant-a`/`tenant-b` fixture pattern, 9 branches, 5 warehouses, 15 units, 20 products, 25 stock movements, and 104 audit events attached to those organizations. These are generated test fixtures; no cleanup/deletion was performed because existing records must be preserved. The most recent isolated run did not add to those public-schema counts. Treat those rows as retained test data; do not delete them without explicit approval.
- Earlier notes claiming no owner-database changes from all inventory integration runs were inaccurate; this correction is recorded in `docs/progress/session-log.md`.

## Implemented functionality

- INV-005/006: immutable ledger, transactional posting and reconciliation verified by the correctly isolated PostgreSQL suite; completed count remains 14/47.
- INV-007: count draft/post/history and movement history are implemented; remains IN_PROGRESS pending adjustment scope-denial assertions and authenticated browser workflow.
- PROCUREMENT-001: Supplier model with tenant-composite ownership and normalized tenant-unique name; validated contact/email/phone/website/address/country fields and terms notes; audited create/update/archive, tenant-scoped read/search/pagination/detail/audit history; procurement capability guards; Next.js directory with create/edit, archive, active/archived filters, search, pagination, detail and history. Supplier migration is applied to `inventory_dev`.
- Not implemented: purchase orders, goods receipts, inventory transfers, and sales reservation lifecycle.

## Verification

- `npm run db:validate --workspace=@inventory/api`: passed.
- `npx prisma migrate status --config prisma.config.ts`: 10 migrations found; schema up to date.
- `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/inventory.postgres.integration.test.mjs`: 6 passed, 0 failed, using a generated schema with a runtime schema assertion and cleanup.
- `npm test`: 37 passed, 0 failed, 2 opt-in PostgreSQL suites skipped. Elevated permission was required for the temporary API listener.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, and `git diff --check`: passed.
- Local API started; readiness returned HTTP 200 and unauthenticated supplier list returned HTTP 401. Next.js `/suppliers` returned HTTP 200. Chrome rendered the suppliers empty state without an active workspace, then redirected `/organizations` to login; supplier create/edit/archive browser workflow was not verified.

## Exact next steps

1. Use an authenticated owner/buyer browser session to verify supplier creation, search, detail/audit history, edit, archive, and archived filter. Do not create or remove accounts solely to fabricate a browser result.
2. Keep PROCUREMENT-001 IN_PROGRESS until interactive workflow is verified; the PostgreSQL service-level lifecycle, tenant denial, uniqueness, audit, and DTO validation checks already pass.
3. PROCUREMENT-002 depends on PROCUREMENT-001 and INV-003. Resolve INV-003's remaining authenticated browser/API acceptance, then implement purchase order draft/submit/cancel without taxes or approval rules not in the roadmap.
4. Implement PROCUREMENT-003 goods receiving through `InventoryPostingService` with transaction/idempotency, partial receiving, audit/outbox, and PostgreSQL concurrency/rollback tests. Do not update balances directly.
5. INV-008 remains dependency-ready and unimplemented; reservations are part of SALES-002 after SALES-001. Continue according to user priority and the roadmap.
