# UI redesign acceptance results

**Updated:** 2026-11-26 (Africa/Lagos)
**Scope:** Customer reference and selected list/drawer standardization pass. Nine-module definition of done is **not met**.

## Browser evidence

| Page / behavior                                                | Result             | Evidence / limitation                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer reference                                             | Partial            | Chrome showed the Customer Add drawer already open in an existing user tab with labeled fields and grouped sections. This session did not change that tab or submit the form. Earlier list review noted a transient Unauthorized alert; root cause remains unresolved. |
| Products list                                                  | Rendering observed | Chrome displayed one existing product with SKU, category, unit, price, active status and actions.                                                                                                                                                                      |
| Product create drawer                                          | Rendering observed | Drawer displayed the existing API-backed category and unit choices and supported product fields. No creation or validation submission was attempted. Screenshot showed the standard two-column desktop layout.                                                         |
| Reorder rules list                                             | Rendering observed | Chrome showed the shared header, filters, shared table headers and 0-record empty state. The corrected toolbar spacing was rechecked. No rule created.                                                                                                                 |
| Stock Counts source                                           | Code implemented    | `/inventory` now defaults to a paginated count table, with separate balance/movement tabs, a draft drawer, count details, and explicit posting confirmation. No authenticated rendering or workflow mutation was performed. |
| Branches / Warehouses source                                   | Code implemented    | `/locations` now separates lists into tabs and uses shared table, search/filter toolbar, pagination, drawers, status badges and archive confirmation. Chrome redirected a fresh tab to `/login`, so authenticated rendering was not verified. |
| Reorder rule drawer                                            | Rendering observed | Final browser view showed the two-column desktop form and Cancel/Create footer. No rule created. A generic request-failure banner was visible behind the drawer during hot reload; cause is unknown.                                                                   |
| Low stock                                                      | Source-level only  | Uses shared header/table/status in source; populated browser state not reviewed.                                                                                                                                                                                       |
| Purchase Orders list                                           | Source-level only  | Shared header, table and status badge adopted after the browser review. The draft editor remains inline; latest changes not browser-checked.                                                                                                                           |
| Transfers, Sales Orders and Stock Counts                       | Not accepted       | These workflows were not comprehensively reviewed after changes.                                                                                                                                                                    |
| Responsive breakpoints                                         | Not run            | No 360/390/768/1024/1440/1920 viewport sweep this pass. Prior 390px customer list measurement remains partial historical evidence only.                                                                                                                                |
| Create/edit/archive/transaction actions                        | Not run            | No business records changed. No form mutation, archive, transfer lifecycle, count posting, PO workflow or sales workflow was exercised.                                                                                                                                |
| Accessibility, RBAC, tenant isolation                          | Not run            | No keyboard/screen-reader audit, role-switch test or cross-tenant denial test was performed.                                                                                                                                                                           |

## Automated checks

| Check                    | Result                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`      | Passed after sequential Prisma Client generation.                                                                                                                                                 |
| `npm run lint`           | Passed.                                                                                                                                                                                           |
| `npm run format:check`   | Passed after formatting the changed source and documentation files.                                                                                                                               |
| `npm test`               | Passed sequentially: 60 API/shared and 2 web tests, 0 failures; 3 opt-in PostgreSQL tests skipped. The earlier parallel run failed during concurrent Prisma Client generation and is not counted. |
| `npm run build`          | Passed sequentially; Next.js compiled and generated all 29 routes. The earlier parallel build failure during overlapping Prisma generation is not counted.                                        |
| `git diff --check`       | Passed after code changes.                                                                                                                                                                        |
| Responsive browser check | Not run.                                                                                                                                                                                          |

No screenshot files were saved; the browser tool displayed inline observations. No migrations, backend behavior, credentials, permissions, or business data were changed. PostgreSQL integration tests, UI-specific regression tests, full workflow tests and the requested responsive sweep remain open.

## Location-slice checks (2026-11-26)

- `npm run typecheck`, `npm run lint`, and `npm run format:check`: passed after both UI slices.
- `npm test`: 60 API/shared passed, 0 failed; 3 opt-in PostgreSQL suites skipped; 2 web tests passed, 0 failed. No UI component test covers the new toolbar, pagination, or locations page.
- `npm run build`: passed; 29 routes generated.
- `git diff --check`: passed after documentation edits.
- Browser: `/locations` redirected to `/login` in a new Chrome tab. No authenticated location or inventory UI, responsive dimensions, drawer, RBAC behavior, or mutation workflow was verified. No data was changed.
- Location API source inspection confirms server-side tenant and warehouse-grant scoping and supports branch/warehouse status, search, paging, and branch filters. The UI loads up to the API maximum of 100 branch choices for selectors. Branch search matches names only. The list endpoint does not return branch warehouse counts, so no count is fabricated.

- Stock Count source uses the existing single-product draft API, exact decimal string variance arithmetic, and the existing explicit `/post` endpoint behind a confirmation dialog. No multi-product count is implied. The list API returns rows and total; count, balance, and movement page sizes are sent to the server. Workflow and inventory reconciliation are not browser-verified.


## Phase C source and verification (2026-11-26)

- Source implemented: shared document presentation components; PO/transfer creation moved to dedicated routes; sales draft uses shared layout and line-item pattern; three detail routes use shared document headers. Product catalog search is debounced and paginated. Existing scanner and transaction actions remain.
- Focused API regression: product-filtered balance read remains scoped by active organization and warehouse; unfiltered listing remains unfiltered. Included in `npm test`.
- Checks after code changes: full `npm run typecheck` passed after Prisma Client generation; `npm run lint` passed; `npm run format:check` passed; `npm test` passed 62 API/shared + 2 web (3 opt-in PostgreSQL suites skipped); `npm run qa:test` passed 18; `npm run build` passed and generated 31 routes.
- Browser and operational: not run. Both local ports 3000 and 4000 refused connections. No authenticated session, DB-backed availability, form mutation, lifecycle action, responsive viewport, cross-tenant, warehouse role, or ledger acceptance was observed. No data changed.
- Acceptance remains source-level only.
