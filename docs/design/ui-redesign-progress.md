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
| Transfers       | Listing-first shared table; dedicated `/transfers/new` document draft route; shared searchable product selector, warehouse-specific availability and shared detail header. | Browser/responsive acceptance; source availability race check; existing native confirmations remain on list actions. |
| Purchase orders | Shared list; dedicated `/purchase-orders/new` document draft route with searchable catalog, exact totals, summary, and shared detail header. | Supplier/warehouse selectors remain bounded native selects; browser/responsive and complete detail/receiving redesign remain open. |
| Sales orders    | Draft route uses shared document layout/line items, server-searched catalog, product-specific balances, retained barcode scanning and shared detail header. | Customer selector remains bounded; full detail, picking/fulfillment presentation and browser/responsive acceptance remain open. |
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


## Phase C implementation update (2026-11-26)

- Shared components added: `DocumentHeader`, `DocumentLayout`, `DocumentSection`, `DocumentLineItems`, `DocumentSummary`, `DocumentActions`, and `ProductSelector`.
- Removed inline PO and transfer creation from their list pages. Added `/purchase-orders/new` and `/transfers/new`; both create drafts only. Sales order draft now uses the shared document components. Existing barcode scan behavior, exact monetary/quantity arithmetic, authorization, lifecycle API calls, and idempotency behavior were preserved.
- Added optional product-specific filtering on warehouse balances with tenant/warehouse scoping and two service regression tests. No schema or migration change.
- Source implementation complete for the C1 base and C2/C3 draft-route slice. C2/C3 detail/receiving/dispatch experiences and C4 sales detail/picking/fulfillment consistency are partial. C5 is blocked on authenticated browser/services; no route was browser validated. No 360–1920px sweep and no authenticated operational transaction was performed. Backend roadmap remains 30/47.
- `npm test`: 62 API/shared + 2 web pass, 3 opt-in PostgreSQL tests skipped; `npm run qa:test`: 18 pass; full typecheck, lint, format check, and build pass. No focused React interaction tests exist.

## Phase C detail and selector implementation update (2026-11-26)

This entry supersedes the Phase C open-source gaps above; it does not supersede their browser/operational acceptance limitations.

- **Purchase orders:** detail now uses shared information, summary, table, and activity components; receipt endpoint data renders actual receipt quantities, actors and movement presence. Receiving supports partial/full posting, receive-all outstanding, barcode scans, confirmation, refresh and recoverable errors.
- **Transfers:** detail now uses shared information/table/action/activity patterns; exact decimal sums show requested, dispatched, received and outstanding values. Submit, dispatch, partial receipt and cancel actions are state/role gated and confirmed; dispatch uses a stable key and receive retains a retry key for the same payload.
- **Sales orders:** detail uses shared information/summary/activity. Existing ordered/reserved/picked/fulfilled details, barcode picking, partial fulfillment and transaction APIs remain. Pick/fulfillment confirmation panels explain stock effects. Finance-capable roles see the existing eligible invoice workflow with order preselection.
- **Search selectors:** `EntitySelector` now replaces the bounded customer/supplier/warehouse lists on transaction create/edit forms; the existing product selector remains in use. Server filtering/pagination, keyboard selection, loading/empty/error states, clearing, tenant endpoints and warehouse grants are retained.
- **Async consistency:** detail loads guard request generation and organization identity; selector searches use generation cancellation; transfer source switches keep existing availability generation guards. Browser race tests remain pending.
- **Verification:** full typecheck, lint and formatting passed; default suite passed 62 API/shared + 2 web, with 3 opt-in PostgreSQL suites skipped; QA tests 18/18; production build passed with 31 routes; Prisma schema validation and `git diff --check` passed. Three generated Prisma relation inference errors were resolved with schema-matching type annotations in auth/reporting; review those on Prisma upgrades.
- **Acceptance:** Docker app not found, local PostgreSQL not responding, and ports 3000/4000 refused connections. No authenticated browser, responsive sweep, migration check, live API/DB operation, ledger reconciliation or retry scenario was performed. No component-interaction harness was present.
- Source implementation is substantially complete; Phase C is not fully accepted. Roadmap remains 30/47.
