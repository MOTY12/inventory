CREATE TABLE "sales_fulfillments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "sales_order_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(160) NOT NULL,
  "note" VARCHAR(500),
  "posted_by_user_id" UUID NOT NULL,
  "posted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_fulfillments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_fulfillments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_fulfillments_organization_id_sales_order_id_fkey" FOREIGN KEY ("organization_id", "sales_order_id") REFERENCES "sales_orders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_fulfillments_organization_id_warehouse_id_fkey" FOREIGN KEY ("organization_id", "warehouse_id") REFERENCES "warehouses"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_fulfillments_organization_id_posted_by_user_id_fkey" FOREIGN KEY ("organization_id", "posted_by_user_id") REFERENCES "memberships"("organization_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "sales_fulfillments_organization_id_id_key" ON "sales_fulfillments"("organization_id", "id");
CREATE UNIQUE INDEX "sales_fulfillments_organization_id_idempotency_key_key" ON "sales_fulfillments"("organization_id", "idempotency_key");
CREATE INDEX "sales_fulfillments_organization_id_sales_order_id_posted_at_idx" ON "sales_fulfillments"("organization_id", "sales_order_id", "posted_at");

CREATE TABLE "sales_fulfillment_lines" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "fulfillment_id" UUID NOT NULL,
  "sales_order_line_id" UUID NOT NULL,
  "reservation_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity" DECIMAL(20,6) NOT NULL,
  "base_quantity" DECIMAL(20,6) NOT NULL,
  "movement_id" UUID NOT NULL,
  CONSTRAINT "sales_fulfillment_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_fulfillment_lines_positive_quantity_check" CHECK ("quantity" > 0 AND "base_quantity" > 0),
  CONSTRAINT "sales_fulfillment_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_fulfillment_lines_organization_id_fulfillment_id_fkey" FOREIGN KEY ("organization_id", "fulfillment_id") REFERENCES "sales_fulfillments"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sales_fulfillment_lines_organization_id_sales_order_line_id_fkey" FOREIGN KEY ("organization_id", "sales_order_line_id") REFERENCES "sales_order_lines"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_fulfillment_lines_organization_id_reservation_id_fkey" FOREIGN KEY ("organization_id", "reservation_id") REFERENCES "inventory_reservations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_fulfillment_lines_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_fulfillment_lines_organization_id_movement_id_fkey" FOREIGN KEY ("organization_id", "movement_id") REFERENCES "stock_movements"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "sales_fulfillment_lines_organization_id_id_key" ON "sales_fulfillment_lines"("organization_id", "id");
CREATE UNIQUE INDEX "sales_fulfillment_lines_movement_id_key" ON "sales_fulfillment_lines"("movement_id");
CREATE UNIQUE INDEX "sales_fulfillment_lines_organization_id_movement_id_key" ON "sales_fulfillment_lines"("organization_id", "movement_id");
CREATE INDEX "sales_fulfillment_lines_organization_id_sales_order_line_id_idx" ON "sales_fulfillment_lines"("organization_id", "sales_order_line_id");
