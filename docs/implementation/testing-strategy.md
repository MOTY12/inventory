# Testing strategy

The first version of this document was written during planning, before application tests existed. Implementation and verification have since been recorded per milestone in `docs/progress/session-log.md`. Use deterministic fixtures and a real PostgreSQL transaction environment for integrity claims.

## Layers
- Unit: quantity formulas, state machines, UoM conversions, money rounding, permission policy.
- Integration: Prisma repositories, composite tenant constraints, ledger/balance transaction, idempotency, outbox, queue retries.
- API: auth, DTO validation, filters/pagination, status/error contract, tenant and warehouse scopes.
- E2E: browser workflows for onboarding, catalog, PO partial receipt, transfer, sale/partial fulfillment/payment and reports.
- Security: cross-tenant guessed IDs, role escalation, access revocation, CSV injection, auth rate limits, signed file URL expiry.
- Resilience: DB rollback, deadlock/serialization retry, duplicate HTTP request, Redis outage, job retry/dead-letter, restore drill.

## Required critical scenarios
1. Two users selling the last available unit simultaneously: exactly one strict-policy allocation succeeds.
2. Duplicate PO receiving request with same key creates one receipt and one movement.
3. Partial PO delivery leaves remaining quantity open and only received qty on hand.
4. Transfer source dispatch and destination receipt move the same qty through in-transit without double count.
5. Sales cancellation releases reservation once; cancellation after shipment is rejected or requires return.
6. Product return creates reverse/restock or discard transaction and linked customer credit/refund.
7. Adjustment stores before/after/delta/reason/actor; posted event cannot be edited.
8. Tenant A cannot read/mutate Tenant B by UUID, report, import, export or background job.
9. Failed background job retries boundedly and operator can inspect/replay safely.
10. DB transaction rollback leaves document, balance, movement, audit and outbox consistent.
11. Concurrent sales confirmations cannot reserve the same available quantity; cancellation releases once and partial/full fulfillment consumes only its matching reservation. Distinct picking-stage bounds and sales-fulfillment-specific rollback remain pending until that workflow is implemented/tested.

## Test data and determinism
Seed synthetic organizations, branches, products, units, suppliers/customers and transactions. No real customer data. Freeze clock and FX rates in tests. Use unique idempotency keys per fixture. Parallel tests use isolated tenant IDs/database schemas. Verify report totals against independent ledger sums.

## Quality gates
Lint, typecheck, unit, integration, API, E2E, dependency scan, migration check and restore rehearsal are distinct gates. Do not report one as another. Failure messages and environment versions are saved in progress logs.
