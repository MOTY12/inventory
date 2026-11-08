# Current state

**Updated:** 2026-11-08 (Africa/Lagos)

## Repository and roadmap

- Workspace: `/Users/newuser/Documents/GitHub/inventory`; branch `develop`; `HEAD` and `origin/develop` are `5938d93` (`feat: add sales order`). The commit contains the broad SALES-002/003 implementation. Four source files and the progress/architecture docs have local uncommitted follow-ups; preserve and inspect them. No commit or push was made in this continuation.
- Completed roadmap count: **15/47**. SALES-002 is now COMPLETED because its documented concurrency, cancellation-release, tenant-scope and state lifecycle acceptance passed in isolated PostgreSQL integration tests and the API/UI build. SALES-003 remains IN_PROGRESS: direct partial/full fulfillment works, but there is no distinct picking stage or picked-quantity invariant. Existing task statuses are authoritative in `docs/implementation/task-breakdown.md`.
- Latest database check: `inventory_dev` on `localhost:5433`; all **16 migrations are applied**. The two sales migrations are additive and were deployed without reset or deletion. Existing `inventory_dev.public` synthetic fixture data remains untouched.

## Delivered sales functionality

- SALES-002: tenant-composite sales orders, lines, numbering, reservation and status history; exact Decimal totals and unit snapshots; draft create/edit/list/search/filter/pagination/detail/audit; idempotent confirmation/cancellation; warehouse scope; reservation reconciliation; register/create/edit/detail UI.
- Confirmation reserves through the existing `InventoryPostingService`, leaves on-hand unchanged, and locks inventory in deterministic order. Cancellation releases remaining reservation once.
- SALES-003 implementation: fulfillment documents/lines and history; partial/full fulfillment API/UI; reservation consumption and immutable SALE_FULFILLMENT movements through `InventoryPostingService`; audit/outbox; idempotent retries and serializable conflict retries.
- Corrected remaining display arithmetic to exact scaled integer quantities and show reservation values in base units; order register now reports completed lines instead of summing quantities across unlike units. Removed an invalid warehouse filter from the fulfillment line query and populated the required fulfillment warehouse reference.

## Verification

- Passed: `npx prisma validate --config prisma.config.ts`; `npx prisma migrate status --config prisma.config.ts` (16 current); `npm run typecheck`; `npm run lint`; `npm run format:check`; `npm run build`; `git diff --check` before documentation edits (rerun after final edits).
- Full `npm test`: **40 passed, 0 failed, 2 skipped** (the two opt-in PostgreSQL suites are not included by default).
- Isolated `RUN_POSTGRES_INTEGRATION=1 node --test apps/api/test/inventory.postgres.integration.test.mjs`: **10 passed, 0 failed, 0 skipped** in a generated isolated schema. Coverage includes sales order Decimal totals, tenant denial, insufficient stock, confirm replay, cancel/release replay, racing orders, partial/full fulfillment, fulfillment replay/overfulfill/race, final balance reconciliation; unrelated existing catalog/procurement/ledger/transfer cases also passed. The generated schema was removed by the test; no owner data was reset.
- Browser automation is unavailable in current Codex Work settings. No authenticated browser workflow is claimed. Production migrations are not implied; local development DB only.

## Gaps and decisions

- SALES-003 lacks a distinct pick document/stage and a persisted picked quantity; the documented `shipped <= picked <= ordered` criterion is therefore unmet. A sales-fulfillment-specific injected rollback case and authenticated browser workflow also remain pending. Keep SALES-003 IN_PROGRESS.
- SALES-004 is not started: invoice/tax/payment/accounting rules remain open under PROD-002/DEC-007, and must not be guessed.
- Removed the SALES-003 → INV-010 dependency because INV-010 already depends on SALES-003, creating a cycle. Barcode support follows core fulfillment.
- Outstanding browser acceptance for SALES-001, INV-008, purchasing and stock adjustments remains tracked in the task ledger.

## Exact next steps

1. Preserve the existing data and current uncommitted changes. Run `git diff --check`, inspect the diff and final status.
2. Continue SALES-003 by defining and implementing a separate pick stage/document with exact `picked`, `fulfilled`, and outstanding quantity constraints; add an additive migration and isolated PostgreSQL tests for pick bounds, authorization, rollback and fulfillment consumption.
3. Complete authenticated browser workflows for sales order creation, confirmation, fulfillment and prior outstanding modules when browser control is available; do not claim they passed now.
4. Do not start SALES-004 until the owner/accountant resolves invoice/tax/payment accounting rules; choose another dependency-ready task only if it does not rely on those decisions.
5. Rerun Prisma validation/status, PostgreSQL integration, full tests, typecheck, lint, format, build and `git diff --check` after the next implementation milestone; update this checkpoint and task ledger with actual results.
