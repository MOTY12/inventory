# Pending work

**Updated:** 2026-11-25 (Africa/Lagos).

This summary is subordinate to the task ledger in `docs/implementation/task-breakdown.md`.

## Current implementation

- **QUALITY-001 — IN_PROGRESS (harness implementation only):** API-driven baseline fixture commands now validate the local API/database fingerprint, exact QA organization and active OWNER, use exact resource recovery and per-run locks, persist stable idempotency keys, and independently verify movements, reservations, cost, balances and payment reversal totals. QA generator tests pass 11/11. Its live scenario remains NOT RUN and is gated by SALES-004/REPORT-002 acceptance and missing local QA account settings.
- **REPORT-003 — COMPLETED:** All four CSV exports, queue/storage integration, service-authenticated downloads, multi-warehouse movement ordering, historical/current WAC, NGN/USD separation, low-stock values, transient retry, expiry object deletion and expired-download denial passed isolated tests. See task ledger and next-session checkpoint.

## Current next-stage work

- **QUALITY-002 — IN_PROGRESS:** Security review is documented in `docs/security/tenant-isolation-review.md`; baseline API/Next response headers and an API HTTP regression assertion are added. Current default tests passed (52 API/shared, 2 web; 2 opt-in PostgreSQL suites skipped), explicit isolated PostgreSQL suites passed 10/10 and 13/13; typecheck, lint, format, build and Prisma validation passed. Read-only Prisma migration status confirms 20/20 up to date. No confirmed critical/high authorization bypass was found in reviewed code. npm audit is blocked by registry DNS; prior installation output reported 3 high advisories. Do not mark complete until advisory risk is inspected and resolved or formally dispositioned.

- **QUALITY-003 — IN_PROGRESS:** Dependencies FOUNDATION-002 and FOUNDATION-005 are complete. PostgreSQL restore, queue worker termination/restart, durable pending-job dispatch, private-prefix object backup, missing-object behavior and checksum-verified restore drills passed locally. Runbook includes database/queue/object recovery and incident steps. Measured timings are documented; production off-host encrypted recovery configuration has not been drilled, and owner-approved RPO/RTO/retention/residency/key policy remain open.
- **SALES-004 — IN_PROGRESS:** DEC-010 policies are owner-approved. Isolated PostgreSQL acceptance now passes 3/3, covering concurrent numbering, void/tax snapshots, reversal replay/conflict, database triggers, authenticated HTTP/controller roles/tenant/warehouse scope, PDF, DTO/OpenAPI and inventory non-mutation. Interactive authenticated browser flow remains unverified; see next-session checkpoint.
- **REPORT-002 — IN_PROGRESS:** Live summary/trend/aging and paginated product-sales, customer, product-purchasing, and supplier APIs/UI/dashboard are implemented. Four detailed report export types reuse REPORT-003. Migration `20261124150000_business_performance_exports` is applied (22 migrations, schema up to date). Disposable PostgreSQL acceptance covers purchase partial/full receipt totals, four detailed CSV worker outputs via S3Mock, customer payment reversal totals, aging boundaries including missing due-date reconciliation, and updated filter/tenant/warehouse-denial cases. Authenticated Chrome exercised filters and export completion against an empty QA dataset; the route returned HTTP 200 but browser file capture is unconfirmed. Remaining: comprehensive role/security matrix, multi-currency pagination/exports, EXPLAIN ANALYZE/performance, confirmed browser download, and populated report UI evidence. Completed count remains 30/47.
- **REPORT-002 — IN_PROGRESS:** Live summary/trend/aging and paginated product-sales, customer, product-purchasing, and supplier APIs/UI/dashboard are implemented. Four detailed report export types reuse REPORT-003. Migration status is 22/22 current. Disposable PostgreSQL acceptance covers receipt totals, four CSV worker outputs via S3Mock, customer payment reversals, aging boundaries and filter/tenant/warehouse denials. Browser file capture, multi-currency fixtures/pagination, full security matrix and EXPLAIN ANALYZE remain open.

## Other pending work

- PROD-002: owner validation of target segment, statutory obligations, pricing and limits.
- ARCH-002: approval of RLS and privileged support-access boundaries.
- Production email delivery, distributed rate limiting and comprehensive browser E2E remain hardening work.
- Registry-backed dependency audit remains unknown; prior audit could not reach npm registry and install output reported seven advisories (4 moderate, 3 high).
- Large-export performance benchmark and authenticated browser Reports UAT remain broader hardening/UAT gaps.

Checkpoint 2026-11-25: three isolated PostgreSQL suites passed 26/26 in this session. Default tests passed 60 API/shared, 2 web, with 3 opt-in PostgreSQL suites skipped. QA harness unit tests passed 11/11. See `current-state.md` and `next-session.md` for exact live-runtime blockers and next steps. Migration status is 22/22.

## Environment evidence

- Current session: API readiness returned HTTP 200 with the development-only database fingerprint; its fingerprint matched the CLI's direct local `inventory_dev.public` connection. Docker showed PostgreSQL, Redis and S3Mock healthy. Frontend port 3002 was unavailable because the existing Next dev server holds the `apps/web` dev lock on port 3000; its title identified Stockroom, and no process was stopped. Migration status is 22/22. No reset or deletion occurred.
- Current-session `npm audit --omit=dev --audit-level=high` failed because `registry.npmjs.org` returned `ENOTFOUND`; no clean audit is claimed.
