# Stockroom UX audit

**Date:** 2026-11-07

## Reference review

- Reviewed the public product maps for [inFlow](https://www.inflowinventory.com/), [Zoho Inventory](https://www.zoho.com/inventory/) and [Odoo Inventory](https://www.odoo.com/app/inventory-features). Their public navigation emphasizes workflow areas such as inventory control, warehousing, purchasing/receiving, fulfillment and reporting. These informed Stockroom’s workflow group names only; no reference branding, copy or screen layouts were reproduced.

## Findings

- The only shared shell was rendered on the dashboard. Other authenticated routes used unrelated page wrappers, so navigation, organization context and page spacing changed between workflows.
- Navigation contained placeholder hash links, used text-symbol icons, and marked Overview active regardless of route. There was no working organization switcher even though the API supports selecting a member organization.
- Product, supplier and purchase-order forms were permanently placed before their directories, pushing the main task below a large editor. Page headers and action styles also varied.
- The dashboard showed setup placeholders instead of available product, balance, warehouse, movement and purchase-order data. Empty states did not direct users to a specific next task.
- Small typography, narrow default controls and ungrouped inventory counts made core data harder to scan. Responsive shell behavior was limited.
- Some backend modules do not exist yet, including sales, reports and transfers. These must remain absent from primary navigation until they have usable workflows.

## Changes made in this pass

- Applied a shared authenticated shell from the root layout, with route-derived active states and breadcrumbs, mobile drawer, collapsible desktop sidebar, account/logout controls and organization selection through the existing organization-select API.
- Grouped only working routes into Overview, Inventory, Purchasing and Management. No placeholder hash links remain.
- Replaced the dashboard placeholder with API-backed product count, tracked balance count, active warehouse count, open purchase-order count, recent movement rows and recent purchasing activity. Low-stock and inventory valuation are omitted because approved thresholds and valuation report APIs are not available.
- Changed product, supplier and purchase-order creation/editing to an explicit action that reveals the editor, keeping directories as the default page content.
- Added a first-run checklist linking to existing organization, warehouse, catalog and product workflows, plus shared responsive and focus styling.

## Remaining design work

- Product, supplier and purchase-order forms need a later dedicated page or accessible drawer and clearer field sections; this pass keeps their existing working forms behind an explicit action.
- The dashboard currently requests balances and movements for each active warehouse; large organizations will need a warehouse selector and server-side aggregate endpoint before expanding result sizes.
- Stock transfer, reporting, sales and customer navigation should be added only after those workflows exist.
- Authenticated browser, mobile-device and assistive-technology acceptance still needs to be performed with a signed-in test workspace.
