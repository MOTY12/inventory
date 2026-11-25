# UI redesign progress

**Updated:** 2026-11-25 (Africa/Lagos)  
**Status:** In progress. The customer design primitives have been applied to selected module lists; nine-module standardization and acceptance are not complete. Backend roadmap remains **30/47**.

| Module          | Implemented in this pass                                                                                                                    | Still open                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customers       | Approved reference patterns and components remain in place.                                                                                 | Recheck transient Unauthorized report; finish mobile drawer, keyboard and functional acceptance.                                                                    |
| Products        | Shared PageHeader, DataTable, StatusBadge, create/edit Drawer, and archive ConfirmDialog; existing list API, filters and handlers retained. | Search debounce/filter matrix, category filter, row menu, detailed sections, detail page, functional and responsive validation.                                     |
| Stock counts    | No redesign changes.                                                                                                                        | All presentation standardization and browser checks.                                                                                                                |
| Reorder rules   | Shared PageHeader, DataTable, StatusBadge and create/edit Drawer; threshold fields and API calls retained.                                  | Search debounce, confirmed action UX, responsive/permission checks and form validation acceptance.                                                                  |
| Low stock       | Shared PageHeader, DataTable and status badges; derived inventory fields retained.                                                          | Warehouse/category filters (only existing query/status are retained), browser/responsive verification and contextual actions not supported by this pass.            |
| Transfers       | Shared PageHeader, DataTable and StatusBadge; status-dependent submit/cancel/dispatch/receive actions retained.                             | Move draft creation from inline panel to document flow, use ConfirmDialog instead of existing native confirmations where appropriate, and detail/responsive checks. |
| Purchase orders | Shared PageHeader, DataTable, StatusBadge on list; existing query/status filters retained.                                                  | Draft editor remains inline; complex document creation page, detail, browser and responsive review remain open.                                                     |
| Sales orders    | Shared PageHeader, DataTable and StatusBadge on the existing list; existing query/status/pagination and detail links retained.              | Filters/formatted progress, row action pattern, create/detail workflow consistency and responsive verification.                                                     |
| Branches        | No redesign changes.                                                                                                                        | Split branch listing from warehouse listing and standardize list/forms.                                                                                             |
| Warehouses      | No redesign changes.                                                                                                                        | Dedicated table/forms/details where supported; preserve warehouse scope and access behavior.                                                                        |

## Shared patterns now used

- Existing shared components: `PageHeader`, `DataTable`, `StatusBadge`, `Drawer`, and `ConfirmDialog`.
- Product and reorder create/edit forms use the existing Drawer. Product archive confirmation uses ConfirmDialog.
- Reorder/low-stock quantities are right-aligned by the shared table and use existing API values.
- Transfer and sales-order lists use shared table rendering and status badges.
- Purchase-order list uses the shared table and status badge; its complex draft editor remains inline pending a dedicated creation flow.
- No new backend endpoints, API payloads, schema, permissions or inventory behavior were introduced.

## Verification

- Chrome: `/products` rendered one existing product with category, unit, prices, status and actions. The Add Product drawer rendered with the existing category/unit choices. No form submission or product mutation was performed.
- Chrome: `/inventory/reorder-rules` rendered the shared header and table empty state with current data (0 rules). No record was created or changed.
- The reorder toolbar's spacing and create-rule drawer were corrected after the first visual check and rechecked in Chrome. The form has two columns and a standard action footer. A generic “The request could not be completed” banner appeared behind the drawer during hot reload; the cause remains unknown.
- The current workspace already had an Add Customer drawer open in another tab; it was observed but not modified.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` (60 API/shared + 2 web passed, 0 failed, 3 opt-in PostgreSQL skipped), `npm run build` (29 routes) and `git diff --check` passed sequentially. No before/after screenshot files were saved.

## Exact next work

1. Inspect current source and document diffs; preserve the uncommitted changes. Checks have passed, but rerun after further edits.
2. Complete list/table and creation-flow standardization in Branches and Warehouses, including separate data tables and drawers where the existing API supports them.
3. Move Purchase Orders draft creation off the list into a dedicated document flow and standardize detail without changing financial or receiving behavior.
4. Standardize Stock Counts and transfer document forms, then review sales order list/detail/new flows.
5. Test populated pages at 360, 390, 768, 1024, 1440 and 1920px; test role-aware actions and interaction states without mutating existing business records.
6. Update this matrix and acceptance record with observed evidence. Keep all untested states marked pending.
