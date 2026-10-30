# MVP scope and release boundary

## MVP outcomes
A Nigerian SME can configure one organization and multiple branches/warehouses, import/opening-balance products, buy, receive, store, transfer, sell, fulfill, record invoice/payment evidence, and reconcile/report stock with a complete audit trail.

## Included
1. Authentication, organization/member, basic subscription-state placeholder, branch and warehouse.
2. Roles: owner/admin, manager, buyer, sales, warehouse clerk, finance/read-only. Warehouse scopes enforced server-side.
3. Catalog: stocked/service product, normalized SKU, category, barcode, base UoM + simple conversion, NGN default cost/sell price, archive.
4. Opening inventory import with preview, duplicate validation, count reason and ledger posting.
5. Inventory ledger/balances, adjustments/counts, stock summary/history, strict negative-stock policy configurable at organization level.
6. Supplier/customer records.
7. PO with draft/submitted/cancelled/partially received/received; multiple receipts and receipt dates.
8. Sales order with draft/confirmed/partially fulfilled/fulfilled/cancelled; reservation, pick/fulfill, backorder; invoice and one/multiple manual payment records.
9. Warehouse transfers with dispatch/in-transit/receipt.
10. Reorder point and low-stock view; generated suggestions only, no auto-submit.
11. Dashboard, stock/movement/low-stock/purchase/sales reports and CSV exports.
12. OpenAPI, audit log, idempotency, transaction handling, background export/notifications, Docker local environment, CI, backup/restore runbook.
13. Responsive desktop-first web interface and keyboard-wedge barcode scanner support.

## Excluded from MVP
Manufacturing/BOM, batch/serial/expiry, shipping carrier API/labels, payments collection, local accounting sync, ecommerce, public/private B2B portal, offline mobile write operations, AI command agent, multi-currency, advanced tax engine and custom workflow builder.

## MVP release gates
- All stock movement follows ledger; no direct quantity mutation path.
- Tenant isolation and branch/warehouse permission tests pass.
- Critical concurrent sale and duplicate receipt flows are proven in transaction tests.
- Backup restore drill and migration rollback/recovery approach documented.
- Local accountant reviews invoice/tax representation before any public launch that implies statutory invoice compliance.
- Pilot users validate receive, transfer, count and fulfillment UI on actual devices and network quality.
