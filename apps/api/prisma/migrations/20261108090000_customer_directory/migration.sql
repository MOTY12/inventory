-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('BUSINESS', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "name_normalized" VARCHAR(180) NOT NULL,
    "type" "CustomerType" NOT NULL DEFAULT 'BUSINESS',
    "contact_name" VARCHAR(180),
    "email" VARCHAR(320),
    "email_normalized" VARCHAR(320),
    "phone" VARCHAR(40),
    "billing_address_line_1" VARCHAR(240),
    "billing_address_line_2" VARCHAR(240),
    "billing_city" VARCHAR(120),
    "billing_region" VARCHAR(120),
    "billing_postal_code" VARCHAR(32),
    "billing_country_code" CHAR(2),
    "shipping_address_line_1" VARCHAR(240),
    "shipping_address_line_2" VARCHAR(240),
    "shipping_city" VARCHAR(120),
    "shipping_region" VARCHAR(120),
    "shipping_postal_code" VARCHAR(32),
    "shipping_country_code" CHAR(2),
    "notes" VARCHAR(1000),
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_organization_id_status_name_idx" ON "customers"("organization_id", "status", "name");

-- CreateIndex
CREATE INDEX "customers_organization_id_name_normalized_idx" ON "customers"("organization_id", "name_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "customers_organization_id_id_key" ON "customers"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_organization_id_email_normalized_key" ON "customers"("organization_id", "email_normalized");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
