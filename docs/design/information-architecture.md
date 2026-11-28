# Stockroom information architecture

## Existing authenticated navigation

The current shell exposes only implemented routes and groups them into Overview, Catalog, Inventory, Purchasing, Sales, Reports and Administration. Role visibility continues to be filtered by existing client role checks; server authorization remains authoritative. No new navigation destinations were added in this redesign slice.

| Group          | Current destinations                                |
| -------------- | --------------------------------------------------- |
| Overview       | Dashboard                                           |
| Catalog        | Products, Categories & units, Import data           |
| Inventory      | Stock counts, Reorder rules, Low stock, Transfers   |
| Purchasing     | Purchase orders, Suppliers                          |
| Sales          | Sales orders, Customers, Invoices, Payments         |
| Reports        | Inventory reports, Sales & purchasing               |
| Administration | Branches & warehouses, Business settings, Tax rates |

The switcher and breadcrumb now use “Business” labels where visible. The API path `/organizations/...`, organization IDs, membership role model and backend terminology are unchanged.

## User journeys to connect

- Product: product profile → stock by location → movements → count or transfer.
- Purchasing: supplier → purchase order → receive stock → inventory ledger.
- Sales: customer → sales order → reservation/picking/fulfillment → invoice/payment.
- Finance: customer/invoice → payment → financial report.

Only transitions supported by current routes and APIs should be linked; context-preserving create flows remain a follow-up.

## Navigation gaps

Expandable subgroups, remembered preferences, a quick-create menu and contextual global actions have not been implemented. Do not add placeholders for capabilities that do not have functional routes.
