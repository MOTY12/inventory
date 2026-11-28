CREATE TYPE "SalesPickStatus" AS ENUM ('CONFIRMED');

ALTER TABLE "sales_order_lines"
  ADD COLUMN "picked_quantity" DECIMAL(20,6) NOT NULL DEFAULT 0;

-- Existing fulfillment rows predate picking. Preserve their shipped quantities
-- as already picked so the new cumulative invariant holds without data loss.
UPDATE "sales_order_lines"
SET "picked_quantity" = "fulfilled_quantity";

ALTER TABLE "sales_order_lines"
  ADD CONSTRAINT "sales_order_lines_picking_range_check"
  CHECK ("fulfilled_quantity" >= 0 AND "fulfilled_quantity" <= "picked_quantity" AND "picked_quantity" <= "ordered_quantity");

CREATE TABLE "sales_picks" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "sales_order_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "status" "SalesPickStatus" NOT NULL DEFAULT 'CONFIRMED',
  "idempotency_key" VARCHAR(160) NOT NULL,
  "note" VARCHAR(500),
  "picked_by_user_id" UUID NOT NULL,
  "picked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_picks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_picks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_picks_organization_id_sales_order_id_fkey" FOREIGN KEY ("organization_id", "sales_order_id") REFERENCES "sales_orders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_picks_organization_id_warehouse_id_fkey" FOREIGN KEY ("organization_id", "warehouse_id") REFERENCES "warehouses"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_picks_organization_id_picked_by_user_id_fkey" FOREIGN KEY ("organization_id", "picked_by_user_id") REFERENCES "memberships"("organization_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "sales_picks_organization_id_id_key" ON "sales_picks"("organization_id", "id");
CREATE UNIQUE INDEX "sales_picks_organization_id_idempotency_key_key" ON "sales_picks"("organization_id", "idempotency_key");
CREATE INDEX "sales_picks_organization_id_sales_order_id_picked_at_idx" ON "sales_picks"("organization_id", "sales_order_id", "picked_at");

CREATE TABLE "sales_pick_lines" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "sales_pick_id" UUID NOT NULL,
  "sales_order_line_id" UUID NOT NULL,
  "reservation_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity" DECIMAL(20,6) NOT NULL,
  "base_quantity" DECIMAL(20,6) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_pick_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_pick_lines_positive_quantity_check" CHECK ("quantity" > 0 AND "base_quantity" > 0),
  CONSTRAINT "sales_pick_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_pick_lines_organization_id_sales_pick_id_fkey" FOREIGN KEY ("organization_id", "sales_pick_id") REFERENCES "sales_picks"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sales_pick_lines_organization_id_sales_order_line_id_fkey" FOREIGN KEY ("organization_id", "sales_order_line_id") REFERENCES "sales_order_lines"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_pick_lines_organization_id_reservation_id_fkey" FOREIGN KEY ("organization_id", "reservation_id") REFERENCES "inventory_reservations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_pick_lines_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "sales_pick_lines_organization_id_id_key" ON "sales_pick_lines"("organization_id", "id");
CREATE INDEX "sales_pick_lines_organization_id_sales_order_line_id_created_at_idx" ON "sales_pick_lines"("organization_id", "sales_order_line_id", "created_at");
