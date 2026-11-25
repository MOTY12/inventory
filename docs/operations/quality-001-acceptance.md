# QUALITY-001 end-to-end acceptance preparation

**Status:** HARNESS IN PROGRESS — OPERATIONAL ACCEPTANCE NOT RUN
**Updated:** 2026-11-25 (Africa/Lagos)
**Prerequisite:** REPORT-002 acceptance must pass before this scenario is executed.

This document defines the intended deterministic local QA scenario. It is not evidence that the workflow has run. Do not mark QUALITY-001 complete until an authorized isolated organization/warehouse fixture has been exercised end-to-end and the exact actual values, IDs, checks and outcomes are recorded.

## Preconditions

- Use a disposable, organization-scoped development fixture; never reset or delete existing user data.
- Confirm migrations are current and the test user has the intended owner/finance/warehouse capabilities.
- Create or select a branch, source/destination warehouses, active supplier, customer, base unit, and products through supported workflows.
- Establish known opening quantities and costs; record IDs and exact Decimal values in the execution record below.
- Use unique idempotency keys and record retries separately. Avoid relying on empty dashboard/report states.

## Planned scenario and expected invariants

1. **Procure and receive:** create and submit a purchase order, partially receive it, retry the same receipt command, then receive the remaining quantity.
   - Expected: retry creates no duplicate receipt or movement; received quantity equals ordered quantity; PO outstanding is zero; stock and immutable ledger agree by product/warehouse.
2. **Transfer:** create a transfer between the two warehouses, dispatch and receive (include a partial receipt if supported by the selected workflow), then replay each critical command.
   - Expected: source outbound and destination inbound movements are each posted once; total organization stock changes only by documented adjustments; source/destination balances reconcile.
3. **Sale and reservation:** create a customer order, confirm it, and attempt a competing reservation for remaining stock if the fixture permits.
   - Expected: available quantity cannot be over-reserved; confirmed reservation appears once; confirmation does not reduce on-hand quantity.
4. **Picking, fulfillment and payment:** pick in multiple steps, fulfill partially and then fully, issue an invoice, record partial/multiple payment, then verify customer history.
   - Expected: fulfilled ≤ picked ≤ ordered; each fulfillment moves stock once; reservations release/consume correctly; invoice total less effective payments equals outstanding; invoice/payment actions do not create duplicate stock movements.
5. **Reporting reconciliation:** query inventory and business reports for the scenario's date, branch, warehouse, product and currency, then download the scoped detail CSV.
   - Expected: report quantities and amounts reconcile to the source documents and posted ledger; currency groups remain separate; CSV row values match the API result.
6. **Scope and retry checks:** repeat selected reads from another tenant and from a user without the warehouse grant; replay receipt, transfer, fulfillment and payment requests with the same idempotency key.
   - Expected: cross-tenant and ungranted access is denied; replay returns the original result and does not duplicate records, movements, reservations, or allocations.

## Actual execution record

**Actual outcome:** Not run.  
**Reason:** SALES-004 and REPORT-002 acceptance remains IN_PROGRESS. The local API-driven fixture generator is implemented, but seed execution stopped before authentication because `NODE_ENV`/`QA_ENVIRONMENT` are not configured in `.env`; when explicitly set for the attempt, `QA_ORGANIZATION_ID` was also missing. CLI credentials are absent. No API request or mutation occurred.
**Source hardening:** Before any authenticated run, the generator now verifies the active OWNER and exact QA organization directly in the configured database and compares the API's development-only live database fingerprint. Baseline recovery now matches exact document attributes, uses exact decimal quantities, rejects ambiguity, serializes per-run execution with a lock, and verifies movement, reservation, WAC and payment reconciliation. Baseline gross payments are NGN 220,000, reversals NGN 60,000, effective payments NGN 160,000, and fulfillment cost NGN 100,000.
**Additional scenario implementation:** A registry now selects `baseline` or `document-states`; manifests created by new runs are schema v2 and valid schema-v1 baseline manifests remain compatible. The document-state scenario builds six PO and five sales-order statuses through ordinary authenticated API routes and verifies status plus exact ordered/received/picked/fulfilled quantities. Its test uses an API-shaped fake and checks that resume does not increase PO/SO counts; it is not a live API/DB execution. Invoice lifecycle variants, NGN/USD comparison, authorization users, CSV reconciliation, and browser journeys are not implemented or run.
**Fixture organization/branch/warehouses:** Not created for this scenario.  
**Document IDs and expected/actual quantities or amounts:** Not run.  
**Tests/browser evidence:** QA generator tests passed 14/14; existing isolated PostgreSQL suites passed 26/26. No generator seed, browser invoice lifecycle, PDF/CSV file capture or named E2E execution occurred.
**Ledger/balance/reservation reconciliation:** Not run.  
**Authorization and idempotency outcomes:** Not run.  
**Remaining prerequisite:** Configure the explicitly approved QA organization UUID and existing OWNER account credentials in ignored local `.env`; run `qa:seed` and `qa:verify`; complete REPORT-002 filter/security, multi-currency pagination/export and performance evidence plus SALES-004 browser acceptance. Then run this named scenario separately and record actual data.

## Execution evidence to attach when run

Record exact commands and exit statuses, test names and counts, browser route and actions, source document IDs, movement IDs, before/after balances, reservation totals, report/API/CSV values, role and warehouse grants, retry keys/outcomes, and any failure. Do not use screenshots or a successful build as a substitute for reconciliation evidence.
