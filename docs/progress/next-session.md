# Next session handoff

## Checkpoint — 2026-11-06 (Africa/Lagos)

Workspace `/Users/newuser/Documents/GitHub/inventory`, branch `develop`, start HEAD `5d098bf update the plan` (equal to `origin/develop`). The worktree now contains this session's INV-007 implementation, migration, tests and progress edits. Preserve all changes; do not stage generated `apps/web/tsconfig.tsbuildinfo` or `.env`. Roadmap is **12/47 completed**; INV-007 is in progress.

## Delivered in this session

- Confirmed the prior migrations were applied and database is available, then implemented initial INV-007 physical stock count workflow.
- Added `StockAdjustment` / `StockAdjustmentStatus` schema and additive migration `20261106160000_stock_adjustments`; applied successfully to `inventory_dev`.
- Added `CreateStockAdjustmentDto`, `StockAdjustmentsService`, and routes for listing, recording a physical count, and posting variance. The count captures current on-hand, validates product base-unit precision and reason, and audits the draft. Posting derives a stable idempotency key and, inside the ledger posting transaction, checks the count snapshot still matches the locked balance before atomically writing movement/projection/audit/outbox/idempotency and posted document state.
- Added authenticated `/inventory` UI with warehouse/product selection, count entry, exact-decimal variance display, draft/history list, and post action. Sidebar now links Inventory counts and duplicate Products nav entry was removed.
- Added unit tests for tenant-scoped draft/snapshot/audit, precision rejection, and posting payload/key. These are not database transaction tests.

## Verification results

- Applied migration `20261106160000_stock_adjustments` using `npm run db:migrate:deploy --workspace=@inventory/api`.
- `npm run db:validate --workspace=@inventory/api`, Prisma client generation, `npm run typecheck`, `npm run lint`, `npm run format:check`: passed.
- `npm test`: 35 passed, 0 failed, 1 opt-in PostgreSQL suite skipped. Elevated run was required because the test API listener gets `EPERM` in sandbox.
- `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/postgres.integration.test.mjs`: 10 passed, 0 failed. This suite does not exercise inventory postings or the new adjustment workflow.
- After the final exact-decimal variance refactor, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, and `git diff --check` all passed. Generated `apps/web/tsconfig.tsbuildinfo` was restored to HEAD.
- Started `npm run dev:api`; Nest mapped all adjustment routes and `/api/v1/health/ready` returned HTTP 200. Authenticated product/adjustment calls and browser workflow remain untested.
- No roadmap task marked complete and no commit/push made.

## Exact next steps

1. Add isolated PostgreSQL integration coverage for adjustment create/post/replay, stale count rejection, reserved-stock floor, transaction rollback, audit/outbox writes, warehouse and tenant scope, and immutable movement updates. Use unique test-owned data and safe cleanup; stock ledger rows are append-only, so do not leave fixture movements in the user's primary database. If safe cleanup cannot be guaranteed, use a disposable test schema/database.
2. Add real database posting tests for INV-006 and product CRUD/conversions; existing 10/10 opt-in tests only cover auth/org/location/catalog-unit basics. Reconcile balances to movement totals and verify idempotent replay/conflict.
3. Run authenticated API and Chrome workflows for product → opening/receipt balance → count → variance post → reconciliation. Record each actual result.
4. Finish INV-007, then continue inventory reservations and the INV-008 transfer lifecycle in roadmap dependency order. PROCUREMENT-001 supplier directory is also dependency-ready per task breakdown; move to purchase orders/receiving once the required inventory posting foundation is verified. Then implement sales customer/orders/fulfillment.
5. Update current-state, task-breakdown, completed-tasks (only if legitimately complete), and session-log at each milestone. Do not inflate 12/47. Inspect `git status`; commit only a coherent verified milestone and never push without authorization.

## Open gates

- INV-001/002/003/005/006 integration acceptance remains incomplete; INV-007 is partial.
- Reservations, transfer posting, movement-history interface and authenticated browser checks are missing.
- DEC-007 costing and open PROD-002/ARCH-002 choices remain provisional/unapproved where documented.
- API dev process was restarted after the final build and remained healthy at final check; verify it remains running before using the UI.
