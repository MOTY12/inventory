# User stories and acceptance intent

## Foundation
- As an owner, I can create an organization and first branch/warehouse so stock has a clear home.
- As an admin, I can invite a user with a role and warehouse scope so access fits their job.
- As a user, I can switch organization/branch with the active context visible so I do not transact in the wrong place.

## Catalog and inventory
- As a clerk, I can find a product by name, SKU or barcode and see on-hand/reserved/available by warehouse.
- As a controller, I can record a count, reason and counted quantity, review the resulting delta, then post it with an audit trail.
- As an owner, I can see each movement with source document, actor, time and location.
- As a buyer, I can set reorder point/quantity per warehouse and see projected quantity and calculation.

## Procurement
- As a buyer, I can draft and submit a PO to a supplier, with expected date and destination warehouse.
- As a receiving clerk, I can receive only delivered quantities, in multiple receipts, and see outstanding quantities.
- As a manager, I can reject or cancel an unreceived order without altering posted receipts.

## Sales
- As a sales user, I can create an order and see stock available at the selected branch before confirming.
- As a fulfillment clerk, I can pick part of an order and leave the balance backordered.
- As a finance user, I can issue an invoice and record one or more payments with method/reference/date.
- As a manager, I can cancel an unfulfilled order and verify its reservation is released.

## Transfer and reports
- As a manager, I can dispatch stock from one warehouse and receive it at another with an in-transit state and two ledger movements.
- As an owner, I can export stock, movement, low-stock, purchase and sales summaries for a period and scope.
- As an auditor, I can trace a report total to ledger rows and transaction documents.

## Reliability/security
- As an API client, I can safely retry a critical command with the same idempotency key without duplicate stock movement.
- As a user from tenant A, I cannot read or mutate tenant B data even if I guess an identifier.
- As a manager, I can prevent concurrent orders from allocating the same last unit.
- As an operator, I can see a clear validation/conflict error and retry only when safe.
