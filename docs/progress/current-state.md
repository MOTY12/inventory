# Current state

**Updated:** 2026-11-24 (Africa/Lagos)

## Repository and roadmap

- Repository: `/Users/newuser/Documents/GitHub/inventory`, branch `develop`, base HEAD at session start `8f07388` (`payment integration implemented`). Existing SALES-004 changes were present and preserved. This session has uncommitted SALES-004 tests/hardening and REPORT-002 code/docs; no commit, push or deployment was made.
- Roadmap count: **30/47 complete**, recalculated from task entries. SALES-004 and REPORT-002 remain IN_PROGRESS and are not counted complete. SALES-004 acceptance implementation/database/API checks now pass, but the attached brief's interactive browser workflow was not run because the available Chrome/IAB tabs did not have the local inventory app running. REPORT-002 is a partial implementation slice.
- SALES-004 migration `20261124120000_sales_invoices_payments` was applied in the existing local DB by the preceding session, additively; no reset/deletion. Latest documented migration count is 21/21. REPORT-002 required no schema migration.

## SALES-004 acceptance completed in this session

- Strengthened void and payment reversal reason checks to reject whitespace-only values at DTO and service boundaries.
- Expanded isolated PostgreSQL acceptance to cover sequential numbering under concurrent issuance across orders, organization-local sequences and no reuse; unpaid versus paid/partial void rules, required reason and idempotent void; tax snapshot preservation after rate edit/deactivation and rejection of inactive/cross-tenant rates; reversal replay/conflict/duplicate prevention; direct DB invoice/line/payment immutability, cross-tenant FK and allocation-overpayment trigger; authenticated live HTTP routes, DTO validation, OpenAPI, role/warehouse/tenant denial, PDF, customer summary and no inventory mutation.
- `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/sales-invoices.postgres.integration.test.mjs`: **3 passed, 0 failed, 0 skipped** against a unique temporary schema; cleanup is performed by the test. This run also exercised REPORT-002 sales/purchase/aging API queries and finance-role denial.
- Browser workflow remains unverified. Available browser state showed unrelated tabs and an inventory verify-email URL that could not be reached; no local UI session was opened. No browser acceptance is claimed.

## REPORT-002 implementation slice

- Added organization- and warehouse-scoped APIs for sales summary (order status/value, issued invoices, effective/reversed payments and current receivables), purchasing summary (PO status/value, received value and outstanding quantity/value), receivable aging by currency, and daily/weekly/monthly sales and purchase trends.
- Monetary totals remain grouped by currency and use PostgreSQL `numeric`; current receivable values are labeled current-state. Draft/void invoices are excluded, reversed payments do not count as collections, no-due-date invoices are identified separately, and outstanding PO amount is explicitly not supplier payable.
- Financial report endpoints require `reports:read` and `finance:read`; links are hidden for roles without finance access. Added validated date/currency/status filters, endpoint OpenAPI/auth contract checks, a live-data responsive report page, and metric definitions in `docs/architecture/purchase-sales-reporting.md`.
- A serialization defect from SQL `bigint` counts was found by the integration test and fixed by mapping count fields to JSON numbers. The final 3/3 isolated suite passed after the fix.
- REPORT-002 is not complete: product/customer/supplier performance reports, aging boundary fixtures, full filter matrix, CSV export integration, deterministic purchase/report fixtures, performance query evidence, and browser UAT remain.

## Verification status

- `npm test`: **59 API/shared passed, 0 failed, 3 opt-in PostgreSQL suites skipped**, plus **2 web tests passed**. The SALES-004/REPORT-002 opt-in suite was run explicitly: **3 passed, 0 failed, 0 skipped** against an isolated schema; authenticated summary, trends, aging and purchase endpoints passed, as did restricted-role denial.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run db:validate --workspace=@inventory/api`, and `git diff --check` passed after final edits. Generated Next artifacts were restored to their original HEAD content.
- Read-only migration status: **21 migrations found; database schema up to date** at `inventory_dev` on `localhost:5433`. No migration was added or applied this session.
- Do not infer full task acceptance from these checks: browser flow and remaining REPORT-002 breadth are outstanding. npm audit remains blocked by prior registry DNS (`ENOTFOUND`).

## Exact next work

1. Start the local application and execute the authenticated browser invoice/payment/PDF/history workflow plus new report UI acceptance; the available browser had no live local Stockroom instance.
2. Add paginated product/customer/supplier performance APIs with per-currency totals and unit-aware quantity grouping.
3. Add receivable aging boundary and resource/status/filter/security integration fixtures; add export types using REPORT-003 authorization and bounded paging.
4. Inspect representative query plans and test multi-currency, canceled/partial/full order and receipt fixtures.
5. Re-run the quality and isolated integration checks after code changes.
6. Update task statuses and checkpoint. Keep SALES-004 IN_PROGRESS until browser acceptance is completed; keep REPORT-002 IN_PROGRESS until its full acceptance and dependencies are verified. Do not increase 30/47 without that evidence.
