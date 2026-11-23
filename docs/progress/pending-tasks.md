# Pending work

This summary is subordinate to the task ledger in `docs/implementation/task-breakdown.md`.

## Current implementation

- **INV-010 — IN_PROGRESS:** Scanner lookup and workflows are implemented for sales-order creation, PO receiving, and sales picking. Unit tests cover one submit exactly once and sequential repeated scans. Native Enter-key behavior, live quantity increment, unknown-barcode feedback, limits in the UI, and workspace-switch clearing still need browser/component interaction evidence.
- **REPORT-003 — COMPLETED:** All four CSV exports, queue/storage integration, service-authenticated downloads, multi-warehouse movement ordering, historical/current WAC, NGN/USD separation, low-stock values, transient retry, expiry object deletion and expired-download denial passed isolated tests. See task ledger and next-session checkpoint.

## Current next-stage work

- **QUALITY-002 — IN_PROGRESS:** Security review is documented in `docs/security/tenant-isolation-review.md`; baseline API/Next response headers and an API HTTP regression assertion are added. Current default tests passed (52 API/shared, 2 web; 2 opt-in PostgreSQL suites skipped), explicit isolated PostgreSQL suites passed 10/10 and 13/13; typecheck, lint, format, build and Prisma validation passed. Read-only Prisma migration status confirms 20/20 up to date. No confirmed critical/high authorization bypass was found in reviewed code. npm audit is blocked by registry DNS; prior installation output reported 3 high advisories. Do not mark complete until advisory risk is inspected and resolved or formally dispositioned.

- **QUALITY-003 — IN_PROGRESS:** Dependencies FOUNDATION-002 and FOUNDATION-005 are complete. PostgreSQL restore, queue worker termination/restart, durable pending-job dispatch, private-prefix object backup, missing-object behavior and checksum-verified restore drills passed locally. Runbook includes database/queue/object recovery and incident steps. Measured timings are documented; production off-host encrypted recovery configuration has not been drilled, and owner-approved RPO/RTO/retention/residency/key policy remain open.
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
