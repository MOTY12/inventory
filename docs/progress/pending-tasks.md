# Pending work

**Updated:** 2026-11-28 (Africa/Lagos). Current environment evidence is in `docs/progress/current-state.md` and `docs/progress/next-session.md`; older snapshots below are historical.

This summary is subordinate to the task ledger in `docs/implementation/task-breakdown.md`.

## Current implementation

- **QUALITY-001 — IN_PROGRESS (harness implementation only):** API-driven baseline, document-state, multi-currency, financial-export and authorization scenarios; finance and report Playwright suites; shared safe browser/manifest helpers. Report browser suite covers summary/detail/aging filters and UI capture/API reconciliation for eight NGN/USD CSVs. QA tests pass **29/29**. Both browser tests are discoverable but neither has run. Latest preflight failed local services (API, DB, Redis, S3Mock, web and migration status unavailable), so current OWNER eligibility is UNKNOWN; a prior preflight rejected the configured non-OWNER login. No QA scenario or business data was changed. Financial PDF/CSV browser capture and authorization actor execution remain unverified.
- **REPORT-003 — COMPLETED:** All four CSV exports, queue/storage integration, service-authenticated downloads, multi-warehouse movement ordering, historical/current WAC, NGN/USD separation, low-stock values, transient retry, expiry object deletion and expired-download denial passed isolated tests. See task ledger and next-session checkpoint.

## Current next-stage work

- **QUALITY-002 — IN_PROGRESS:** Security review is documented in `docs/security/tenant-isolation-review.md`; baseline API/Next response headers and an API HTTP regression assertion are added. Earlier isolated PostgreSQL/security suites and code review are documented there. Latest `npm audit --json` attempt failed before receiving registry data (`ENOTFOUND registry.npmjs.org`), so this session could not identify affected packages, advisory IDs, versions or dependency paths. Prior outputs reported advisories without sufficient detail to disposition. No dependency changes were made. Do not mark complete until current advisory risk is inspected and resolved or formally dispositioned.

- **QUALITY-003 — IN_PROGRESS:** Dependencies FOUNDATION-002 and FOUNDATION-005 are complete. PostgreSQL restore, queue worker termination/restart, durable pending-job dispatch, private-prefix object backup, missing-object behavior and checksum-verified restore drills passed locally. Runbook includes database/queue/object recovery and incident steps. Measured timings are documented; production off-host encrypted recovery configuration has not been drilled, and owner-approved RPO/RTO/retention/residency/key policy remain open.
- **SALES-004 — IN_PROGRESS:** DEC-010 policies are owner-approved. Prior isolated PostgreSQL suite passed **4/4** with sequential numbering, payments, reversal/replacement, reconciliation, tax snapshots, PDF content, auth/tenant/warehouse scope and inventory non-mutation. This session did not access PostgreSQL or run a browser. Latest preflight found local services unavailable; a prior run found the configured login was not an active OWNER of the exact QA workspace. Use the selected existing OWNER credential path. No QA invoice/payment was created. Remaining: authenticated browser workflow, actual PDF capture/inspection and browser reconciliation/non-mutation.
- **REPORT-002 — IN_PROGRESS:** Existing summary/trend/aging and paginated performance APIs/UI and four export types remain, with prior isolated PostgreSQL evidence recorded in the task ledger. This session added a reusable report Playwright suite and exact-decimal CSV/API reconciliation unit coverage; the test is discoverable but not run. Latest services were unavailable, so there is no browser/file evidence from this session. Remaining: execute populated report UI and eight CSVs; exercise pagination beyond one page; complete role/tenant/warehouse denial and revocation evidence; collect representative EXPLAIN ANALYZE results. REPORT-002 remains dependency-gated by PROCUREMENT-003 and SALES-004. Count remains 30/47.

## Latest verification snapshot (2026-11-28)

- `npm run qa:test`: 29/29. `npm test`: 62 API/shared + 4 web passed, 0 failed, 3 opt-in PostgreSQL suites skipped. Typecheck, lint, format and build (31 routes) passed. No isolated PostgreSQL suite ran this session.
- Finance and report E2E each discover one test; neither executed. QA preflight failed because local services were unavailable, so OWNER status and migration status could not be checked. No fixtures/business records changed. `npm audit --json` was blocked by registry DNS. Roadmap remains 30/47.
## Other pending work

- PROD-002: owner validation of target segment, statutory obligations, pricing and limits.
- ARCH-002: approval of RLS and privileged support-access boundaries.
- Production email delivery, distributed rate limiting and comprehensive browser E2E remain hardening work.
- Registry-backed dependency audit remains unknown; this turn's audit could not reach npm registry, and earlier outputs reported advisories without package-level details.
- Large-export performance benchmark and authenticated browser Reports UAT remain broader hardening/UAT gaps.

Historical 2026-11-25 test evidence follows; it is not the latest check. See `current-state.md` and `next-session.md` for the authoritative current state.

## Environment evidence

- Previous checkpoint (2026-11-28): API readiness and frontend login returned HTTP 200; PostgreSQL/Redis/S3Mock were healthy and Prisma reported 22 migrations applied. At that checkpoint, the configured login was not an active OWNER of the exact QA workspace. This is historical, not evidence about this turn's service availability.
- Current checkpoint (2026-11-28): local API, database, Redis, S3Mock and frontend were unavailable in preflight; migration status and OWNER eligibility could not be verified. `npm audit --json` failed at registry DNS. See `current-state.md` and `next-session.md` for exact results and resume steps.
