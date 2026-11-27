# Blockers and constraints

**Updated 2026-11-25 (Africa/Lagos).** Historical blockers below are superseded by the latest evidence where noted.

## Active verification gaps

- **QUALITY-002 dependency audit:** `npm audit --omit=dev --audit-level=high` failed because `registry.npmjs.org` resolved as `ENOTFOUND`. Earlier installation output recorded seven lockfile advisories including three high, without details. QUALITY-002 remains IN_PROGRESS until current advisory state is known and dispositioned. Evidence is in `docs/security/tenant-isolation-review.md`.
- **Prisma migration status:** Resolved. Read-only `npx prisma migrate status --config prisma.config.ts` reports 22 migrations and schema up to date in local `inventory_dev`. No reset or deletion occurred.

- **QUALITY-001 authenticated workflow UAT:** INV-010's scanner component acceptance passed in headless Chrome. Current QA source includes document-state recovery, invoice states, NGN/USD report verification, financial CSV reconciliation and read-only authorization probes. Tests are mock/API-shape checks; no authenticated scenario ran. The authorization path still lacks membership/grant revocation and export-download checks, while the named operational scenario remains open. INV-010's documented acceptance is complete.
- **SALES-004 acceptance:** DEC-010 is approved; isolated PostgreSQL and authenticated HTTP/controller coverage passes, including numbering, void/tax/reversal, immutability, auth/tenant/warehouse scope, non-mutation and customer metrics after payment reversal. Interactive invoice/payment browser UAT is unverified because the QA workspace has no eligible sales/invoice/payment data. SALES-004 remains IN_PROGRESS and is not counted complete.
- **REPORT-002 acceptance:** Sales/purchase/receivables summaries, trends, paginated performance APIs, live UI and four detail export types are implemented. Isolated PostgreSQL acceptance verifies populated purchase receipts, four CSV worker outputs via S3Mock, customer reversal balances, aging boundaries including no-due-date reconciliation, and updated resource-filter tenant/warehouse denials. New source covers NGN/USD reporting and CSV exports but is not live-executed. Authenticated Chrome previously exercised views and filters on an empty QA dataset; download route returned HTTP 200, file capture was not confirmed. Remaining: full role/security matrix, live multi-currency pagination/exports, query plan/performance evidence, confirmed download and populated browser evidence. REPORT-002 remains IN_PROGRESS; count is 30/47.
- **QUALITY-001 execution:** Harness code covers PO/SO recovery, nine invoice states, NGN/USD reporting, eight financial CSV exports and read-only authorization probes. No authenticated scenario ran. Membership/grant revocation, export-download access denial, cross-currency payment allocation, and the named business lifecycle remain NOT RUN and dependency-gated.
- **Report performance:** All export types, queue/storage, private service download, retries and expiry passed isolated integration, but a representative large-tenant performance benchmark was not run.
- **Dependency audit:** Current `npm audit --omit=dev --audit-level=high` could not reach `registry.npmjs.org` (`ENOTFOUND`). Earlier installation reported seven lockfile advisories (4 moderate, 3 high) without full advisory detail. No clean audit is claimed.
- **Local QA configuration:** `DATABASE_URL` is set. Missing names: `NODE_ENV`, `QA_ENVIRONMENT`, `QA_API_BASE_URL`, `QA_ORGANIZATION_ID`, `QA_ORGANIZATION_NAME`, `QA_EMAIL`, `QA_PASSWORD`. Do not record their values. Without the explicit QA owner identity, fixture seed, login, browser invoice/payment workflow and report-export acceptance cannot run.
- **Authenticated UI acceptance:** This turn's API readiness returned HTTP 200 and existing web at port 3000 returned HTTP 200 for `/login`. QA owner/org settings remain missing, so authenticated journeys and financial browser acceptance were not performed.
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


## Phase C UI acceptance blocker (2026-11-26)

- Local API and web were not listening: `curl http://localhost:3000/purchase-orders/new` and `curl http://localhost:4000/api/v1/health/ready` both returned connection refused. Authenticated browser and live transaction acceptance could not run. No services were started because this pass focused on source work and no approved credentials were available in session context.
- UI regressions: no React component interaction test infrastructure is currently used by the web suite; responsive sweep, live warehouse-specific availability, role/tenant denial, transaction movements and retries remain unverified.
- The optional `productId` query filter was covered by service-level tests; controller validation via `InventoryBalanceQueryDto` compiles, but no live endpoint request was exercised.

## Phase C environment update (2026-11-26)

- The source implementation has since advanced to shared PO/transfer/SO detail bodies, operational panels and searchable transaction entity selectors. Do not use older statements that details remain header-only; see current-state and next-session.
- Docker Desktop app is not installed in this environment; daemon access fails. Local `pg_isready` reports no response at `/tmp:5432`. Ports 3000 and 4000 refuse connections.
- Consequently no browser, responsive, migration, database, live transaction, retry, ledger reconciliation or role/tenant acceptance ran. No QA credentials/data were invented or changed; no records were touched.
- The three standalone typecheck errors were resolved with explicit types matching non-null user relations in the Prisma schema; full typecheck now passes. The production build also passes. Review those annotations on Prisma upgrades.
