# Pending work

**Updated:** 2026-11-28 (Africa/Lagos). The latest QA identity and browser automation evidence below supersedes older notes that say credentials or services are wholly unavailable.

This summary is subordinate to the task ledger in `docs/implementation/task-breakdown.md`.

## Current implementation

- **QUALITY-001 — IN_PROGRESS (harness implementation only):** API-driven baseline, document-state, multi-currency, financial-export and authorization selectors. Document recovery validates saved identities and resumes interrupted operations. Implemented the existing `qa:preflight` entry and extended the manifest-scoped finance browser scenario to capture/inspect the actual PDF, reconcile exact financial values and check inventory non-mutation. QA tests pass **27/27**; Playwright discovery finds one finance test. No QA business scenario has run against the live API/DB. Preflight verifies API/database fingerprint and all infrastructure dependencies, but the configured login is not an active OWNER of the exact QA workspace. The owner selected use of the existing workspace OWNER credentials; correct local `.env` values are required. Cross-currency and authorization scenario execution, browser workflow and browser PDF remain unverified. Operational acceptance remains NOT RUN.
- **REPORT-003 — COMPLETED:** All four CSV exports, queue/storage integration, service-authenticated downloads, multi-warehouse movement ordering, historical/current WAC, NGN/USD separation, low-stock values, transient retry, expiry object deletion and expired-download denial passed isolated tests. See task ledger and next-session checkpoint.

## Current next-stage work

- **QUALITY-002 — IN_PROGRESS:** Security review is documented in `docs/security/tenant-isolation-review.md`; baseline API/Next response headers and an API HTTP regression assertion are added. Current default tests passed (52 API/shared, 2 web; 2 opt-in PostgreSQL suites skipped), explicit isolated PostgreSQL suites passed 10/10 and 13/13; typecheck, lint, format, build and Prisma validation passed. Read-only Prisma migration status confirms 20/20 up to date. No confirmed critical/high authorization bypass was found in reviewed code. npm audit is blocked by registry DNS; prior installation output reported 3 high advisories. Do not mark complete until advisory risk is inspected and resolved or formally dispositioned.

- **QUALITY-003 — IN_PROGRESS:** Dependencies FOUNDATION-002 and FOUNDATION-005 are complete. PostgreSQL restore, queue worker termination/restart, durable pending-job dispatch, private-prefix object backup, missing-object behavior and checksum-verified restore drills passed locally. Runbook includes database/queue/object recovery and incident steps. Measured timings are documented; production off-host encrypted recovery configuration has not been drilled, and owner-approved RPO/RTO/retention/residency/key policy remain open.
- **SALES-004 — IN_PROGRESS:** DEC-010 policies are owner-approved. Explicit isolated PostgreSQL suite passes **4/4**, including sequential numbering, partial/full payments, reversal/replacement, reconciliation, tax snapshots, PDF content, auth/tenant/warehouse scope and inventory non-mutation. Existing default test results are recorded in `current-state.md`; the focused SQL suite was run explicitly. Docker services are healthy; migration status is 22/22 current. Current QA login authenticates but is not an active OWNER of the exact configured QA workspace. The owner selected use of existing workspace OWNER credentials. No QA invoice/payment was created. Remaining acceptance: authenticated browser workflow, actual PDF inspection, final reconciliation and non-mutation. See `next-session.md`.
- **REPORT-002 — IN_PROGRESS:** Live summary/trend/aging and paginated product-sales, customer, product-purchasing, and supplier APIs/UI/dashboard are implemented. Four detailed report export types reuse REPORT-003. Migration `20261124150000_business_performance_exports` is applied (22 migrations, schema up to date). Disposable PostgreSQL acceptance covers purchase partial/full receipt totals, four detailed CSV worker outputs via S3Mock, customer payment reversal totals, aging boundaries including missing due-date reconciliation, and updated filter/tenant/warehouse-denial cases. Authenticated Chrome exercised filters and export completion against an empty QA dataset; the route returned HTTP 200 but browser file capture is unconfirmed. Remaining: comprehensive role/security matrix, multi-currency pagination/exports, EXPLAIN ANALYZE/performance, confirmed browser download, and populated report UI evidence. Completed count remains 30/47.

## Latest verification snapshot (2026-11-28)

- Typecheck, lint, format, production build (31 routes), default tests and explicit SALES-004 isolated PostgreSQL tests passed. Default `npm test`: 62 API/shared pass, 4 web pass, 0 fail, 3 opt-in PostgreSQL suites skipped; SALES-004 explicit suite: 4/4; `qa:test`: 27/27.
- QA preflight infrastructure passed, but exact QA OWNER identity failed; browser E2E is discovered only and not run. No business fixtures or financial records were changed. Roadmap remains 30/47.
## Other pending work

- PROD-002: owner validation of target segment, statutory obligations, pricing and limits.
- ARCH-002: approval of RLS and privileged support-access boundaries.
- Production email delivery, distributed rate limiting and comprehensive browser E2E remain hardening work.
- Registry-backed dependency audit remains unknown; prior audit could not reach npm registry and install output reported seven advisories (4 moderate, 3 high).
- Large-export performance benchmark and authenticated browser Reports UAT remain broader hardening/UAT gaps.

Historical 2026-11-25 test evidence follows; it is not the latest check. See `current-state.md` and `next-session.md` for the authoritative current state.

## Environment evidence

- Current turn (2026-11-28): API readiness HTTP 200; Stockroom Next `/login` HTTP 200 on port 3001 (port 3000 belongs to another app); PostgreSQL/Redis/S3Mock are healthy; Prisma reports 22/22 migrations applied. QA credentials exist locally, but the configured login is not an active OWNER of the exact QA workspace. Preflight logged the session out without creating business fixtures. The owner selected the existing OWNER credential path; update `.env` values. Playwright discovers one finance test; it is not yet executed. See the current checkpoint and exact next steps in `next-session.md`.
- Dependency audit was not run this turn; registry-backed advisory status remains unknown as noted in `docs/security/tenant-isolation-review.md`.
