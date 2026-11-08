# Next session checkpoint

**Updated:** 2026-11-08 (Africa/Lagos)

## Current repository state

- Repository: `/Users/newuser/Documents/GitHub/inventory`, branch `develop`.
- Starting commit this execution: `b1e7ed9` (`Update the sales record`). Changes are uncommitted and cover the SALES-003 picking workflow, INV-004 imports, tests, API contract notes and progress docs. Preserve them; do not reset or clean.
- Completed roadmap count: **15/47**. SALES-003 and INV-004 remain IN_PROGRESS pending authenticated browser acceptance. `docs/implementation/task-breakdown.md` is the status source of truth.
- Local additive migrations: `20261108160000_sales_picking` and `20261108180000_product_imports` are applied; `npx prisma migrate status --config prisma.config.ts` reports all 18 current. No data reset/deletion occurred.

## Completed implementation in this execution

- SALES-003 persisted picks, cumulative picked quantities, concurrency/idempotency enforcement, authorization and fulfillment bound to picked quantity; sales order detail UI now supports pick and fulfill history/actions.
- INV-004 includes CSV templates, upload and column mapping, parsing limits, validation/duplicate detection, preview-only batches, explicit commit, batch history, create-only product imports, and opening balance posting through the immutable inventory posting service. Product/opening commits are atomic and idempotent. Opening balance imports reject product/warehouse pairs with existing movement or balance history.
- New files include `apps/api/src/imports/`, `apps/web/src/app/imports/page.tsx`, and additive Prisma migrations listed above. Other edited files are visible in `git status --short`; inspect diff before proceeding.

## Checks actually run

- Final `npm run typecheck`, `npm run lint`, `npm run format:check`, `npx prisma validate --config prisma.config.ts`, `npm run build`, and `git diff --check`: passed.
- `npm test`: passed, **40 pass / 0 fail / 2 skipped**. Requires local network permission because existing HTTP API contract test binds a temporary port. An initial sandbox-only attempt failed with `listen EPERM`; escalated rerun passed.
- `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/inventory.postgres.integration.test.mjs`: passed, **11 pass / 0 fail / 0 skipped**, including current import rollback cases, in an isolated schema that the suite dropped.
- Full production build passed after final code changes; Next route output includes `/imports`.
- Chrome is installed, but CUA/browser discovery reports “Local browser use is disabled in Work settings.” No authenticated browser pass is claimed.
- Local migrate deploy applied the imports migration; final read-only migration status verified 18/18 current.

## Next exact steps

1. If browser control becomes available, exercise authenticated sales picking/partial fulfillment and product/opening-balance CSV import end to end. Current browser-disabled setting is the blocker.
2. Keep SALES-003 and INV-004 IN_PROGRESS until browser acceptance passes. The roadmap count stays 15/47.
3. After they pass, inspect the actual dependencies and status of PROCUREMENT-002; start INV-009 (reorder thresholds/alerts) only if all prerequisites are met. Do not start SALES-004 until invoice/tax/payment/accounting decisions are approved.
4. No commit or push was made. Continue preserving this worktree; no destructive Git/database commands.

## Outstanding decisions and blockers

- Browser automation is disabled by Work settings; user must enable it or allow a supported browser test environment.
- Opening-balance imports are create-only and restricted to an uninitialized product/warehouse pair. This is a conservative provisional behavior and is documented as not a validated business requirement.
- Invoice/tax/payment/accounting policy remains open and gates SALES-004.
