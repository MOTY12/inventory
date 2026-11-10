# Current state

**Updated:** 2026-11-09 (Africa/Lagos)

## Repository and roadmap

- Workspace: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; starting `HEAD` was `353a049` (`Update migration.sql`) and worktree was clean. Current implementation and test changes are uncommitted; preserve them. No push was performed.
- Completed roadmap count remains **15/47**. SALES-003 and INV-004 have implementation plus database/API verification, but remain IN_PROGRESS pending authenticated browser acceptance. No task was marked complete based solely on a build.
- Local database: `inventory_dev` at `localhost:5433`. Reorder migration `20261108190000_reorder_rules_low_stock` was applied additively with `npm run db:migrate:deploy --workspace=@inventory/api` after isolated schema validation. No reset/deletion was run. Post-deploy `npx prisma migrate status --config prisma.config.ts` confirmed all 19 migrations applied.

## INV-009 implementation milestone

- Added exact-Decimal, tenant-composite reorder rules and one-current-alert/history tables. Rule thresholds validate target > minimum ≥ 0 and product unit precision; duplicate org/product/warehouse rules conflict.
- Added authenticated APIs: GET/POST `organizations/current/inventory/reorder-rules`, PATCH `.../reorder-rules/:ruleId`, GET `.../reorder-rules/:ruleId/history`, POST `.../reorder-rules/evaluate`, GET `organizations/current/inventory/low-stock`.
- Rule and alert APIs filter by organization and warehouse grants. Evaluation uses `available = on hand - reserved`; recommendation is `max(target - available, 0)`. Incoming PO and in-transit supply are deliberately excluded and shown as 0; no automatic PO creation.
- Alert lifecycle: OPENED, UPDATED, RESOLVED, REOPENED, with quantity snapshots. Per-process five-minute schedule plus manual evaluation; serializable transactions, row lock, uniqueness and bounded retry. No distributed worker/queue was added.
- UI: `/inventory/reorder-rules`, `/inventory/low-stock`, workspace navigation and real dashboard low-stock indicators.
- Scheduled five-minute cadence is implemented but not timed in automated tests; manual evaluation and DB concurrency/transition behavior are integration tested. Browser workflows are unverified.

## Implemented this continuation

- **SALES-003:** tenant-composite pick documents/lines; cumulative picked quantity and DB check; pick list/create endpoints; reservation/warehouse/tenant-scoped pick service with idempotency, row locks, exact unit conversion, audit/outbox; fulfillment blocked above picked quantity; cancellation rejects outstanding picked stock. Sales order detail UI presents ordered/reserved/picked/fulfilled/outstanding quantities, pick/fulfill actions and history.
- **INV-004:** CSV parser with BOM/quoted field support, duplicate headers and size/row/field bounds; mapped product and opening-balance preview; duplicate SKU/barcode and reference validation; batches, history, idempotent atomic commit; product audit; opening stock via `InventoryPostingService`; conservative opening policy only when product/warehouse has no prior movement or balance; `/imports` UI with templates, mapping, row preview/errors, totals and explicit commit.
- New web upload requests preserve multipart `FormData` rather than JSON-encoding it.

## Verification results

- Passed final `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run db:validate --workspace=@inventory/api`, `npm test` (40 passed, 0 failed, 2 opt-in PostgreSQL suites skipped), `npm run build`, and `git diff --check` after the reorder UI/API work.
- Passed `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/inventory.postgres.integration.test.mjs`: 12 passed, 0 failed, 0 skipped in isolated temporary PostgreSQL schema. Includes new rule thresholds, duplicate/tenant denial, reservation-aware formula, concurrent evaluation without duplicate history, recovery resolution, and alert reopening, plus existing inventory, purchasing, sales, import and transfer regressions. The isolated schema was removed.
- Applied local migration `20261108190000_reorder_rules_low_stock` additively; the migration deploy reported success. Production build route output includes `/inventory/reorder-rules` and `/inventory/low-stock`.
- The first default `npm test` attempt failed because the sandbox denied binding the existing temporary HTTP test port; rerun with local network permission passed.
- Browser inventory confirms Chrome is present but browser control is disabled in Work settings. Authenticated UI flows have not been browser verified.
- `migrate deploy` applied the additive import migration without reset; final read-only status confirmed 18/18 current.

## Acceptance status and decisions

- SALES-003: implementation and isolated DB acceptance covered; task remains IN_PROGRESS solely pending authenticated browser review. No carrier/shipping scope added.
- INV-004: implementation and isolated DB acceptance covered; task remains IN_PROGRESS pending authenticated browser review. Import is create-only; opening stock cannot overwrite historical inventory.
- INV-009 implementation is present but remains IN_PROGRESS: dependency PROCUREMENT-002 remains IN_PROGRESS and authenticated browser acceptance is disabled. Do not count as complete. Browser acceptance/manual workflow is outstanding.
- SALES-004 remains gated by tax/invoice/payment/accounting decisions. Provisional opening-stock policy: create one opening ledger posting only for a product/warehouse pair with no prior movement/balance; this is a conservative implementation default, not a validated business requirement.

## Exact next steps

1. Migration status was verified 19/19 current after deploy; rerun only if the DB changes before the next session.
2. When browser control is enabled, run authenticated workflows for sales picking/fulfillment, product/opening CSV import, and reorder rules (create/edit/pause; low-stock open, evaluate, recovery, reopen; warehouse-grant visibility). Record manual acceptance results; browser is currently disabled.
3. Keep SALES-003, INV-004, PROCUREMENT-002, and INV-009 IN_PROGRESS until their own criteria and browser gates pass. Completed count remains 15/47.
4. Do not begin REPORT-001 until INV-009 completion gates pass. Then verify actual REPORT-001 dependencies and implement tenant/warehouse scoped ledger-reconciled reports; do not start SALES-004 absent financial policy approval.
5. Run final workspace checks after latest changes and preserve the current uncommitted work. No Git commit or push was made.
