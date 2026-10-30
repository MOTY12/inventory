# inFlow feature matrix and product disposition

Evidence codes: **D** official documentation, **V** directly observed public homepage, **I** our engineering inference, **U** not established. Disposition: **MVP**, **P2**, **P3**, **OOS**. Complexity: S/M/L/XL for our product, not inFlow.

| Capability | Evidence | Business outcome | Target workflow | Proposed phase | Complexity | Evidence gap |
|---|---|---|---|---|---|---|
| Product catalog/SKU/category | D | Identify items consistently | Create/edit/search products | MVP | M | Variants/custom-field details |
| Unit of measure | D | Buy/sell/count in practical units | Define base and purchase/sales UoM conversions | MVP | M | Conversion edge cases |
| Barcode | D | Fast lookup and warehouse entry | Scan at receiving/pick/count | MVP basic | M | Hardware compatibility matrix |
| Per-location stock | D | Know stock by site | Stock summary by branch/warehouse | MVP | L | Exact internal storage unknown |
| Adjustment/count reasons | D | Reconcile physical and system quantities | Draft count, approve/post delta | MVP | M | inFlow UI not inspected |
| Movement history | D | Audit where stock changed | Filter by product/date/location/type | MVP | M | Public docs cap history view at 100 |
| Suppliers/customers | D | Store counterparties | Directory and details | MVP | M | Data model inferred |
| Purchase orders | D | Replenish inventory | Draft, submit, receive, close/cancel | MVP | L | Approval rules vary |
| Partial goods receiving | D | Handle split deliveries | Receive quantities by line/date/location | MVP | L | Duplicate requests not documented |
| Supplier balance/payments | D | Track payable status | Record one or more payments | P2 basic records | M | Accounting semantics unknown |
| Sales orders | D | Commit customer demand | Create, reserve, fulfill | MVP | L | Reservation point must be chosen by us |
| Picking/partial fulfillment | D | Ship available units accurately | Pick, partial/backorder | MVP | L | Exact policy unknown |
| Invoices/payment history | D | Track receivable and cash evidence | Invoice, partial payment, refund | MVP basic | L | Local invoicing requirements need review |
| Transfers | D | Rebalance warehouses | Request, dispatch, receive, reconcile | MVP | L | Exact movement timing unknown |
| Reorder points/notifications | D | Avoid stockouts | Threshold by product/location, alert | MVP | M | Recommended point formula not required |
| Valuation/COGS | D | Understand capital and margin | Cost layer, valuation report | MVP weighted average | L | InFlow may support costing layers |
| Reports/dashboard | D | Monitor operations | KPIs, reports, filters/export | MVP core set | L | Exact metric formulas require product policy |
| Role/location rights | D | Restrict operational access | Invite, role, assign warehouse scope | MVP | L | Fine-grained permission behavior not runtime tested |
| Responsive mobile | V/D | Use in warehouse/on road | scan/search/receive/pick | MVP responsive web | M | Offline behavior unknown |
| Shipment/carrier labels | D | Fulfill deliveries | Pack, ship, carrier integration | P2 | L | Local carriers to research |
| Quotes | D | Price before commitment | Quote then convert to order | P2 | M | Approval needs |
| Purchase returns | D (feature table; workflow detail not reviewed) | Return supplier stock | Return goods and adjust payable | P2 | M | Specific workflow unknown |
| Sales returns/refunds | D | Receive/credit returned goods | Inspect, restock/discard, refund/credit | P2 | L | Accounting treatment unresolved |
| Lots/expiry | D | Trace regulated/perishable stock | Lot assignment, expiry, recall query | P2 | XL | Industry prioritization needed |
| Serial numbers | D | Track unique assets | Receive, pick, return serials | P2 | L | Warranty needs unknown |
| Multi-currency | D | Trade internationally | Transaction currency and FX | P2 | XL | FX policy and realized gains |
| Accounting integrations | D | Avoid duplicate financial entry | Idempotent sync of invoices/bills | P2 | XL | Nigerian accounting target selection |
| E-commerce | D | Keep storefront stock/orders aligned | Catalog/availability/order sync | P2 | XL | Platforms to prioritize |
| Manufacturing/BOM | D | Assemble kits/products | Issue components, complete work order | P3 | XL | Costing and scrap rules |
| B2B ordering portal | D | Self-service repeat wholesale | Customer-specific catalog/price/order | P3 | XL | Identity/pricing/credit policy |
| Offline mobile | U | Continue during outages | Queue commands/sync conflicts | P3 | XL | Requires field discovery |
| AI assistant | V/D | Ask questions/create actions | Query reports with guarded actions | OOS initially | XL | Security, accuracy, owner approval |
| Subscription billing | D (competitor plans) | Monetize SaaS | Plan limits/billing | Platform foundation, later release | L | Our pricing approval needed |

Essential MVP means reliable catalog, stock ledger, purchasing/receiving, sales/fulfillment, transfers, counterparties, branch/warehouse scoping, audit, and usable reports. Optional capabilities are useful but not blockers for a first dependable release. Out of scope in MVP: manufacturing, B2B portal, offline mode, shipping rate purchase, payment gateway, accounting/ecommerce sync, AI operations and global multi-currency.
