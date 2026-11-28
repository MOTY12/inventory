-- SALES-004 additive schema. Existing inventory and sales rows are untouched.
CREATE TYPE "InvoiceDocumentStatus" AS ENUM ('DRAFT', 'ISSUED', 'VOID');
CREATE TYPE "CustomerPaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'POS', 'CARD', 'CHEQUE', 'OTHER');

CREATE TABLE "invoice_sequences" (
  "organization_id" UUID NOT NULL,
  "next_number" BIGINT NOT NULL DEFAULT 1,
  CONSTRAINT "invoice_sequences_pkey" PRIMARY KEY ("organization_id"),
  CONSTRAINT "invoice_sequences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "invoice_sequences_next_number_check" CHECK ("next_number" > 0)
);

CREATE TABLE "tax_rates" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "code" VARCHAR(40) NOT NULL,
  "rate" DECIMAL(9,6) NOT NULL,
  "description" VARCHAR(300),
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tax_rates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tax_rates_rate_check" CHECK ("rate" >= 0 AND "rate" <= 100)
);
CREATE UNIQUE INDEX "tax_rates_organization_id_id_key" ON "tax_rates"("organization_id", "id");
CREATE UNIQUE INDEX "tax_rates_organization_id_code_key" ON "tax_rates"("organization_id", "code");
CREATE INDEX "tax_rates_organization_id_is_active_name_idx" ON "tax_rates"("organization_id", "is_active", "name");

CREATE TABLE "invoices" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "sales_order_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "invoice_number" VARCHAR(40),
  "status" "InvoiceDocumentStatus" NOT NULL DEFAULT 'DRAFT',
  "currency" CHAR(3) NOT NULL,
  "subtotal" DECIMAL(20,4) NOT NULL DEFAULT 0,
  "discount_amount" DECIMAL(20,4) NOT NULL DEFAULT 0,
  "tax_amount" DECIMAL(20,4) NOT NULL DEFAULT 0,
  "total_amount" DECIMAL(20,4) NOT NULL DEFAULT 0,
  "issue_date" DATE,
  "due_date" DATE,
  "customer_snapshot" JSONB,
  "business_snapshot" JSONB,
  "notes" VARCHAR(1000),
  "created_by_user_id" UUID NOT NULL,
  "issued_by_user_id" UUID,
  "voided_by_user_id" UUID,
  "void_reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "issued_at" TIMESTAMPTZ(3),
  "voided_at" TIMESTAMPTZ(3),
  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoices_amounts_check" CHECK ("subtotal" >= 0 AND "discount_amount" >= 0 AND "tax_amount" >= 0 AND "total_amount" >= 0 AND "discount_amount" <= "subtotal" AND "total_amount" = "subtotal" - "discount_amount" + "tax_amount"),
  CONSTRAINT "invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invoices_organization_id_sales_order_id_fkey" FOREIGN KEY ("organization_id", "sales_order_id") REFERENCES "sales_orders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invoices_organization_id_customer_id_fkey" FOREIGN KEY ("organization_id", "customer_id") REFERENCES "customers"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invoices_organization_id_created_by_user_id_fkey" FOREIGN KEY ("organization_id", "created_by_user_id") REFERENCES "memberships"("organization_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invoices_organization_id_issued_by_user_id_fkey" FOREIGN KEY ("organization_id", "issued_by_user_id") REFERENCES "memberships"("organization_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invoices_organization_id_voided_by_user_id_fkey" FOREIGN KEY ("organization_id", "voided_by_user_id") REFERENCES "memberships"("organization_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "invoices_organization_id_id_key" ON "invoices"("organization_id", "id");
CREATE UNIQUE INDEX "invoices_organization_id_invoice_number_key" ON "invoices"("organization_id", "invoice_number");
CREATE UNIQUE INDEX "invoices_one_active_per_sales_order_key" ON "invoices"("organization_id", "sales_order_id") WHERE "status" <> 'VOID';
CREATE INDEX "invoices_organization_id_status_issue_date_id_idx" ON "invoices"("organization_id", "status", "issue_date", "id");
CREATE INDEX "invoices_organization_id_customer_id_issue_date_idx" ON "invoices"("organization_id", "customer_id", "issue_date");
CREATE INDEX "invoices_organization_id_due_date_status_idx" ON "invoices"("organization_id", "due_date", "status");

