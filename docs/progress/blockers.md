# Blockers and constraints

**Current status as of 2026-11-23 (Africa/Lagos).** Older environment statements in the session log are historical and superseded by this checkpoint.

## Active verification gaps

- **Browser workflow:** Interactive browser RPC/control is unavailable (`Trusted RPC service is not configured: browser` in the prior attempt; no local browser-control package/API was available during this run). INV-010 scanner interactions are implemented and build-verified, not browser-verified. Keep authenticated UAT under QUALITY-001 and do not claim UI acceptance.
- **API contract listener:** `apps/api/test/api-contract.test.mjs` cannot bind its local HTTP test server in this execution environment (`listen EPERM` on both `0.0.0.0` and `127.0.0.1`). Thus full `npm test` remains blocked; the test was not removed or counted as passing. Focused API/shared tests excluding this listener test and opt-in PostgreSQL+Redis+S3 integration tests were run separately.
- **REPORT-003 coverage:** Live queue/storage integration currently covers Inventory Summary only. Movement, Valuation, Low Stock, expiry cleanup, authenticated HTTP download/retry, and browser history/download remain unverified. REPORT-003 stays IN_PROGRESS.
- **Dependency audit:** `npm audit --omit=dev --audit-level=high` could not resolve `registry.npmjs.org` (`ENOTFOUND`). Next.js and eslint-config-next are updated to 16.4.6 and production build passes, but a complete registry audit remains pending.
- The BullMQ/S3 SDK install reported 7 vulnerabilities across the lockfile (4 moderate, 3 high) without advisory details in the install output. No remediation or clean audit is claimed; inspect with `npm audit` when registry access is available.
- **Report performance:** Fixture reconciliation and query behavior were verified against isolated PostgreSQL; a representative large-tenant performance benchmark has not been run.
- **INV-010 camera workflow:** The Barcode Detection API is not a cross-browser baseline; it is limited/experimental, needs HTTPS and runtime feature detection, and iOS Safari support is not dependable. Chrome documents API support in supported Chrome builds (Chrome 83+), but that does not establish device-level camera availability. Camera scanning was not added without target-device verification. Manual entry or a USB/Bluetooth keyboard-emulating scanner is the fallback. Sources: [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API), [Chrome Developers](https://developer.chrome.com/docs/capabilities/shape-detection), [WebKit](https://bugs.webkit.org/show_bug.cgi?id=198174). Reassess camera support only with target browser/device coverage and an explicit dependency/maintenance decision.

## Production hardening and policy gates

- Production email provider and delivery operations are pending.
- Authentication rate limiting is process-local; shared storage is required before horizontally scaling API replicas.
- Open material decisions are recorded in `docs/progress/decisions.md`: target segment/brand, tax/invoice requirements, pricing/limits, production residency/hosting commitments, MFA enforcement, RLS and privileged support access. Keep dependent work gated.
- Browser E2E/session restore, role/grant workflows, pilot and production release checks remain outstanding.

## Database/runtime evidence

- This session connected to local PostgreSQL at `localhost:5433`; `docker compose ps` reported PostgreSQL, Redis and S3Mock healthy. Applied the additive `20261123160000_report_exports` migration without reset or deletion. Prisma reports 20 migrations and the configured `inventory_dev` schema up to date. The export integration test created and cleaned up a separate random schema and one unique S3Mock object; no production database was touched.
