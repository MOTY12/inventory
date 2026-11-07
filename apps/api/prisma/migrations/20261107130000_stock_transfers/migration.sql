-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "stock_transfer_sequences" (
    "organization_id" UUID NOT NULL,
    "next_number" BIGINT NOT NULL DEFAULT 1,

    CONSTRAINT "stock_transfer_sequences_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "source_warehouse_id" UUID NOT NULL,
    "destination_warehouse_id" UUID NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'DRAFT',
    "note" VARCHAR(500),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "submitted_at" TIMESTAMPTZ(3),
    "dispatched_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "requested_quantity" DECIMAL(20,6) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfer_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_dispatches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "dispatched_by_user_id" UUID NOT NULL,
    "dispatched_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfer_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_dispatch_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "dispatch_id" UUID NOT NULL,
    "transfer_line_id" UUID NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "movement_id" UUID NOT NULL,
    "cost_per_base_unit" DECIMAL(20,4),
    "cost_currency" CHAR(3),

    CONSTRAINT "stock_transfer_dispatch_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_receipts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(160) NOT NULL,
    "note" VARCHAR(500),
    "received_by_user_id" UUID NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfer_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_receipt_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "transfer_line_id" UUID NOT NULL,
    "quantity" DECIMAL(20,6) NOT NULL,
    "movement_id" UUID NOT NULL,

    CONSTRAINT "stock_transfer_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_status_history" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "from_status" "StockTransferStatus",
    "to_status" "StockTransferStatus" NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "note" VARCHAR(500),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfer_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_transfers_organization_id_status_created_at_idx" ON "stock_transfers"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "stock_transfers_organization_id_source_warehouse_id_status__idx" ON "stock_transfers"("organization_id", "source_warehouse_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "stock_transfers_organization_id_destination_warehouse_id_st_idx" ON "stock_transfers"("organization_id", "destination_warehouse_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_organization_id_id_key" ON "stock_transfers"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_organization_id_number_key" ON "stock_transfers"("organization_id", "number");

-- CreateIndex
CREATE INDEX "stock_transfer_lines_organization_id_product_id_created_at_idx" ON "stock_transfer_lines"("organization_id", "product_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfer_lines_organization_id_id_key" ON "stock_transfer_lines"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfer_lines_organization_id_transfer_id_product_id_key" ON "stock_transfer_lines"("organization_id", "transfer_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfer_dispatches_organization_id_id_key" ON "stock_transfer_dispatches"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfer_dispatches_organization_id_transfer_id_key" ON "stock_transfer_dispatches"("organization_id", "transfer_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfer_dispatch_lines_movement_id_key" ON "stock_transfer_dispatch_lines"("movement_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfer_dispatch_lines_organization_id_id_key" ON "stock_transfer_dispatch_lines"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfer_dispatch_lines_organization_id_transfer_line_key" ON "stock_transfer_dispatch_lines"("organization_id", "transfer_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfer_dispatch_lines_organization_id_movement_id_key" ON "stock_transfer_dispatch_lines"("organization_id", "movement_id");

-- CreateIndex
CREATE INDEX "stock_transfer_receipts_organization_id_transfer_id_receive_idx" ON "stock_transfer_receipts"("organization_id", "transfer_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfer_receipts_organization_id_id_key" ON "stock_transfer_receipts"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfer_receipts_organization_id_idempotency_key_key" ON "stock_transfer_receipts"("organization_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfer_receipt_lines_movement_id_key" ON "stock_transfer_receipt_lines"("movement_id");

-- CreateIndex
CREATE INDEX "stock_transfer_receipt_lines_organization_id_transfer_line__idx" ON "stock_transfer_receipt_lines"("organization_id", "transfer_line_id", "receipt_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfer_receipt_lines_organization_id_id_key" ON "stock_transfer_receipt_lines"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfer_receipt_lines_organization_id_movement_id_key" ON "stock_transfer_receipt_lines"("organization_id", "movement_id");

-- CreateIndex
CREATE INDEX "stock_transfer_status_history_organization_id_transfer_id_o_idx" ON "stock_transfer_status_history"("organization_id", "transfer_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "stock_transfer_sequences" ADD CONSTRAINT "stock_transfer_sequences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_organization_id_source_warehouse_id_fkey" FOREIGN KEY ("organization_id", "source_warehouse_id") REFERENCES "warehouses"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_organization_id_destination_warehouse_id_fkey" FOREIGN KEY ("organization_id", "destination_warehouse_id") REFERENCES "warehouses"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_organization_id_created_by_user_id_fkey" FOREIGN KEY ("organization_id", "created_by_user_id") REFERENCES "memberships"("organization_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_organization_id_transfer_id_fkey" FOREIGN KEY ("organization_id", "transfer_id") REFERENCES "stock_transfers"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_dispatches" ADD CONSTRAINT "stock_transfer_dispatches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_dispatches" ADD CONSTRAINT "stock_transfer_dispatches_organization_id_transfer_id_fkey" FOREIGN KEY ("organization_id", "transfer_id") REFERENCES "stock_transfers"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_dispatches" ADD CONSTRAINT "stock_transfer_dispatches_organization_id_dispatched_by_us_fkey" FOREIGN KEY ("organization_id", "dispatched_by_user_id") REFERENCES "memberships"("organization_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_dispatch_lines" ADD CONSTRAINT "stock_transfer_dispatch_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_dispatch_lines" ADD CONSTRAINT "stock_transfer_dispatch_lines_organization_id_dispatch_id_fkey" FOREIGN KEY ("organization_id", "dispatch_id") REFERENCES "stock_transfer_dispatches"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_dispatch_lines" ADD CONSTRAINT "stock_transfer_dispatch_lines_organization_id_transfer_lin_fkey" FOREIGN KEY ("organization_id", "transfer_line_id") REFERENCES "stock_transfer_lines"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_dispatch_lines" ADD CONSTRAINT "stock_transfer_dispatch_lines_organization_id_movement_id_fkey" FOREIGN KEY ("organization_id", "movement_id") REFERENCES "stock_movements"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_receipts" ADD CONSTRAINT "stock_transfer_receipts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_receipts" ADD CONSTRAINT "stock_transfer_receipts_organization_id_transfer_id_fkey" FOREIGN KEY ("organization_id", "transfer_id") REFERENCES "stock_transfers"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_receipts" ADD CONSTRAINT "stock_transfer_receipts_organization_id_received_by_user_i_fkey" FOREIGN KEY ("organization_id", "received_by_user_id") REFERENCES "memberships"("organization_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_receipt_lines" ADD CONSTRAINT "stock_transfer_receipt_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_receipt_lines" ADD CONSTRAINT "stock_transfer_receipt_lines_organization_id_receipt_id_fkey" FOREIGN KEY ("organization_id", "receipt_id") REFERENCES "stock_transfer_receipts"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_receipt_lines" ADD CONSTRAINT "stock_transfer_receipt_lines_organization_id_transfer_line_fkey" FOREIGN KEY ("organization_id", "transfer_line_id") REFERENCES "stock_transfer_lines"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_receipt_lines" ADD CONSTRAINT "stock_transfer_receipt_lines_organization_id_movement_id_fkey" FOREIGN KEY ("organization_id", "movement_id") REFERENCES "stock_movements"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_status_history" ADD CONSTRAINT "stock_transfer_status_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_status_history" ADD CONSTRAINT "stock_transfer_status_history_organization_id_transfer_id_fkey" FOREIGN KEY ("organization_id", "transfer_id") REFERENCES "stock_transfers"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_status_history" ADD CONSTRAINT "stock_transfer_status_history_organization_id_actor_user_i_fkey" FOREIGN KEY ("organization_id", "actor_user_id") REFERENCES "memberships"("organization_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
