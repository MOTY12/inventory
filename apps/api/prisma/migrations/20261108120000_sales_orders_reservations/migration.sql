CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED');
CREATE TYPE "InventoryReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONSUMED');

CREATE TABLE "sales_order_sequences" (
  "organization_id" UUID NOT NULL,
  "next_number" BIGINT NOT NULL DEFAULT 1,
  CONSTRAINT "sales_order_sequences_pkey" PRIMARY KEY ("organization_id"),
  CONSTRAINT "sales_order_sequences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "sales_orders" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "number" VARCHAR(40) NOT NULL,
  "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "order_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expected_fulfillment_at" DATE,
  "currency" CHAR(3) NOT NULL,
  "subtotal" DECIMAL(20,4) NOT NULL DEFAULT 0,
  "total" DECIMAL(20,4) NOT NULL DEFAULT 0,
  "notes" VARCHAR(1000),
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "confirmed_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_orders_subtotal_nonnegative_check" CHECK ("subtotal" >= 0),
  CONSTRAINT "sales_orders_total_nonnegative_check" CHECK ("total" >= 0),
  CONSTRAINT "sales_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_orders_organization_id_customer_id_fkey" FOREIGN KEY ("organization_id", "customer_id") REFERENCES "customers"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_orders_organization_id_warehouse_id_fkey" FOREIGN KEY ("organization_id", "warehouse_id") REFERENCES "warehouses"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_orders_organization_id_created_by_user_id_fkey" FOREIGN KEY ("organization_id", "created_by_user_id") REFERENCES "memberships"("organization_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "sales_orders_organization_id_id_key" ON "sales_orders"("organization_id", "id");
CREATE UNIQUE INDEX "sales_orders_organization_id_number_key" ON "sales_orders"("organization_id", "number");
CREATE INDEX "sales_orders_organization_id_status_order_date_id_idx" ON "sales_orders"("organization_id", "status", "order_date", "id");
CREATE INDEX "sales_orders_organization_id_customer_id_order_date_idx" ON "sales_orders"("organization_id", "customer_id", "order_date");
CREATE INDEX "sales_orders_organization_id_warehouse_id_status_order_date_idx" ON "sales_orders"("organization_id", "warehouse_id", "status", "order_date");

CREATE TABLE "sales_order_lines" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "sales_order_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "unit_id" UUID NOT NULL,
  "product_name" VARCHAR(180) NOT NULL,
  "sku" VARCHAR(80) NOT NULL,
  "unit_code" VARCHAR(40) NOT NULL,
  "ordered_quantity" DECIMAL(20,6) NOT NULL,
  "base_quantity" DECIMAL(20,6) NOT NULL,
  "unit_price" DECIMAL(20,4) NOT NULL,
  "line_total" DECIMAL(20,4) NOT NULL,
  "fulfilled_quantity" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_order_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_order_lines_positive_quantity_check" CHECK ("ordered_quantity" > 0),
  CONSTRAINT "sales_order_lines_positive_base_quantity_check" CHECK ("base_quantity" > 0),
  CONSTRAINT "sales_order_lines_nonnegative_price_check" CHECK ("unit_price" >= 0),
  CONSTRAINT "sales_order_lines_fulfillment_range_check" CHECK ("fulfilled_quantity" >= 0 AND "fulfilled_quantity" <= "ordered_quantity"),
  CONSTRAINT "sales_order_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_order_lines_organization_id_sales_order_id_fkey" FOREIGN KEY ("organization_id", "sales_order_id") REFERENCES "sales_orders"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sales_order_lines_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_order_lines_organization_id_unit_id_fkey" FOREIGN KEY ("organization_id", "unit_id") REFERENCES "units"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "sales_order_lines_organization_id_id_key" ON "sales_order_lines"("organization_id", "id");
CREATE UNIQUE INDEX "sales_order_lines_organization_id_sales_order_id_product_id_key" ON "sales_order_lines"("organization_id", "sales_order_id", "product_id");
CREATE INDEX "sales_order_lines_organization_id_product_id_created_at_idx" ON "sales_order_lines"("organization_id", "product_id", "created_at");

CREATE TABLE "inventory_reservations" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "sales_order_id" UUID NOT NULL,
  "sales_order_line_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "quantity" DECIMAL(20,6) NOT NULL,
  "fulfilled_quantity" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "released_quantity" DECIMAL(20,6) NOT NULL DEFAULT 0,
  "status" "InventoryReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_reservations_positive_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "inventory_reservations_quantities_check" CHECK ("fulfilled_quantity" >= 0 AND "released_quantity" >= 0 AND "fulfilled_quantity" + "released_quantity" <= "quantity"),
  CONSTRAINT "inventory_reservations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_reservations_organization_id_sales_order_id_fkey" FOREIGN KEY ("organization_id", "sales_order_id") REFERENCES "sales_orders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_reservations_organization_id_sales_order_line_id_fkey" FOREIGN KEY ("organization_id", "sales_order_line_id") REFERENCES "sales_order_lines"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_reservations_organization_id_warehouse_id_fkey" FOREIGN KEY ("organization_id", "warehouse_id") REFERENCES "warehouses"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_reservations_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "inventory_reservations_organization_id_id_key" ON "inventory_reservations"("organization_id", "id");
CREATE UNIQUE INDEX "inventory_reservations_organization_id_sales_order_line_id_key" ON "inventory_reservations"("organization_id", "sales_order_line_id");
CREATE INDEX "inventory_reservations_organization_id_warehouse_id_product_id_status_idx" ON "inventory_reservations"("organization_id", "warehouse_id", "product_id", "status");
CREATE INDEX "inventory_reservations_organization_id_sales_order_id_status_idx" ON "inventory_reservations"("organization_id", "sales_order_id", "status");

CREATE TABLE "inventory_reservation_history" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "reservation_id" UUID NOT NULL,
  "from_status" "InventoryReservationStatus",
  "to_status" "InventoryReservationStatus" NOT NULL,
  "quantity_delta" DECIMAL(20,6) NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "reason" VARCHAR(80) NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_reservation_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_reservation_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_reservation_history_organization_id_reservation_id_fkey" FOREIGN KEY ("organization_id", "reservation_id") REFERENCES "inventory_reservations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_reservation_history_organization_id_actor_user_id_fkey" FOREIGN KEY ("organization_id", "actor_user_id") REFERENCES "memberships"("organization_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "inventory_reservation_history_organization_id_reservation_id_occurred_at_idx" ON "inventory_reservation_history"("organization_id", "reservation_id", "occurred_at");

CREATE TABLE "sales_order_status_history" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "sales_order_id" UUID NOT NULL,
  "from_status" "SalesOrderStatus",
  "to_status" "SalesOrderStatus" NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_order_status_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_order_status_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_order_status_history_organization_id_sales_order_id_fkey" FOREIGN KEY ("organization_id", "sales_order_id") REFERENCES "sales_orders"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sales_order_status_history_organization_id_actor_user_id_fkey" FOREIGN KEY ("organization_id", "actor_user_id") REFERENCES "memberships"("organization_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "sales_order_status_history_organization_id_sales_order_id_occurred_at_idx" ON "sales_order_status_history"("organization_id", "sales_order_id", "occurred_at");
