# Next session checkpoint

**Updated:** 2026-11-09 (Africa/Lagos)

## Current state

- Repo: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; base commit at session start `353a049` (`Update migration.sql`). Changes from this session are uncommitted. No push was performed.
- Completed roadmap count remains **15/47**. No task was newly completed. SALES-003, INV-004, PROCUREMENT-002, and INV-009 remain IN_PROGRESS pending documented browser/dependency acceptance.
- INV-009 API, UI, Prisma schema and additive migration are implemented. Local migration `20261108190000_reorder_rules_low_stock` applied successfully; do not reset the DB.

## Implemented in this session

- `ReorderRule`, `LowStockAlert`, and `LowStockAlertHistory` schema, tenant composite constraints, check constraints and indexes; additive migration `apps/api/prisma/migrations/20261108190000_reorder_rules_low_stock/migration.sql`.
- Reorder rule create/list/update, threshold validation and warehouse-grant filtering. Exactly one rule per organization/product/warehouse.
- Low-stock evaluation with exact Decimal math, available = on-hand minus reserved, suggested = max(target minus available, 0), immutable event snapshots, open/update/resolve/reopen transitions, serializable transactions, row locks and bounded retry. Scheduler evaluates every five minutes per API process; manual evaluate endpoint included.
- Incoming POs and in-transit stock are excluded from the projected quantity (incoming shown as zero). No automatic purchase order creation.
- Authenticated UI routes `/inventory/reorder-rules` and `/inventory/low-stock`, workspace links, manual evaluate action, and dashboard alert count/list.
- Files touched include Prisma schema/migration, inventory module/reordering service/controller/DTO/scheduler, integration test, web dashboard/shell/reordering pages, and roadmap/progress/architecture docs. Use `git status --short` for exact list.

## Verification actually completed

- Prisma format, validation and client generation passed.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` passed (**40 pass, 0 fail, 2 PostgreSQL suites skipped by default**), and production `npm run build` passed. The Next route list includes both reorder pages.
- Isolated PostgreSQL integration passed **12/12, 0 failures** after applying migrations in a unique temporary schema; the schema was dropped by the suite. It verifies threshold/duplicate errors, tenant scoping, reservation-aware formula, concurrent evaluation, one alert/history stream, resolution and reopening, and regressions for inventory/purchasing/sales/imports/transfers.
- First integration run revealed incorrect alert-history field mapping and a concurrency serialization wrapper; both were fixed and the passing suite rerun. Sandbox loopback denial was bypassed only through approved local integration execution.
- Applied local additive migration using `npm run db:migrate:deploy --workspace=@inventory/api`; deploy succeeded. Before deploy, `migrate status` showed only this new migration pending. Post-deploy `npx prisma migrate status --config prisma.config.ts` confirmed all 19 migrations applied.
- Browser acceptance not done: Work settings report local browser use disabled. Do not claim UI acceptance passed.
- The scheduler's five-minute timing/cadence has not been asserted by an automated clock test; only manual evaluation and persistence/concurrency behavior were exercised.

## Remaining gates / decisions

- INV-009 stays IN_PROGRESS because PROCUREMENT-002 is still IN_PROGRESS and browser acceptance is unavailable. Completed count remains 15/47.
- REPORT-001 depends on INV-009 and must not start until that milestone’s gates pass.
- Incoming supply policy is unresolved; current implementation explicitly excludes purchase orders and in-transit quantities. The per-process scheduler has DB serialization/idempotency, not a distributed queue.
- SALES-004 remains gated on tax, invoice, payment and accounting decisions.

## Exact next steps

1. Migration status is verified at 19/19 current; rerun only if the local DB changes before continuing.
2. Inspect `git status --short` and `git diff`; preserve all changes. Then rerun `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build && git diff --check` after any modifications.
3. When browser control is enabled, log in and manually verify sales confirm → partial/multiple pick → partial/full fulfillment; product/opening CSV preview, validation, commit and replay; reorder rule create/edit/pause and low-stock open/evaluate/recovery/reopen. Verify warehouse-grant visibility.
4. Update task statuses only from actual acceptance evidence. Keep 15/47 until criteria for a roadmap task are fully satisfied.
5. After INV-009 gates and dependencies are actually satisfied, inspect REPORT-001 acceptance and dependencies, then build tenant/warehouse scoped reports with quantities reconciled to the ledger cutoff. Avoid valuation/accounting assumptions not approved.
6. No commit or push was created; commit only a coherent verified milestone if safe. Never reset or clean unrelated work.
