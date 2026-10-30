# REST API specification outline

Base `/api/v1`; JSON; bearer access token; request ID; critical POST/PATCH commands accept `Idempotency-Key`. OpenAPI generated from NestJS DTOs. All list routes support `page`, `page_size` (bounded), allowlisted filters/sorts and search. Responses use `{data,meta}`; errors `{error:{code,message,request_id,field_errors?}}`.

## Identity and organization
- `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`; revoke sessions; MFA decision pending.
- `GET/POST /organizations`; `GET/PATCH /organizations/:id`; active org selection is membership-validated.
- `GET/POST /organizations/:id/members`; invite/accept/change role/deactivate.
- CRUD `/branches`, `/warehouses`; enforce branch scope.

## Catalog and contacts
- `GET/POST /products`, `GET/PATCH /products/:id`, `POST /products/import/preview`, `/products/import/commit`.
- `GET/POST /categories`, `/units`, `/suppliers`, `/customers`.
- Search fields SKU/name/barcode; duplicate SKU returns 409; archive referenced products instead of deletion.

## Inventory
- `GET /inventory/balances?warehouse_id=&product_id=&availability=`
- `GET /inventory/movements` and `/products/:id/movements`
- `POST /inventory/adjustments` creates draft; `POST /inventory/adjustments/:id/post` commits audited deltas.
- `POST /stock-transfers`; `POST /stock-transfers/:id/dispatch`; `POST /stock-transfers/:id/receive`.
- `GET/PATCH /reorder-rules`; `GET /inventory/reorder-suggestions`.

## Procurement
- `GET/POST /purchase-orders`; `GET/PATCH /purchase-orders/:id`; submit/cancel transitions.
- `POST /purchase-orders/:id/receipts` with receipt lines; `GET /purchase-orders/:id/receipts`.

## Sales and finance records
- `GET/POST /sales-orders`; confirm/cancel; `POST /sales-orders/:id/fulfillments` (partial lines).
- `POST /sales-orders/:id/invoices`; `POST /invoices/:id/payments` or record payment + allocations.
- Returns/refunds in Phase 2.

## Reporting and operations
- `GET /reports/dashboard`, `/reports/inventory-summary`, `/reports/movements`, `/reports/low-stock`, `/reports/purchases`, `/reports/sales`.
- `POST /exports` returns job ID; `GET /exports/:id`; signed download expires quickly.
- `GET /audit-events`; `GET /health/live`, `/health/ready` (restricted detail).

## Security/error rules
Derive tenant from token and verified membership. Ignore/forbid client organization IDs for data scope except explicitly validated route context. Row-level scope checks precede state disclosure. Use 404 for resources outside visible tenant/scope; 409 for state/version/idempotency conflicts; 422 for invalid quantity, unit or date; 429 for rate limits. Do not return database errors or secrets. Version destructive transitions and use optimistic document version to avoid stale edits.
