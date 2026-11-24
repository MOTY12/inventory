# Current state

**Updated:** 2026-11-24 (Africa/Lagos)

## Repository and roadmap

- Repository: `/Users/newuser/Documents/GitHub/inventory`, branch `develop`; session-start HEAD `f68d85b` (`Update the report`). No commit, push or deployment was made this session. Changes listed in `next-session.md` remain uncommitted.
- Completed task count remains **30/47**. `SALES-004` and `REPORT-002` are IN_PROGRESS and are not counted complete. The count is from individual task entries.
- Local database: `inventory_dev` on localhost:5433. Additive migration `20261124150000_business_performance_exports` was applied using `npm run db:migrate:deploy --workspace=@inventory/api`; it only adds four enum values. Prisma reports **22 migrations found, schema up to date**. No reset or business-record deletion occurred.

## Work this session

- Added paginated business analytics endpoints:
  - `GET /api/v1/organizations/current/reports/sales/products`
  - `GET /api/v1/organizations/current/reports/sales/customers`
  - `GET /api/v1/organizations/current/reports/purchases/products`
  - `GET /api/v1/organizations/current/reports/purchases/suppliers`
- Aggregations separate order lines, issued invoice lines, payments and receipt lines before joining, keep monetary rows separated by currency and quantity rows separated by unit code, and use deterministic sort tie-breakers with bounded pagination. Resource filters are organization-validated; warehouse grants and branch scope constrain report queries. Customer outstanding/overdue values are explicitly current-state. Supplier outstanding order value is not payable.
- Product sales report exposes order/fulfilled/invoiced quantities, order counts/values, issued invoice value, discounts and tax. Customer report exposes order-state counts, order/invoice value, effective payments after reversal, current outstanding/overdue and last order date. Product purchasing exposes ordered/received/outstanding quantities and values. Supplier report exposes PO state counts and ordered/received/outstanding values.
- Extended the Business Reports UI with detail views, currency/search filters and paging controls; dashboard requests finance summaries only for roles with `finance:read` and shows currency-separated invoice, collection, receivable, overdue and PO indicators. Chrome opened the authenticated app on port 3002 and rendered Sales & Purchasing, product sales, product purchasing and supplier analytics with live rows. This verifies the report page data rendering, not filter permutations, export downloads or SALES-004 workflow actions.
- Added four detailed CSV types to the existing export worker: `SALES_PRODUCTS`, `SALES_CUSTOMERS`, `PURCHASE_PRODUCTS`, `PURCHASE_SUPPLIERS`. They use existing bounded service paging, CSV sanitation, private storage and export lifecycle. Financial export queue/process/download authorization now also checks `finance:read`. Detailed worker value reconciliation and revocation integration for these new types remains pending.
- The explicit PG test revealed SQL aggregate counts serialize as `bigint`; converted report row bigints to JSON numbers while keeping exact decimal fields intact. Added a safe server-side error log for unexpected exceptions without exposing internals in the HTTP error envelope.
- SALES-004 whitespace-only void/reversal reason checks and existing isolated DB/API acceptance work remain in place; browser acceptance is still unverified.

## Verification evidence

- `npm test`: **59 API/shared passed, 0 failed, 3 opt-in PostgreSQL suites skipped**; web **2 passed, 0 failed**.
- `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/inventory.postgres.integration.test.mjs apps/api/test/postgres.integration.test.mjs apps/api/test/sales-invoices.postgres.integration.test.mjs`: final explicit run **26 passed, 0 failed, 0 skipped** against disposable schemas. Includes SALES-004 DB/API cases, exact sales product quantity/tax, summary/trends/aging, all detail report routes, finance-role denials and new export enqueue permission checks. Purchase analytics routes have empty purchase fixtures; exact populated purchase/receipt reconciliation remains unverified.
- Passed: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run db:validate --workspace=@inventory/api`, API build, root `npm run build` (Next Webpack production build, 29 routes), and final `git diff --check`.
- Local API readiness returned HTTP 200. Stockroom web returned HTTP 200 on port 3002 and was inspected in Chrome. Port 3000 was occupied by a separate “Hello World!” app and was not touched.
- Migration status after applying the additive migration: **22/22 up to date**. Migration applied locally without reset/deletion.
- Browser report-page rendering was observed, but authenticated SALES-004 invoice/payment/PDF/customer-history workflow, detailed filter behavior and export downloads were not exercised. Export worker/storage reconciliation for the new financial types, report-specific non-empty purchasing fixtures, aging-boundary fixture run or EXPLAIN ANALYZE evidence remain open. `npm audit` remains blocked by registry DNS (`ENOTFOUND`).

## Remaining task status

- **SALES-004 — IN_PROGRESS:** database and authenticated HTTP acceptance passed; authenticated interactive invoice/payment/PDF/customer-history/tax/organization-switch browser workflow remains open. No completion claim.
- **REPORT-002 — IN_PROGRESS:** summary/trend/aging and four paginated detail APIs plus first UI/dashboard/export support are implemented. Full purchase receipt/supplier and payment/reversal fixtures, full filter/security matrix, export worker reconciliation, performance query plans, and authenticated browser acceptance remain. No completion claim.
- Completed task count remains **30/47**; no task was newly completed.
