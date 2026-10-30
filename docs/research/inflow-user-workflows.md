# Observed and documented inFlow workflows

**Research date:** 2026-10-31. These are summaries of public official documentation, not direct observation of authenticated app behavior. Detailed user-visible screens and timings remain unknown.

## 1. Create product and maintain stock
1. User creates a product with name/type and SKU; may associate category, barcode, UoM, costing/pricing and optional tracking fields. **DOCUMENTED**
2. User selects a location and edits/counts stock or uses an adjustment workflow with a reason. **DOCUMENTED**
3. Product movement history links recent stock changes to documents such as sales orders and transfers. **DOCUMENTED**
4. Inputs: product identity, UoM, location, count/delta, reason, date. Output: updated location quantity and auditable movement record. **Documented outcomes; exact posting implementation UNKNOWN.**

## 2. Purchase order and partial receiving
1. Create PO, select or create vendor, add product lines and quantities, set delivery/location/payment details.
2. Use the Receive tab; enter actual received quantity per line, optionally change UoM and receipt date; partial receive and save.
3. Open order remains available until remaining stock is received and payment criteria are satisfied; each line indicates partial receipt.
4. Stock is expected to become available as receipts are posted (**DOCUMENTED by receiving workflow and stock quantity help**). Exact transaction isolation/idempotency behavior **UNKNOWN**.

## 3. Sales order through payment and shipment
1. Create sales order and select/create customer; add products and quantities, customer PO, assigned rep, dates, location, tax/pricing/payment terms.
2. Pick all or some quantities, optionally scanning barcodes. If stock is short, backorder or split order based on on-hand stock.
3. If shipping enabled, pack/ship full or partial shipment(s); record shipping metadata and fees.
4. Invoice/email/print and record full/partial/multiple payments, method, date, reference. Return workflow can restock or discard and record refund/credit.
5. Complete status is described as all products picked and paid in full; specific status transitions and accounting side-effects depend on workflow. **DOCUMENTED**.

## 4. Transfer stock
1. Start a transfer, select sending and destination locations, add items/quantities.
2. Dispatch then receive at destination; track status and requested/sent/received dates.
3. Location-restricted staff can initiate if authorized to sending location and complete if authorized to destination location. **DOCUMENTED**.
4. Quantity docs describe outgoing quantity awaiting receipt as in transit. Exact source reservation timing and cancellation behavior **UNKNOWN**.

## 5. Replenish low stock
1. Configure reorder point/quantity and method per product/location (PO, transfer, manufacture).
2. Reorder screen lists candidates for a location; review supplier, generate replenishment documents.
3. Reorder candidate quantity is based on anticipated quantity = on-hand − reserved + on-order; a scheduled email alert can list low items.
4. Choose thresholds considering supplier lead time; official docs recommend review because vendor can default to last purchased vendor. **DOCUMENTED**.

## 6. Barcode/warehouse operation
Phone camera or compatible scanner can find products/orders and support receive, pick, check levels, adjust, and transfer. Stockroom is a separate scan-in/out product. This provides evidence for scan-oriented operational flows; no complete pixel-level page audit was possible.

## 7. Reports and integration
Movement history can be filtered by location/product/date/type; official help says product-level recent history is capped at 100 rows and recommends movement summary reports for wider analysis. Public feature pages list inventory/sales/purchase/manufacturing reports and accounting/ecommerce/shipping integrations. Exact export contracts and sync conflict rules are **UNKNOWN**.

## Cross-cutting failure cases to design for (our requirements, not claims about inFlow)
- Stale quantities and concurrent sale of last unit.
- Duplicate receiving or payment posts after retries.
- Partial quantities that exceed remaining order lines.
- Transfer dispatch with insufficient source stock; lost/short shipment; double receipt.
- UoM conversion rounding and decimal quantities.
- Cancel/return after partial fulfillment or payment.
- Unavailable warehouse scope or revoked user access.
- Network drop during an idempotent operation.
- Reconciliation differences and immutable audit history.
