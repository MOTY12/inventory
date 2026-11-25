# Blockers and constraints

**Updated 2026-11-25 (Africa/Lagos).** Historical blockers below are superseded by the latest evidence where noted.

## Active verification gaps

- **QUALITY-002 dependency audit:** `npm audit --omit=dev --audit-level=high` failed because `registry.npmjs.org` resolved as `ENOTFOUND`. Earlier installation output recorded seven lockfile advisories including three high, without details. QUALITY-002 remains IN_PROGRESS until current advisory state is known and dispositioned. Evidence is in `docs/security/tenant-isolation-review.md`.
- **Prisma migration status:** Resolved. Read-only `npx prisma migrate status --config prisma.config.ts` reports 22 migrations and schema up to date in local `inventory_dev`. No reset or deletion occurred.

- **QUALITY-001 authenticated workflow UAT:** INV-010's scanner component acceptance passed in headless Chrome: native Enter once, repeated quantity increment, rapid order, unknown-code feedback/no quantity change, recovery, focus, and no parent submit. The authenticated new-sales-order, PO-receiving, and sales-picking pages were not exercised end-to-end; track that broader manual/browser workflow evidence under QUALITY-001. INV-010's documented acceptance is complete.
- **SALES-004 acceptance:** DEC-010 is approved; isolated PostgreSQL and authenticated HTTP/controller coverage passes, including numbering, void/tax/reversal, immutability, auth/tenant/warehouse scope, non-mutation and customer metrics after payment reversal. Interactive invoice/payment browser UAT is unverified because the QA workspace has no eligible sales/invoice/payment data. SALES-004 remains IN_PROGRESS and is not counted complete.
- **REPORT-002 acceptance:** Sales/purchase/receivables summaries, trends, paginated performance APIs, live UI and four detail export types are implemented. Isolated PostgreSQL acceptance verifies populated purchase receipts, four CSV worker outputs via S3Mock, customer reversal balances, aging boundaries including no-due-date reconciliation, and updated resource-filter tenant/warehouse denials. Authenticated Chrome exercised views and filters on an empty QA dataset, and export job completion plus HTTP 200 download route; file capture was not confirmed. Remaining: full role/security matrix, multi-currency pagination/exports, query plan/performance evidence, confirmed download and populated browser evidence. REPORT-002 remains IN_PROGRESS; completed count remains 30/47.
- **QUALITY-001 execution:** Harness implementation is IN_PROGRESS; the named business lifecycle remains NOT RUN and gated by SALES-004/REPORT-002 acceptance.
- **Report performance:** All export types, queue/storage, private service download, retries and expiry passed isolated integration, but a representative large-tenant performance benchmark was not run.
- **Dependency audit:** Current `npm audit --omit=dev --audit-level=high` could not reach `registry.npmjs.org` (`ENOTFOUND`). Earlier installation reported seven lockfile advisories (4 moderate, 3 high) without full advisory detail. No clean audit is claimed.
- **Local QA configuration:** `DATABASE_URL` is set and reaches `inventory_dev.public`. Missing names: `NODE_ENV`, `QA_ENVIRONMENT`, `QA_API_BASE_URL`, `QA_ORGANIZATION_ID`, `QA_ORGANIZATION_NAME`, `QA_EMAIL`, `QA_PASSWORD`. Do not record their values. Without the explicit QA owner identity, the fixture seed, login, browser invoice/payment workflow and report-export acceptance cannot run.
- **Authenticated UI acceptance:** The API and web dev servers are now running on ports 4000 and 3000. Readiness returned HTTP 200 and its DB identity matched a direct read-only PostgreSQL query; Chrome rendered the Stockroom login form. QA owner/org settings are still missing, so authenticated journeys and financial browser acceptance could not be performed.
- **QUALITY-003:** PostgreSQL, queue interruption/restart, pending-row dispatch, and generated-object backup/missing/restore rehearsals pass locally; measured timings are recorded in `docs/operations/backup-restore.md`. Production independent-account replication/encryption has not been configured or drilled. RPO/RTO and retention/residency/key policies require owner approval before closure.
- **SALES-004 verification:** Browser/control and live authenticated controller acceptance remain unavailable/unrun. PostgreSQL itself is reachable when granted local access; isolated SALES-004 integration passed.

## 2026-11-24 REPORT-002 checkpoint correction

- Four report detail APIs, UI sections/dashboard metrics, and four export types are implemented; additive migration `20261124150000_business_performance_exports` is applied, and local migration status is 22/22. Explicit isolated PostgreSQL/API suite passed 3/3. This supersedes earlier statements that no REPORT-002 rankings/export support or migration existed.
- Remaining evidence gaps: complete filter/security matrix, multi-currency pagination, EXPLAIN ANALYZE, and confirmed browser download from a populated report.
- Latest browser session authenticated to the local Stockroom app and exercised report views/filters with an empty dataset. The download endpoint returned HTTP 200, but browser download file capture was not confirmed. SALES-004 invoice/payment UI was not exercised; no credentials were changed.

## Completed verification in previous session

- All three opt-in PostgreSQL suites together: 26 passed, 0 failed, 0 skipped using disposable schemas. Workspace checks passed: `npm test` 59 API/shared pass, 0 fail, 3 opt-in suites skipped, web 2/2; typecheck, lint, format, production build, Prisma validation. Read-only migration status: 22 migrations found, schema up to date. No application data was reset or deleted.

## Current session verification

- Changed inventory and sales-invoice PostgreSQL suites passed 16/16 with no skips after filter additions. A later rerun of all three suites stalled and was interrupted; it is not a passing result.
- Default suite, typecheck, lint, format, build, Prisma validation, and read-only migration status results are recorded in `current-state.md`. Current-schema status remains 22 migrations, up to date.

## Production hardening and policy gates

- Production email and distributed rate limiting remain open.
- CSP is not configured; add only with a nonce-compatible Next.js plan and verified Swagger behavior. Baseline browser response headers are now configured for the API and web app.
- Open material decisions are in `docs/progress/decisions.md`: target segment/brand, tax/invoice requirements, pricing/limits, production residency/hosting commitments, MFA enforcement, RLS and privileged support access. Keep dependent work gated.
- RPO/RTO targets for QUALITY-003 are not approved. Measure local backup/restore behavior but do not invent customer-facing service objectives.
- Browser E2E, pilot and production release checks remain outstanding.

## Barcode capability constraints

Camera scanning remains deferred. Barcode Detection API support is limited/experimental, requires HTTPS and feature detection, and is not dependable on iOS Safari. Manual input or a USB/Bluetooth keyboard-emulating scanner remains the fallback. Sources: [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API), [Chrome Developers](https://developer.chrome.com/docs/capabilities/shape-detection), [WebKit](https://bugs.webkit.org/show_bug.cgi?id=198174).
