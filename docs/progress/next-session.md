# Next session checkpoint

**Updated:** 2026-11-25 (Africa/Lagos)

## Resume facts

- Repository `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; HEAD at UI session start `0493aab` (`update the pending task`). UI changes are uncommitted; preserve them with any later QA work. No commit/push/deploy or database migration/reset/deletion occurred.
- Roadmap count **30/47**. No task newly completed. SALES-004, REPORT-002 and QUALITY-001 remain IN_PROGRESS; QUALITY-001 operational acceptance is NOT RUN.
- API readiness returned HTTP 200 and `/login` on port 3000 returned HTTP 200. Docker PostgreSQL/Redis/S3Mock are healthy. The API is running. The existing Next server on port 3000 responds; a second server start exited because the development lock is already owned. The existing process was left untouched. QA OWNER/org variables are still absent; no QA business data was created.

## Current UI redesign checkpoint

- Initial design tokens and shared `PageHeader`, `DataTable`, `StatusBadge`, `Drawer` and `ConfirmDialog` are implemented.
- Customers and Suppliers directory pages now share the list pattern, use debounced server-side search and grouped create/edit forms in a drawer. Backend APIs and request payloads are unchanged. Supplier archive confirmation is implemented but not browser-tested.
- Shell/user-facing routes display “Business” where appropriate. Full application redesign is not complete; 34 routes are inventoried in `docs/design/ui-ux-audit.md`, and all routes besides Customers and Suppliers still need detailed review/adoption.
- Browser showed populated customer/supplier lists at desktop size. Customer list at 390×844 had no page-level overflow (document width equaled viewport); table content scrolls in its own region. Initial mobile form review exposed a cramped layout, corrected by moving the form to the shared drawer and applying one column on mobile. The browser returned to sign-in during hot reload, so the corrected drawer, form actions and supplier confirmation remain unverified. One transient customer Unauthorized alert disappeared on route revisit; investigate before acceptance.
- No before/after screenshots were saved as files. No records, credentials, API policy or database changes were made.
- Final checks after the last UI source/CSS update passed: typecheck, lint, format check, default tests, production build (29 routes) and diff check. Default tests had 3 opt-in PostgreSQL skips; UI-specific component tests were not added. Backend roadmap stays **30/47**; UI progress does not affect task count.

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

1. Inspect `git status` and changed source/document diffs; preserve all UI changes. Do not commit or push.
2. Final checks are recorded in `docs/design/ui-acceptance-results.md`: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build`, and `git diff --check` passed. Rerun them after any code changes.
3. With the approved development account available, visually recheck `/customers` and `/suppliers` at desktop and 390px after hot reload. Check drawer layout, form open/cancel/validation, supplier archive-dialog cancel, keyboard focus and role-aware actions without submitting or archiving business records. Investigate the transient customer Unauthorized banner using browser diagnostics.
4. Save screenshots in a gitignored QA evidence directory if the local browser runtime can export them; capture a populated desktop list and mobile list/drawer. Record evidence paths and viewport sizes.
5. Continue Phase 2 with Products and Categories/Units: review actual route/API behavior, adopt shared UI, verify existing business behavior, then update the route matrix.
6. Continue Branches/Warehouses, then inventory operations and transactions in dependency order. Preserve backend authorization and do not mark pages accepted from build output alone.
7. Keep backend roadmap progress **30/47** until individual acceptance criteria pass. Track redesign separately in `docs/design/ui-redesign-progress.md`.
8. Resume pending QA financial and authorization scenarios only when approved OWNER, organization and actor settings are available; never print credentials or mutate unapproved business data.
