-- Additive inventory ledger, command idempotency, and transactional outbox schema.
CREATE TYPE "StockMovementType" AS ENUM (
    'OPENING_BALANCE', 'RECEIPT', 'SALE_FULFILLMENT', 'TRANSFER_OUT',
    'TRANSFER_IN', 'ADJUSTMENT', 'REVERSAL'
);
CREATE TYPE "IdempotencyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "document_type" VARCHAR(48) NOT NULL,
    "document_id" UUID NOT NULL,
    "document_line_id" UUID,
    "movement_type" "StockMovementType" NOT NULL,
    "quantity_delta" DECIMAL(20,6) NOT NULL,
    "cost_per_base_unit" DECIMAL(20,4),
    "cost_currency" CHAR(3),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" UUID NOT NULL,
    "reversal_of_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stock_movements_quantity_nonzero" CHECK ("quantity_delta" <> 0),
    CONSTRAINT "stock_movements_cost_pair" CHECK (("cost_per_base_unit" IS NULL) = ("cost_currency" IS NULL)),
    CONSTRAINT "stock_movements_cost_nonnegative" CHECK ("cost_per_base_unit" IS NULL OR "cost_per_base_unit" >= 0),
    CONSTRAINT "stock_movements_currency_format" CHECK ("cost_currency" IS NULL OR "cost_currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "idempotency_records" (
    "organization_id" UUID NOT NULL,
    "key" VARCHAR(160) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "result_type" VARCHAR(48),
    "result_id" UUID,
    "response" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("organization_id", "key"),
    CONSTRAINT "idempotency_records_completion_state" CHECK (("status" = 'COMPLETED') = ("completed_at" IS NOT NULL))
);

CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "aggregate_type" VARCHAR(80) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(1000),
    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "outbox_events_attempt_nonnegative" CHECK ("attempt_count" >= 0)
);

CREATE UNIQUE INDEX "stock_movements_organization_id_id_key" ON "stock_movements"("organization_id", "id");
CREATE INDEX "stock_movements_organization_id_product_id_occurred_at_id_idx" ON "stock_movements"("organization_id", "product_id", "occurred_at", "id");
CREATE INDEX "stock_movements_organization_id_warehouse_id_occurred_at_id_idx" ON "stock_movements"("organization_id", "warehouse_id", "occurred_at", "id");
CREATE INDEX "stock_movements_organization_id_document_type_document_id_idx" ON "stock_movements"("organization_id", "document_type", "document_id");
CREATE INDEX "stock_movements_organization_id_reversal_of_id_idx" ON "stock_movements"("organization_id", "reversal_of_id");
CREATE INDEX "idempotency_records_organization_id_status_created_at_idx" ON "idempotency_records"("organization_id", "status", "created_at");
CREATE INDEX "outbox_events_organization_id_published_at_occurred_at_idx" ON "outbox_events"("organization_id", "published_at", "occurred_at");
CREATE INDEX "outbox_events_organization_id_aggregate_type_aggregate_id_occurred_at_idx" ON "outbox_events"("organization_id", "aggregate_type", "aggregate_id", "occurred_at");

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organization_id_warehouse_id_fkey" FOREIGN KEY ("organization_id", "warehouse_id") REFERENCES "warehouses"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organization_id_actor_user_id_fkey" FOREIGN KEY ("organization_id", "actor_user_id") REFERENCES "memberships"("organization_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organization_id_reversal_of_id_fkey" FOREIGN KEY ("organization_id", "reversal_of_id") REFERENCES "stock_movements"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION prevent_stock_movement_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'stock movements are immutable; append a compensating movement instead'
        USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "stock_movements_immutable"
BEFORE UPDATE OR DELETE ON "stock_movements"
FOR EACH ROW EXECUTE FUNCTION prevent_stock_movement_mutation();
