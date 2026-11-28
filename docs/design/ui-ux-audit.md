# Stockroom UI/UX audit

**Date:** 2026-11-25  
**Scope:** First redesign slice: shared directory foundation, Customers, Suppliers and authenticated shell labels.

## Current browser observations

- Reviewed the populated Customers and Suppliers routes in Chrome at desktop size using the signed-in development business. The directories render real API data; no customer or supplier records were created, changed or archived during this review.
- Before work, the two lists used separate table wrappers and dense legacy styling. Customer and supplier page headers, status labels, filter spacing and row actions did not share a presentation system. Supplier archive relied on the native browser confirmation.
- After work, both lists use a consistent page header, directory surface, filter bar, accessible shared table, status badge and pagination treatment. Supplier edit/archive controls remain permission-gated; archive now asks through the shared native-dialog primitive before sending the existing API mutation.
- The Customers page showed a transient “Unauthorized” error banner during the first hot-reloaded visit while existing rows remained visible. It disappeared after navigating to the route again; cause has not been diagnosed and is recorded as a functional validation gap.
- The customer and supplier routes were visually reviewed at desktop size. Mobile viewport, keyboard-only, screen reader, create/edit/archive journeys and cross-role authorization were not exercised. No before/after screenshot artifact was saved.

## Prioritized findings

| Page / area       | Severity | User impact                                                                                                | Proposed improvement                                                                       | Status                                               | Browser validation                                                                 |
| ----------------- | -------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Customers list    | High     | Unclear hierarchy and narrow table styling made contact records harder to scan.                            | Shared page header, filters, readable data table, status badge and consistent pagination.  | Implemented in this slice.                           | Desktop populated page viewed; transient authorization banner needs investigation. |
| Customers form    | Medium   | Fields appeared as one long undifferentiated group.                                                        | Group existing fields under customer information, address information and notes.           | Implemented in this slice; layout review pending.    | Not submitted in browser.                                                          |
| Suppliers list    | High     | Different styling and multiple inline actions made supplier records inconsistent with customer management. | Shared table and status components; retain only current role-permitted actions.            | Implemented in this slice.                           | Desktop populated page viewed.                                                     |
| Suppliers form    | Medium   | Contact, address and terms fields lacked visual grouping.                                                  | Group existing supplier fields without changing the API contract.                          | Implemented in this slice; layout review pending.    | Not submitted in browser.                                                          |
| Supplier archive  | Medium   | Native confirm dialog lacked consistent Stockroom context.                                                 | Accessible shared confirmation using the browser dialog primitive.                         | Implemented; mutation not invoked.                   | Dialog not opened during browser review.                                           |
| Application shell | Medium   | “Workspace” was inconsistent with the target business language.                                            | Use “Business” in shell context and settings labels; keep organization API terms internal. | Partially implemented in shell and directory routes. | Desktop context selector visible.                                                  |
| All other routes  | High     | Route-specific layouts and interaction patterns remain inconsistent.                                       | Continue page-by-page redesign after shared foundations are verified.                      | Not redesigned in this slice.                        | Not individually reviewed.                                                         |

## Complete route inventory

The route inventory was collected from `apps/web/src/app`. It is a completeness checklist, not a claim that every page has received a detailed visual and functional audit.

| Route                                | Module                  | Audit / redesign status                                             |
| ------------------------------------ | ----------------------- | ------------------------------------------------------------------- |
| `/`                                  | Dashboard               | Existing implementation; review pending                             |
| `/login`                             | Authentication          | Existing implementation; review pending                             |
| `/register`                          | Authentication          | Existing implementation; review pending                             |
| `/forgot-password`                   | Authentication          | Existing implementation; review pending                             |
| `/reset-password`                    | Authentication          | Existing implementation; review pending                             |
| `/verify-email`                      | Authentication          | Existing implementation; review pending                             |
| `/organizations`                     | Business settings       | Existing implementation; review pending                             |
| `/organizations/accept-invitation`   | Business settings       | Existing implementation; review pending                             |
| `/locations`                         | Branches and warehouses | Existing implementation; review pending                             |
| `/catalog`                           | Categories and units    | Existing implementation; review pending                             |
| `/products`                          | Products                | Existing implementation; review pending                             |
| `/products/[productId]`              | Product details         | Existing implementation; review pending                             |
| `/imports`                           | Imports                 | Existing implementation; review pending                             |
| `/inventory`                         | Stock counts            | Existing implementation; review pending                             |
| `/inventory/low-stock`               | Low stock               | Existing implementation; review pending                             |
| `/inventory/reorder-rules`           | Reorder rules           | Existing implementation; review pending                             |
| `/transfers`                         | Transfers               | Existing implementation; review pending                             |
| `/transfers/[transferId]`            | Transfer details        | Existing implementation; review pending                             |
| `/suppliers`                         | Suppliers               | Reference redesign slice implemented; functional acceptance pending |
| `/purchase-orders`                   | Purchasing              | Existing implementation; review pending                             |
| `/purchase-orders/[purchaseOrderId]` | Purchase order details  | Existing implementation; review pending                             |
| `/customers`                         | Customers               | Reference redesign slice implemented; functional acceptance pending |
| `/customers/[customerId]`            | Customer details        | Existing implementation; review pending                             |
| `/sales-orders`                      | Sales orders            | Existing implementation; review pending                             |
| `/sales-orders/new`                  | Sales orders            | Existing implementation; review pending                             |
| `/sales-orders/[salesOrderId]`       | Sales order details     | Existing implementation; review pending                             |
| `/sales-orders/[salesOrderId]/edit`  | Sales orders            | Existing implementation; review pending                             |
| `/invoices`                          | Finance                 | Existing implementation; review pending                             |
| `/invoices/new`                      | Finance                 | Existing implementation; review pending                             |
| `/invoices/[invoiceId]`              | Finance                 | Existing implementation; review pending                             |
| `/payments`                          | Finance                 | Existing implementation; review pending                             |
| `/tax-rates`                         | Finance settings        | Existing implementation; review pending                             |
| `/reports`                           | Inventory reports       | Existing implementation; review pending                             |
| `/reports/business`                  | Business reports        | Existing implementation; review pending                             |

## Constraints

- No API contract, database schema, inventory policy, permission rule, financial calculation, authentication behavior or stored record was changed.
- Data values continue to load through existing authenticated endpoints. The redesign does not add mock rows or unavailable financial metrics.
- This slice does not establish WCAG 2.2 AA conformance. Automated accessibility and manual keyboard/screen-reader checks remain outstanding.
