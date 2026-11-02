-- Additive balance projection; values remain derived from the immutable movement ledger.
CREATE TABLE "inventory_balances" (
    "organization_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "on_hand" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "in_transit" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "average_cost" DECIMAL(20,4),
    "cost_currency" CHAR(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("organization_id", "warehouse_id", "product_id"),
    CONSTRAINT "inventory_balances_reserved_nonnegative" CHECK ("reserved" >= 0),
    CONSTRAINT "inventory_balances_on_hand_nonnegative" CHECK ("on_hand" >= "reserved"),
    CONSTRAINT "inventory_balances_in_transit_nonnegative" CHECK ("in_transit" >= 0),
    CONSTRAINT "inventory_balances_cost_pair" CHECK (("average_cost" IS NULL) = ("cost_currency" IS NULL)),
    CONSTRAINT "inventory_balances_cost_nonnegative" CHECK ("average_cost" IS NULL OR "average_cost" >= 0),
    CONSTRAINT "inventory_balances_currency_format" CHECK ("cost_currency" IS NULL OR "cost_currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "inventory_balances_version_nonnegative" CHECK ("version" >= 0)
);

CREATE INDEX "inventory_balances_organization_id_product_id_warehouse_id_idx" ON "inventory_balances"("organization_id", "product_id", "warehouse_id");
CREATE INDEX "inventory_balances_organization_id_warehouse_id_on_hand_idx" ON "inventory_balances"("organization_id", "warehouse_id", "on_hand");

ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_organization_id_warehouse_id_fkey" FOREIGN KEY ("organization_id", "warehouse_id") REFERENCES "warehouses"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
