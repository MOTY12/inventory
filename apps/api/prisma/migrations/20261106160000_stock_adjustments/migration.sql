CREATE TYPE "StockAdjustmentStatus" AS ENUM ('DRAFT', 'POSTED');

CREATE TABLE "stock_adjustments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "system_quantity" DECIMAL(20,6) NOT NULL,
  "counted_quantity" DECIMAL(20,6) NOT NULL,
  "status" "StockAdjustmentStatus" NOT NULL DEFAULT 'DRAFT',
  "created_by_user_id" UUID NOT NULL,
  "posted_movement_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "posted_at" TIMESTAMPTZ(3),
  CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_adjustments_counts_nonnegative" CHECK ("system_quantity" >= 0 AND "counted_quantity" >= 0),
  CONSTRAINT "stock_adjustments_post_state" CHECK (("status" = 'DRAFT' AND "posted_movement_id" IS NULL AND "posted_at" IS NULL) OR ("status" = 'POSTED' AND "posted_movement_id" IS NOT NULL AND "posted_at" IS NOT NULL))
);

CREATE UNIQUE INDEX "stock_adjustments_organization_id_id_key" ON "stock_adjustments"("organization_id", "id");
CREATE UNIQUE INDEX "stock_adjustments_organization_id_posted_movement_id_key" ON "stock_adjustments"("organization_id", "posted_movement_id");
CREATE UNIQUE INDEX "stock_adjustments_posted_movement_id_key" ON "stock_adjustments"("posted_movement_id");
CREATE INDEX "stock_adjustments_organization_id_warehouse_id_status_created_at_idx" ON "stock_adjustments"("organization_id", "warehouse_id", "status", "created_at");
CREATE INDEX "stock_adjustments_organization_id_product_id_created_at_idx" ON "stock_adjustments"("organization_id", "product_id", "created_at");

ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_organization_id_warehouse_id_fkey" FOREIGN KEY ("organization_id", "warehouse_id") REFERENCES "warehouses"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_organization_id_created_by_user_id_fkey" FOREIGN KEY ("organization_id", "created_by_user_id") REFERENCES "memberships"("organization_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_organization_id_posted_movement_id_fkey" FOREIGN KEY ("organization_id", "posted_movement_id") REFERENCES "stock_movements"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
