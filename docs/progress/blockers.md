# Blockers and constraints

**Updated 2026-11-23 (Africa/Lagos).** Historical environment blockers below are superseded by the latest evidence where noted.

## Active verification gaps

- **QUALITY-002 dependency audit:** `npm audit --omit=dev --audit-level=high` failed because `registry.npmjs.org` resolved as `ENOTFOUND`. Earlier installation output recorded seven lockfile advisories including three high, without details. QUALITY-002 remains IN_PROGRESS until current advisory state is known and dispositioned. Evidence is in `docs/security/tenant-isolation-review.md`.
- **Prisma migration status:** Resolved for this checkpoint. Read-only `npx prisma migrate status --config prisma.config.ts` passed: 20 migrations found; schema up to date. No migration was applied.

- **QUALITY-001 authenticated workflow UAT:** INV-010's scanner component acceptance passed in headless Chrome: native Enter once, repeated quantity increment, rapid order, unknown-code feedback/no quantity change, recovery, focus, and no parent submit. The authenticated new-sales-order, PO-receiving, and sales-picking pages were not exercised end-to-end; track that broader manual/browser workflow evidence under QUALITY-001. INV-010's documented acceptance is complete.
- **Report performance:** All export types, queue/storage, private service download, retries and expiry passed isolated integration, but a representative large-tenant performance benchmark was not run.
- **Dependency audit:** Current `npm audit --omit=dev --audit-level=high` could not reach `registry.npmjs.org` (`ENOTFOUND`). Earlier installation reported seven lockfile advisories (4 moderate, 3 high) without full advisory detail. No clean audit is claimed.
- **Docker CLI:** `docker compose ps` is blocked by access to the Docker daemon socket. PostgreSQL, Redis and S3Mock endpoints were reachable and the isolated integration suites used them successfully; Docker health itself is not claimed for this session.
- **QUALITY-003:** PostgreSQL, queue interruption/restart, pending-row dispatch, and generated-object backup/missing/restore rehearsals pass locally; measured timings are recorded in `docs/operations/backup-restore.md`. Production independent-account replication/encryption has not been configured or drilled. RPO/RTO and retention/residency/key policies require owner approval before closure.

## Completed verification in this session

- Full `npm test` passed: 52 passed, 0 failed, 2 opt-in PostgreSQL suites skipped in that invocation; web tests passed 2/2. Local loopback permission allowed the API contract smoke, so the previously reported `listen EPERM` is no longer an active test blocker under that permission.
- Opt-in PostgreSQL inventory/report tests passed 13/13, including recovery drill timings (worker restart 3,253 ms, pending dispatcher 105 ms, object backup/missing/restore 84 ms); auth/organization tests passed 10/10. Prisma status is 20/20. API `/api/v1/health/ready` returned status `ok` in prior verified session.
- No application data was reset or deleted. Tests created and dropped only their isolated random schemas and removed the temporary export objects.

## Production hardening and policy gates

- Production email and distributed rate limiting remain open.
- CSP is not configured; add only with a nonce-compatible Next.js plan and verified Swagger behavior. Baseline browser response headers are now configured for the API and web app.
- Open material decisions are in `docs/progress/decisions.md`: target segment/brand, tax/invoice requirements, pricing/limits, production residency/hosting commitments, MFA enforcement, RLS and privileged support access. Keep dependent work gated.
- RPO/RTO targets for QUALITY-003 are not approved. Measure local backup/restore behavior but do not invent customer-facing service objectives.
- Browser E2E, pilot and production release checks remain outstanding.

## Barcode capability constraints

Camera scanning remains deferred. Barcode Detection API support is limited/experimental, requires HTTPS and feature detection, and is not dependable on iOS Safari. Manual input or a USB/Bluetooth keyboard-emulating scanner remains the fallback. Sources: [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API), [Chrome Developers](https://developer.chrome.com/docs/capabilities/shape-detection), [WebKit](https://bugs.webkit.org/show_bug.cgi?id=198174).
