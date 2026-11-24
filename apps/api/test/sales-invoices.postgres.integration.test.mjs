import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import test from "node:test";
import "dotenv/config";
import { PrismaService } from "../dist/database/prisma.service.js";
import { CatalogService } from "../dist/catalog/catalog.service.js";
import { LocationsService } from "../dist/locations/locations.service.js";
import { InventoryPostingService } from "../dist/inventory/inventory-posting.service.js";
import { CustomersService } from "../dist/sales/customers.service.js";
import { SalesOrdersService } from "../dist/sales/sales-orders.service.js";
import { InvoicesService } from "../dist/sales/invoices.service.js";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";

test(
  "isolated PostgreSQL invoice issuance, payments, reversals, tenant and warehouse scope",
  {
    skip:
      !enabled && "Set RUN_POSTGRES_INTEGRATION=1 to use isolated PostgreSQL",
  },
  async (t) => {
    assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
    const schema = `invoice_it_${randomUUID().replaceAll("-", "")}`;
    const admin = new Client({ connectionString: process.env.DATABASE_URL });
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const testUrl = new URL(process.env.DATABASE_URL);
    testUrl.searchParams.set("schema", schema);
    testUrl.searchParams.set("options", `-c search_path=${schema}`);
    const originalUrl = process.env.DATABASE_URL;
    const originalSchema = process.env.DATABASE_SCHEMA;
    let prisma;
    try {
      execFileSync(
        "node_modules/.bin/prisma",
        ["migrate", "deploy", "--config", "prisma.config.ts"],
        {
          cwd: process.cwd(),
          env: { ...process.env, DATABASE_URL: testUrl.toString() },
          stdio: "pipe",
        },
      );
      process.env.DATABASE_URL = testUrl.toString();
      process.env.DATABASE_SCHEMA = schema;
      prisma = new PrismaService();
      await prisma.onModuleInit();
      const owner = await seedOwner(prisma, "invoice-owner");
      const foreign = await seedOwner(prisma, "invoice-foreign");
      const locations = new LocationsService(prisma);
      const catalog = new CatalogService(prisma);
      const posting = new InventoryPostingService(prisma);
      const customers = new CustomersService(prisma);
      const salesOrders = new SalesOrdersService(prisma, posting);
      const invoices = new InvoicesService(prisma);
      const branch = await locations.createBranch(owner.context, owner.userId, {
        name: "Invoice branch",
      });
      const warehouse = await locations.createWarehouse(
        owner.context,
        owner.userId,
        { branchId: branch.id, name: "Invoice warehouse", code: "INV" },
      );
      const unit = await catalog.createUnit(owner.context, owner.userId, {
        code: "EA",
        name: "Each",
        precision: 0,
      });
      const product = await catalog.createProduct(owner.context, owner.userId, {
        name: "Invoice item",
        sku: `INV-${randomUUID()}`,
        baseUnitId: unit.id,
      });
      await posting.postWarehouseMovement(
        owner.context,
        owner.userId,
        `invoice-opening-${randomUUID()}`,
        {
          warehouseId: warehouse.id,
          productId: product.id,
          documentType: "OPENING_BALANCE",
          documentId: randomUUID(),
          movementType: "OPENING_BALANCE",
          quantityDelta: "50",
          costPerBaseUnit: "1.0000",
          costCurrency: "NGN",
        },
      );
      const customer = await customers.create(owner.context, owner.userId, {
        name: "Invoice customer",
      });
      const order = await salesOrders.create(
        owner.context,
        owner.userId,
        {
          customerId: customer.id,
          warehouseId: warehouse.id,
          currency: "NGN",
          lines: [{ productId: product.id, quantity: "10", unitPrice: "5000" }],
        },
        `invoice-order-${randomUUID()}`,
      );
      await salesOrders.confirm(
        owner.context,
        owner.userId,
        order.id,
        `invoice-confirm-${randomUUID()}`,
      );
      const tax = await invoices.createTaxRate(owner.context, owner.userId, {
        name: "Fixture tax",
        code: `T-${randomUUID().slice(0, 8)}`,
        rate: "5",
      });
      const orderLineId = order.lines[0].id;
      const createInput = {
        salesOrderId: order.id,
        lines: [
          {
            salesOrderLineId: orderLineId,
            discountAmount: "5000",
            taxRateId: tax.id,
          },
        ],
      };
      const createKey = `invoice-create-${randomUUID()}`;
      const draft = await invoices.create(
        owner.context,
        owner.userId,
        createInput,
        createKey,
      );
      assert.equal(draft.totalAmount.toString(), "47250");
      assert.equal(
        (
          await invoices.create(
            owner.context,
            owner.userId,
            createInput,
            createKey,
          )
        ).id,
        draft.id,
      );
      const issueKey = `invoice-issue-${randomUUID()}`;
      const issued = await invoices.issue(
        owner.context,
        owner.userId,
        draft.id,
        issueKey,
      );
      assert.equal(issued.invoiceNumber, "INV-000001");
      assert.equal(
        (await invoices.issue(owner.context, owner.userId, draft.id, issueKey))
          .invoiceNumber,
        issued.invoiceNumber,
      );

      const movementsBeforeFinancialActions = await prisma.stockMovement.count({
        where: { organizationId: owner.context.organizationId },
      });
      async function pay(amount, key) {
        return invoices.recordPayment(
          owner.context,
          owner.userId,
          {
            invoiceId: draft.id,
            amount,
            method: "BANK_TRANSFER",
            paymentDate: "2026-11-24",
          },
          key,
        );
      }
      const firstKey = `invoice-pay-${randomUUID()}`;
      const first = await pay("30000", firstKey);
      assert.equal((await pay("30000", firstKey)).id, first.id);
      await pay("10000", `invoice-pay-${randomUUID()}`);
      await pay("7250", `invoice-pay-${randomUUID()}`);
      assert.equal(
        (await invoices.get(owner.context, draft.id)).paymentStatus,
        "PAID",
      );
      await invoices.reversePayment(
        owner.context,
        owner.userId,
        first.id,
        "Bank entry was recorded in error",
        `invoice-reverse-${randomUUID()}`,
      );
      const afterReversal = await invoices.get(owner.context, draft.id);
      assert.equal(afterReversal.amountPaid.toString(), "17250");
      assert.equal(afterReversal.outstandingAmount.toString(), "30000");

      const raced = await Promise.allSettled([
        pay("20000", `invoice-race-${randomUUID()}`),
        pay("20000", `invoice-race-${randomUUID()}`),
      ]);
      assert.equal(
        raced.filter((result) => result.status === "fulfilled").length,
        1,
      );
      assert.equal(
        (await invoices.get(owner.context, draft.id)).amountPaid.toString(),
        "37250",
      );
      await assert.rejects(
        pay("20000", `invoice-overpay-${randomUUID()}`),
        (error) => error.getStatus() === 409,
      );

      const financeEmail = `finance-${randomUUID()}@example.test`;
      const financeUser = await prisma.user.create({
        data: {
          email: financeEmail,
          emailNormalized: financeEmail,
          passwordHash: "integration-only",
          status: "ACTIVE",
          emailVerifiedAt: new Date(),
        },
      });
      const financeMembership = await prisma.membership.create({
        data: {
          organizationId: owner.context.organizationId,
          userId: financeUser.id,
          role: "FINANCE",
        },
      });
      const financeContext = {
        organizationId: owner.context.organizationId,
        membershipId: financeMembership.id,
        userId: financeUser.id,
        role: "FINANCE",
      };
      await assert.rejects(
        invoices.recordPayment(
          financeContext,
          financeUser.id,
          {
            invoiceId: draft.id,
            amount: "30000",
            method: "BANK_TRANSFER",
            paymentDate: "2026-11-24",
          },
          firstKey,
        ),
        (error) => error.getStatus() === 404,
      );
      await assert.rejects(
        invoices.get(foreign.context, draft.id),
        (error) => error.getStatus() === 404,
      );
      assert.equal(
        await prisma.stockMovement.count({
          where: { organizationId: owner.context.organizationId },
        }),
        movementsBeforeFinancialActions,
      );
      assert.equal(
        (await invoices.customerSummary(owner.context, customer.id))[0]
          .outstanding,
        "10000.0000",
      );
      await t.test(
        "invoice changes and payment correction are audited",
        async () => {
          const events = await invoices.invoiceAudit(owner.context, draft.id);
          assert.ok(events.some((event) => event.action === "ISSUED"));
          assert.ok(
            events.some((event) => event.action === "PAYMENT_REVERSED"),
          );
        },
      );
    } finally {
      if (prisma) await prisma.$disconnect();
      process.env.DATABASE_URL = originalUrl;
      process.env.DATABASE_SCHEMA = originalSchema;
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  },
);

async function seedOwner(prisma, label) {
  const id = randomUUID();
  const email = `${label}-${id}@example.test`;
  const user = await prisma.user.create({
    data: {
      email,
      emailNormalized: email,
      passwordHash: "integration-only",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  const organization = await prisma.organization.create({
    data: {
      name: `Integration ${label}`,
      slug: `${label}-${id.replaceAll("-", "")}`,
    },
  });
  const membership = await prisma.membership.create({
    data: { organizationId: organization.id, userId: user.id, role: "OWNER" },
  });
  return {
    userId: user.id,
    context: {
      organizationId: organization.id,
      membershipId: membership.id,
      userId: user.id,
      role: "OWNER",
    },
  };
}
