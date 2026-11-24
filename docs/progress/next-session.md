# Next session checkpoint

**Updated:** 2026-11-23 (Africa/Lagos)

## Repository and roadmap

- Workspace: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; start HEAD `4a6dbde` (`update the mds`). Worktree was clean at start.
- Application code is unchanged by this session. Only progress/roadmap documentation is now modified. No commit, push, deployment, production migration, configured-schema reset, or deletion of existing data occurred.
- Roadmap is **30/47 complete**, recalculated from the 47 task entries. INV-010 moved to COMPLETED based on its documented acceptance criterion and browser evidence below. QUALITY-002 and QUALITY-003 remain IN_PROGRESS.

## INV-010 acceptance completed

- Reviewed the scanner component, barcode API, new sales order handler, purchase receiving handler, and reserved sales-picking handler. The handlers use exact tenant barcode lookup; guard late results after organization/order changes; bound receiving to outstanding quantity and unit precision; bound picking to active reservations, unpicked quantity and unit precision; and do not post stock during scanning.
- Rendered the actual `BarcodeScanner` React component on a temporary local Next page and drove it with native keyboard events in installed headless Chrome over CDP. Seven checks passed:
  - Enter submitted exactly once.
  - Three identical scans showed quantity 1 → 2 → 3.
  - Rapid different codes kept submission order.
  - An unknown code produced an accessible error without changing quantity.
  - The scanner accepted another scan after the error.
  - Focus returned to the input after processing.
  - The scanner form submit event was default-prevented.
- The temporary route and its WorkspaceShell public-route exception were removed. No app page or route was added to the product.
- Existing API tests cover normalized exact tenant lookup, unknown/foreign barcode denial, auth and OpenAPI. The inventory PostgreSQL suite passed 13/13. Full authenticated browser journeys through the actual new-sales-order, PO-receiving and sales-picking pages were not executed; retain that broader UAT under QUALITY-001. No inventory posting claim is based on the temporary component harness.

## Verification results

- `npm test`: API/shared **52 passed, 0 failed, 2 opt-in PostgreSQL suites skipped**; web **2 passed, 0 failed**.
- `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/inventory.postgres.integration.test.mjs`: **13 passed, 0 failed, 0 skipped**.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run format:check`: passed.
- `npm run build`: passed (shared, Nest API, Next.js Webpack production build).
- `npm run db:validate --workspace=@inventory/api`: passed in previous checkpoint.
- Read-only `npx prisma migrate status --config prisma.config.ts`: **20 migrations found; configured development schema up to date**.
- API readiness returned HTTP 200 and the local web login returned HTTP 200 while services were running. Services and isolated Chrome were stopped afterward.
- For an isolated migration check, all existing migrations were applied to a new random schema; that schema contained only migration artifacts and was dropped at the end. The configured `public` schema was not modified by migrations.
- No application test framework was added. An offline npm install attempt could not resolve cached package metadata; the actual rendered component was verified in Chrome instead.

## Remaining work and exact next steps

1. Continue QUALITY-002: rerun `npm audit --omit=dev --audit-level=high` when npm registry DNS works; inspect advisories and remediate only confirmed compatible risks. Keep the task IN_PROGRESS until the no-unresolved-high gate is evidenced or formally dispositioned.
2. Continue QUALITY-003: obtain owner-approved RPO/RTO, retention, residency and encryption/key-management policy; configure and drill independent off-host recovery. Local test timings do not establish production recovery commitments.
3. Keep full authenticated browser UAT for actual sales order scanning, PO receipt limits/post confirmation, sales picking reservation limits, and organization switching under QUALITY-001. Do not count the temporary component harness as full workflow UAT.
4. QUALITY-001 is not dependency-ready until REPORT-002 is complete; REPORT-002 remains gated by SALES-004/accounting/tax decisions. Do not invent those approvals.
5. Preserve current progress-document edits; no commits were created. No app changes remain from the temporary browser test.

## Current open blockers

- npm audit registry DNS previously returned `ENOTFOUND registry.npmjs.org`; earlier install output reported three high advisories without details.
- Production independent-account/off-site encrypted backup configuration and drill are not complete; owner approval for RPO/RTO and retention/residency/key policy is pending.
- Authenticated full-page browser UAT is not complete, although INV-010's scanner component acceptance passed.
- Other unresolved decisions remain in `docs/progress/decisions.md`: tax/accounting, RLS/support access, MFA enforcement and hosting/data residency.
