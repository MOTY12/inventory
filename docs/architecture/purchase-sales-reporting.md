# Purchase, sales and receivables reporting semantics

Status: implemented summaries, daily/weekly/monthly trends, current receivables aging, paginated performance APIs and initial detail-report export types. REPORT-002 remains IN_PROGRESS pending broader data-fixture, browser and performance acceptance.

## Scope and data source

Reports are read-only projections over PostgreSQL business records. They do not create accounting entries and do not represent recognized accounting revenue. Financial output remains grouped by currency; clients must not add values from different currency groups. Monetary arithmetic and aggregation use PostgreSQL `numeric` and Prisma Decimal.

## Date semantics

- Sales order summaries use `sales_orders.order_date`; cancelled orders remain visible in status counts and are excluded from non-cancelled order-value totals.
- Invoiced sales use `invoices.issue_date` and only `ISSUED` invoices. Draft and void invoices are excluded.
- Payment collections and reversals use `customer_payments.payment_date` for the payment summary. A reversed payment is excluded from effective collections and reported in the reversed amount group.
- Sales fulfillment quantity trends use fulfillment `posted_at`, grouped by sales-line unit code so incompatible unit quantities are never combined.
- Purchase order totals use `purchase_orders.order_date`; cancelled purchase orders remain in status counts and are excluded from order value.
- Received purchase value uses `goods_receipts.received_at` and receipt quantity multiplied by the purchase order line's recorded unit cost.
- Receivable aging is current-state only, calculated against the database's current date. Historical aging is not reconstructed because payment allocation and reversal effective timestamps do not preserve a complete historical balance timeline.

For date filters, `from` is inclusive at UTC start of day and `to` is inclusive through UTC end of day. Date-only order and invoice columns are compared as dates. The current receivable balance ignores the requested historical cutoff and is explicitly labeled `current_state`.

## Metric definitions

- **Order value**: non-cancelled sales order totals or purchase order subtotal, grouped by document currency. This is operational document value, not accounting revenue or supplier payable.
- **Issued invoice value**: total amount on issued invoices in the selected issue-date interval, grouped by invoice currency.
- **Effective collections**: payment amounts allocated to issued invoices with no payment reversal. Fully reversed amounts are excluded. Reversed amounts are displayed separately.
- **Current receivable**: issued invoice total less allocations for payments without a reversal. Draft/void invoices are excluded. Overdue means a non-zero balance with due date before current database date. Invoices with no due date are separately counted and not labeled overdue.
- **Received purchase value**: goods receipt quantity multiplied by the corresponding PO line unit cost, grouped by PO currency. This is received operational cost, not an accounts-payable balance.
- **Outstanding receiving**: ordered quantity less received quantity, grouped by PO line unit code; value is the same remainder multiplied by PO line unit cost. Cancelled and fully received orders are excluded.
- **Receivables aging**: current outstanding invoice balance bucketed by due date as not yet due, 1–30, 31–60, 61–90, and over 90 days overdue. Missing due dates have a separate count and `no_due_date_outstanding` amount; that amount is included when reconciling all outstanding receivables.
- **Product sales performance**: aggregates sales order lines by product, sales-line unit code and currency. Ordered/fulfilled quantities and order values come from order lines; invoiced quantity, discount, tax and issued value come from issued invoice lines, pre-aggregated separately to avoid join multiplication.
- **Customer performance**: reports order-state counts and order value by order date, issued invoice value by issue date, payment collections by payment date, and current outstanding/overdue balances. Reversed payments are excluded from effective collections and current balances. Current balances are not historical snapshots.
- **Product purchasing performance**: groups PO line quantities by PO unit and currency; receipts are aggregated separately by product/unit/currency. Received value uses receipt quantity times recorded PO unit cost. Outstanding receiving is a PO-line quantity/value projection, not payable.
- **Supplier performance**: supplier PO counts/status counts, order value, received value and outstanding order value. The outstanding value is operational receiving exposure, not accounts payable. No lead-time score is produced because workflow timestamps have not been validated for that use.

## Filters and authorization

The reporting controller derives organization scope from authenticated membership. Warehouse scope is resolved from active grants; a requested warehouse outside that scope is denied, and an omitted warehouse filter is restricted to all granted warehouses. Sales, purchase and receivable filters accept inclusive `from`/`to`, optional warehouse, customer or supplier where relevant, currency, and lifecycle status where relevant. Resource IDs are filtered inside the active organization query. Finance reports require both `reports:read` and `finance:read`; role denials are server-side. No report filter may widen the member's warehouse grants.

## Known limitations

The implemented detail APIs are `/reports/sales/products`, `/reports/sales/customers`, `/reports/purchases/products`, and `/reports/purchases/suppliers`; they use stable tie-breakers, bounded pagination and currency/unit-separated rows. Product/customer/supplier filters are organization validated. Branch scope is applied through associated warehouse rows; warehouse grants remain an intersected scope. The business report page now includes live detail sections, currency/search filters and pagination; the dashboard requests finance KPIs only for roles with finance read access.

The export worker now recognizes `SALES_PRODUCTS`, `SALES_CUSTOMERS`, `PURCHASE_PRODUCTS`, and `PURCHASE_SUPPLIERS`. These types reuse REPORT-003 jobs, bounded API paging, private storage, CSV escaping and current authorization checks. Their report-specific worker output/revocation paths still require dedicated isolated integration coverage. Sales/Purchase Summary and Receivables Aging export types are not yet implemented. No general ledger semantics are inferred.

Known acceptance gaps: report PostgreSQL fixtures now cover partial/full receipt aggregation, the four detail CSV worker outputs and customer payment reversal balances, and the aging boundaries today/1/30/31/60/61/90/91 plus no due date. Multi-currency pagination, the complete filter/security matrix, browser UAT and EXPLAIN ANALYZE evidence remain outstanding. Historical receivables are not reconstructed and a full customer invoice table is not part of these ranked APIs.

## Local QA target verification

The development/test API readiness response includes a SHA-256 fingerprint of the live PostgreSQL database, schema, server address and port; production omits this field. The QA runner compares this with a direct read-only PostgreSQL connection before login/mutation and verifies the exact organization plus an active OWNER account. This prevents a CLI `.env` pointing to one local database from silently seeding through an API connected to another. The fingerprint contains no credentials and is accepted only from the required loopback HTTP API.

## QA scenario coverage status

The QA tooling registry supports `baseline`, `document-states`, `multi-currency`, and `financial-exports`. Document-state fixtures cover PO/SO lifecycles and nine invoice/payment states using the normal authenticated APIs. Multi-currency fixtures keep NGN and USD data separate and verify existing currency-specific report aggregates without conversion. Financial-export fixtures queue the four implemented detail CSV types for NGN and USD, then parse downloaded content and compare the scoped row with its live report API page. Authorization fixtures, cross-currency allocation-denial execution, live authenticated scenario execution, and browser CSV capture remain open. These are fixture/acceptance gaps and do not alter accounting/reporting semantics. New manifests use schema v2 while the loader retains valid v1 baseline compatibility. Mock tests and production builds do not constitute operational acceptance.
