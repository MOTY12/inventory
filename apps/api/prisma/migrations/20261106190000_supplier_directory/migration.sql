CREATE TABLE "suppliers" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "name_normalized" VARCHAR(180) NOT NULL,
  "contact_name" VARCHAR(180),
  "email" VARCHAR(320),
  "phone" VARCHAR(40),
  "website" VARCHAR(500),
  "address_line_1" VARCHAR(240),
  "address_line_2" VARCHAR(240),
  "city" VARCHAR(120),
  "region" VARCHAR(120),
  "postal_code" VARCHAR(32),
  "country_code" CHAR(2),
  "terms_notes" VARCHAR(1000),
  "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "suppliers_country_code_check" CHECK ("country_code" IS NULL OR "country_code" ~ '^[A-Z]{2}$'),
  CONSTRAINT "suppliers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "suppliers_organization_id_id_key" ON "suppliers"("organization_id", "id");
CREATE UNIQUE INDEX "suppliers_organization_id_name_normalized_key" ON "suppliers"("organization_id", "name_normalized");
CREATE INDEX "suppliers_organization_id_status_name_idx" ON "suppliers"("organization_id", "status", "name");
CREATE INDEX "suppliers_organization_id_email_idx" ON "suppliers"("organization_id", "email");
