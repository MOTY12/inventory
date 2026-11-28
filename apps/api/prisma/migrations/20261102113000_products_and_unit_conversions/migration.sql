-- Product identity and product-specific units; this migration is additive.
CREATE TYPE "ProductType" AS ENUM ('STOCKED', 'NON_STOCK');

CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "sku" VARCHAR(80) NOT NULL,
    "sku_normalized" VARCHAR(80) NOT NULL,
    "barcode" VARCHAR(100),
    "barcode_normalized" VARCHAR(100),
    "description" VARCHAR(2000),
    "type" "ProductType" NOT NULL DEFAULT 'STOCKED',
    "category_id" UUID,
    "base_unit_id" UUID NOT NULL,
    "track_inventory" BOOLEAN NOT NULL DEFAULT true,
    "default_cost" DECIMAL(20,4),
    "cost_currency" CHAR(3),
    "default_sale_price" DECIMAL(20,4),
    "sale_currency" CHAR(3),
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "products_sku_normalized_nonempty" CHECK (length("sku_normalized") > 0),
    CONSTRAINT "products_cost_currency_pair" CHECK (("default_cost" IS NULL) = ("cost_currency" IS NULL)),
    CONSTRAINT "products_price_currency_pair" CHECK (("default_sale_price" IS NULL) = ("sale_currency" IS NULL)),
    CONSTRAINT "products_cost_nonnegative" CHECK ("default_cost" IS NULL OR "default_cost" >= 0),
    CONSTRAINT "products_sale_price_nonnegative" CHECK ("default_sale_price" IS NULL OR "default_sale_price" >= 0),
    CONSTRAINT "products_cost_currency_format" CHECK ("cost_currency" IS NULL OR "cost_currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "products_sale_currency_format" CHECK ("sale_currency" IS NULL OR "sale_currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "products_nonstock_not_tracked" CHECK ("type" <> 'NON_STOCK' OR "track_inventory" = false)
);

CREATE TABLE "product_unit_conversions" (
    "organization_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "base_quantity" DECIMAL(20,6) NOT NULL,

    CONSTRAINT "product_unit_conversions_pkey" PRIMARY KEY ("organization_id", "product_id", "unit_id"),
    CONSTRAINT "product_unit_conversions_base_quantity_positive" CHECK ("base_quantity" > 0)
);

CREATE UNIQUE INDEX "products_organization_id_id_key" ON "products"("organization_id", "id");
CREATE UNIQUE INDEX "products_organization_id_sku_normalized_key" ON "products"("organization_id", "sku_normalized");
CREATE UNIQUE INDEX "products_organization_id_barcode_normalized_key" ON "products"("organization_id", "barcode_normalized");
CREATE INDEX "products_organization_id_status_name_idx" ON "products"("organization_id", "status", "name");
CREATE INDEX "products_organization_id_category_id_status_idx" ON "products"("organization_id", "category_id", "status");
CREATE INDEX "products_organization_id_type_status_idx" ON "products"("organization_id", "type", "status");
CREATE INDEX "product_unit_conversions_organization_id_unit_id_idx" ON "product_unit_conversions"("organization_id", "unit_id");

ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_category_id_fkey"
    FOREIGN KEY ("organization_id", "category_id") REFERENCES "categories"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_base_unit_id_fkey"
    FOREIGN KEY ("organization_id", "base_unit_id") REFERENCES "units"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_unit_conversions" ADD CONSTRAINT "product_unit_conversions_organization_id_product_id_fkey"
    FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_unit_conversions" ADD CONSTRAINT "product_unit_conversions_organization_id_unit_id_fkey"
    FOREIGN KEY ("organization_id", "unit_id") REFERENCES "units"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
