# Pending work

**Updated:** 2026-11-24 (Africa/Lagos).

This summary is subordinate to the task ledger in `docs/implementation/task-breakdown.md`.

## Current implementation

- **QUALITY-001 browser UAT gap:** INV-010 is complete after real Enter/scan component acceptance in Chrome and existing API/DB checks. Still schedule authenticated browser UAT on the actual new sales order, PO receiving, and sales picking pages, including warehouse permissions and no-post-until-confirm behavior.
- **REPORT-003 — COMPLETED:** All four CSV exports, queue/storage integration, service-authenticated downloads, multi-warehouse movement ordering, historical/current WAC, NGN/USD separation, low-stock values, transient retry, expiry object deletion and expired-download denial passed isolated tests. See task ledger and next-session checkpoint.

## Current next-stage work

- **QUALITY-002 — IN_PROGRESS:** Security review is documented in `docs/security/tenant-isolation-review.md`; baseline API/Next response headers and an API HTTP regression assertion are added. Current default tests passed (52 API/shared, 2 web; 2 opt-in PostgreSQL suites skipped), explicit isolated PostgreSQL suites passed 10/10 and 13/13; typecheck, lint, format, build and Prisma validation passed. Read-only Prisma migration status confirms 20/20 up to date. No confirmed critical/high authorization bypass was found in reviewed code. npm audit is blocked by registry DNS; prior installation output reported 3 high advisories. Do not mark complete until advisory risk is inspected and resolved or formally dispositioned.

- **QUALITY-003 — IN_PROGRESS:** Dependencies FOUNDATION-002 and FOUNDATION-005 are complete. PostgreSQL restore, queue worker termination/restart, durable pending-job dispatch, private-prefix object backup, missing-object behavior and checksum-verified restore drills passed locally. Runbook includes database/queue/object recovery and incident steps. Measured timings are documented; production off-host encrypted recovery configuration has not been drilled, and owner-approved RPO/RTO/retention/residency/key policy remain open.
- **SALES-004 — IN_PROGRESS:** DEC-010 policies are owner-approved. Isolated PostgreSQL acceptance now passes 3/3, covering concurrent numbering, void/tax snapshots, reversal replay/conflict, database triggers, authenticated HTTP/controller roles/tenant/warehouse scope, PDF, DTO/OpenAPI and inventory non-mutation. Interactive authenticated browser flow remains unverified; see next-session checkpoint.
- **REPORT-002 — IN_PROGRESS:** Live summary/trend/aging and paginated product-sales, customer, product-purchasing, and supplier APIs/UI/dashboard are implemented. Four detailed report export types reuse REPORT-003. Migration `20261124150000_business_performance_exports` was applied additively (22/22). Remaining: populated purchasing/receipt and customer payment/reversal fixtures, aging boundaries, full filter/security matrix, new export worker content/download/revocation verification, query-plan evidence and browser acceptance. Completed count remains 30/47.

## Other pending work

- PROD-002: owner validation of target segment, statutory obligations, pricing and limits.
- ARCH-002: approval of RLS and privileged support-access boundaries.
- Production email delivery, distributed rate limiting and comprehensive browser E2E remain hardening work.
- Registry-backed dependency audit remains unknown; prior audit could not reach npm registry and install output reported seven advisories (4 moderate, 3 high).
- Large-export performance benchmark and authenticated browser Reports UAT remain broader hardening/UAT gaps.

Checkpoint 2026-11-24: SALES-004/REPORT-002 isolated DB/API suite most recently passed 3/3; default tests passed 59 API/shared and 2 web with 3 opt-in PG suites skipped. See `current-state.md` and `next-session.md` for exact evidence and remaining steps. Migration status is now 22/22, superseding earlier 21/21 entries above.

## Environment evidence

- Latest explicit SALES-004/REPORT-002 PostgreSQL suite passed 3 tests, 0 failures, 0 skipped using a temporary schema. Full workspace tests passed 59 API/shared and 2 web, with 3 opt-in PostgreSQL suites skipped in that default run; typecheck/lint/format/build/Prisma validation and diff check passed. Migration status is 21/21; no new migration or database reset/deletion occurred.
- Current-session `npm audit --omit=dev --audit-level=high` failed because `registry.npmjs.org` returned `ENOTFOUND`; no clean audit is claimed.