CREATE TABLE "invoice_lines" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "sales_order_line_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "tax_rate_id" UUID,
  "product_name_snapshot" VARCHAR(180) NOT NULL,
  "sku_snapshot" VARCHAR(80) NOT NULL,
  "unit_snapshot" VARCHAR(40) NOT NULL,
  "quantity" DECIMAL(20,6) NOT NULL,
  "unit_price" DECIMAL(20,4) NOT NULL,
  "discount_amount" DECIMAL(20,4) NOT NULL DEFAULT 0,
  "tax_rate_snapshot" DECIMAL(9,6) NOT NULL DEFAULT 0,
  "line_subtotal" DECIMAL(20,4) NOT NULL,
  "tax_amount" DECIMAL(20,4) NOT NULL DEFAULT 0,
  "line_total" DECIMAL(20,4) NOT NULL,
  CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoice_lines_values_check" CHECK ("quantity" > 0 AND "unit_price" >= 0 AND "discount_amount" >= 0 AND "line_subtotal" >= 0 AND "discount_amount" <= "quantity" * "unit_price" AND "tax_rate_snapshot" >= 0 AND "tax_rate_snapshot" <= 100 AND "tax_amount" >= 0 AND "line_total" = "line_subtotal" + "tax_amount"),
  CONSTRAINT "invoice_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invoice_lines_organization_id_invoice_id_fkey" FOREIGN KEY ("organization_id", "invoice_id") REFERENCES "invoices"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "invoice_lines_organization_id_sales_order_line_id_fkey" FOREIGN KEY ("organization_id", "sales_order_line_id") REFERENCES "sales_order_lines"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invoice_lines_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invoice_lines_organization_id_tax_rate_id_fkey" FOREIGN KEY ("organization_id", "tax_rate_id") REFERENCES "tax_rates"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "invoice_lines_organization_id_id_key" ON "invoice_lines"("organization_id", "id");
CREATE UNIQUE INDEX "invoice_lines_organization_id_invoice_id_sales_order_line_id_key" ON "invoice_lines"("organization_id", "invoice_id", "sales_order_line_id");
CREATE INDEX "invoice_lines_organization_id_invoice_id_idx" ON "invoice_lines"("organization_id", "invoice_id");

