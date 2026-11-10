# REST API specification outline

Base `/api/v1`; JSON; bearer access token; request ID; critical POST/PATCH commands accept `Idempotency-Key`. OpenAPI generated from NestJS DTOs. All list routes support `page`, `page_size` (bounded), allowlisted filters/sorts and search. Responses use `{data,meta}`; errors `{error:{code,message,request_id,field_errors?}}`.

## Identity and organization

- `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`; revoke sessions; email verification required. Owner-directed default is email/password with JWT access and rotating refresh tokens; design for MFA, defer enforcement.
- `GET/POST /organizations`; `GET/PATCH /organizations/:id`; active org selection is membership-validated.
- `GET/POST /organizations/:id/members`; invite/accept/change role/deactivate.
- CRUD `/branches`, `/warehouses`; enforce branch scope.

## Catalog and contacts

- `GET/POST /products`, `GET/PATCH /products/:id`, `POST /products/import/preview`, `/products/import/commit`.
- `GET/POST /categories`, `/units`, `/suppliers`, `/customers`.
- `GET /organizations/current/imports/template?kind=PRODUCTS|OPENING_BALANCES`; `GET /organizations/current/imports`, `GET /:batchId`, and `GET /:batchId/audit`.
- `POST /organizations/current/imports/products/preview`, `POST /products/:batchId/commit`, `POST /opening-balances/preview`, and `POST /opening-balances/:batchId/commit` (all under the imports base path). Preview accepts multipart CSV plus JSON column mapping and makes no catalog/stock changes. Commit requires `Idempotency-Key`; an invalid/expired preview is rejected atomically.
- Search fields SKU/name/barcode; duplicate SKU returns 409; archive referenced products instead of deletion.

## Procurement directory

- `GET/POST /organizations/current/procurement/suppliers`; `GET/PATCH /organizations/current/procurement/suppliers/:supplierId`; `PATCH /organizations/current/procurement/suppliers/:supplierId/archive`; `GET /organizations/current/procurement/suppliers/:supplierId/audit`.
- Supplier records are organization-scoped; normalized names are unique within an organization. Reads require `procurement:read`; writes require `procurement:write`.

## Sales directory

- `GET/POST /organizations/current/sales/customers`; `GET/PATCH /organizations/current/sales/customers/:customerId`; `PATCH /organizations/current/sales/customers/:customerId/archive`; `GET /organizations/current/sales/customers/:customerId/audit`.
- Customer reads require `sales:read`; writes require `sales:write`. Email uniqueness is organization-scoped when an email is supplied. Archived customers remain visible under filters and cannot be edited.

## Inventory

- `GET /inventory/balances?warehouse_id=&product_id=&availability=`
- `GET /inventory/movements` and `/products/:id/movements`
- `POST /inventory/adjustments` creates draft; `POST /inventory/adjustments/:id/post` commits audited deltas.
- `GET/POST /organizations/current/inventory/transfers`; `GET /organizations/current/inventory/transfers/:id`; submit/cancel; dispatch and `POST /:id/receipts` with `Idempotency-Key`.
- `GET/POST /organizations/current/inventory/reorder-rules`; `PATCH /organizations/current/inventory/reorder-rules/:ruleId`; `GET /organizations/current/inventory/reorder-rules/:ruleId/history`; `POST /organizations/current/inventory/reorder-rules/evaluate`; `GET /organizations/current/inventory/low-stock`.
- Low-stock calculations use `available = on hand - reserved`; suggested quantity is `max(target - available, 0)`. Incoming purchase orders and in-transit quantities are excluded and displayed as zero until an approved supply projection policy exists. Rule evaluations run every five minutes per API process and are also manually triggerable. No purchase order is automatically submitted.

## Procurement

- `GET/POST /purchase-orders`; `GET/PATCH /purchase-orders/:id`; submit/cancel transitions.
- `POST /purchase-orders/:id/receipts` with receipt lines; `GET /purchase-orders/:id/receipts`.

Purchase order routes are organization-scoped and additionally filtered by the member's active warehouse grants. Draft order lines use decimal quantity/cost strings and a selected product unit with a configured product conversion. Totals are stored as PostgreSQL Decimal values. Organization purchase order numbers are allocated atomically as `PO-000001` style identifiers. Drafts can be edited; submit and cancel transitions are audited. Submission does not post stock.

Goods receipt creation requires an `Idempotency-Key` header. Receipt line quantities are expressed in the purchase order line unit and converted to the product base unit. The PO row is locked while outstanding quantities are checked. Receipt lines, PO received quantities/status, inventory ledger movements/balances, audit events and outbox events commit in one transaction. Excess quantities and mismatched idempotency replays are rejected. The purchase order is marked `PARTIALLY_RECEIVED` or `RECEIVED` as quantities are posted. No approval, tax or landed-cost policy is introduced.

## Sales and finance records

- `/organizations/current/sales/orders`: `GET/POST`; `GET/PATCH /:salesOrderId`; `POST /:salesOrderId/confirm`; `POST /:salesOrderId/cancel`; `GET /:salesOrderId/audit`; `GET/POST /:salesOrderId/picks`; `GET/POST /:salesOrderId/fulfillments`.
- Creating a draft, confirming/canceling, picking and posting fulfillment require `Idempotency-Key`. Draft lines capture product/unit/price snapshots and Decimal totals. Confirmation locks balances in stable order and reserves through `InventoryPostingService`; it does not reduce on-hand. Cancellation releases outstanding reservations once and is rejected when physical picked quantity remains unfulfilled. Picking may be partial and repeated; cumulative picked quantity is in the order line's selected unit, and must satisfy `fulfilled <= picked <= ordered`. Fulfillment posts immutable stock outflow and consumes reservation quantities in the same transaction as fulfillment, order progress, audit and outbox.
- Sales order reads/writes derive organization and warehouse access from authenticated membership context; client-supplied organization IDs do not establish tenant scope.
- `POST /sales-orders/:id/invoices`; `POST /invoices/:id/payments` or record payment + allocations. These routes are planned, not implemented; invoice/tax/accounting rules remain unapproved.
- Returns/refunds in Phase 2.

## Reporting and operations

- `GET /reports/dashboard`, `/reports/inventory-summary`, `/reports/movements`, `/reports/low-stock`, `/reports/purchases`, `/reports/sales`.
- `POST /exports` returns job ID; `GET /exports/:id`; signed download expires quickly.
- `GET /audit-events`; `GET /health/live`, `/health/ready` (restricted detail).

## Security/error rules

Derive tenant from token and verified membership. Ignore/forbid client organization IDs for data scope except explicitly validated route context. Row-level scope checks precede state disclosure. Use 404 for resources outside visible tenant/scope; 409 for state/version/idempotency conflicts; 422 for invalid quantity, unit or date; 429 for rate limits. Do not return database errors or secrets. Version destructive transitions and use optimistic document version to avoid stale edits.
