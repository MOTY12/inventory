# Current state

**Updated:** 2026-11-06 (Africa/Lagos) — inventory migrations deployed to local development database

## Repository and roadmap

- Workspace: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; HEAD `57fa537 update the code`, equal to `origin/develop`; worktree was clean before documentation updates. No unrelated work was present. Do not stage `.env` or secrets.
- Roadmap remains **12/47 completed**. INV-001, INV-002, INV-003, INV-005, and INV-006 are still IN_PROGRESS: implementation exists, but product/inventory database workflow acceptance and/or required tests remain incomplete. INV-007 is NOT_STARTED and depends on INV-006 and INV-003.
- Local Compose PostgreSQL, Redis, and S3Mock were started and reported healthy by `docker compose ps`. PostgreSQL `localhost:5433` accepted connections. API on port 4000 was not running when checked; no runtime API or browser inventory workflow is claimed.

## Database and migration checkpoint

- Reviewed SQL for `20261102113000_products_and_unit_conversions`, `20261102143000_inventory_ledger_schema`, and `20261102150000_inventory_balance_projection`; these only create types/tables/indexes/constraints/trigger/function, with no DROP/TRUNCATE/DELETE operations.
- Applied all three using `npm run db:migrate:deploy --workspace=@inventory/api` against `inventory_dev`; Prisma reports 8 migrations found and schema up to date. No reset was run.
- Preserved row counts: before migration users/organizations/memberships = **13/3/3**; afterward still **13/3/3**. New products, movements, and balances each contained 0 rows at verification time.
- Environment validation and Prisma schema validation passed. Docker service health and database connectivity were explicitly verified; these do not imply API readiness.

## Implemented catalog and inventory surface

- INV-001/002/003: organization-scoped category/unit/product APIs, product-specific unit conversion API, product create/list/detail/edit/archive, filtering/pagination, audit events, and authenticated Catalog/Products UI are present. These product/conversion workflows have not yet been exercised end-to-end against PostgreSQL or Chrome.
- INV-005: append-only stock movement schema, immutability trigger, tenant-scoped idempotency records and outbox schema are now migrated. Trigger behavior has not yet been tested by attempting mutation.
- INV-006: balance projection and reconciliation reads plus internal single-warehouse opening, receipt, fulfillment, and adjustment posting are implemented. Posting uses serializable transactions, balance row locks, reservation floor checks, weighted-average inbound cost, payload-hash idempotency, audit and outbox records. It has not been verified with database-backed posting/concurrency/replay/rollback tests; reservation creation and transfer batches are absent.
- INV-007 has not started. No adjustment document API/UI exists.

## Verification performed on 2026-11-06

- `docker compose ps`: PostgreSQL, Redis, and S3Mock reported healthy.
- `pg_isready -h localhost -p 5433`: accepting connections.
- `npm run validate:env`, `npm run db:validate --workspace=@inventory/api`, and `npx prisma migrate status --config prisma.config.ts`: passed; schema up to date.
- `npm run db:migrate:deploy --workspace=@inventory/api`: applied the three listed migrations successfully.
- `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/postgres.integration.test.mjs`: 10 passed, 0 failed, 0 skipped. These are auth/organization/location/catalog-unit tests; they do not cover product operations or inventory posting.
- `npm test`: first sandbox run had 1 failure because its local HTTP test server could not bind (`EPERM`); approved out-of-sandbox rerun passed 32, failed 0, skipped 1 opt-in PostgreSQL suite.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, and `git diff --check`: passed.
- API readiness curl to `localhost:4000` returned connection refused; API was not running. Browser checks were not performed.

## Outstanding decisions and blockers

- DEC-007 weighted-average costing and strict nonnegative availability remain provisional implementation assumptions, not validated accounting/customer requirements.
- PROD-002 and ARCH-002 product/security/release gates remain open as documented. They do not block additive database infrastructure, but remain gates for dependent domain behavior.
- Docker socket access requires an approved external command in this sandbox; authorized `docker compose ps` succeeded. Do not keep retrying the same denied sandbox command.
- Inventory migration application is done; product CRUD/conversion smoke tests and INV-006 critical transaction tests are now the immediate implementation/verification gap.

## Exact next steps

1. Add and run disposable PostgreSQL integration tests for product create/list/update/archive, conversion uniqueness/tenant scope, ledger immutability, and `InventoryPostingService` idempotent replay/conflict, negative available rejection, weighted cost, rollback, row-lock race, and reconciliation. Clean up only test-owned fixtures.
2. Fix any failures and run schema validation, typecheck, lint, formatting, build, and tests. Update INV-001/002/003/005/006 only to the statuses supported by acceptance evidence; do not increase the 12/47 count unless task criteria pass.
3. Start the API only after any production build completes (build rewrites shared `apps/api/dist`); verify readiness and authenticated product/inventory calls against PostgreSQL if runtime access is available.
4. Implement INV-007 adjustment draft/count/delta preview/reason/post/history as an atomic, tenant- and warehouse-scoped document flow with idempotency, audit/outbox and a real UI; require a fresh count if the balance changed after the draft snapshot.
5. Continue in `docs/implementation/task-breakdown.md` dependency order; keep exact results and next actions in this file, `next-session.md`, and `session-log.md`.
