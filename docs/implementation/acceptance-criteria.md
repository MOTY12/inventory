# Program acceptance criteria

## Repository/foundation
- Reproducible setup from a clean checkout; dependencies locked; no secret in history.
- CI validates lint, typecheck, builds, migration and required test suites.
- API OpenAPI describes current behavior and errors.

## Tenant/security
- Every tenant-owned model/query/write is scoped to authorized organization.
- All role and warehouse permission checks are server-side and covered by positive/negative tests.
- Session revocation and audit events work; uploads/exports cannot cross tenant scope.

## Inventory integrity
- Every stock increase/decrease is linked to a posted transaction and immutable movement.
- Balance projection reconciles to ledger by product/warehouse/cutoff.
- Available, reserved, on-hand, incoming and in-transit have defined formulas.
- Critical command retry is idempotent; concurrent allocation respects approved policy.
- Corrections use compensating entries and preserve actor/reason.

## Operations
- PO supports multiple partial receipts and outstanding quantity.
- Sales order supports partial fulfillment, cancellation before movement, and payment records.
- Transfer supports dispatch, transit, destination receipt and discrepancy handling.
- Reports use explicit date/status/location scope and can be exported safely.

## Launch
- Performance and availability targets measured at expected pilot load.
- Encrypted backup restore tested against RPO/RTO; incident/support runbooks ready.
- Local tax/accounting/privacy obligations reviewed; user acceptance signed off.
- No unresolved critical/high security or data-integrity defects.
