CREATE TYPE "ReorderRuleStatus" AS ENUM ('ACTIVE', 'PAUSED');
CREATE TYPE "LowStockAlertStatus" AS ENUM ('OPEN', 'RESOLVED');
CREATE TYPE "LowStockAlertEventType" AS ENUM ('OPENED', 'UPDATED', 'RESOLVED', 'REOPENED');

CREATE TABLE "reorder_rules" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "minimum_quantity" DECIMAL(20,6) NOT NULL,
  "target_quantity" DECIMAL(20,6) NOT NULL,
  "status" "ReorderRuleStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_by_user_id" UUID NOT NULL,
  "last_evaluated_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reorder_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reorder_rules_quantities_check" CHECK ("minimum_quantity" >= 0 AND "target_quantity" > "minimum_quantity"),
  CONSTRAINT "reorder_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reorder_rules_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reorder_rules_organization_id_warehouse_id_fkey" FOREIGN KEY ("organization_id", "warehouse_id") REFERENCES "warehouses"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "reorder_rules_organization_id_created_by_user_id_fkey" FOREIGN KEY ("organization_id", "created_by_user_id") REFERENCES "memberships"("organization_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "reorder_rules_organization_id_id_key" ON "reorder_rules"("organization_id", "id");
CREATE UNIQUE INDEX "reorder_rules_organization_id_product_id_warehouse_id_key" ON "reorder_rules"("organization_id", "product_id", "warehouse_id");
CREATE INDEX "reorder_rules_organization_id_status_warehouse_id_product_id_idx" ON "reorder_rules"("organization_id", "status", "warehouse_id", "product_id");

CREATE TABLE "low_stock_alerts" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "reorder_rule_id" UUID NOT NULL,
  "status" "LowStockAlertStatus" NOT NULL DEFAULT 'OPEN',
  "resolution_reason" VARCHAR(48),
  "on_hand_quantity" DECIMAL(20,6) NOT NULL,
  "reserved_quantity" DECIMAL(20,6) NOT NULL,
  "available_quantity" DECIMAL(20,6) NOT NULL,
  "minimum_quantity" DECIMAL(20,6) NOT NULL,
  "target_quantity" DECIMAL(20,6) NOT NULL,
  "suggested_quantity" DECIMAL(20,6) NOT NULL,
  "last_evaluated_at" TIMESTAMPTZ(3) NOT NULL,
  "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "low_stock_alerts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "low_stock_alerts_quantities_check" CHECK ("on_hand_quantity" >= 0 AND "reserved_quantity" >= 0 AND "reserved_quantity" <= "on_hand_quantity" AND "available_quantity" = "on_hand_quantity" - "reserved_quantity" AND "minimum_quantity" >= 0 AND "target_quantity" > "minimum_quantity" AND "suggested_quantity" = GREATEST("target_quantity" - "available_quantity", 0)),
  CONSTRAINT "low_stock_alerts_state_check" CHECK (("status" = 'OPEN' AND "resolved_at" IS NULL AND "resolution_reason" IS NULL) OR ("status" = 'RESOLVED' AND "resolved_at" IS NOT NULL AND "resolution_reason" IS NOT NULL)),
  CONSTRAINT "low_stock_alerts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "low_stock_alerts_organization_id_reorder_rule_id_fkey" FOREIGN KEY ("organization_id", "reorder_rule_id") REFERENCES "reorder_rules"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "low_stock_alerts_organization_id_id_key" ON "low_stock_alerts"("organization_id", "id");
CREATE UNIQUE INDEX "low_stock_alerts_organization_id_reorder_rule_id_key" ON "low_stock_alerts"("organization_id", "reorder_rule_id");
CREATE INDEX "low_stock_alerts_organization_id_status_last_evaluated_at_idx" ON "low_stock_alerts"("organization_id", "status", "last_evaluated_at");

CREATE TABLE "low_stock_alert_history" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "reorder_rule_id" UUID NOT NULL,
  "alert_id" UUID NOT NULL,
  "event_type" "LowStockAlertEventType" NOT NULL,
  "reason" VARCHAR(48),
  "on_hand_quantity" DECIMAL(20,6) NOT NULL,
  "reserved_quantity" DECIMAL(20,6) NOT NULL,
  "available_quantity" DECIMAL(20,6) NOT NULL,
  "minimum_quantity" DECIMAL(20,6) NOT NULL,
  "target_quantity" DECIMAL(20,6) NOT NULL,
  "suggested_quantity" DECIMAL(20,6) NOT NULL,
  "actor_user_id" UUID,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "low_stock_alert_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "low_stock_alert_history_quantities_check" CHECK ("on_hand_quantity" >= 0 AND "reserved_quantity" >= 0 AND "reserved_quantity" <= "on_hand_quantity" AND "available_quantity" = "on_hand_quantity" - "reserved_quantity" AND "minimum_quantity" >= 0 AND "target_quantity" > "minimum_quantity" AND "suggested_quantity" = GREATEST("target_quantity" - "available_quantity", 0)),
  CONSTRAINT "low_stock_alert_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "low_stock_alert_history_organization_id_reorder_rule_id_fkey" FOREIGN KEY ("organization_id", "reorder_rule_id") REFERENCES "reorder_rules"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "low_stock_alert_history_organization_id_alert_id_fkey" FOREIGN KEY ("organization_id", "alert_id") REFERENCES "low_stock_alerts"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "low_stock_alert_history_organization_id_actor_user_id_fkey" FOREIGN KEY ("organization_id", "actor_user_id") REFERENCES "memberships"("organization_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "low_stock_alert_history_organization_id_id_key" ON "low_stock_alert_history"("organization_id", "id");
CREATE INDEX "low_stock_alert_history_organization_id_alert_id_occurred_at_idx" ON "low_stock_alert_history"("organization_id", "alert_id", "occurred_at");
CREATE INDEX "low_stock_alert_history_organization_id_reorder_rule_id_occurred_at_idx" ON "low_stock_alert_history"("organization_id", "reorder_rule_id", "occurred_at");
