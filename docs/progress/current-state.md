# Current state

**Updated:** 2026-11-08 (Africa/Lagos)

## Repository and roadmap

- Workspace: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; current HEAD and `origin/develop` are `ce93cc2` (`Update the prompt`), authored by MOTY during this execution. Starting HEAD was `3a8796a`. That commit contains the initial transfer migration/schema/API/UI. This agent made no commit or push; inspect remaining worktree changes before continuing.
- Completed roadmap count remains **14/47**. INV-008 and SALES-001 are `IN_PROGRESS`; SALES-002 has not started. Existing INV-001/002/003/007 and PROCUREMENT-001/002/003 remain in progress as listed in `docs/implementation/task-breakdown.md`.
- No push was performed by this agent. Existing synthetic rows in `inventory_dev.public` remain preserved.

## Delivered in this work session

- Added tenant-composite Prisma schema for transfer headers, lines, dispatches, dispatch lines, receipts, receipt lines, sequence numbers and status history.
- Applied additive migrations `20261107130000_stock_transfers`, `20261108090000_customer_directory`, and `20261108100000_stock_transfer_constraints` to local `inventory_dev`. Prisma reports 14 migrations found and database schema up to date. No reset or data deletion.
- Implemented tenant and both-warehouse access checks, role/capability guarded endpoints, draft creation, listing/search/status/warehouse filtering/pagination, detail/history, submit/cancel before dispatch, idempotent dispatch and partial/full idempotent receipt.
- Transfer movement and balance changes now go through `InventoryPostingService` transaction-composable methods. Dispatch decreases source on-hand and increases source in-transit; receipt decreases in-transit and increases destination on-hand with the existing weighted-average-cost policy. Audit and outbox records are in the same transaction.
- Added `/transfers` list/create/actions and `/transfers/[transferId]` detail, status/receipt history and quantity summary. UI supports search, status/warehouse filters, pagination and multiple draft lines.
- Added isolated PostgreSQL acceptance coverage for tenant denial, warehouse grants, insufficient availability, dispatch replay, over-receive prevention, partial/full receiving, concurrent competing receipts and transfer outbox rollback.
- Advanced into dependency-ready SALES-001: added customer type/status, organization-scoped optional email uniqueness, contact and billing/shipping address fields, additive migration `20261108090000_customer_directory`, guarded CRUD/search/pagination/archive/audit APIs, `/customers` register/create and detail/edit/archive UI, and customer integration coverage.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, and `npx prisma validate --config prisma.config.ts`: passed after customer and transfer code changes. Build includes `/customers`, `/customers/[customerId]`, `/transfers`, and `/transfers/[transferId]`.
- Full `npm test`: **40 passed, 0 failed, 2 opt-in PostgreSQL suites skipped**, run with escalation because sandbox denied the test's temporary localhost listener.
- Latest isolated `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/inventory.postgres.integration.test.mjs`: **9 passed, 0 failed** after the constraint migration. It asserted the generated schema before fixture writes and dropped only that schema. It did not modify or clean `inventory_dev.public`.
- `npx prisma migrate status --config prisma.config.ts`: passed; database schema is up to date with 14 migrations.
- Browser automation is disabled in Codex Work settings. Authenticated transfer UI workflow is therefore unverified; no browser success is claimed.
- Migration application changed only additive schema and `_prisma_migrations` state. Previously identified synthetic fixture data in `inventory_dev.public` remains untouched.

## Remaining acceptance

- INV-008's database checks include competing dispatch and receiving races, rollback, tenant and warehouse scope. Authenticated transfer UI workflow remains unverified.
- SALES-001's CRUD/search/archive/tenant/uniqueness service flow passes isolated DB checks; authenticated customer UI workflow remains unverified.
- Rerun all checks after final edits and keep both tasks `IN_PROGRESS` until acceptance review is satisfied.

## Decisions and blockers

- Transfer progression uses DRAFT → SUBMITTED → IN_TRANSIT → PARTIALLY_RECEIVED → RECEIVED, with cancellation only before dispatch. No approval state or approval policy is documented, so no approval step was invented.
- Transfers use the provisional weighted-average-cost policy and preserve source cost snapshot at dispatch; these are implementation defaults, not validated accounting/customer requirements.
- Browser control is blocked by Work settings. PostgreSQL is available only through escalated local access.

## Exact next steps

1. Run `git diff --check`, inspect the remaining diff, and verify no generated build files remain modified.
2. Keep INV-008 and SALES-001 IN_PROGRESS because authenticated browser acceptance is unavailable; completed count remains 14/47.
3. Continue with SALES-002 after customer workflow acceptance review; its reservations must stay consistent with the existing inventory posting engine.
