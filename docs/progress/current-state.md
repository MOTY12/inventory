# Current state

**Updated:** 2026-11-23 (Africa/Lagos)

## Repository and roadmap

- Workspace: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; session started at `1d0417e` with a clean worktree. No pre-existing changes were overwritten.
- Completed task count: **28/47**, computed from the 47 unique ledger entries. REPORT-001 was completed this session. INV-010 is the current in-progress task. See `docs/implementation/task-breakdown.md` for statuses.
- No application migration was required for reports or barcode lookup. Local PostgreSQL reports 19 migrations found and schema up to date. No reset, data deletion, or production operation occurred.
- Next.js and eslint-config-next were updated from 16.4.3 to 16.4.6 after verifying the compatible patched version and successful production build. `npm audit --omit=dev` could not reach the npm advisory endpoint (`ENOTFOUND registry.npmjs.org`), so no audit result is claimed.

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

- No commit or push was made yet. Inspect the final diff, generated files, and coherent ownership before creating focused local commits. Never push without explicit authorization.
