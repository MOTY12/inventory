# UI redesign progress

**Updated:** 2026-11-26 (Africa/Lagos)
**Status:** In progress. The customer design primitives have been applied to selected module lists; nine-module standardization and acceptance are not complete. Backend roadmap remains **30/47**.

| Module          | Implemented in this pass                                                                                                                    | Still open                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customers       | Approved reference patterns and components remain in place.                                                                                 | Recheck transient Unauthorized report; finish mobile drawer, keyboard and functional acceptance.                                                                    |
| Products        | Shared PageHeader, DataTable, StatusBadge, create/edit Drawer, and archive ConfirmDialog; existing list API, filters and handlers retained. | Search debounce/filter matrix, category filter, row menu, detailed sections, detail page, functional and responsive validation.                                     |
| Stock counts    | `/inventory` is listing-first with shared DataTable/status/pagination; draft creation and count details use drawers; posting uses ConfirmDialog. Balances and movements are separate tabs with server pagination. | Authenticated browser, responsive, count create/post and reconciliation acceptance; no real count was created or posted. |
| Reorder rules   | Shared PageHeader, DataTable, StatusBadge and create/edit Drawer; threshold fields and API calls retained.                                  | Search debounce, confirmed action UX, responsive/permission checks and form validation acceptance.                                                                  |
| Low stock       | Shared PageHeader, DataTable and status badges; derived inventory fields retained.                                                          | Warehouse/category filters (only existing query/status are retained), browser/responsive verification and contextual actions not supported by this pass.            |
| Transfers       | Shared PageHeader, DataTable and StatusBadge; status-dependent submit/cancel/dispatch/receive actions retained.                             | Move draft creation from inline panel to document flow, use ConfirmDialog instead of existing native confirmations where appropriate, and detail/responsive checks. |
| Purchase orders | Shared PageHeader, DataTable, StatusBadge on list; existing query/status filters retained.                                                  | Draft editor remains inline; complex document creation page, detail, browser and responsive review remain open.                                                     |
| Sales orders    | Shared PageHeader, DataTable and StatusBadge on the existing list; existing query/status/pagination and detail links retained.              | Filters/formatted progress, row action pattern, create/detail workflow consistency and responsive verification.                                                     |
| Branches        | `/locations` now has a separate tabbed listing, shared DataTable/toolbar/pagination/status, server-side search/status/page size, edit/create drawers, archive confirmation, and branch-to-warehouse filter navigation. | Authenticated browser, responsive and create/edit/archive acceptance; warehouse association counts are not returned by the current list contract.                    |
| Warehouses      | `/locations` now has a separate tabbed listing, shared DataTable/toolbar/pagination/status, server-side search/status/branch/page size, searchable branch datalist, edit/create drawers, archive confirmation. | Authenticated browser, responsive and workflow acceptance; first 100 branch choices are loaded for the selector, and authorized inventory navigation is not available from the current location API/UI. |

## Shared patterns now used

- Existing shared components: `PageHeader`, `DataTable`, `StatusBadge`, `Drawer`, and `ConfirmDialog`.
- Product and reorder create/edit forms use the existing Drawer. Product archive confirmation uses ConfirmDialog.
- Reorder/low-stock quantities are right-aligned by the shared table and use existing API values.
- Transfer and sales-order lists use shared table rendering and status badges.
- Purchase-order list uses the shared table and status badge; its complex draft editor remains inline pending a dedicated creation flow.
- Branch and warehouse listings use new shared `TableToolbar` and `TablePagination`; both resource types use the existing shared `Drawer` and `ConfirmDialog`.
- Stock Counts uses shared `PageHeader`, `DataTable`, `StatusBadge`, `Drawer`, `ConfirmDialog`, and `TablePagination`; stock balances and movement history remain accessible as separate tabs. Saving a count still creates a draft; posting is explicitly confirmed.
- No new backend endpoints, API payloads, schema, permissions or inventory behavior were introduced.

## Verification

- Chrome: `/locations` loaded but redirected to `/login` in a fresh browser tab. No authenticated location or inventory page was observed. Browser, responsive, RBAC, and functional acceptance for these slices remain pending; no records were changed.
- Chrome: `/products` rendered one existing product with category, unit, prices, status and actions. The Add Product drawer rendered with the existing category/unit choices. No form submission or product mutation was performed.
- Chrome: `/inventory/reorder-rules` rendered the shared header and table empty state with current data (0 rules). No record was created or changed.
- The reorder toolbar's spacing and create-rule drawer were corrected after the first visual check and rechecked in Chrome. The form has two columns and a standard action footer. A generic “The request could not be completed” banner appeared behind the drawer during hot reload; the cause remains unknown.
- The current workspace already had an Add Customer drawer open in another tab; it was observed but not modified.
- For the location and stock-count implementations, sequential `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` (60 API/shared + 2 web passed, 0 failed, 3 opt-in PostgreSQL skipped), and `npm run build` (29 routes) passed. No module-specific UI tests exist. Build-generated tracked Next files are restored from HEAD. `git diff --check` is recorded in the final checkpoint.

## Exact next work

1. Authenticate Chrome with an approved development account, then inspect `/locations`; verify drawer layout, tabs, server pagination, search, filters, and error states without mutating existing records.
2. Run the responsive sweep (360, 390, 768, 1024, 1440, 1920px) and use authorized disposable records for branch/warehouse create/edit/archive acceptance. Verify warehouse-grant behavior with approved roles.
3. Implement Phase B: convert Stock Counts into a listing-first view, separate overview and movement history into tabs, use shared tables/pagination and a draft drawer; retain explicit posting confirmation and exact Decimal calculations.
4. Implement shared document presentation, then move PO and transfer creation into dedicated routes and align detail pages; continue with sales orders after inspecting actual endpoints and eligibility rules.
5. Investigate the previously observed reorder-rule generic request error using authenticated network/API evidence; do not suppress valid errors.
6. Update the matrix and acceptance record from actual browser evidence. Keep all untested states pending and the backend task count at 30/47.
