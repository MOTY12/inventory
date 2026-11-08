# Current state

**Updated:** 2026-11-08 (Africa/Lagos)

## Repository and roadmap

- Workspace: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; starting `HEAD` was `b1e7ed9` (`Update the sales record`). Worktree already contained related uncommitted SALES-003 work from the prior execution; it was preserved and continued. No commit or push was created in this execution.
- Completed roadmap count remains **15/47**. SALES-003 and INV-004 have implementation plus database/API verification, but remain IN_PROGRESS pending authenticated browser acceptance. No task was marked complete based solely on a build.
- Local database: `inventory_dev` at `localhost:5433`. `20261108160000_sales_picking` and `20261108180000_product_imports` are applied with Prisma `migrate deploy`. Read-only `npx prisma migrate status --config prisma.config.ts` reports all 18 migrations current. Never reset or deleted existing data.

## Implemented this continuation

- **SALES-003:** tenant-composite pick documents/lines; cumulative picked quantity and DB check; pick list/create endpoints; reservation/warehouse/tenant-scoped pick service with idempotency, row locks, exact unit conversion, audit/outbox; fulfillment blocked above picked quantity; cancellation rejects outstanding picked stock. Sales order detail UI presents ordered/reserved/picked/fulfilled/outstanding quantities, pick/fulfill actions and history.
- **INV-004:** CSV parser with BOM/quoted field support, duplicate headers and size/row/field bounds; mapped product and opening-balance preview; duplicate SKU/barcode and reference validation; batches, history, idempotent atomic commit; product audit; opening stock via `InventoryPostingService`; conservative opening policy only when product/warehouse has no prior movement or balance; `/imports` UI with templates, mapping, row preview/errors, totals and explicit commit.
- New web upload requests preserve multipart `FormData` rather than JSON-encoding it.

## Verification results

- Passed final `npm run typecheck`, `npm run lint`, `npm run format:check`, `npx prisma validate --config prisma.config.ts`, `npm run build`, and `git diff --check`.
- Passed `npm test`: 40 passed, 0 failed, 2 opt-in database suites skipped.
- Passed `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/inventory.postgres.integration.test.mjs`: 11 passed, 0 failed, 0 skipped in an isolated temporary PostgreSQL schema. Coverage includes picking/fulfillment races, rollback, scope, inventory reconciliation, product import preview/commit/replay, opening stock posting/replay, invalid rows and injected product/opening outbox rollback. The test schema was removed after execution.
- Passed final production build for shared, NestJS API, and Next.js web. `/imports` appears in generated route output.
- The first default `npm test` attempt failed because the sandbox denied binding the existing temporary HTTP test port; rerun with local network permission passed.
- Browser inventory confirms Chrome is present but browser control is disabled in Work settings. Authenticated UI flows have not been browser verified.
- `migrate deploy` applied the additive import migration without reset; final read-only status confirmed 18/18 current.

## Acceptance status and decisions

- SALES-003: implementation and isolated DB acceptance covered; task remains IN_PROGRESS solely pending authenticated browser review. No carrier/shipping scope added.
- INV-004: implementation and isolated DB acceptance covered; task remains IN_PROGRESS pending authenticated browser review. Import is create-only; opening stock cannot overwrite historical inventory.
- INV-009 is not started. The actual roadmap defines it as reorder rules/alerts and dependencies include PROCUREMENT-002; attached prompt says advance only after SALES-003 and INV-004 are complete and verified. Browser acceptance is still outstanding for both, so do not start it yet.
- SALES-004 remains gated by tax/invoice/payment/accounting decisions. Provisional opening-stock policy: create one opening ledger posting only for a product/warehouse pair with no prior movement/balance; this is a conservative implementation default, not a validated business requirement.

## Exact next steps

1. When browser control is enabled, sign in to a development workspace and exercise sales order confirm → partial/multiple pick → partial/full fulfill, then import product CSV preview/error/reupload/commit and opening balance preview/commit/history.
2. Keep SALES-003 and INV-004 IN_PROGRESS until authenticated browser workflows pass; then update roadmap completion count based on actual criteria.
3. Only after those milestones are verified, inspect PROCUREMENT-002 status/dependencies and start INV-009 reorder rules/alerts if its prerequisites are satisfied. Do not start SALES-004 without financial-policy approval.
4. Preserve all current uncommitted work. No Git commit or push was made.
