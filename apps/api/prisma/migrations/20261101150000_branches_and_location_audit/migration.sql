CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TABLE "branches" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "address" VARCHAR(500),
  "status" "BranchStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "branches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "branches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "branches_organization_id_id_key" UNIQUE ("organization_id", "id"),
  CONSTRAINT "branches_organization_id_name_key" UNIQUE ("organization_id", "name")
);
CREATE INDEX "branches_organization_id_status_name_idx" ON "branches"("organization_id", "status", "name");

ALTER TABLE "warehouses" ADD COLUMN "branch_id" UUID;
CREATE INDEX "warehouses_organization_id_branch_id_status_idx" ON "warehouses"("organization_id", "branch_id", "status");
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_organization_id_branch_id_fkey"
  FOREIGN KEY ("organization_id", "branch_id") REFERENCES "branches"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "audit_events" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "entity_type" VARCHAR(80) NOT NULL,
  "entity_id" UUID NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "audit_events_organization_id_occurred_at_idx" ON "audit_events"("organization_id", "occurred_at");
CREATE INDEX "audit_events_organization_id_entity_type_entity_id_occurred_at_idx" ON "audit_events"("organization_id", "entity_type", "entity_id", "occurred_at");
