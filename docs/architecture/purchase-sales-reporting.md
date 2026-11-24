# Purchase, sales and receivables reporting semantics

Status: implemented initial REPORT-002 summaries, daily/weekly/monthly trends and receivables aging; product-performance tables, export types and historical receivable snapshots remain pending.

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
- **Receivables aging**: current outstanding invoice balance bucketed by due date as not yet due, 1–30, 31–60, 61–90, and over 90 days overdue. Missing due dates have a separate count.

## Filters and authorization

The reporting controller derives organization scope from authenticated membership. Warehouse scope is resolved from active grants; a requested warehouse outside that scope is denied, and an omitted warehouse filter is restricted to all granted warehouses. Sales, purchase and receivable filters accept inclusive `from`/`to`, optional warehouse, customer or supplier where relevant, currency, and lifecycle status where relevant. Resource IDs are filtered inside the active organization query. Finance reports require both `reports:read` and `finance:read`; role denials are server-side. No report filter may widen the member's warehouse grants.

## Known limitations

The first implementation exposes overview, daily/weekly/monthly trend, and aging APIs plus a live UI. It does not yet provide product/customer/supplier performance rankings, a historical receivables cutoff, a full customer outstanding invoice table, configurable sorting/pagination on those rankings, or financial CSV export integration. Those remain acceptance work for REPORT-002. No general ledger semantics are inferred.
