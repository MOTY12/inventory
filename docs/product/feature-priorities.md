# Feature priorities

Scoring: Must = required for safe first value; Should = valuable soon after MVP; Could = later option; Won't now = deliberately excluded pending product-market evidence.

| Priority | Feature |
|---|---|
| Must | Tenant/org/user/roles, branch/warehouse, product/SKU/UoM/category, ledger, adjustment/count, PO/partial receipt, customer/sales order/reservation/pick/partial fulfill, transfer, invoice/payment records, basic reorder, search/filter, audit, core reports/export, secure backup and observability. |
| Should (Phase 2) | Quotes, returns/refunds, approval thresholds, shipment metadata, serial OR lot traceability, advanced inventory valuation, import wizard, MFA, external accounting integration, local notification channels, subscription enforcement. |
| Could (Phase 3) | BOM/manufacturing, B2B portal, e-commerce connectors, multi-currency, offline mobile queue, carrier labels, forecasting, automation rules, AI report query with read-only first. |
| Won't in MVP | Native iOS/Android apps; full ERP/accounting; payment-gateway custody/settlement; advanced MRP; broad integration marketplace; customer-facing marketplace; multi-region active-active. |

Value/risk ordering: stock ledger and tenant isolation are foundational and high consequence; establish these before adding workflows. Integration modules come after stable canonical events and idempotent APIs.
