# inFlow Inventory feature analysis

**Research date:** 2026-10-31. **Boundary:** public official marketing/help pages plus a visible public homepage. No app login or trial account. No REA CDP inspection (see `rea-setup.md`). This is a feature/workflow analysis, not an assertion about hidden implementation.

## Evidence labels
- **VERIFIED (public page):** directly visible in the public homepage or official page content during this review.
- **DOCUMENTED:** explicitly described in official public help/feature/pricing documentation.
- **INFERRED:** engineering implications or likely implementation design, not a claim about inFlow internals.
- **UNKNOWN:** not established by the public materials reviewed.

## Positioning and product line
**VERIFIED:** The homepage positions inFlow as inventory/order-management software for small and mid-size teams and lists Inventory, Manufacturing, and Stockroom products. It promotes product/catalog management, stock tracking, purchase/sales operations, reorder, reporting, integrations, desktop/web/mobile access and customer support. The homepage says it serves businesses in over 90 countries, promotes an AI report assistant and MCP integration, and advertises a 14-day trial without a card.

**DOCUMENTED:** The public feature comparison separates Inventory, Manufacturing and Stockroom capabilities. Inventory covers stock, purchasing, sales and reporting; Manufacturing adds BOM/assembly operations, disassembly, costs and timesheets; Stockroom is a scan-in/scan-out mobile workflow with a narrower feature set. Plan/add-on packaging limits members, locations and some capabilities.

## Feature groups
| Area | Evidence and observed/documented capability | Business importance / proposed direction |
|---|---|---|
| Catalog/SKU | **DOCUMENTED:** products, SKU, barcode, categories/custom fields, stocked and service types, pricing/costing, units. Product creation and types described in help center. | Essential MVP: products, SKU uniqueness, category, base UoM, cost/sell price, active state, optional barcode. Defer flexible variants/custom fields. |
| Stock | **DOCUMENTED:** per-location quantities, stock counts/adjustments with reasons, history attached to documents, negative/not-enough status can occur, movement reports. | Essential. Adopt an append-only ledger and policy-controlled prevention of negative available stock. |
| Quantity semantics | **DOCUMENTED:** help defines on hand, reserved, available, picked, on order, in-transit and anticipated quantities. Public docs define anticipated = on hand − reserved + on order. | Essential; our terms must be explicit and use a consistent reservation lifecycle. Do not assume identical internal behavior. |
| Replenishment | **DOCUMENTED:** per-location reorder point and quantity; reorder method can be PO, transfer, or manufacture; reorder screen may generate documents; low-stock emails compare anticipated quantity. | MVP: reorder thresholds and list/report; generated PO later after validation of demand math. |
| Procurement | **DOCUMENTED:** vendor, PO details, receive tab, partial receipt per line, dates/UoM, payments, status/list views. | Essential PO + partial receiving. Supplier payments/balances and advanced split PO are later. |
| Sales | **DOCUMENTED:** customers, sales orders, quotes, pick/partial pick, ship/partial shipment, invoice/payment state, backorders/split by available stock, returns/refunds, customer terms. | MVP order and fulfillment plus invoice/payment recording; richer quotes, shipping integrations, credit control later. |
| Transfers | **DOCUMENTED:** source/destination locations, send/receive workflow, status and dates; access may depend on either location. | Essential transfer with explicit in-transit state and two-sided ledger postings. |
| Barcode/mobile | **DOCUMENTED:** phone camera and dedicated scanner workflows for receiving, picking, stock lookup, adjustment and transfer; barcode can select product/order. | MVP responsive tables and keyboard scanner-as-input compatibility. Native offline scanner app later. |
| Warehouses/locations | **DOCUMENTED:** location restrictions, location-aware quantity/reorder, multiple locations per plan. | MVP branches and warehouses; permissions limited by warehouse scope. |
| Valuation/COGS | **DOCUMENTED:** feature page lists costing, COGS and inventory valuation/reporting capabilities; sales docs describe estimated vs actual profit and costing layers. | MVP basic weighted average and valuation summary; FIFO/serial-specific costing is later pending accounting policy. |
| Reporting | **DOCUMENTED:** inventory, sales, purchase, movement, stock transfer, low-stock and manufacturing reports; dashboards can be customized. | MVP KPIs, stock summary, movement, low-stock, purchase and sales summaries with CSV export. |
| Invoicing/payments | **DOCUMENTED:** invoices/receipts, partial/multiple payment history, balances/credits. Online payments are advertised only for US and Canada. | MVP invoice PDF/number, payment records as bookkeeping evidence; gateway excluded initially. Nigerian payment provider integration requires approval. |
| Integrations | **DOCUMENTED:** accounting QuickBooks/Xero, ecommerce, shipping, automation and API/MCP appear in feature/pricing pages. | Defer integrations; design outbox/webhook boundaries. Prioritize local accounting/payment integrations only after discovery. |
| Roles/access | **DOCUMENTED:** user-specific access, assigned orders, sales-rep restrictions, location access, 2FA features. | MVP roles and warehouse scoping; fine-grained custom roles and 2FA required before production. |
| Pricing | **DOCUMENTED:** pricing page as checked lists Lite/Core/Pro/Max with member and location quotas, plus manufacturing/Stockroom/lot/serial/API/etc add-ons. Currency and values change; exact figures recorded in `research-sources.md` as a 2026-10-31 snapshot. | Our price design is a product/financial decision; do not copy competitor pricing. Start usage-based plan proposal for review. |
| Manufacturing | **DOCUMENTED:** BOM, assembly steps, labor/material cost, work orders, disassembly, buildable quantity. | Phase 3. Model product BOM extension without prematurely shipping work-order workflows. |
| B2B portal | **DOCUMENTED:** public/private portal, custom domain, catalog and cart follow-ups. | Phase 3 after core inventory integrity and customer price lists. |
| Batch/serial/expiry | **DOCUMENTED:** lot/expiry and serial features offered (some as add-ons). | Phase 2: choose one traceability approach based on target industries. |
| Tax/currency | **DOCUMENTED:** tax schemes, order currency, exchange rates on sales. | MVP NGN only, configurable VAT/tax labels after Nigerian tax/accounting review; multi-currency Phase 2. |

## Public research limitations and outstanding questions
- **UNKNOWN:** actual inFlow web app page layouts, role-specific screens, API behavior, database rules, concurrency semantics and exact permissions at runtime.
- **UNKNOWN:** precise behavior of sales reservation timing, transfer inventory timing, valuation formulas in every workflow, and audit retention.
- Official pages can be marketing-oriented and change; see sources for dates and ambiguity.
- Do not claim inFlow always prevents negative stock. Official quantity documentation describes negative stock states. Our design will enforce configurable policy and serialize critical stock allocation.
