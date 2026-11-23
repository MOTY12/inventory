CREATE TYPE "ReportExportStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'EXPIRED'
);

CREATE TYPE "ReportExportType" AS ENUM (
  'INVENTORY_SUMMARY',
  'MOVEMENTS',
  'VALUATION',
  'LOW_STOCK'
);

CREATE TABLE "report_exports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "requested_by_user_id" UUID NOT NULL,
  "report_type" "ReportExportType" NOT NULL,
  "idempotency_key" VARCHAR(160) NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "status" "ReportExportStatus" NOT NULL DEFAULT 'PENDING',
  "filters" JSONB NOT NULL,
  "warehouse_scope" JSONB NOT NULL,
  "snapshot_at" TIMESTAMPTZ(3) NOT NULL,
  "retry_sequence" INTEGER NOT NULL DEFAULT 0,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "row_count" INTEGER,
  "file_size_bytes" BIGINT,
  "object_key" VARCHAR(512),
  "last_error" VARCHAR(1000),
  "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "expires_at" TIMESTAMPTZ(3),

  CONSTRAINT "report_exports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "report_exports_object_key_key" UNIQUE ("object_key"),
  CONSTRAINT "report_exports_organization_id_idempotency_key_key"
    UNIQUE ("organization_id", "idempotency_key"),
  CONSTRAINT "report_exports_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "report_exports_requester_membership_fkey"
    FOREIGN KEY ("organization_id", "requested_by_user_id")
    REFERENCES "memberships"("organization_id", "user_id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "report_exports_organization_id_requested_at_id_idx"
  ON "report_exports"("organization_id", "requested_at", "id");
CREATE INDEX "report_exports_organization_id_requested_by_user_id_requested_at_id_idx"
  ON "report_exports"("organization_id", "requested_by_user_id", "requested_at", "id");
CREATE INDEX "report_exports_status_requested_at_idx"
  ON "report_exports"("status", "requested_at");
CREATE INDEX "report_exports_status_expires_at_idx"
  ON "report_exports"("status", "expires_at");