CREATE TABLE "customer_payments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "payment_reference" VARCHAR(100),
  "payment_method" "CustomerPaymentMethod" NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "amount" DECIMAL(20,4) NOT NULL,
  "payment_date" DATE NOT NULL,
  "notes" VARCHAR(1000),
  "recorded_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_payments_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "customer_payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_payments_organization_id_customer_id_fkey" FOREIGN KEY ("organization_id", "customer_id") REFERENCES "customers"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_payments_organization_id_recorded_by_user_id_fkey" FOREIGN KEY ("organization_id", "recorded_by_user_id") REFERENCES "memberships"("organization_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "customer_payments_organization_id_id_key" ON "customer_payments"("organization_id", "id");
CREATE INDEX "customer_payments_organization_id_customer_id_payment_date_id_idx" ON "customer_payments"("organization_id", "customer_id", "payment_date", "id");
CREATE INDEX "customer_payments_organization_id_payment_reference_idx" ON "customer_payments"("organization_id", "payment_reference");

CREATE TABLE "payment_allocations" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "amount" DECIMAL(20,4) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_allocations_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "payment_allocations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_allocations_organization_id_payment_id_fkey" FOREIGN KEY ("organization_id", "payment_id") REFERENCES "customer_payments"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_allocations_organization_id_invoice_id_fkey" FOREIGN KEY ("organization_id", "invoice_id") REFERENCES "invoices"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payment_allocations_organization_id_id_key" ON "payment_allocations"("organization_id", "id");
CREATE UNIQUE INDEX "payment_allocations_organization_id_payment_id_key" ON "payment_allocations"("organization_id", "payment_id");
CREATE INDEX "payment_allocations_organization_id_invoice_id_created_at_idx" ON "payment_allocations"("organization_id", "invoice_id", "created_at");

CREATE TABLE "payment_reversals" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "amount" DECIMAL(20,4) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "reversed_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_reversals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_reversals_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "payment_reversals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_reversals_organization_id_payment_id_fkey" FOREIGN KEY ("organization_id", "payment_id") REFERENCES "customer_payments"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_reversals_organization_id_reversed_by_user_id_fkey" FOREIGN KEY ("organization_id", "reversed_by_user_id") REFERENCES "memberships"("organization_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payment_reversals_organization_id_id_key" ON "payment_reversals"("organization_id", "id");
CREATE UNIQUE INDEX "payment_reversals_organization_id_payment_id_key" ON "payment_reversals"("organization_id", "payment_id");

-- Issued documents and posted payment evidence are append-only financial records.
CREATE FUNCTION protect_invoice_document() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' THEN RAISE EXCEPTION 'Issued invoices cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" = 'VOID' THEN RAISE EXCEPTION 'Voided invoices are immutable'; END IF;
  IF OLD."status" = 'ISSUED' AND (
    NEW."organization_id" IS DISTINCT FROM OLD."organization_id" OR
    NEW."sales_order_id" IS DISTINCT FROM OLD."sales_order_id" OR
    NEW."customer_id" IS DISTINCT FROM OLD."customer_id" OR
    NEW."invoice_number" IS DISTINCT FROM OLD."invoice_number" OR
    NEW."currency" IS DISTINCT FROM OLD."currency" OR
    NEW."subtotal" IS DISTINCT FROM OLD."subtotal" OR
    NEW."discount_amount" IS DISTINCT FROM OLD."discount_amount" OR
    NEW."tax_amount" IS DISTINCT FROM OLD."tax_amount" OR
    NEW."total_amount" IS DISTINCT FROM OLD."total_amount" OR
    NEW."issue_date" IS DISTINCT FROM OLD."issue_date" OR
    NEW."due_date" IS DISTINCT FROM OLD."due_date" OR
    NEW."customer_snapshot" IS DISTINCT FROM OLD."customer_snapshot" OR
    NEW."business_snapshot" IS DISTINCT FROM OLD."business_snapshot" OR
    NEW."notes" IS DISTINCT FROM OLD."notes" OR
    NEW."created_by_user_id" IS DISTINCT FROM OLD."created_by_user_id" OR
    NEW."issued_by_user_id" IS DISTINCT FROM OLD."issued_by_user_id" OR
    NEW."issued_at" IS DISTINCT FROM OLD."issued_at" OR
    NEW."created_at" IS DISTINCT FROM OLD."created_at" OR
    NEW."status" NOT IN ('ISSUED', 'VOID')
  ) THEN RAISE EXCEPTION 'Issued invoice financial details are immutable'; END IF;
  IF OLD."status" = 'ISSUED' AND NEW."status" = 'ISSUED' AND (
    NEW."voided_at" IS DISTINCT FROM OLD."voided_at" OR
    NEW."voided_by_user_id" IS DISTINCT FROM OLD."voided_by_user_id" OR
    NEW."void_reason" IS DISTINCT FROM OLD."void_reason"
  ) THEN RAISE EXCEPTION 'Void metadata is only set when voiding an invoice'; END IF;
  IF OLD."status" = 'DRAFT' AND NEW."status" NOT IN ('DRAFT', 'ISSUED') THEN
    RAISE EXCEPTION 'Draft invoices may only remain drafts or be issued';
  END IF;
  IF OLD."status" = 'DRAFT' AND NEW."status" = 'ISSUED' AND (
    NEW."invoice_number" IS NULL OR NEW."issue_date" IS NULL OR NEW."issued_at" IS NULL OR
    NEW."issued_by_user_id" IS NULL OR NEW."customer_snapshot" IS NULL OR NEW."business_snapshot" IS NULL
  ) THEN RAISE EXCEPTION 'Issuing an invoice requires its number, dates, actor, and snapshots'; END IF;
  IF OLD."status" = 'ISSUED' AND NEW."status" = 'VOID' THEN
    IF NEW."voided_at" IS NULL OR NEW."voided_by_user_id" IS NULL OR NEW."void_reason" IS NULL OR length(btrim(NEW."void_reason")) = 0 THEN
      RAISE EXCEPTION 'Voiding an invoice requires actor, timestamp, and reason';
    END IF;
    IF EXISTS (
      SELECT 1 FROM "payment_allocations" a
      JOIN "customer_payments" p ON p."organization_id" = a."organization_id" AND p."id" = a."payment_id"
      LEFT JOIN "payment_reversals" r ON r."organization_id" = p."organization_id" AND r."payment_id" = p."id"
      WHERE a."organization_id" = OLD."organization_id" AND a."invoice_id" = OLD."id" AND r."id" IS NULL
    ) THEN RAISE EXCEPTION 'Invoices with effective payments cannot be voided'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "invoices_financial_immutability" BEFORE UPDATE OR DELETE ON "invoices" FOR EACH ROW EXECUTE FUNCTION protect_invoice_document();

CREATE FUNCTION protect_invoice_line() RETURNS trigger AS $$
DECLARE invoice_status "InvoiceDocumentStatus"; target_organization UUID; target_invoice UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN target_organization := OLD."organization_id"; target_invoice := OLD."invoice_id";
  ELSE target_organization := NEW."organization_id"; target_invoice := NEW."invoice_id"; END IF;
  SELECT "status" INTO invoice_status FROM "invoices"
    WHERE "organization_id" = target_organization AND "id" = target_invoice;
  IF invoice_status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Issued invoice lines are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "invoice_lines_financial_immutability" BEFORE INSERT OR UPDATE OR DELETE ON "invoice_lines" FOR EACH ROW EXECUTE FUNCTION protect_invoice_line();

CREATE FUNCTION protect_posted_payment() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Posted customer payments are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "customer_payments_immutable" BEFORE UPDATE OR DELETE ON "customer_payments" FOR EACH ROW EXECUTE FUNCTION protect_posted_payment();
CREATE TRIGGER "payment_allocations_immutable" BEFORE UPDATE OR DELETE ON "payment_allocations" FOR EACH ROW EXECUTE FUNCTION protect_posted_payment();
CREATE TRIGGER "payment_reversals_immutable" BEFORE UPDATE OR DELETE ON "payment_reversals" FOR EACH ROW EXECUTE FUNCTION protect_posted_payment();

CREATE FUNCTION validate_payment_allocation() RETURNS trigger AS $$
DECLARE payment_row "customer_payments"%ROWTYPE; invoice_row "invoices"%ROWTYPE;
BEGIN
  SELECT * INTO payment_row FROM "customer_payments" WHERE "organization_id" = NEW."organization_id" AND "id" = NEW."payment_id";
  SELECT * INTO invoice_row FROM "invoices" WHERE "organization_id" = NEW."organization_id" AND "id" = NEW."invoice_id" FOR UPDATE;
  IF payment_row."id" IS NULL OR invoice_row."id" IS NULL OR invoice_row."status" <> 'ISSUED' THEN
    RAISE EXCEPTION 'Payment allocation requires an issued invoice and existing payment';
  END IF;
  IF payment_row."customer_id" <> invoice_row."customer_id" OR payment_row."currency" <> invoice_row."currency" OR payment_row."amount" <> NEW."amount" THEN
    RAISE EXCEPTION 'Payment allocation customer, currency, or amount does not match';
  END IF;
  IF NEW."amount" + COALESCE((
    SELECT SUM(a."amount") FROM "payment_allocations" a
    LEFT JOIN "payment_reversals" r ON r."organization_id" = a."organization_id" AND r."payment_id" = a."payment_id"
    WHERE a."organization_id" = NEW."organization_id" AND a."invoice_id" = NEW."invoice_id" AND r."id" IS NULL
  ), 0) > invoice_row."total_amount" THEN
    RAISE EXCEPTION 'Payment allocation exceeds invoice outstanding amount';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "payment_allocation_integrity" BEFORE INSERT ON "payment_allocations" FOR EACH ROW EXECUTE FUNCTION validate_payment_allocation();

CREATE FUNCTION validate_payment_reversal() RETURNS trigger AS $$
DECLARE original_amount DECIMAL(20,4); allocated_amount DECIMAL(20,4);
BEGIN
  SELECT "amount" INTO original_amount FROM "customer_payments" WHERE "organization_id" = NEW."organization_id" AND "id" = NEW."payment_id";
  SELECT COALESCE(SUM("amount"), 0) INTO allocated_amount FROM "payment_allocations" WHERE "organization_id" = NEW."organization_id" AND "payment_id" = NEW."payment_id";
  IF original_amount IS NULL OR NEW."amount" <> original_amount OR allocated_amount <> original_amount THEN
    RAISE EXCEPTION 'Initial payment reversal must reverse the full original amount';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "payment_reversal_integrity" BEFORE INSERT ON "payment_reversals" FOR EACH ROW EXECUTE FUNCTION validate_payment_reversal();
