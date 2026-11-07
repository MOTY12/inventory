-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "purchase_order_sequences" (
    "organization_id" UUID NOT NULL,
    "next_number" BIGINT NOT NULL DEFAULT 1,

    CONSTRAINT "purchase_order_sequences_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "order_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_delivery_at" DATE,
    "currency" CHAR(3) NOT NULL,
    "subtotal" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "submitted_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "ordered_quantity" DECIMAL(20,6) NOT NULL,
    "received_quantity" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "received_base_quantity" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "base_quantity" DECIMAL(20,6) NOT NULL,
    "unit_cost" DECIMAL(20,4) NOT NULL,
    "base_unit_cost" DECIMAL(20,4) NOT NULL,
    "line_total" DECIMAL(20,4) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(160) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_by_user_id" UUID NOT NULL,
    "note" VARCHAR(500),

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "purchase_order_line_id" UUID NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "base_quantity" DECIMAL(20,6) NOT NULL,
    "stock_movement_id" UUID,

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_orders_organization_id_status_order_date_id_idx" ON "purchase_orders"("organization_id", "status", "order_date", "id");

-- CreateIndex
CREATE INDEX "purchase_orders_organization_id_supplier_id_order_date_idx" ON "purchase_orders"("organization_id", "supplier_id", "order_date");

-- CreateIndex
CREATE INDEX "purchase_orders_organization_id_warehouse_id_status_idx" ON "purchase_orders"("organization_id", "warehouse_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_organization_id_id_key" ON "purchase_orders"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_organization_id_number_key" ON "purchase_orders"("organization_id", "number");

-- CreateIndex
CREATE INDEX "purchase_order_lines_organization_id_purchase_order_id_idx" ON "purchase_order_lines"("organization_id", "purchase_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_lines_organization_id_id_key" ON "purchase_order_lines"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_lines_organization_id_purchase_order_id_prod_key" ON "purchase_order_lines"("organization_id", "purchase_order_id", "product_id", "unit_id");

-- CreateIndex
CREATE INDEX "goods_receipts_organization_id_purchase_order_id_received_a_idx" ON "goods_receipts"("organization_id", "purchase_order_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_organization_id_id_key" ON "goods_receipts"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_organization_id_idempotency_key_key" ON "goods_receipts"("organization_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_organization_id_receipt_id_idx" ON "goods_receipt_lines"("organization_id", "receipt_id");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_organization_id_purchase_order_line_id_idx" ON "goods_receipt_lines"("organization_id", "purchase_order_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipt_lines_organization_id_id_key" ON "goods_receipt_lines"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipt_lines_organization_id_stock_movement_id_key" ON "goods_receipt_lines"("organization_id", "stock_movement_id");

-- AddForeignKey
ALTER TABLE "purchase_order_sequences" ADD CONSTRAINT "purchase_order_sequences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organization_id_supplier_id_fkey" FOREIGN KEY ("organization_id", "supplier_id") REFERENCES "suppliers"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organization_id_warehouse_id_fkey" FOREIGN KEY ("organization_id", "warehouse_id") REFERENCES "warehouses"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organization_id_created_by_user_id_fkey" FOREIGN KEY ("organization_id", "created_by_user_id") REFERENCES "memberships"("organization_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_organization_id_purchase_order_id_fkey" FOREIGN KEY ("organization_id", "purchase_order_id") REFERENCES "purchase_orders"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_organization_id_unit_id_fkey" FOREIGN KEY ("organization_id", "unit_id") REFERENCES "units"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_organization_id_purchase_order_id_fkey" FOREIGN KEY ("organization_id", "purchase_order_id") REFERENCES "purchase_orders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_organization_id_received_by_user_id_fkey" FOREIGN KEY ("organization_id", "received_by_user_id") REFERENCES "memberships"("organization_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_organization_id_receipt_id_fkey" FOREIGN KEY ("organization_id", "receipt_id") REFERENCES "goods_receipts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_organization_id_purchase_order_line_id_fkey" FOREIGN KEY ("organization_id", "purchase_order_line_id") REFERENCES "purchase_order_lines"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_orders"
  ADD CONSTRAINT "purchase_orders_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "purchase_orders_subtotal_check" CHECK ("subtotal" >= 0);

ALTER TABLE "purchase_order_lines"
  ADD CONSTRAINT "purchase_order_lines_quantity_check" CHECK ("ordered_quantity" > 0 AND "received_quantity" >= 0 AND "received_quantity" <= "ordered_quantity"),
  ADD CONSTRAINT "purchase_order_lines_base_quantity_check" CHECK ("base_quantity" > 0 AND "received_base_quantity" >= 0 AND "received_base_quantity" <= "base_quantity"),
  ADD CONSTRAINT "purchase_order_lines_cost_check" CHECK ("unit_cost" >= 0 AND "base_unit_cost" >= 0 AND "line_total" >= 0);

ALTER TABLE "goods_receipt_lines"
  ADD CONSTRAINT "goods_receipt_lines_quantity_check" CHECK ("quantity" > 0 AND "base_quantity" > 0),
  ADD CONSTRAINT "goods_receipt_lines_stock_movement_id_fkey" FOREIGN KEY ("organization_id", "stock_movement_id") REFERENCES "stock_movements"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
