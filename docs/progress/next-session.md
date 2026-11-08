# Next session handoff

## Checkpoint — 2026-11-08 (Africa/Lagos)

Repository: `/Users/newuser/Documents/GitHub/inventory`, branch `develop`. `HEAD` and `origin/develop` are `5938d93` (`feat: add sales order`). The commit contains the implementation milestone. Follow-up edits remain uncommitted in sales UI/API/schema and progress docs; preserve and inspect them before editing. No commit or push was made. Roadmap progress is **15/47**: SALES-002 COMPLETED; SALES-003 IN_PROGRESS.

## Implemented and verified

- SALES-002: order and reservation schema/API/UI; draft/edit/list/detail, Decimal totals, tenant/warehouse scope, confirmation reservations, idempotent cancellation release, reservation reconciliation. Database acceptance for oversell races, replay, insufficient stock, tenant denial and cancellation passed.
- SALES-003: partial/full fulfillment docs/API/UI; atomic immutable ledger posting via `InventoryPostingService`, reservation consumption, audit/outbox, idempotency and concurrency handling. Integration covers partial/full fulfillment, replay, overfulfillment denial, fulfillment races, balance reconciliation and tenant scope.
- Additive migrations `20261108120000_sales_orders_reservations` and `20261108140000_sales_fulfillment` are applied locally. `npx prisma migrate status --config prisma.config.ts` reports 16 migrations found and current. No reset/deletion; synthetic rows in `inventory_dev.public` were untouched.
- Checks passed: Prisma validation, typecheck, lint, formatting, production build, full `npm test` (**40 pass, 0 fail, 2 opt-in suites skipped**), isolated PostgreSQL suite (**10 pass, 0 fail, 0 skipped**), and `git diff --check` before the last documentation edits. Rerun whitespace check at resume.

## Remaining work / limitations

- SALES-003 still has no separate picking stage/document or persisted picked quantity; therefore `shipped <= picked <= ordered` is not satisfied. It also lacks a sales-fulfillment-specific injected rollback test. Keep IN_PROGRESS.
- Browser automation is disabled in current Codex Work settings; authenticated UI workflow was not tested. No browser pass is claimed.
- SALES-004 remains gated: invoice/tax/payment/accounting policy has not been approved (PROD-002/DEC-007). Do not implement financial policy by assumption.
- Fixed the roadmap cycle by making SALES-003 depend only on SALES-002; INV-010 barcode enhancement already depends on SALES-003 and follows it.

## Exact next actions

1. Inspect `git status --short` and the diff; keep user changes and only touch the intended sales work.
2. Implement the SALES-003 pick document/stage and quantity constraints in a new additive migration; keep every reference organization-scoped and use the existing posting service for final stock outflow.
3. Add isolated PostgreSQL cases for `picked <= reserved/ordered`, `fulfilled <= picked`, partial pick/fulfillment, retry, tenant/warehouse scope and injected rollback; run them without touching `inventory_dev.public`.
4. Run Prisma validation and migration status, `npm test`, isolated integration suite, typecheck, lint, format, production build, and `git diff --check`; record exact outputs.
5. Complete browser checks for SALES-002/003 and previously pending SALES-001, INV-008, purchasing and adjustments if browser control becomes available. Do not infer browser success from builds or API integration tests.
6. Only then update SALES-003 status if all criteria are met. Do not start SALES-004 until its financial-policy decisions are approved. No push without authorization.

## Current modified areas

- Sales backend: `apps/api/prisma/schema.prisma`, `apps/api/src/sales/sales-orders.service.ts`.
- Sales UI: `apps/web/src/app/sales-orders/page.tsx`, `apps/web/src/app/sales-orders/[salesOrderId]/page.tsx`.
- Progress/architecture: this file, `current-state.md`, `session-log.md`, `completed-tasks.md`, `docs/implementation/task-breakdown.md`, `docs/implementation/master-plan.md`, `docs/architecture/api-specification.md`, `docs/architecture/inventory-semantics.md`, `docs/implementation/testing-strategy.md`.
