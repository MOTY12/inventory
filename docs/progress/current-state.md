# Current state

**Updated:** 2026-11-06 (Africa/Lagos) — INV-005/006 verified; INV-007 extended

## Repository and roadmap

- Workspace: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; starting HEAD `d865079` matched `origin/develop`. Worktree has uncommitted movement-history API/UI and isolated PostgreSQL integration test changes; preserve them.
- Roadmap is **14/47 completed**. INV-005 and INV-006 meet documented acceptance based on disposable PostgreSQL evidence. INV-001/002/003 and INV-007 remain IN_PROGRESS pending authenticated browser/API checks and remaining scope-denial assertions.
- PostgreSQL migration status was previously verified at 9 applied migrations. Current `prisma migrate status` and readiness checks could not connect in this sandbox; no migration was applied to the owner's DB this session. API port 4000 was not listening at final check. The disposable integration schema was deployed then dropped.

## Database and migration checkpoint

- Reviewed SQL for `20261102113000_products_and_unit_conversions`, `20261102143000_inventory_ledger_schema`, and `20261102150000_inventory_balance_projection`; these only create types/tables/indexes/constraints/trigger/function, with no DROP/TRUNCATE/DELETE operations.
- Applied all three product/ledger/balance migrations plus `20261106160000_stock_adjustments` using `npm run db:migrate:deploy --workspace=@inventory/api` against `inventory_dev`; Prisma reports 9 migrations found and schema up to date. No reset was run.
- Preserved row counts: before migration users/organizations/memberships = **13/3/3**; afterward still **13/3/3**. New products, movements, and balances each contained 0 rows at verification time.
- Environment validation and Prisma schema validation passed. Docker service health and database connectivity were explicitly verified; these do not imply API readiness.

## Implemented catalog and inventory surface

- INV-001/002/003: organization-scoped category/unit/product/conversion APIs and authenticated Catalog/Products UI are present. Disposable PostgreSQL tests verify product lifecycle, SKU/barcode uniqueness, Decimal money, search, tenant denial, and conversion constraints. Browser workflow remains pending.
- INV-005: append-only movement schema/trigger, tenant-scoped idempotency and outbox are verified in a disposable PostgreSQL schema; UPDATE and DELETE were rejected.
- INV-006: PostgreSQL tests verify opening, receipt, fulfillment and adjustment posting; weighted-average cost, idempotency replay/conflict, reservation floor, rollback, stale competing count safety, audit/outbox atomicity and reconciliation. Reservation creation and transfer batches remain future work.
## INV-007 implementation started

- Added one-product stock adjustment/count schema and additive migration `20261106160000_stock_adjustments`, now applied to `inventory_dev`. Tenant-composite FKs tie organization, warehouse, product, creator membership, and posted movement. Check constraints require nonnegative count snapshots and consistent DRAFT/POSTED fields.
- Added count DTO/service/controller routes for list, draft creation, and posting. Creation validates active tenant warehouse/product, product base-unit precision, nonzero variance, and reason; records the system quantity and an audit event. Posting checks snapshot freshness under the inventory row lock and atomically writes the adjustment's posted state with ledger/balance/audit/outbox/idempotency records.
- Added `/inventory` physical count entry and history UI, including exact decimal variance display and post action. Sidebar now links to Inventory counts and no longer repeats Products.
- Unit and disposable PostgreSQL tests cover draft/post, precision, stale snapshot, reserve floor, audit/outbox, rollback, reconciliation, and movement history. INV-007 remains IN_PROGRESS pending live authenticated browser workflow and explicit foreign-tenant/warehouse denial checks.

## Verification performed on 2026-11-06

- `docker compose ps`: PostgreSQL, Redis, and S3Mock reported healthy.
- `pg_isready -h localhost -p 5433`: accepting connections.
- `npm run validate:env`, `npm run db:validate --workspace=@inventory/api`, and `npx prisma migrate status --config prisma.config.ts`: passed; all 9 migrations applied.
- `npm run db:migrate:deploy --workspace=@inventory/api`: applied the three product/ledger/balance migrations and `20261106160000_stock_adjustments` successfully.
- `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/postgres.integration.test.mjs`: 10 passed, 0 failed, 0 skipped. These are auth/organization/location/catalog-unit tests; they do not cover product operations or inventory posting.
- This session: disposable PostgreSQL integration passed 5/5 using a generated schema, dropped during cleanup. `npm test` passed 35, failed 0, skipped 2; elevated permission was required for its temporary HTTP listener.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, Prisma validation, and `git diff --check` passed. Fresh migration-status and readiness checks could not connect in this sandbox; no live API/browser workflow is claimed.

## Outstanding decisions and blockers

- DEC-007 weighted-average costing and strict nonnegative availability remain provisional implementation assumptions, not validated accounting/customer requirements.
- PROD-002 and ARCH-002 product/security/release gates remain open as documented. They do not block additive database infrastructure, but remain gates for dependent domain behavior.
- Docker socket access requires an approved external command in this sandbox; authorized `docker compose ps` succeeded. Do not keep retrying the same denied sandbox command.
- Authenticated product browser workflow and INV-007 adjustment scope/browser checks remain. INV-008 is dependency-ready. Reservations belong to SALES-002 (dependencies SALES-001, INV-006, ARCH-001), not a standalone inventory task.

## Exact next steps

1. Start local Compose services and API with documented commands; confirm readiness and migration status, then run authenticated product/count/reconciliation browser workflows without resetting the database.
2. Add explicit foreign-tenant/warehouse denial assertions for adjustment routes and complete INV-007 after these and the browser workflow pass.
3. Implement INV-008 transfer draft/dispatch/in-transit/partial-receive workflow with atomic idempotent ledger postings, APIs/UI and disposable PostgreSQL concurrency/rollback/scope tests.
4. Implement SALES-001 customer directory before reservations in SALES-002, following documented dependencies and inventory semantics.
5. Consider INV-004 import/opening-balance workflow (INV-003/INV-006 dependencies are met) and continue in task-ledger order.
