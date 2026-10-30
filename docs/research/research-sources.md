# Research sources and evidence ledger

**Checked:** 2026-10-31 (Africa/Lagos). Primary official sources only for product behavior. Site content is mutable; pricing below is a dated snapshot. No screenshots saved. Directly visible homepage accessed in existing public Chrome tab. The other URLs were read via public web results/pages. REA official repository was inspected but passive page capture was blocked by missing CDP endpoint.

| ID | Source | Use / evidence level |
|---|---|---|
| R-01 | https://github.com/morluto/rea | Official REA project purpose, quick-start, supported target classes and prerequisites. Repository README page opened through search result. |
| R-02 | https://github.com/morluto/rea/blob/main/docs/installation.md | Official installation/setup and agent registration guide; README confirms npx setup and explicit review/approval. |
| R-03 | https://github.com/morluto/rea/blob/main/docs/cli.md | Official CLI guide reference; exact command surface should be checked against installed version before future use. |
| R-04 | https://www.inflowinventory.com/ | Public homepage directly observed in browser on 2026-10-31. Positioning, product line, CTA, homepage feature statements. |
| R-05 | https://www.inflowinventory.com/features | Feature comparison and listed product capabilities (inventory, sales, purchasing, reports, access, manufacturing, integrations). |
| R-06 | https://www.inflowinventory.com/software-pricing-inflow-2026 | Pricing page observed 2026-10-31. Annual pricing snapshot: Lite $99/mo (2 team members, 1 location), Core $299/mo (5 members, 5 locations), Pro $499/mo (10 members, unlimited locations), Max $699/mo (20 members, unlimited locations). Page also lists add-ons; pricing is not treated as durable or copied. |
| R-07 | https://www.inflowinventory.com/software-pricing-inflow | Plan/add-on comparison and localized currency price information. Pricing variants make exact price dependent on billing period/region. |
| R-08 | https://www.inflowinventory.com/support/cloud/how-do-i-create-and-complete-a-purchase-order | PO creation/details and PO completion overview; accessed 2026-10-31. |
| R-09 | https://www.inflowinventory.com/support/cloud/how-do-i-partially-receive-products-on-a-purchase-order-in-inflow-cloud/ | Official partial receiving per line, quantity/UoM/date. |
| R-10 | https://www.inflowinventory.com/support/cloud/how-do-i-create-and-complete-a-sales-order | Sales order creation, pick/partial pick, split/backorder, ship, partial payments, return and mobile flow. |
| R-11 | https://www.inflowinventory.com/support/cloud/how-do-i-transfer-stock-between-locations/ | Transfer source/destination and role/location access statements; page search result was accessible; open request timed out during full-page fetch. |
| R-12 | https://www.inflowinventory.com/support/cloud/quantity-breakdown/ | Definitions for on-hand, reserved, available, picked, on-order, in-transit, negative and anticipated quantity. |
| R-13 | https://www.inflowinventory.com/support/cloud/is-there-a-way-to-reorder-items-that-are-low-in-stock/ | Location-based reorder point/method/quantity, reorder generation and anticipated quantity discussion. |
| R-14 | https://www.inflowinventory.com/support/cloud/can-inflow-notify-me-when-im-low-on-stock/ | Low-stock notification cadence and formula: on hand + on order − reserved. |
| R-15 | https://www.inflowinventory.com/support/cloud/how-do-i-see-the-movement-or-transaction-history/ | Product movement history linked to source documents, filters and view row limit. |
| R-16 | https://www.inflowinventory.com/support/cloud/how-do-i-adjust-my-stock-levels | Stock adjustment/count with reasons and serial-number note. |
| R-17 | https://www.inflowinventory.com/features/barcode-software | Barcode scan/print workflow, phone scanning, receiving, picking, lookup, adjustment, transfer. |
| R-18 | https://www.inflowinventory.com/features/reporting | Public report/dashboard categories. |
| R-19 | https://www.inflowinventory.com/features/b2b-portal | Public/private B2B portal feature page. |
| R-20 | https://www.inflowinventory.com/integrations | Integration categories. Specific target connectors must be verified before selection. |
| R-21 | https://www.inflowinventory.com/support/cloud/how-do-i-set-up-quickbooks-online-with-inflow | QuickBooks sync workflow/example; do not assume same behavior across other integrations. |
| R-22 | https://www.inflowinventory.com/support/cloud/how-can-i-create-products-in-inflow/ | Product setup/SKU help article. |
| R-23 | https://www.inflowinventory.com/support/cloud/how-do-i-choosechange-my-product-type/ | Stocked/service product type notes. |

## Evidence and uncertainty notes
- R-01 is official REA README; the browser method surfaced it and the active REA MCP tool inventory independently confirms web tools. Specific calls used are described in `rea-setup.md`.
- R-04 is a direct public homepage UI observation; **not** an REA capture. No gated views were accessed.
- R-11 full article open timed out, so details are limited to official search-result excerpt, not a full article review.
- Some official help pages include Windows/Mobile/Web-specific steps and may describe different UI generations. Treat the underlying capability as documented; avoid asserting identical cross-platform screens.
- InFlow account behavior, proprietary business logic and exact concurrent transaction semantics remain unknown.
- On 2026-10-31 the visible pricing page labels the values annual-billing monthly equivalents. Prices may change without notice; do not use as a business recommendation.
