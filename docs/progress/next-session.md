# Next session handoff

## Checkpoint (2026-11-02, Africa/Lagos)

Workspace `/Users/newuser/Documents/GitHub/inventory`, branch `develop`, committed HEAD `bb3ed64 the catalogue build` (branch ahead of origin by one). Current work is uncommitted and the worktree was clean at session start. Preserve all changes in this session and generated `apps/web/tsconfig.tsbuildinfo`; do not stage `.env` or secrets. Completed roadmap count remains **12/47**.

## Implemented this session

- INV-001: product-specific conversion list/create APIs and detail UI; per-product/unit uniqueness, strictly positive conversion factor, same-tenant product/unit references, no base-unit duplication, and base-unit changes rejected while conversions exist. Existing `/catalog` still manages categories/units.
- INV-002/003: product list/detail/create/edit/archive APIs, tenant-scoped search and pagination, normalized SKU/barcode uniqueness, Decimal money and currency validation, transactional audit events, UUID path validation, authenticated `/products` list/form and `/products/[productId]` details/conversion UI. UI states include loading, empty, error, search/filter/pagination. No browser/API runtime flow was verified.
- INV-005: additive StockMovement schema and migration `20261102143000_inventory_ledger_schema`, with tenant-composite warehouse/product/reversal references, actor membership reference, cost snapshot, document reference, nonzero quantity constraint, and trigger rejecting UPDATE/DELETE. Added tenant-scoped IdempotencyRecord and OutboxEvent tables. Migration is unapplied.
- INV-006: InventoryBalance schema and unapplied migration `20261102150000_inventory_balance_projection`; organization/warehouse-scoped balance and reconciliation reads; internal single-warehouse posting service for opening, receipt, sale fulfillment, and adjustment. It uses a row lock, strict reserve floor, weighted-average receipt costs, idempotency payload hash/replay/conflict, serialization retry, and atomic movement/balance/audit/outbox/idempotency transaction. Transfer batch posting and reservation flows remain outside this partial implementation.

## Verification and blockers

- Passed after changes: `npx prisma validate --schema apps/api/prisma/schema.prisma`, Prisma client generation, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `git diff --check`.
- Automated tests were not run under the accelerated-development instruction. Do not claim current product, ledger or balance behavior is test-verified.
- Current environment check: Docker socket permission denied; `pg_isready -h localhost -p 5433` reported no response; API readiness on port 4000 was connection-refused. New migrations are unapplied; no records were changed.
- INV-001/002/003 implementation is present but database integration and browser workflow remain unverified. INV-005 schema is present but migration/integrity verification is pending. INV-006 includes balance/reconciliation reads and an internal posting service, but its migrations and concurrency behavior are unverified; transfer-batch and reservation creation are still missing.
- No commit was created in this session. No unrelated changes existed at session start; generated build metadata changed during verification.

## Exact next steps

1. Restore/authorize local Docker/PostgreSQL access; inspect `inventory_dev` and migration history without resetting or deleting data.
2. Apply the additive migrations in order with the documented Prisma deploy workflow: `20261102113000_products_and_unit_conversions`, `20261102143000_inventory_ledger_schema`, `20261102150000_inventory_balance_projection`. Verify migration status/schema and preserve existing data.
3. Run minimal API smoke checks for product create/list/detail/edit/archive and conversion list/create; verify tenant isolation, duplicate conversion/SKU handling, and that stock movement UPDATE/DELETE is rejected. Record actual outcomes.
4. Verify INV-006 posting/reconciliation against PostgreSQL (including duplicate/reused key, negative available, cost currency, rollback, row-lock race, and ledger mismatch cases). Extend posting to atomic two-location transfer and reservations before claiming INV-006 complete.
5. Implement INV-007 adjustment draft/count/reason/post history and UI through the internal posting service. Continue in task-breakdown dependency order. Update progress docs after milestones; keep count at 12/47 until acceptance/verification requirements pass.
