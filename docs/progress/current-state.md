# Current state

**Updated:** 2026-11-24 (Africa/Lagos)

## Repository and roadmap

- Repository: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; HEAD `4079799` (`update the inventory`). Worktree was clean at session start. No source files were changed, and no commit, push, deployment, migration application, database reset, or data deletion was performed.
- Completed tasks: **30/47**, counted from individual ledger entries. No task newly completed. SALES-004 and REPORT-002 remain IN_PROGRESS; QUALITY-001 remains NOT_STARTED because REPORT-002 is unfinished.
- Local `inventory_dev` PostgreSQL at `localhost:5433` is reachable. Read-only Prisma status: 22 migrations found, schema up to date. Prisma schema validation passed.

## Work and evidence this session

- Extended business-report DTO contract coverage for combined date, branch, warehouse, customer, supplier, product, category, currency, status, search, sorting, and pagination filters, including invalid enum/date/page-size checks.
- Expanded disposable PostgreSQL report fixtures and assertions for branch/warehouse/date/category/product/customer/supplier/currency/status/search filtering, stable pagination, currency-separated results, and denial for foreign-tenant resources and an ungranted warehouse. Added branch/warehouse/date filters to receivables-aging acceptance.
- Improved the authenticated reports page with branch/status/sort filters and detailed CSV queue, history polling, and download actions. Reports page now fetches active branches alongside warehouses and passes supported filters to the API/export.
- Authenticated Chrome on `http://localhost:3002/reports/business`: viewed all seven report views; exercised branch, warehouse, date, currency, search, status, and sorting controls; confirmed normal empty states for this test workspace. Queued a filtered product-sales CSV; UI showed job completion with zero rows, expected for this empty report dataset. The authenticated download route returned HTTP 200 in API logs, but browser download event/file capture was not confirmed. The workspace had no sales order/invoice/payment data, so SALES-004 UI acceptance could not be exercised.
- A temporary product was created in the workspace during UI exploration; its stock-count document remains DRAFT/unposted. No inventory movement was posted. Keep this test artifact in mind when using the QA workspace; do not infer on-hand stock from it.

## Verification results

- Earlier complete three-suite opt-in PostgreSQL run: **26 passed, 0 failed, 0 skipped**, isolated disposable schemas. A narrower run after the current report filter tests across `inventory.postgres.integration.test.mjs` and `sales-invoices.postgres.integration.test.mjs` passed **16, 0 failed, 0 skipped**.
- A subsequent attempt to rerun all three opt-in suites stalled without output; it was interrupted. Node reported the inventory test file still pending; this interrupted attempt is **not** a pass and does not supersede the two completed results above.
- Default `npm test`: API/shared **59 passed, 0 failed, 3 opt-in PostgreSQL skipped**; web **2 passed, 0 failed**.
- Passed after implementation: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build` (Next Webpack production build; 29 routes), and `npm run db:validate --workspace=@inventory/api`.
- Read-only `npx prisma migrate status --config prisma.config.ts`: **22 migrations found; schema up to date**.
- This session reran `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/inventory.postgres.integration.test.mjs apps/api/test/sales-invoices.postgres.integration.test.mjs`: **16 passed, 0 failed, 0 skipped** in 61.5 seconds against isolated PostgreSQL schemas. The sandboxed attempt first failed with local socket `EPERM`; the authorized local-DB rerun passed.
- This session reran `npm test`: API/shared **59 passed, 0 failed, 3 opt-in PostgreSQL skipped**; web **2 passed, 0 failed**. Also passed `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run db:validate --workspace=@inventory/api`, `npm run build`, and read-only migration status (22/22 current).
- A final readiness probe to `http://127.0.0.1:4000/api/v1/health/ready` returned HTTP 000 because the API process was no longer listening at that moment. Do not describe the API as currently running; an earlier probe in this session returned HTTP 200.
- Current-session browser review confirmed the authenticated QA workspace and empty Suppliers list. It did not create or alter business records. The earlier browser report review and its limitations remain as recorded above.

## Task status and remaining gaps

- **SALES-004 — IN_PROGRESS:** Database and authenticated API/controller acceptance passes, including PDF and accounting edge cases. Invoice/payment/PDF/customer-history browser flow remains unverified because the QA workspace has no eligible sales/invoice/payment records.
- **REPORT-002 — IN_PROGRESS:** APIs, UI and export work are implemented. Isolated database evidence covers sales and purchasing metrics, CSV workers, reversals and aging. Current browser exercised filters and export queue, but no-row results limit data assertions and download file capture remains unconfirmed. Still required: complete filter/security matrix, multi-currency pagination (including purchasing and exports), representative `EXPLAIN ANALYZE` performance evidence, and restricted role/organization UI checks.
- **QUALITY-001 — NOT_STARTED:** Do not begin the end-to-end operational scenario until REPORT-002 acceptance and dependencies are complete. A preparation-only scenario is in `docs/operations/quality-001-acceptance.md`; no QUALITY-001 test has been run.
- Completed task count remains **30/47**. No task was marked complete based on UI/build evidence alone.

## Runtime and constraints

- Local Postgres, Redis and S3Mock were available to completed isolated tests. The QA browser was available on port 3002; API readiness was unavailable on port 4000 at final recheck. Port 3000 was left untouched.
- No schema migration was needed for this session's changes. No existing database data was reset or deleted.
- No commit or push. Registry audit and broader release/security gaps remain recorded in `docs/progress/blockers.md`.
