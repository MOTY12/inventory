-- CreateEnum
CREATE TYPE "WarehouseStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MembershipRole" ADD VALUE 'MANAGER';
ALTER TYPE "MembershipRole" ADD VALUE 'BUYER';
ALTER TYPE "MembershipRole" ADD VALUE 'SALES';
ALTER TYPE "MembershipRole" ADD VALUE 'WAREHOUSE_CLERK';
ALTER TYPE "MembershipRole" ADD VALUE 'FINANCE';
ALTER TYPE "MembershipRole" ADD VALUE 'READ_ONLY';

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "status" "WarehouseStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_warehouse_grants" (
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_warehouse_grants_pkey" PRIMARY KEY ("organization_id","user_id","warehouse_id")
);

-- CreateIndex
CREATE INDEX "warehouses_organization_id_status_name_idx" ON "warehouses"("organization_id", "status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_organization_id_id_key" ON "warehouses"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_organization_id_code_key" ON "warehouses"("organization_id", "code");

-- CreateIndex
CREATE INDEX "membership_warehouse_grants_organization_id_warehouse_id_idx" ON "membership_warehouse_grants"("organization_id", "warehouse_id");

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_warehouse_grants" ADD CONSTRAINT "membership_warehouse_grants_organization_id_user_id_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "memberships"("organization_id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_warehouse_grants" ADD CONSTRAINT "membership_warehouse_grants_organization_id_warehouse_id_fkey" FOREIGN KEY ("organization_id", "warehouse_id") REFERENCES "warehouses"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
