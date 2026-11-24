# Blockers and constraints

**Updated 2026-11-24 (Africa/Lagos).** Historical environment blockers below are superseded by the latest evidence where noted.

## Active verification gaps

- **QUALITY-002 dependency audit:** `npm audit --omit=dev --audit-level=high` failed because `registry.npmjs.org` resolved as `ENOTFOUND`. Earlier installation output recorded seven lockfile advisories including three high, without details. QUALITY-002 remains IN_PROGRESS until current advisory state is known and dispositioned. Evidence is in `docs/security/tenant-isolation-review.md`.
- **Prisma migration status:** Resolved. The additive SALES-004 migration was applied to local `inventory_dev`; `npx prisma migrate status --config prisma.config.ts` reports 21 migrations and database schema up to date. No reset or deletion occurred.

- **QUALITY-001 authenticated workflow UAT:** INV-010's scanner component acceptance passed in headless Chrome: native Enter once, repeated quantity increment, rapid order, unknown-code feedback/no quantity change, recovery, focus, and no parent submit. The authenticated new-sales-order, PO-receiving, and sales-picking pages were not exercised end-to-end; track that broader manual/browser workflow evidence under QUALITY-001. INV-010's documented acceptance is complete.
- **SALES-004 acceptance:** DEC-010 is approved; expanded isolated PostgreSQL and authenticated HTTP/controller coverage passed 3/3, including numbering, void/tax/reversal, immutability, auth/tenant/warehouse scope and non-mutation. Interactive authenticated browser UAT remains unverified because no local inventory UI was available in the browser. SALES-004 remains IN_PROGRESS and is not counted complete.
- **REPORT-002 acceptance:** Sales/purchase/receivables summary, aging, daily/weekly/monthly trends and a live-data UI are implemented; authenticated API queries pass in the temporary PostgreSQL suite. Product/customer/supplier performance, expanded test fixtures, CSV export integration, query performance evidence and browser UAT remain. REPORT-002 is IN_PROGRESS; completed count remains 30/47.
- **Report performance:** All export types, queue/storage, private service download, retries and expiry passed isolated integration, but a representative large-tenant performance benchmark was not run.
- **Dependency audit:** Current `npm audit --omit=dev --audit-level=high` could not reach `registry.npmjs.org` (`ENOTFOUND`). Earlier installation reported seven lockfile advisories (4 moderate, 3 high) without full advisory detail. No clean audit is claimed.
- **Docker CLI:** `docker compose ps` is blocked by access to the Docker daemon socket. PostgreSQL, Redis and S3Mock endpoints were reachable and the isolated integration suites used them successfully; Docker health itself is not claimed for this session.
- **QUALITY-003:** PostgreSQL, queue interruption/restart, pending-row dispatch, and generated-object backup/missing/restore rehearsals pass locally; measured timings are recorded in `docs/operations/backup-restore.md`. Production independent-account replication/encryption has not been configured or drilled. RPO/RTO and retention/residency/key policies require owner approval before closure.
- **SALES-004 verification:** Browser/control and live authenticated controller acceptance remain unavailable/unrun. PostgreSQL itself is reachable when granted local access; isolated SALES-004 integration passed.

## 2026-11-24 REPORT-002 checkpoint correction

- Four report detail APIs, UI sections/dashboard metrics, and four export types are implemented; additive migration `20261124150000_business_performance_exports` is applied, and local migration status is 22/22. Explicit isolated PostgreSQL/API suite passed 3/3. This supersedes earlier statements that no REPORT-002 rankings/export support or migration existed.
- Remaining evidence gaps: new purchase analytics on non-empty PO/receipt fixtures; customer effective collections and reversal reconciliation; boundary/filter/security matrix; worker CSV value and revoked-finance download tests; EXPLAIN ANALYZE; authenticated browser acceptance.
- Browser remains a real blocker for SALES-004 and REPORT-002 UAT: no local application/session was available in the current browser. Do not claim the workflow verified.

## Completed verification in this session

- Current explicit SALES-004 plus REPORT-002 PostgreSQL suite: 3 passed, 0 failed, 0 skipped; it uses a uniquely named temporary schema. Workspace checks passed: `npm test` 59 API/shared pass, 0 fail, 3 opt-in suites skipped, web 2/2; typecheck, lint, format, production build, Prisma validation and diff check passed. Read-only migration status is 21/21. Migration deploy succeeded in prior work; no application data was reset or deleted.

## Production hardening and policy gates

- Production email and distributed rate limiting remain open.
- CSP is not configured; add only with a nonce-compatible Next.js plan and verified Swagger behavior. Baseline browser response headers are now configured for the API and web app.
- Open material decisions are in `docs/progress/decisions.md`: target segment/brand, tax/invoice requirements, pricing/limits, production residency/hosting commitments, MFA enforcement, RLS and privileged support access. Keep dependent work gated.
- RPO/RTO targets for QUALITY-003 are not approved. Measure local backup/restore behavior but do not invent customer-facing service objectives.
- Browser E2E, pilot and production release checks remain outstanding.

## Barcode capability constraints

Camera scanning remains deferred. Barcode Detection API support is limited/experimental, requires HTTPS and feature detection, and is not dependable on iOS Safari. Manual input or a USB/Bluetooth keyboard-emulating scanner remains the fallback. Sources: [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API), [Chrome Developers](https://developer.chrome.com/docs/capabilities/shape-detection), [WebKit](https://bugs.webkit.org/show_bug.cgi?id=198174).
