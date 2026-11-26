# UI consistency matrix

**Updated:** 2026-11-26 (Africa/Lagos)
**Reference:** Customers directory; details in [customer-module-reference.md](customer-module-reference.md).

| Module                | Shared page header | Shared table | Shared status | Drawer flow                         | Search/filter                              | Detail/document view                     | Browser / responsive acceptance                                                                   |
| --------------------- | ------------------ | ------------ | ------------- | ----------------------------------- | ------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Customers (reference) | Yes                | Yes          | Yes           | Yes                                 | Existing server search/status/pagination   | Customer detail not redesigned           | Desktop list/drawer observed; mobile was previously partially checked; no current full acceptance |
| Products              | Yes                | Yes          | Yes           | Yes, create/edit                    | Existing query/status and pagination       | Existing product details unchanged       | Populated list and create drawer observed in Chrome; no mutation; responsive not checked          |
| Stock counts          | Yes                | Yes          | Yes           | Yes; draft/detail drawers; posting confirmed | Warehouse selector; server page/page size | Count details in drawer; no dedicated route | Source updated; Chrome auth redirect blocked visual and functional acceptance                    |
| Reorder rules         | Yes                | Yes          | Yes           | Yes, create/edit                    | Existing query/status/pagination           | Not applicable                           | Empty list observed in Chrome; form/actions and responsive not checked                            |
| Low stock             | Yes                | Yes          | Yes           | No (derived list)                   | Existing query/status/pagination           | Links to product details                 | Shared table rendered in source; browser pass not recorded                                        |
| Transfers             | Yes; document header on details | Yes | Yes | Dedicated `/transfers/new` document form | Existing query/status/warehouse/pagination; searchable catalog | Shared document header; existing detail content/actions retained | Not checked; local services unavailable |
| Purchase orders       | Yes; document header on details | Yes | Yes | Dedicated `/purchase-orders/new` document form | Existing query/status/pagination; searchable catalog | Shared document header; existing detail content/actions retained | Not checked; local services unavailable |
| Sales orders          | Yes; document header on details | Yes | Yes | Shared document layout and line-item editor | Existing list filters; searchable catalog in draft | Shared document header; existing detail content/actions retained | Not checked; local services unavailable |
| Branches              | Yes                | Yes          | Yes           | Yes; create/edit drawers            | Server name/status filter; page and page size | No dedicated detail route                | Source updated; Chrome redirected to sign-in; responsive and functional acceptance pending |
| Warehouses            | Yes                | Yes          | Yes           | Yes; create/edit drawers            | Server name/code/status/branch filter and paging | No dedicated detail route             | Source updated; Chrome redirected to sign-in; responsive and functional acceptance pending |

This matrix records component adoption only. It does not imply full functional, accessibility, role/tenant, or visual acceptance. Backend APIs, permissions and transaction behavior were not changed in this UI pass. The new `TableToolbar` and `TablePagination` are used by `/locations`; no location workflow was submitted in the browser.


Phase C source adoption: shared document components are used by PO, transfer, and sales draft routes; PO, transfer, and SO detail pages use `DocumentHeader`. This is source-level implementation, not browser or operational acceptance.
