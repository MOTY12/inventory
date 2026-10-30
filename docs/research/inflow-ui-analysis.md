# inFlow public UI analysis and original UI direction

**Research date:** 2026-10-31. **Evidence:** homepage AX snapshot through visible public browser, official product/feature/help pages, not an authenticated product session. REA could not attach to Chrome CDP (`rea-setup.md`); no REA screenshots were captured or copied.

## Direct observations
- Homepage heading positions the product around making inventory numbers understandable; calls to action include a 14-day trial and sales contact.
- Homepage segments software into Inventory, Manufacturing and Stockroom cards; also surfaces hardware, support/onboarding, customer proof, app comparison and product navigation.
- Official help instructions describe a main menu/Create action, searchable order lists, order detail headers and tabbed order work areas such as Order/Receive, Pick, Ship, Return/Restock and payment history.
- Product pages show quantity status and movement history, and transfer/reorder workflows are location-oriented.

## Pattern analysis (documented/inferred)
- **DOCUMENTED:** status-led lists (open, unpaid, ready-to-ship, all), sortable columns, filters, document-centric details, partial progression, barcode scan action and location context.
- **INFERRED:** persistent navigation + dense operational tables are suitable for recurring desk work; document tabs preserve detail within the transaction lifecycle; scanning reduces item lookup friction.
- **UNKNOWN:** actual app palette, spacing, typography, responsive breakpoint behavior, component anatomy, accessibility conformance and whether all public help screenshots match current product UI. Do not claim pixel-level or full app inspection.

## Original UI specification
- Brand: new product name/identity to be chosen; do not use inFlow name, marks, screenshots, illustration style or text.
- Desktop shell: collapsible left navigation grouped into Overview, Inventory, Purchasing, Sales, Contacts, Reports, Organization; top bar with branch/warehouse switcher, universal search, alerts, help and account menu.
- Dashboard: cards for stock value/count, open purchase orders, open sales orders, low stock, inventory adjustments; each KPI links to a filtered view and defines its time/location scope.
- Catalog: table with SKU/name/category, on hand, reserved, available, reorder status, default cost/price; filters, saved views, bulk import/export and visible branch context.
- Product detail: overview, warehouse quantities, reorder settings, cost/pricing, barcode, movement ledger, related orders. Never display editable quantity as a direct field except through an explicit count/adjustment command.
- Purchase order: header, vendor, location, line grid, totals, status; separate receive workflow with per-line received/remaining quantities and idempotent post confirmation.
- Sales order: customer, fulfillment warehouse, line grid, available quantities, status progression; pick/ship/payment actions are explicit and distinct.
- Transfer: source/destination, line grid, draft → dispatched → received; in-transit quantities visible.
- Tables: server pagination, column sort/filter, keyboard focus, empty/loading/error states, row action menu, export. Date and currency use organization locale/configuration.
- Mobile: responsive web for search, scan-compatible SKU input, receive/pick/count and lookup; avoid promising offline mode until designed.
- Accessibility: semantic forms and tables, keyboard operation, status text not color-only, clear labels/help, validation summaries, focus management.
- Destructive actions: explicit confirmation and reason where applicable; soft-delete catalog entities referenced by posted transactions.

## UI research still needed before implementation
Run original wireframes against target users in Nigeria, especially warehouse clerks, buyers and owner-operators. Review tablet/phone ergonomics, low bandwidth and barcode hardware. Capture only owner-approved inFlow public pages if the future CDP setup allows; do not access gated UI without legitimate authorization.
