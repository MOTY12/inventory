# Blockers and constraints

**Current status as of 2026-11-23 (Africa/Lagos).** Older environment statements in the session log are historical and superseded by this checkpoint.

## Active verification gaps

- **Browser workflow:** Interactive browser RPC is not configured (`Trusted RPC service is not configured: browser`, from the prior attempt). REPORT-001 UI and INV-010 keyboard scanning are build-verified, not browser-verified. Keep full authenticated UAT under QUALITY-001 and do not claim UI acceptance.
- **Dependency audit:** `npm audit --omit=dev --audit-level=high` could not resolve `registry.npmjs.org` (`ENOTFOUND`). Next.js and eslint-config-next are updated to 16.4.6 and production build passes, but a complete registry audit remains pending.
- **Report performance:** Fixture reconciliation and query behavior were verified against isolated PostgreSQL; a representative large-tenant performance benchmark has not been run.
- **INV-010 camera workflow:** Keyboard scanner is implemented; mobile camera API feasibility and any camera-based scan implementation are not verified.

## Production hardening and policy gates

- Production email provider and delivery operations are pending.
- Authentication rate limiting is process-local; shared storage is required before horizontally scaling API replicas.
- Open material decisions are recorded in `docs/progress/decisions.md`: target segment/brand, tax/invoice requirements, pricing/limits, production residency/hosting commitments, MFA enforcement, RLS and privileged support access. Keep dependent work gated.
- Browser E2E/session restore, role/grant workflows, pilot and production release checks remain outstanding.

## Database/runtime evidence

- This session connected to local PostgreSQL at `localhost:5433`; the inventory reporting integration suite created and cleaned up a random isolated test schema. Prisma reports 19 migrations and the configured `inventory_dev` schema up to date. Reporting and barcode lookup required no database migration; no production database was touched.
- Docker health was not rechecked in this task. Do not infer container health from the successful direct PostgreSQL connection.
