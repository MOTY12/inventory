# Current state

**Updated:** 2026-11-23 (Africa/Lagos)

## Repository and roadmap

- Workspace: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; this session started at `ae44aea` with a clean worktree. No pre-existing changes were overwritten.
- Completed task count: **28/47**, computed from the 47 unique ledger entries. REPORT-001 is complete; INV-010 is the current in-progress task. See `docs/implementation/task-breakdown.md` for statuses.
- No application migration was required for reports or barcode lookup. Local PostgreSQL reports 19 migrations found and schema up to date. No reset, data deletion, or production operation occurred.
- Next.js and eslint-config-next were updated from 16.4.3 to 16.4.6 after verifying the compatible patched version and successful production build. `npm audit --omit=dev` could not reach the npm advisory endpoint (`ENOTFOUND registry.npmjs.org`), so no audit result is claimed.

## UI/UX redesign — shared system and first module pass (2026-11-23)

- Reorganized the workspace navigation into existing product areas, moved organization selection to the topbar, and added an account menu with identity, role, and sign-out. Organization switching and session behavior remain on their existing APIs.
- Added centralized design tokens and responsive shared styles for the app shell, page headings, cards, forms, tables, controls, and semantic status colors. These styles apply across the current modules. Individual page-by-page workflow redesign remains incomplete.
- Dashboard reads inventory value grouped by currency, exact pending purchase/sales order counts for accessible areas, and warehouse total from existing APIs. Purchasing and sales requests respect the active role so restricted endpoints do not fail the entire dashboard.
- Products page review found pagination controls repeated inside every product row; moved them into a single accessible pagination nav after the table. The list count now uses filtered total results, loading is announced as a status, and roles already allowed to edit products see default cost/sale price in the list. No API or authorization policy changed.
- Product details now have retry/unavailable states, clear archive/read-only messaging, and a useful state when all conversions are configured. Inventory counts now show on-hand, reserved, available and in-transit balances separately with exact-decimal availability, warehouse pagination, role-gated posting, and a posting confirmation. Organization changes clear stale product and warehouse IDs.
- Reorder evaluation and transfer controls are role-aware. Transfer receipt arithmetic now uses scaled integers, validates the received amount, preserves an idempotency key for a retried identical receipt, and confirms dispatch/cancellation. Transfer list loading/empty/filter/pagination states were clarified.
- Purchasing list adds retry/loading/filter-aware empty states and uppercase currency validation. Sales list explains partially fulfilled lines and uses named pagination navigation. No backend, API, schema, or migration changes.
- Catalog/category/unit listings now display API totals rather than just the current page and include retryable errors. Supplier and customer lists have explicit workspace/loading/error/empty states and accessible pagination/details controls; catalog and customer/supplier requests ignore stale responses after workspace/filter changes, and customer detail clears data on workspace changes and distinguishes loading from unavailable. No API or authorization policy changed.
- Purchase-order detail now has workspace-safe loading, retry and unavailable states; receiving filters and bounds quantities using exact decimal helpers against outstanding amounts, and cancellation confirms before acting. No backend behavior changed.
- Sales-order detail now resets across workspace changes and discards stale responses, shows retryable loading/error/unavailable states, validates all entered pick/fulfillment quantities against exact per-line limits, ties retry idempotency keys to identical payloads, and confirms fulfillment before posting. No backend behavior changed.
- Verification for these page passes: typecheck, lint, format check, diff check, `npm test` (41 passed, 0 failed, 2 opt-in PostgreSQL suites skipped), and web production build passed; the latest run also passed with the same 41/0/2 result. First sandboxed test run hit `listen EPERM` in the API contract test; loopback-enabled reruns passed. Build generated all current routes. Database and migration status were not rechecked; no interactive/browser visual review was performed.
- This work is not a new roadmap task and does not change the completed count (28/47). Catalog, supplier/customer details, procurement receiving, sales order detail/fulfillment, reports, and administration still need page-specific review; shared styles are already applied. Exact handoff is in `docs/progress/next-session.md`.

## REPORT-001 implementation and verification

- Added organization-scoped APIs and `/reports` UI for inventory summary, stock movements, weighted-average valuation, and low-stock alerts. Summary includes product/SKU counts, on-hand/reserved/available quantities, inventory value by currency, current low-stock product count, warehouse/category groupings, and paginated detail.
- Historical quantity and moving weighted-average cost are reconstructed from ordered immutable stock movements at the cutoff; reserved quantity uses reservation history. Current low-stock alert count is labelled as current even on a historical report. Report queries do not write inventory data.
- Integration fixture reconciled 10 units @ NGN 2 plus 10 @ NGN 4: historical valuation NGN 20; current WAC NGN 3 and value NGN 60; 20 on hand, 5 reserved, 15 available. Verified receipt filter/reference, low-stock suggestion, tenant denial, warehouse grant scope and denial for an ungranted warehouse.
- API contract smoke verified all four report routes reject unauthenticated requests (401) and are present in OpenAPI. Opt-in PostgreSQL integration suite: **13 passed, 0 failed, 0 skipped**. Default `npm test`: **41 passed, 0 failed, 2 opt-in suites skipped**. Typecheck, lint, Prettier check, Prisma validation, migration status (19/19), and production Next.js Webpack build passed.
- No manual browser workflow, full report performance/load run, or authenticated HTTP report request with a real login token was performed. UI is production-build verified only. The report database services themselves were exercised in the isolated PostgreSQL suite.

## Current task: INV-010

- Added an accessible keyboard-scanner input to sales-order creation. It searches the tenant-scoped active product API by barcode, requires an exact normalized barcode match, adds one base unit, and increments an existing base-unit line by exact scaled-integer arithmetic on repeat scans. Post-change typecheck, lint, format, default tests and production build passed.
- Still pending: focused automated or browser regression verification for repeated scans and Enter-key behavior, and camera-scanning API feasibility. Keep INV-010 IN_PROGRESS until its criteria are evidenced.

## Other gaps and decisions

- Interactive browser bridge is not configured in this environment; prior attempt returned `Trusted RPC service is not configured: browser`. Do not claim browser UAT. Track authenticated interactive workflow UAT under QUALITY-001.
- Production email, distributed rate limiting, and other production hardening remain open. Material product, compliance, billing, RLS/support-access, MFA enforcement, and hosting/data-residency decisions remain in `docs/progress/decisions.md`.
- npm audit could not reach the registry. The previously reported Next build fatal blocker was resolved by upgrading the vulnerable Next.js line; do not suppress security checks.

## Git

- UI implementation commits: `33fa0a6` (shared system), `f041826` (product list), `43dacf1` (inventory/order UI), `17e4688` (catalog/contact directories), `448c8c8` (purchase receiving), and `5092ed4` (sales fulfillment). Checkpoint commits: `960912d`, `0e42502`, `b2e19f0`, `5908956`. No push.
- INV-010 remains in progress pending barcode repeat/keyboard acceptance and camera feasibility. Browser UI and API endpoint acceptance remain pending where not evidenced. See `docs/progress/next-session.md` for exact next actions. Do not start SALES-004 until financial policy is approved.
