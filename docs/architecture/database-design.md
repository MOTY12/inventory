# Database design

## Conventions
PostgreSQL; UUID primary keys; `organization_id` required on tenant-owned rows; `created_at`, `updated_at`; actor IDs on mutable business records; soft archive for master records; immutable posted events. Numeric quantities use `numeric(20,6)` pending UoM interviews; money uses `numeric(20,4)` plus ISO currency; no floating point. Add `organization_id` to composite unique/index keys. UTC timestamps, display in organization timezone.

## Core entities
- `Organization(id,name,slug,base_currency,timezone,negative_stock_policy,settings_json)`
- `User(id,email,password_hash or identity_subject,status)`; `Membership(id,organization_id,user_id,role_id,status)`
- `Role`, `Permission`, `RolePermission`, `MembershipLocationScope`
- `Branch(id,organization_id,name,address,status)`; `Warehouse(id,organization_id,branch_id,name,code,status)`
- `Category(id,organization_id,parent_id,name)`; `Unit(id,organization_id,code,name,precision)`
- `Product(id,organization_id,sku,name,type,category_id,base_unit_id,barcode,cost,price,track_inventory,status)`; `ProductUnitConversion(product_id,unit_id,base_quantity)`
- `Supplier`, `Customer` with tenant scope, addresses, contact, payment terms/status.
- `InventoryBalance(organization_id,warehouse_id,product_id,on_hand,reserved,in_transit,version)` projection, unique `(org,warehouse,product)`.
- `StockMovement(id,organization_id,warehouse_id,product_id,document_type,document_id,line_id,movement_type,quantity_delta,cost_per_base_unit,occurred_at,actor_id,idempotency_key,reversal_of_id)` append-only.
- `InventoryReservation(id,organization_id,order_line_id,warehouse_id,product_id,quantity,status)` unique active allocation key; transitions reserve/release/consume.
- `PurchaseOrder`, `PurchaseOrderLine`; `GoodsReceipt`, `GoodsReceiptLine`; `SupplierPayment`.
- `SalesOrder`, `SalesOrderLine`; `Pick/Shipment`; `Invoice`, `Payment`, `PaymentAllocation`; return entities later.
- `StockTransfer`, `StockTransferLine`, `TransferReceipt`.
- `ReorderRule(org,warehouse,product,reorder_point,reorder_quantity,method)`; `AuditEvent`; `IdempotencyRecord`; `OutboxEvent`; `ImportJob`, `ExportJob`.

## Important constraints/indexes
- Unique normalized `(organization_id, sku)` for non-null SKU; decide soft-deleted uniqueness policy.
- Unique `(organization_id, warehouse_id, product_id)` balance.
- Unique `(organization_id, idempotency_key)` for critical commands; payload hash prevents key reuse with different payload.
- Nonnegative PO receipt quantity and cumulative accepted receipt check under row lock; no SQL check can replace transaction validation.
- Sales shipped <= picked <= ordered (return paths are separate documents).
- All FK relations between tenant entities include organization_id using composite foreign keys where Prisma supports generated schema; otherwise enforce repository checks plus tests.
- Movement rows immutable by application DB role; separate migration role. Add `(org,product,occurred_at)`, `(org,warehouse,occurred_at)`, document reference, and status indexes.
- Transaction rows include `posted_at` and never hard-delete. Master deletion is archive/restrict when referenced.

## Inventory transaction strategy
For each critical write: reserve idempotency key, lock inventory balance rows in sorted warehouse/product order, check current state/policy, insert movement/reservation/document transitions and update balance projection in one transaction, append audit/outbox. Retry deadlocks/serialization failures with bounded attempts and same idempotency key. Do not rely solely on client-side checks.

## Valuation
Owner-directed provisional implementation default: moving weighted average at warehouse/product level with cost snapshot on inbound/outbound movements (DEC-007). This is not validated accounting policy. Keep receipts, costs and reversals sufficient to add FIFO later. Landed costs and currency conversion are excluded pending owner/accountant review.

## Retention/privacy
Determine whether invoices and audit data must be retained for legal/accounting purposes. Deletion requests should anonymize user identity where permissible while preserving legally required transaction records. Avoid unrestricted JSON fields for core data.
