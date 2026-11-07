# Current state

**Updated:** 2026-11-07 (Africa/Lagos) — Procurement 002/003 implementation and verification in progress

## Repository and roadmap

- Workspace: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; current HEAD is `86789bd` (`update the supplier`) and the local `origin/develop` ref points to it. This execution did not push. That commit includes the procurement service/migration/UI/tests, but inspection found its Prisma model declarations missing; the declarations have been restored locally and await a focused fix commit.
- Roadmap: **14/47 completed**. INV-005/006 are complete. INV-001/002/003/007 and PROCUREMENT-001/002/003 remain IN_PROGRESS; other tasks are in `docs/implementation/task-breakdown.md`.
- Current changes add PO/receipt schema, migration, service/controller/DTOs, transaction-composable inventory posting, frontend workflows, integration/DTO tests, and progress/API docs.

## Database and test-data audit

- `20261106190000_supplier_directory` and `20261106214440_procurement_orders_and_receipts` are applied to local `inventory_dev`. The procurement migration is additive: new sequence, PO/line and receipt/line tables, indexes, tenant-composite FKs, and currency/quantity/cost checks. No reset or deletion. Prisma reports all 11 migrations current.
- Corrected the inventory PostgreSQL suite isolation. `?schema=` alone did not select the Prisma PostgreSQL adapter query schema. `PrismaService` accepts `DATABASE_SCHEMA`; integration tests also set PostgreSQL `search_path` and assert `current_schema()` before fixture writes.
- **Data preservation issue:** earlier suite runs before the isolation fix inserted generated fixtures into `inventory_dev.public`: 12 tenant-a/tenant-b organizations/memberships, 9 branches, 5 warehouses, 15 units, 20 products, 25 stock movements, and 104 audit events. No cleanup/deletion occurred. Treat those rows as retained data; do not modify them without explicit approval. Current integration runs use a generated temporary schema and clean up only that schema.
- Earlier claims that all test runs left the owner database untouched were inaccurate; correction remains recorded in `docs/progress/session-log.md`.

## Implemented functionality

- INV-005/006: immutable ledger, transactional posting, reconciliation and weighted-average costing verified; completed count remains 14/47.
- INV-007: count draft/post/history and movement history implemented; IN_PROGRESS pending adjustment scope denial checks and authenticated browser workflow.
- PROCUREMENT-001: supplier model/API/UI with tenant uniqueness, contact validation, CRUD/search/pagination/archive, audit history and capability guards. Service-level PostgreSQL acceptance passes; authenticated browser workflow pending.
- PROCUREMENT-002 (IN_PROGRESS): PO draft create/edit, atomic tenant-scoped numbering, Decimal line/total calculations, product-unit conversion/cost snapshots, supplier/warehouse validation, warehouse-scoped search/status/pagination/detail, submit/cancel transitions, audit events, and `/purchase-orders` list/create/detail/edit UI.
- PROCUREMENT-003 (IN_PROGRESS): partial/full goods receipts and history; PO row locking and over-receive prevention; transaction-composable `InventoryPostingService`; idempotent retries; stock ledger/balance/weighted-average cost, audit and outbox committed atomically; responsive receiving interface.
- Not implemented: warehouse transfers and sales reservation lifecycle.

## Verification

- `npm run db:validate --workspace=@inventory/api`: passed.
- Migration deploy applied the additive procurement migration. `npx prisma migrate status --config prisma.config.ts`: 11 migrations current.
- Latest isolated `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/inventory.postgres.integration.test.mjs`: 7 reported tests passed, 0 failed. Scenarios include product/supplier lifecycle and tenant denial; PO draft edit/submit/cancel; receipt partial/full/replay/over-receive/concurrency; rollback on receipt-outbox failure; balance, movement, cost and audit/outbox consistency. Generated schema asserted and dropped.
- Final `npm test`: 40 passed, 0 failed, 2 opt-in PostgreSQL suites skipped. The dedicated isolated PostgreSQL suite was separately rerun after schema reconciliation: 7 reported tests passed, 0 failed.
- Final `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run db:validate --workspace=@inventory/api`, `npx prisma migrate status --config prisma.config.ts`, and `git diff --check` passed. Production Next.js build includes both purchase order routes.
- Chrome currently has no authenticated Stockroom session (tab at `/login`). Supplier, product, and purchasing authenticated browser workflows are unverified.

## Exact next steps

1. Run final `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run db:validate --workspace=@inventory/api`, `npx prisma migrate status --config prisma.config.ts`, and `git diff --check`.
2. Use an existing authenticated owner/buyer session to verify supplier/product/PO workflows in Chrome, including PO draft edit/submit/cancel, partial/full receive and resulting balances. Do not create or remove accounts solely to fabricate browser acceptance.
3. Keep PROCUREMENT-001/002/003 and INV-003 IN_PROGRESS until remaining authenticated API/browser and permission checks pass.
4. Commit the missing Prisma model declaration reconciliation with a focused message after reviewing the final diff; do not push.
5. After P002/P003 acceptance, continue with dependency-ready INV-008 warehouse transfers. Reservation lifecycle belongs to SALES-002 after SALES-001, INV-006 and ARCH-001.
