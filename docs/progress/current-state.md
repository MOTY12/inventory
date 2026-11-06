# Current state

**Updated:** 2026-11-06 (Africa/Lagos) — INV-007 adjustment workflow started

## Repository and roadmap

- Workspace: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; start HEAD `5d098bf update the plan`, equal to `origin/develop`. Working tree contains this session's INV-007 code and progress edits; preserve them. Do not stage `.env`, generated files, or unrelated changes.
- Roadmap remains **12/47 completed**. INV-001, INV-002, INV-003, INV-005, INV-006, and INV-007 are IN_PROGRESS. Product/inventory database acceptance tests remain incomplete; INV-007 depends on INV-006/003.
- Local Compose PostgreSQL, Redis, and S3Mock were previously verified healthy. The new stock adjustment migration was deployed. Started the Nest API after the production build; `/api/v1/health/ready` returned HTTP 200 and Nest logged all three adjustment routes. No authenticated browser workflow was exercised.

## Database and migration checkpoint

- Reviewed SQL for `20261102113000_products_and_unit_conversions`, `20261102143000_inventory_ledger_schema`, and `20261102150000_inventory_balance_projection`; these only create types/tables/indexes/constraints/trigger/function, with no DROP/TRUNCATE/DELETE operations.
- Applied all three product/ledger/balance migrations plus `20261106160000_stock_adjustments` using `npm run db:migrate:deploy --workspace=@inventory/api` against `inventory_dev`; Prisma reports 9 migrations found and schema up to date. No reset was run.
- Preserved row counts: before migration users/organizations/memberships = **13/3/3**; afterward still **13/3/3**. New products, movements, and balances each contained 0 rows at verification time.
- Environment validation and Prisma schema validation passed. Docker service health and database connectivity were explicitly verified; these do not imply API readiness.

## Implemented catalog and inventory surface

- INV-001/002/003: organization-scoped category/unit/product APIs, product-specific unit conversion API, product create/list/detail/edit/archive, filtering/pagination, audit events, and authenticated Catalog/Products UI are present. These product/conversion workflows have not yet been exercised end-to-end against PostgreSQL or Chrome.
- INV-005: append-only stock movement schema, immutability trigger, tenant-scoped idempotency records and outbox schema are now migrated. Trigger behavior has not yet been tested by attempting mutation.
- INV-006: balance projection and reconciliation reads plus internal single-warehouse opening, receipt, fulfillment, and adjustment posting are implemented. Posting uses serializable transactions, balance row locks, reservation floor checks, weighted-average inbound cost, payload-hash idempotency, audit and outbox records. It has not been verified with database-backed posting/concurrency/replay/rollback tests; reservation creation and transfer batches are absent.
## INV-007 implementation started

- Added one-product stock adjustment/count schema and additive migration `20261106160000_stock_adjustments`, now applied to `inventory_dev`. Tenant-composite FKs tie organization, warehouse, product, creator membership, and posted movement. Check constraints require nonnegative count snapshots and consistent DRAFT/POSTED fields.
- Added count DTO/service/controller routes for list, draft creation, and posting. Creation validates active tenant warehouse/product, product base-unit precision, nonzero variance, and reason; records the system quantity and an audit event. Posting checks snapshot freshness under the inventory row lock and atomically writes the adjustment's posted state with ledger/balance/audit/outbox/idempotency records.
- Added `/inventory` physical count entry and history UI, including exact decimal variance display and post action. Sidebar now links to Inventory counts and no longer repeats Products.
- Automated unit tests cover draft scoping/snapshot/audit, precision validation, and idempotent posting payload shape. The service has not yet been exercised end-to-end against PostgreSQL; movement history UI and authenticated browser testing remain open. INV-007 stays IN_PROGRESS.

## Verification performed on 2026-11-06

- `docker compose ps`: PostgreSQL, Redis, and S3Mock reported healthy.
- `pg_isready -h localhost -p 5433`: accepting connections.
- `npm run validate:env`, `npm run db:validate --workspace=@inventory/api`, and `npx prisma migrate status --config prisma.config.ts`: passed; all 9 migrations applied.
- `npm run db:migrate:deploy --workspace=@inventory/api`: applied the three product/ledger/balance migrations and `20261106160000_stock_adjustments` successfully.
- `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/postgres.integration.test.mjs`: 10 passed, 0 failed, 0 skipped. These are auth/organization/location/catalog-unit tests; they do not cover product operations or inventory posting.
- `npm test` after INV-007: 35 passed, 0 failed, 1 opt-in PostgreSQL suite skipped; the local HTTP listener test needed elevated execution due sandbox EPERM.
- After the final UI decimal formatter change, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, and `git diff --check` all passed. The generated `apps/web/tsconfig.tsbuildinfo` was restored to HEAD and is not part of the changes.
- The API dev server is running after the production build. Final migration status is current; readiness returned HTTP 200 and an unauthenticated adjustment list request returned HTTP 401, confirming the route requires authentication. Authenticated adjustment commands and browser checks were not performed.

## Outstanding decisions and blockers

- DEC-007 weighted-average costing and strict nonnegative availability remain provisional implementation assumptions, not validated accounting/customer requirements.
- PROD-002 and ARCH-002 product/security/release gates remain open as documented. They do not block additive database infrastructure, but remain gates for dependent domain behavior.
- Docker socket access requires an approved external command in this sandbox; authorized `docker compose ps` succeeded. Do not keep retrying the same denied sandbox command.
- Product CRUD/conversion smoke tests, INV-006 critical transaction tests, and INV-007 database-backed posting tests are the immediate verification gaps.

## Exact next steps

1. Add and run disposable PostgreSQL integration tests for product CRUD/update/archive, conversion uniqueness/tenant scope, ledger immutability, and `InventoryPostingService` idempotent replay/conflict, negative availability, weighted cost, rollback, row-lock race, and reconciliation.
2. Add adjustment PostgreSQL tests for draft/post/replay, stale snapshot rejection, reserved floor, rollback, audit/outbox, tenant/warehouse scope, and immutable movement behavior. Use a disposable schema or fixtures with safe cleanup; never leave immutable test movements in the owner's development data.
3. Run authenticated API and Chrome workflow for product, count draft/variance/post, and reconciliation. Keep results pending until executed.
4. Finish INV-007 (including stock movement history UI/tests), then complete INV-006 acceptance; proceed with reservation and INV-008 transfers. PROCUREMENT-001 is independently dependency-ready per the roadmap; sequence purchase orders/receiving after the inventory posting foundation is verified. Sales follows the task dependency graph.
5. Keep task status, 12/47 count, current-state, this handoff, and session-log accurate; do not claim INV-007 complete until its remaining acceptance criteria pass.
