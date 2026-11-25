# Next session checkpoint

**Updated:** 2026-11-25 (Africa/Lagos)

## Resume facts

- Repository `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; HEAD at session start `b97445d` (`update registrrry`). Changes are uncommitted; preserve them. No commit/push/deploy or database migration/reset/deletion occurred.
- Roadmap count **30/47**. No task newly completed. SALES-004, REPORT-002 and QUALITY-001 remain IN_PROGRESS; QUALITY-001 operational acceptance is NOT RUN.
- API readiness returned HTTP 200 and `/login` on port 3000 returned HTTP 200. Docker PostgreSQL/Redis/S3Mock are healthy. The API is running. The existing Next server on port 3000 responds; a second server start exited because the development lock is already owned. The existing process was left untouched. QA OWNER/org variables are still absent; no QA business data was created.

## Implemented since the previous checkpoint

- Fixed PO pagination and exact BigInt quantity matching in document-state recovery; validate manifest-recovered PO/SO identity before mutations; reject ambiguous/malformed/incomplete result sets and inherited registry properties.
- Split pick and fulfillment reconciliation; authoritative reloads after mutations resume a partially picked order correctly. Regression test simulates interruption after pick succeeds.
- Added nine NGN invoice/payment states using existing APIs and exact money verification (including gross/reversed/effective payments, balances, overdue/no-due-date and void).
- Added `multi-currency` NGN/USD flows and currency-separated report/aging/valuation reconciliation. Automatic conversion is not used.
- Added `financial-exports`, running the multi-currency source fixture and all four supported detail CSV types for each currency. It polls jobs, downloads through the API, parses CSV and compares IDs/currency/financial values to filtered report API pages.
- Registry selectors include `baseline`, `document-states`, `multi-currency`, `financial-exports`, and `authorization`. The authorization path probes configured roles, tenant and warehouse outcomes, but requires approved disposable `QA_AUTH_*` identities and IDs to run. Membership/grant revocation and export-download revocation remain uncovered. Manifest schema-v1 baseline compatibility is retained.
- Updated QA guide, quality acceptance record, purchase/sales reporting architecture, task ledger/master plan, current state, pending/blockers/completed summaries and session log.

## Evidence and checks

- Final `npm run qa:test`: **18/18 passed**.
- `npm test`: **60 API/shared and 2 web passed; 0 failed; 3 opt-in PostgreSQL suites skipped** in default invocation. The opt-in suites were individually run against randomized/isolated test scopes: auth/org **10/10**, inventory/procurement/sales/report **13/13**, invoice/report **3/3** (26/26 total, no skipped tests).
- `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`, `npm run db:validate --workspace=@inventory/api`, and `git diff --check` passed. Default `npm test`: **60 API/shared and 2 web passed; 0 failed; 3 opt-in PostgreSQL suites skipped**.
- Compose services are healthy. API readiness: **HTTP 200**, development fingerprint present. Existing web at port 3000 `/login`: **HTTP 200**. A second Next dev-server attempt exited because the existing process owns the development lock on port 3000; the existing server was left untouched.
- QA settings absent: `NODE_ENV`, `QA_ENVIRONMENT`, `QA_API_BASE_URL`, `QA_ORGANIZATION_ID`, `QA_ORGANIZATION_NAME`, `QA_EMAIL`, `QA_PASSWORD`, and all required `QA_AUTH_*` actor/fixture IDs. Values were not printed; no credentials were created/changed. No live QA scenario, report export, authenticated browser financial workflow, browser file capture or EXPLAIN was run.
- Prisma validation passed. Read-only `npx prisma migrate status --config prisma.config.ts` reports **22 migrations found; database schema is up to date**. No migration was applied. Production build generated 29 routes successfully.

## Exact next steps

1. Inspect `git status` and changed source/document diffs; preserve all uncommitted changes. Do not commit or push.
2. Configure the explicitly approved development QA OWNER identity in ignored `.env` without printing values or changing credentials. If unavailable, do not mutate QA business data.
3. Run `QA_SCENARIO=authorization npm run qa:seed` with separately configured approved disposable identities/IDs (`QA_AUTH_*`) and verify/replay it. Then add isolated integration coverage for membership/grant revocation and export-download authorization. Do not revoke real users or weaken the OWNER mutation gate. Cross-currency payment allocation is not directly testable because payment currency is inherited from its invoice.
4. When the approved QA organization and OWNER values are present, run `QA_SCENARIO=document-states npm run qa:seed`, record the run ID, then matching `qa:verify` and `qa:resume`; reconcile documents, payments/reversals and inventory movements/balances.
5. Run and verify `QA_SCENARIO=multi-currency npm run qa:seed` and `QA_SCENARIO=financial-exports npm run qa:seed`; record currency totals, export IDs/statuses, downloaded CSV rows and resume behavior. Do not treat mocked tests as live evidence.
6. Complete authenticated SALES-004 and REPORT-002 browser workflows, role/tenant/warehouse denial checks, verified file downloads and disposable-schema EXPLAIN measurements. Only afterward execute `COMPLETE_INVENTORY_BUSINESS_LIFECYCLE` for QUALITY-001.
7. Recalculate progress from task entries; keep **30/47** until every task acceptance condition passes, then update these progress notes with exact evidence. No commits or pushes requested.
