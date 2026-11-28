CREATE TYPE "ImportBatchKind" AS ENUM ('PRODUCTS', 'OPENING_BALANCES');
CREATE TYPE "ImportBatchStatus" AS ENUM ('PREVIEWED', 'COMMITTED');

CREATE TABLE "import_batches" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "kind" "ImportBatchKind" NOT NULL,
  "status" "ImportBatchStatus" NOT NULL DEFAULT 'PREVIEWED',
  "file_name" VARCHAR(255) NOT NULL,
  "source_hash" CHAR(64) NOT NULL,
  "mapping" JSONB NOT NULL,
  "preview_rows" JSONB NOT NULL,
  "summary" JSONB NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "committed_at" TIMESTAMPTZ(3),
  CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "import_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "import_batches_organization_id_created_by_user_id_fkey" FOREIGN KEY ("organization_id", "created_by_user_id") REFERENCES "memberships"("organization_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "import_batches_organization_id_id_key" ON "import_batches"("organization_id", "id");
CREATE INDEX "import_batches_organization_id_kind_created_at_idx" ON "import_batches"("organization_id", "kind", "created_at");
CREATE INDEX "import_batches_organization_id_status_expires_at_idx" ON "import_batches"("organization_id", "status", "expires_at");
