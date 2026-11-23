# Pending work

This summary is subordinate to the task ledger in `docs/implementation/task-breakdown.md`.

## Current implementation

- **INV-010 — IN_PROGRESS:** Scanner lookup and workflows are implemented for sales-order creation, PO receiving, and sales picking. Unit tests cover one submit exactly once and sequential repeated scans. Native Enter-key behavior, live quantity increment, unknown-barcode feedback, limits in the UI, and workspace-switch clearing still need browser/component interaction evidence.
- **REPORT-003 — COMPLETED:** All four CSV exports, queue/storage integration, service-authenticated downloads, multi-warehouse movement ordering, historical/current WAC, NGN/USD separation, low-stock values, transient retry, expiry object deletion and expired-download denial passed isolated tests. See task ledger and next-session checkpoint.

## Current next-stage work

- **QUALITY-002 — IN_PROGRESS:** Security review is documented in `docs/security/tenant-isolation-review.md`; baseline API/Next response headers and an API HTTP regression assertion were added. Default tests passed (51 pass/0 fail/2 opt-in DB suites skipped, web 2/2); explicit isolated PostgreSQL suites passed 10/10 and 13/13; typecheck, lint, format, build and Prisma validation passed. No confirmed critical/high authorization bypass was found in reviewed code. npm audit remains blocked by registry DNS and prior install output reported 3 high advisories; migration status also could not connect to `localhost:5433`. Do not mark complete or increase the count until dependency risk is known and dispositioned.

- **QUALITY-003 — IN_PROGRESS:** Dependencies FOUNDATION-002 and FOUNDATION-005 are complete. Added safe PostgreSQL archive/restore scripts and a runbook; local isolated restore drill passed. Next add queue restart and object storage recovery rehearsal, finish incident steps, and obtain RPO/RTO targets before claiming completion.
- Do not start SALES-004 or REPORT-002 until invoice/tax/accounting policy is approved.

## Other pending work

- PROD-002: owner validation of target segment, statutory obligations, pricing and limits.
- ARCH-002: approval of RLS and privileged support-access boundaries.
- Production email delivery, distributed rate limiting and comprehensive browser E2E remain hardening work.
- Registry-backed dependency audit remains unknown; prior audit could not reach npm registry and install output reported seven advisories (4 moderate, 3 high).
- Large-export performance benchmark and authenticated browser Reports UAT remain broader hardening/UAT gaps.

## Environment evidence

- The full `npm test` command passed 51 tests, with two opt-in PostgreSQL suites skipped in that invocation; web tests passed 2/2. Both database suites were explicitly run separately and passed 13/13 and 10/10.
- The API contract smoke passed when local loopback permission was granted; prior `listen EPERM` was environmental. Docker daemon socket itself remains inaccessible, but the configured PostgreSQL, Redis and S3Mock endpoints were used successfully by integration tests.
