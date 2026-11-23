# Blockers and constraints

**Updated 2026-11-23 (Africa/Lagos).** Historical environment blockers below are superseded by the latest evidence where noted.

## Active verification gaps

- **INV-010 browser interaction:** Native Enter-key submission, repeat increments, unknown barcode feedback, receiving/picking UI limits, and workspace-switch clearing still need browser/component interaction evidence. Existing queue regression, API lookup tests and database workflow suite pass. Chrome CDP at `127.0.0.1:9222` was unreachable. Do not mark INV-010 complete until keyboard acceptance has automated interaction evidence.
- **Report performance:** All export types, queue/storage, private service download, retries and expiry passed isolated integration, but a representative large-tenant performance benchmark was not run.
- **Dependency audit:** Registry-backed `npm audit` could not reach `registry.npmjs.org` in earlier work. Prior installation reported seven lockfile advisories (4 moderate, 3 high) without full advisory detail. No clean audit is claimed.
- **Docker CLI:** `docker compose ps` is blocked by access to the Docker daemon socket. PostgreSQL, Redis and S3Mock endpoints were reachable and the isolated integration suites used them successfully; Docker health itself is not claimed for this session.
- **QUALITY-003:** The PostgreSQL backup/restore script and local isolated drill passed. Off-host backup encryption/retention, object-storage recovery, queue restart rehearsal, incident procedures and approved RPO/RTO targets remain before closure.

## Completed verification in this session

- Full `npm test` passed: 51 passed, 0 failed, 2 opt-in PostgreSQL suites skipped in that invocation; web tests passed 2/2. Local loopback permission allowed the API contract smoke, so the previously reported `listen EPERM` is no longer an active test blocker under that permission.
- Opt-in PostgreSQL inventory/report tests passed 13/13; auth/organization tests passed 10/10. Prisma status is 20/20. API `/api/v1/health/ready` returned status `ok`.
- No application data was reset or deleted. Tests created and dropped only their isolated random schemas and removed the temporary export objects.

## Production hardening and policy gates

- Production email and distributed rate limiting remain open.
- Open material decisions are in `docs/progress/decisions.md`: target segment/brand, tax/invoice requirements, pricing/limits, production residency/hosting commitments, MFA enforcement, RLS and privileged support access. Keep dependent work gated.
- RPO/RTO targets for QUALITY-003 are not approved. Measure local backup/restore behavior but do not invent customer-facing service objectives.
- Browser E2E, pilot and production release checks remain outstanding.

## Barcode capability constraints

Camera scanning remains deferred. Barcode Detection API support is limited/experimental, requires HTTPS and feature detection, and is not dependable on iOS Safari. Manual input or a USB/Bluetooth keyboard-emulating scanner remains the fallback. Sources: [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API), [Chrome Developers](https://developer.chrome.com/docs/capabilities/shape-detection), [WebKit](https://bugs.webkit.org/show_bug.cgi?id=198174).
