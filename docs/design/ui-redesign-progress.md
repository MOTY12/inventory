# UI redesign progress

**Updated:** 2026-11-25 (Africa/Lagos)  
**Overall status:** Phase 1 in progress; Phase 2 reference modules underway. This work does not change the backend roadmap count.

| Module                 | Route                     | Audit status                               | Redesign status                                                                      | Shared UI adoption                                                | Desktop                                                                                                    | Mobile                                                                           | Accessibility                     | Functional                                                                |
| ---------------------- | ------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------- |
| Customers              | `/customers`              | Initial review                             | Directory and grouped create form use a side drawer                                  | PageHeader, DataTable, StatusBadge, Drawer, tokens                | Populated list visually reviewed; transient unauthorized banner observed once and cleared on route revisit | List checked at 390px; form layout corrected, not rechecked after session expiry | Not tested                        | Existing endpoint retained; create/search/filter/pagination not exercised |
| Customer detail        | `/customers/[customerId]` | Route inventoried                          | Not redesigned                                                                       | None                                                              | Not tested                                                                                                 | Not tested                                                                       | Not tested                        | Not tested                                                                |
| Suppliers              | `/suppliers`              | Initial review                             | Directory and grouped create/edit form use a side drawer; archive confirmation added | PageHeader, DataTable, StatusBadge, Drawer, ConfirmDialog, tokens | Populated list visually reviewed                                                                           | Not tested                                                                       | Native dialog not manually tested | Existing endpoint retained; create/edit/archive not exercised             |
| Supplier detail        | No dedicated route exists | API/UI capability gap                      | Expandable details and audit remain on directory; dedicated detail workflow pending  | None                                                              | Not tested                                                                                                 | Not tested                                                                       | Not tested                        | Existing details/audit path not mutation-tested                           |
| Authenticated shell    | All authenticated routes  | Route structure inventoried                | Business terminology adjusted in breadcrumb, selector and settings label             | Existing shell plus tokens                                        | Visible on customer/supplier routes                                                                        | Not tested                                                                       | Keyboard checks pending           | Business switch interaction not exercised                                 |
| Other 32 route entries | See `ui-ux-audit.md`      | Inventory recorded; detailed audit pending | Not redesigned                                                                       | None                                                              | Not tested                                                                                                 | Not tested                                                                       | Not tested                        | Existing functionality unchanged by this slice                            |

## Work completed in this slice

- Centralized initial shared UI tokens.
- Added reusable page header, data table, status badge, confirmation dialog and drawer.
- Applied the primitives to customer and supplier directories.
- Debounced existing server-side customer and supplier search while retaining pagination reset behavior.
- Grouped existing form fields without changing API payloads.
- Changed user-facing shell/directory labels to “Business” where appropriate.

## Next implementation steps

1. Final typecheck, lint, formatting, tests and production build passed; 3 opt-in PostgreSQL tests were skipped and no component-specific UI tests exist.
2. Recheck the customer route's transient unauthorized error; keep it visible as a defect until its cause is known.
3. Re-authenticate with an approved development account; browser-check drawer layout at 390px and desktop, customer/supplier form cancel and validation, archive-confirmation cancel and keyboard focus without submitting data.
4. Add customer and supplier detail/contextual workflows only where existing endpoints and routes support them.
5. Apply shared components to Products and Categories/Units next; then continue inventory operations and transaction pages in roadmap order.
