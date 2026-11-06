# Next session handoff

## Checkpoint — 2026-11-06 (Africa/Lagos)

Workspace `/Users/newuser/Documents/GitHub/inventory`, branch `develop`, starting HEAD `d865079` matched `origin/develop`. Current worktree has uncommitted source/test changes: inventory movement history API/UI and an isolated PostgreSQL integration suite. Preserve all edits. Do not stage `.env`, generated files, or unrelated changes. Roadmap progress is **14/47 completed**; INV-005/006 are complete, while INV-001/002/003/007 remain in progress.

## Delivered and verified this execution

- Added `apps/api/test/inventory.postgres.integration.test.mjs`. It creates a unique schema, deploys all Prisma migrations there, runs tests, drops only its own schema, and restores `DATABASE_URL`.
- Database integration verifies product lifecycle, SKU/barcode uniqueness, Decimal prices/costs, search, tenant denial, unit conversion uniqueness and foreign-unit denial; opening/receipt/fulfillment posting; weighted-average cost; idempotent replay/conflict; stock reservation floor; immutable movement UPDATE/DELETE rejection; adjustment posting and stale competing count safety; audit/outbox; failed outbox rollback; and balance/ledger reconciliation.
- Added tenant/warehouse-scoped paginated inventory movement history endpoint and `/inventory` history UI.
- INV-005 and INV-006 acceptance criteria now pass; their statuses were changed to COMPLETED. No owner database rows were changed by the disposable-schema suite.

## Checks

- `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/inventory.postgres.integration.test.mjs`: **5 passed, 0 failed**. Elevated local DB access was required; suite cleaned up its temporary schema.
- `npm test`: **35 passed, 0 failed, 2 skipped** (opt-in PostgreSQL suites). Elevated permission was required for its temporary local HTTP listener.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run db:validate --workspace=@inventory/api`, `git diff --check`: passed.
- Fresh `npx prisma migrate status --config prisma.config.ts` and `curl http://localhost:4000/api/v1/health/ready` did not connect in this sandbox. No live API readiness or browser workflow is claimed. A previous checkpoint verified nine migrations applied to `inventory_dev`; this session made no migration against that database.
- No commit or push created.

## Remaining task status and decisions

- INV-001/002/003: implementation and database service behavior are tested, but authenticated browser/API workflows remain unverified.
- INV-007: PostgreSQL posting, stale snapshot, reserve floor, audit/outbox, rollback, reconciliation and movement history are tested. Still needs live authenticated browser flow and explicit foreign-tenant/warehouse denial tests for adjustment routes.
- INV-008 is now dependency-ready (INV-006 and FOUNDATION-009 complete). Implement draft, dispatch, in-transit, partial receive and safe/idempotent ledger postings per `docs/architecture/inventory-semantics.md`.
- Reservation lifecycle is part of SALES-002, depending on SALES-001, INV-006 and ARCH-001; there is no separate reservation task ID in the approved 47-task roadmap.
- DEC-007 weighted-average cost and strict nonnegative availability remain provisional. PROD-002/ARCH-002 open product/security/release decisions remain documented.

## Exact next steps

1. Start Docker services and API with repository commands; confirm readiness and migration status. Do not reset `inventory_dev`.
2. Run authenticated product and inventory browser flows in Chrome. Add explicit adjustment cross-tenant and warehouse-scope denial tests. Complete INV-007 only after these pass.
3. Implement INV-008 end-to-end: schema/migration, APIs, services, DTO validation, tenant/warehouse permissions, transaction/idempotency, UI, and disposable PostgreSQL tests for success, partial receiving, concurrency, rollback and scope.
4. Continue eligible task selection from `docs/implementation/task-breakdown.md`; implement SALES-001 before reservations in SALES-002. INV-004 is also dependency-ready now that INV-006 is complete.
5. Update task ledger, current-state, completed-tasks and session-log after each verified task. Do not push without authorization.
