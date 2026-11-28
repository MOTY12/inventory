import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { Client } from "pg";
import test from "node:test";
import { JwtService } from "@nestjs/jwt";
import "dotenv/config";
import { PrismaService } from "../dist/database/prisma.service.js";
import { CatalogService } from "../dist/catalog/catalog.service.js";
import { LocationsService } from "../dist/locations/locations.service.js";
import { InventoryPostingService } from "../dist/inventory/inventory-posting.service.js";
import { CustomersService } from "../dist/sales/customers.service.js";
import { SalesOrdersService } from "../dist/sales/sales-orders.service.js";
import { InvoicesService } from "../dist/sales/invoices.service.js";
import { AccessTokenService } from "../dist/identity/access-token.service.js";
import { ReportingService } from "../dist/reporting/reporting.service.js";
import { ReorderingService } from "../dist/inventory/reordering/reordering.service.js";
import { ReportFilterDto } from "../dist/reporting/reporting.dto.js";

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
      const reportQueries = new ReportingService(
        prisma,
        new ReorderingService(prisma),
      );
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
      await reportQueries.salesProductPerformance(
        owner.context,
        Object.assign(new ReportFilterDto(), {
          currency: "NGN",
          product_id: product.id,
          page: 1,
          page_size: 25,
        }),
      );

      async function makeDraft(context, actor, customerName, options = {}) {
        const nextCustomer =
          options.customer ??
          (await customers.create(context, actor, { name: customerName }));
        const nextOrder = await salesOrders.create(
          context,
          actor,
          {
            customerId: nextCustomer.id,
            warehouseId: warehouse.id,
            currency: "NGN",
            lines: [
              {
                productId: options.productId ?? product.id,
                quantity: "1",
                unitPrice: "100",
              },
            ],
          },
          `invoice-order-${randomUUID()}`,
        );
        await salesOrders.confirm(
          context,
          actor,
          nextOrder.id,
          `invoice-confirm-${randomUUID()}`,
        );
        return invoices.create(
          context,
          actor,
          {
            salesOrderId: nextOrder.id,
            ...(options.dueDate ? { dueDate: options.dueDate } : {}),
            lines: [{ salesOrderLineId: nextOrder.lines[0].id }],
          },
          `invoice-create-${randomUUID()}`,
        );
      }
      const secondDraft = await makeDraft(
        owner.context,
        owner.userId,
        "Second billing customer",
      );
      const thirdDraft = await makeDraft(
        owner.context,
        owner.userId,
        "Third billing customer",
      );
      const [secondIssued, thirdIssued] = await Promise.all([
        invoices.issue(
          owner.context,
          owner.userId,
          secondDraft.id,
          `invoice-issue-${randomUUID()}`,
        ),
        invoices.issue(
          owner.context,
          owner.userId,
          thirdDraft.id,
          `invoice-issue-${randomUUID()}`,
        ),
      ]);
      assert.deepEqual(
        [secondIssued.invoiceNumber, thirdIssued.invoiceNumber].sort(),
        ["INV-000002", "INV-000003"],
      );
      const voidKey = `invoice-void-${randomUUID()}`;
      const voided = await invoices.void(
        owner.context,
        owner.userId,
        secondDraft.id,
        "Duplicate billing record",
        voidKey,
      );
      assert.equal(voided.status, "VOID");
      assert.equal(
        (
          await invoices.void(
            owner.context,
            owner.userId,
            secondDraft.id,
            "Duplicate billing record",
            voidKey,
          )
        ).status,
        "VOID",
      );
      await assert.rejects(
        invoices.void(
          owner.context,
          owner.userId,
          secondDraft.id,
          " ",
          `invoice-void-${randomUUID()}`,
        ),
        (error) => error.getStatus() === 400,
      );
      const fourthDraft = await makeDraft(
        owner.context,
        owner.userId,
        "Fourth billing customer",
      );
      const fourthIssued = await invoices.issue(
        owner.context,
        owner.userId,
        fourthDraft.id,
        `invoice-issue-${randomUUID()}`,
      );
      assert.equal(fourthIssued.invoiceNumber, "INV-000004");
      const thirdPayment = await invoices.recordPayment(
        owner.context,
        owner.userId,
        {
          invoiceId: thirdDraft.id,
          amount: "0.50",
          method: "CASH",
          paymentDate: "2026-11-24",
        },
        `invoice-pay-${randomUUID()}`,
      );
      assert.ok(thirdPayment);
      await assert.rejects(
        invoices.void(
          owner.context,
          owner.userId,
          thirdDraft.id,
          "Partial invoice",
          `invoice-void-${randomUUID()}`,
        ),
        (error) => error.getStatus() === 409,
      );

      const foreignTax = await invoices.createTaxRate(
        foreign.context,
        foreign.userId,
        {
          name: "Foreign tax",
          code: `FT-${randomUUID().slice(0, 8)}`,
          rate: "7.5",
        },
      );
      const foreignBranch = await locations.createBranch(
        foreign.context,
        foreign.userId,
        { name: "Foreign invoice branch" },
      );
      const foreignWarehouse = await locations.createWarehouse(
        foreign.context,
        foreign.userId,
        {
          branchId: foreignBranch.id,
          name: "Foreign invoice warehouse",
          code: "FINV",
        },
      );
      const foreignUnit = await catalog.createUnit(
        foreign.context,
        foreign.userId,
        { code: "EA", name: "Each", precision: 0 },
      );
      const foreignProduct = await catalog.createProduct(
        foreign.context,
        foreign.userId,
        {
          name: "Foreign invoice item",
          sku: `FINV-${randomUUID()}`,
          baseUnitId: foreignUnit.id,
        },
      );
      await posting.postWarehouseMovement(
        foreign.context,
        foreign.userId,
        `foreign-invoice-opening-${randomUUID()}`,
        {
          warehouseId: foreignWarehouse.id,
          productId: foreignProduct.id,
          documentType: "OPENING_BALANCE",
          documentId: randomUUID(),
          movementType: "OPENING_BALANCE",
          quantityDelta: "10",
          costPerBaseUnit: "1.0000",
          costCurrency: "NGN",
        },
      );
      const foreignCustomer = await customers.create(
        foreign.context,
        foreign.userId,
        { name: "Foreign invoice customer" },
      );
      const foreignOrder = await salesOrders.create(
        foreign.context,
        foreign.userId,
        {
          customerId: foreignCustomer.id,
          warehouseId: foreignWarehouse.id,
          currency: "NGN",
          lines: [
            { productId: foreignProduct.id, quantity: "1", unitPrice: "100" },
          ],
        },
        `foreign-invoice-order-${randomUUID()}`,
      );
      await salesOrders.confirm(
        foreign.context,
        foreign.userId,
        foreignOrder.id,
        `foreign-invoice-confirm-${randomUUID()}`,
      );
      const foreignDraft = await invoices.create(
        foreign.context,
        foreign.userId,
        {
          salesOrderId: foreignOrder.id,
          lines: [
            {
              salesOrderLineId: foreignOrder.lines[0].id,
              taxRateId: foreignTax.id,
            },
          ],
        },
        `foreign-invoice-create-${randomUUID()}`,
      );
      const foreignIssued = await invoices.issue(
        foreign.context,
        foreign.userId,
        foreignDraft.id,
        `foreign-invoice-issue-${randomUUID()}`,
      );
      assert.equal(foreignIssued.invoiceNumber, "INV-000001");
      assert.deepEqual(
        [
          secondIssued.invoiceNumber,
          thirdIssued.invoiceNumber,
          foreignIssued.invoiceNumber,
        ].sort(),
        ["INV-000001", "INV-000002", "INV-000003"],
      );

      const issuedBeforeTaxEdit = await invoices.get(owner.context, draft.id);
      const originalTotal = issuedBeforeTaxEdit.totalAmount.toString();
      assert.equal(
        issuedBeforeTaxEdit.lines[0].taxRateSnapshot.toString(),
        "5",
      );
      await invoices.updateTaxRate(owner.context, owner.userId, tax.id, {
        rate: "10",
      });
      let issuedAfterTaxEdit = await invoices.get(owner.context, draft.id);
      assert.equal(issuedAfterTaxEdit.lines[0].taxRateSnapshot.toString(), "5");
      assert.equal(issuedAfterTaxEdit.totalAmount.toString(), originalTotal);
      await invoices.updateTaxRate(owner.context, owner.userId, tax.id, {
        isActive: false,
      });
      issuedAfterTaxEdit = await invoices.get(owner.context, draft.id);
      assert.equal(issuedAfterTaxEdit.totalAmount.toString(), originalTotal);
      await assert.rejects(
        invoices.create(
          owner.context,
          owner.userId,
          {
            salesOrderId: secondDraft.salesOrderId,
            lines: [
              {
                salesOrderLineId: secondDraft.lines[0].salesOrderLineId,
                taxRateId: tax.id,
              },
            ],
          },
          `inactive-tax-${randomUUID()}`,
        ),
        (error) => error.getStatus() === 404,
      );
      await assert.rejects(
        invoices.create(
          owner.context,
          owner.userId,
          {
            salesOrderId: secondDraft.salesOrderId,
            lines: [
              {
                salesOrderLineId: secondDraft.lines[0].salesOrderLineId,
                taxRateId: foreignTax.id,
              },
            ],
          },
          `foreign-tax-${randomUUID()}`,
        ),
        (error) => error.getStatus() === 404,
      );

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
      await assert.rejects(
        invoices.void(
          owner.context,
          owner.userId,
          draft.id,
          "Paid invoice",
          `invoice-void-${randomUUID()}`,
        ),
        (error) => error.getStatus() === 409,
      );
      const reversalKey = `invoice-reverse-${randomUUID()}`;
      const reversalReason = "Bank entry was recorded in error";
      const reversal = await invoices.reversePayment(
        owner.context,
        owner.userId,
        first.id,
        reversalReason,
        reversalKey,
      );
      assert.equal(
        (
          await invoices.reversePayment(
            owner.context,
            owner.userId,
            first.id,
            reversalReason,
            reversalKey,
          )
        ).reversal.id,
        reversal.reversal.id,
      );
      await assert.rejects(
        invoices.reversePayment(
          owner.context,
          owner.userId,
          first.id,
          "Different reason",
          reversalKey,
        ),
        (error) => error.getStatus() === 409,
      );
      await assert.rejects(
        invoices.reversePayment(
          owner.context,
          owner.userId,
          first.id,
          "Duplicate reversal",
          `invoice-reverse-${randomUUID()}`,
        ),
        (error) => error.getStatus() === 409,
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
      const reconciledCustomer = await reportQueries.customerPerformance(
        owner.context,
        Object.assign(new ReportFilterDto(), {
          customer_id: customer.id,
          currency: "NGN",
          page: 1,
          page_size: 25,
        }),
      );
      assert.equal(reconciledCustomer.data.length, 1);
      assert.equal(String(reconciledCustomer.data[0].invoiced_value), "47250");
      assert.equal(
        String(reconciledCustomer.data[0].effective_payments),
        "37250",
      );
      assert.equal(String(reconciledCustomer.data[0].outstanding), "10000");
      assert.equal(String(reconciledCustomer.data[0].overdue), "0");
      await assert.rejects(
        pay("20000", `invoice-overpay-${randomUUID()}`),
        (error) => error.getStatus() === 409,
      );

      const agingCustomer = await customers.create(
        owner.context,
        owner.userId,
        {
          name: "Aging boundary customer",
        },
      );
      const agingProduct = await catalog.createProduct(
        owner.context,
        owner.userId,
        {
          name: "Aging report item",
          sku: `AGING-${randomUUID()}`,
          baseUnitId: unit.id,
        },
      );
      await posting.postWarehouseMovement(
        owner.context,
        owner.userId,
        `aging-opening-${randomUUID()}`,
        {
          warehouseId: warehouse.id,
          productId: agingProduct.id,
          documentType: "OPENING_BALANCE",
          documentId: randomUUID(),
          movementType: "OPENING_BALANCE",
          quantityDelta: "20",
          costPerBaseUnit: "1.0000",
          costCurrency: "NGN",
        },
      );
      const movementsBeforeFinancialActions = await prisma.stockMovement.count({
        where: { organizationId: owner.context.organizationId },
      });
      const databaseDate =
        await prisma.$queryRaw`SELECT CURRENT_DATE::text AS today`;
      const today = new Date(`${databaseDate[0].today}T00:00:00.000Z`);
      const dateOffset = (days) => {
        const date = new Date(today);
        date.setUTCDate(date.getUTCDate() - days);
        return date.toISOString().slice(0, 10);
      };
      for (const daysOverdue of [0, 1, 30, 31, 60, 61, 90, 91, null]) {
        const agingDraft = await makeDraft(
          owner.context,
          owner.userId,
          "Aging boundary customer",
          {
            customer: agingCustomer,
            productId: agingProduct.id,
            ...(daysOverdue === null
              ? {}
              : { dueDate: dateOffset(daysOverdue) }),
          },
        );
        await invoices.issue(
          owner.context,
          owner.userId,
          agingDraft.id,
          `aging-issue-${randomUUID()}`,
        );
      }
      const aging = await reportQueries.receivablesAging(
        owner.context,
        Object.assign(new ReportFilterDto(), {
          customer_id: agingCustomer.id,
          branch_id: branch.id,
          warehouse_id: warehouse.id,
          from: new Date().toISOString().slice(0, 10),
          to: new Date().toISOString().slice(0, 10),
          currency: "NGN",
        }),
      );
      const agingRow = aging.data[0];
      assert.equal(Number(agingRow.no_due_date), 1);
      assert.equal(String(agingRow.no_due_date_outstanding), "100");
      assert.equal(String(agingRow.not_yet_due), "100");
      assert.equal(String(agingRow.days_1_30), "200");
      assert.equal(String(agingRow.days_31_60), "200");
      assert.equal(String(agingRow.days_61_90), "200");
      assert.equal(String(agingRow.over_90), "100");
      assert.equal(
        [
          "no_due_date_outstanding",
          "not_yet_due",
          "days_1_30",
          "days_31_60",
          "days_61_90",
          "over_90",
        ].reduce((total, key) => total + Number(agingRow[key]), 0),
        900,
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
      const salesEmail = `sales-${randomUUID()}@example.test`;
      const salesUser = await prisma.user.create({
        data: {
          email: salesEmail,
          emailNormalized: salesEmail,
          passwordHash: "integration-only",
          status: "ACTIVE",
          emailVerifiedAt: new Date(),
        },
      });
      const salesMembership = await prisma.membership.create({
        data: {
          organizationId: owner.context.organizationId,
          userId: salesUser.id,
          role: "SALES",
        },
      });
      const salesContext = {
        organizationId: owner.context.organizationId,
        membershipId: salesMembership.id,
        userId: salesUser.id,
        role: "SALES",
      };
      await t.test(
        "authenticated SALES-004 HTTP routes validate, authorize, scope and render PDF",
        async () => {
          await new ReportingService(
            prisma,
            new ReorderingService(prisma),
          ).salesOverview(owner.context, {
            page: 1,
            page_size: 25,
            from: "2026-01-01",
            to: "2026-12-31",
          });
          const secret = "sales-004-http-integration-secret-at-least-32-bytes";
          const ownerToken = await issueApiToken(
            prisma,
            owner.context,
            owner.userId,
            secret,
          );
          const financeToken = await issueApiToken(
            prisma,
            financeContext,
            financeUser.id,
            secret,
          );
          const salesToken = await issueApiToken(
            prisma,
            salesContext,
            salesUser.id,
            secret,
          );
          const api = await startApi(secret);
          const auth = (token) => ({ Authorization: `Bearer ${token}` });
          try {
            const list = await fetch(
              `${api.url}/api/v1/organizations/current/sales/invoices?page=1&page_size=20`,
              { headers: auth(ownerToken) },
            );
            assert.equal(list.status, 200);
            const detail = await fetch(
              `${api.url}/api/v1/organizations/current/sales/invoices/${draft.id}`,
              { headers: auth(ownerToken) },
            );
            assert.equal(detail.status, 200);
            const pdf = await fetch(
              `${api.url}/api/v1/organizations/current/sales/invoices/${draft.id}/pdf`,
              { headers: auth(ownerToken) },
            );
            assert.equal(pdf.status, 200);
            assert.match(
              pdf.headers.get("content-type") ?? "",
              /application\/pdf/,
            );
            assert.ok((await pdf.arrayBuffer()).byteLength > 100);
            const financialSummary = await fetch(
              `${api.url}/api/v1/organizations/current/sales/customers/${customer.id}/financial-summary`,
              { headers: auth(ownerToken) },
            );
            assert.equal(financialSummary.status, 200);
            const salesReport = await fetch(
              `${api.url}/api/v1/organizations/current/reports/sales/summary?from=2026-01-01&to=2026-12-31`,
              { headers: auth(ownerToken) },
            );
            assert.equal(
              salesReport.status,
              200,
              `${await salesReport.clone().text()}\n${api.output()}`,
            );
            const salesReportBody = await salesReport.json();
            assert.ok(Array.isArray(salesReportBody.order_value));
            assert.ok(Array.isArray(salesReportBody.receivables));
            assert.equal(salesReportBody.balance_basis, "current_state");
            const productPerformance = await fetch(
              `${api.url}/api/v1/organizations/current/reports/sales/products?currency=NGN&product_id=${product.id}`,
              { headers: auth(ownerToken) },
            );
            assert.equal(
              productPerformance.status,
              200,
              `${await productPerformance.clone().text()}\n${api.output()}`,
            );
            const productPerformanceBody = await productPerformance.json();
            assert.equal(productPerformanceBody.total, 1);
            assert.equal(productPerformanceBody.data[0].product_id, product.id);
            assert.equal(productPerformanceBody.data[0].unit_code, "EA");
            assert.equal(
              String(productPerformanceBody.data[0].ordered_quantity),
              "13",
            );
            assert.equal(
              String(productPerformanceBody.data[0].invoiced_quantity),
              "12",
            );
            assert.equal(
              String(productPerformanceBody.data[0].tax_amount),
              "2250",
            );
            const customerPerformance = await fetch(
              `${api.url}/api/v1/organizations/current/reports/sales/customers?currency=NGN&customer_id=${customer.id}`,
              { headers: auth(ownerToken) },
            );
            assert.equal(
              customerPerformance.status,
              200,
              await customerPerformance.clone().text(),
            );
            const customerPerformanceBody = await customerPerformance.json();
            assert.ok(
              customerPerformanceBody.data.some(
                (row) => row.customer_id === customer.id,
              ),
            );
            assert.equal(
              customerPerformanceBody.balance_basis,
              "current_state",
            );
            const purchaseProductPerformance = await fetch(
              `${api.url}/api/v1/organizations/current/reports/purchases/products`,
              { headers: auth(ownerToken) },
            );
            assert.equal(
              purchaseProductPerformance.status,
              200,
              await purchaseProductPerformance.clone().text(),
            );
            assert.deepEqual(
              (await purchaseProductPerformance.json()).data,
              [],
            );
            const supplierPerformance = await fetch(
              `${api.url}/api/v1/organizations/current/reports/purchases/suppliers`,
              { headers: auth(ownerToken) },
            );
            assert.equal(
              supplierPerformance.status,
              200,
              await supplierPerformance.clone().text(),
            );
            assert.deepEqual((await supplierPerformance.json()).data, []);
            const restrictedProductReport = await fetch(
              `${api.url}/api/v1/organizations/current/reports/sales/products`,
              { headers: auth(salesToken) },
            );
            assert.equal(restrictedProductReport.status, 403);
            for (const reportType of [
              "SALES_PRODUCTS",
              "SALES_CUSTOMERS",
              "PURCHASE_PRODUCTS",
              "PURCHASE_SUPPLIERS",
            ]) {
              const exportResponse = await fetch(
                `${api.url}/api/v1/organizations/current/reports/exports`,
                {
                  method: "POST",
                  headers: {
                    ...auth(ownerToken),
                    "Content-Type": "application/json",
                    "Idempotency-Key": `report-${reportType}-${randomUUID()}`,
                  },
                  body: JSON.stringify({
                    report_type: reportType,
                    filters: {},
                  }),
                },
              );
              assert.equal(
                exportResponse.status,
                201,
                await exportResponse.clone().text(),
              );
              assert.equal(
                (await exportResponse.json()).report_type,
                reportType,
              );
            }
            const forbiddenFinancialExport = await fetch(
              `${api.url}/api/v1/organizations/current/reports/exports`,
              {
                method: "POST",
                headers: {
                  ...auth(salesToken),
                  "Content-Type": "application/json",
                  "Idempotency-Key": `report-denied-${randomUUID()}`,
                },
                body: JSON.stringify({
                  report_type: "SALES_PRODUCTS",
                  filters: {},
                }),
              },
            );
            assert.equal(forbiddenFinancialExport.status, 403);
            const salesTrends = await fetch(
              `${api.url}/api/v1/organizations/current/reports/sales/trends?period=month`,
              { headers: auth(ownerToken) },
            );
            assert.equal(salesTrends.status, 200);
            assert.equal((await salesTrends.json()).period, "month");
            const agingReport = await fetch(
              `${api.url}/api/v1/organizations/current/reports/receivables/aging`,
              { headers: auth(ownerToken) },
            );
            assert.equal(agingReport.status, 200);
            assert.equal((await agingReport.json()).basis, "current_state");
            const purchaseReport = await fetch(
              `${api.url}/api/v1/organizations/current/reports/purchases/summary`,
              { headers: auth(ownerToken) },
            );
            assert.equal(purchaseReport.status, 200);
            assert.ok(
              Array.isArray((await purchaseReport.json()).received_value),
            );
            const purchaseTrends = await fetch(
              `${api.url}/api/v1/organizations/current/reports/purchases/trends?period=week`,
              { headers: auth(ownerToken) },
            );
            assert.equal(purchaseTrends.status, 200);
            assert.equal((await purchaseTrends.json()).period, "week");
            const restrictedReport = await fetch(
              `${api.url}/api/v1/organizations/current/reports/sales/summary`,
              { headers: auth(salesToken) },
            );
            assert.equal(restrictedReport.status, 403);
            const invalidInvoice = await fetch(
              `${api.url}/api/v1/organizations/current/sales/invoices`,
              {
                method: "POST",
                headers: {
                  ...auth(ownerToken),
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({}),
              },
            );
            assert.equal(invalidInvoice.status, 400);
            const invalidFilter = await fetch(
              `${api.url}/api/v1/organizations/current/sales/invoices?status=UNKNOWN`,
              { headers: auth(ownerToken) },
            );
            assert.equal(invalidFilter.status, 400);
            const foreignRead = await fetch(
              `${api.url}/api/v1/organizations/current/sales/invoices/${foreignIssued.id}`,
              { headers: auth(ownerToken) },
            );
            assert.equal(foreignRead.status, 404);
            const unauthorizedFinanceRead = await fetch(
              `${api.url}/api/v1/organizations/current/sales/invoices`,
              { headers: auth(salesToken) },
            );
            assert.equal(unauthorizedFinanceRead.status, 403);
            const unauthorizedVoid = await fetch(
              `${api.url}/api/v1/organizations/current/sales/invoices/${fourthDraft.id}/void`,
              {
                method: "POST",
                headers: {
                  ...auth(salesToken),
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ reason: "Not permitted" }),
              },
            );
            assert.equal(unauthorizedVoid.status, 403);
            const ungrantedWarehouseRead = await fetch(
              `${api.url}/api/v1/organizations/current/sales/invoices/${draft.id}`,
              { headers: auth(financeToken) },
            );
            assert.equal(ungrantedWarehouseRead.status, 404);
          } finally {
            api.child.kill("SIGTERM");
            await once(api.child, "exit");
          }
        },
      );
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
        invoices.reversePayment(
          financeContext,
          financeUser.id,
          first.id,
          reversalReason,
          reversalKey,
        ),
        (error) => error.getStatus() === 404,
      );
      await assert.rejects(
        invoices.get(foreign.context, draft.id),
        (error) => error.getStatus() === 404,
      );
      await assert.rejects(
        prisma.invoice.update({
          where: { id: draft.id },
          data: { totalAmount: "1" },
        }),
      );
      await assert.rejects(
        prisma.invoiceLine.update({
          where: { id: draft.lines[0].id },
          data: { lineTotal: "1" },
        }),
      );
      await assert.rejects(prisma.invoice.delete({ where: { id: draft.id } }));
      await assert.rejects(
        prisma.customerPayment.delete({ where: { id: first.id } }),
      );
      await assert.rejects(
        prisma.invoice.create({
          data: {
            organizationId: owner.context.organizationId,
            salesOrderId: order.id,
            customerId: foreignCustomer.id,
            currency: "NGN",
            createdByUserId: owner.userId,
          },
        }),
      );
      await assert.rejects(
        prisma.$transaction(async (tx) => {
          const payment = await tx.customerPayment.create({
            data: {
              organizationId: owner.context.organizationId,
              customerId: customer.id,
              paymentMethod: "CASH",
              currency: "NGN",
              amount: "20000",
              paymentDate: new Date("2026-11-24"),
              recordedByUserId: owner.userId,
            },
          });
          return tx.paymentAllocation.create({
            data: {
              organizationId: owner.context.organizationId,
              paymentId: payment.id,
              invoiceId: draft.id,
              amount: "20000",
            },
          });
        }),
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
        "controlled 80,000 invoice, partial payment, reversal and tax snapshot reconciliation",
        async () => {
          const controlledCustomer = await customers.create(
            owner.context,
            owner.userId,
            { name: "Controlled SALES-004 fixture" },
          );
          const controlledOrder = await salesOrders.create(
            owner.context,
            owner.userId,
            {
              customerId: controlledCustomer.id,
              warehouseId: warehouse.id,
              currency: "NGN",
              lines: [
                { productId: product.id, quantity: "10", unitPrice: "8000" },
              ],
            },
            `controlled-invoice-order-${randomUUID()}`,
          );
          await salesOrders.confirm(
            owner.context,
            owner.userId,
            controlledOrder.id,
            `controlled-invoice-confirm-${randomUUID()}`,
          );
          const inventoryBefore = await prisma.inventoryBalance.findUnique({
            where: {
              organizationId_warehouseId_productId: {
                organizationId: owner.context.organizationId,
                warehouseId: warehouse.id,
                productId: product.id,
              },
            },
          });
          const movementsBefore = await prisma.stockMovement.count({
            where: { organizationId: owner.context.organizationId },
          });
          const controlledDraft = await invoices.create(
            owner.context,
            owner.userId,
            {
              salesOrderId: controlledOrder.id,
              lines: [{ salesOrderLineId: controlledOrder.lines[0].id }],
            },
            `controlled-invoice-create-${randomUUID()}`,
          );
          assert.equal(controlledDraft.subtotal.toString(), "80000");
          assert.equal(controlledDraft.totalAmount.toString(), "80000");
          const issuedControlled = await invoices.issue(
            owner.context,
            owner.userId,
            controlledDraft.id,
            `controlled-invoice-issue-${randomUUID()}`,
          );
          assert.match(issuedControlled.invoiceNumber, /^INV-\d{6}$/);

          const firstPayment = await invoices.recordPayment(
            owner.context,
            owner.userId,
            {
              invoiceId: controlledDraft.id,
              amount: "30000",
              method: "BANK_TRANSFER",
              paymentDate: "2026-11-24",
            },
            `controlled-invoice-pay-${randomUUID()}`,
          );
          let controlled = await invoices.get(
            owner.context,
            controlledDraft.id,
          );
          assert.equal(controlled.amountPaid.toFixed(4), "30000.0000");
          assert.equal(controlled.outstandingAmount.toFixed(4), "50000.0000");
          assert.equal(controlled.paymentStatus, "PARTIALLY_PAID");
          const secondPayment = await invoices.recordPayment(
            owner.context,
            owner.userId,
            {
              invoiceId: controlledDraft.id,
              amount: "50000",
              method: "BANK_TRANSFER",
              paymentDate: "2026-11-24",
            },
            `controlled-invoice-pay-${randomUUID()}`,
          );
          controlled = await invoices.get(owner.context, controlledDraft.id);
          assert.equal(controlled.amountPaid.toFixed(4), "80000.0000");
          assert.equal(controlled.outstandingAmount.toFixed(4), "0.0000");
          assert.equal(controlled.paymentStatus, "PAID");
          await invoices.reversePayment(
            owner.context,
            owner.userId,
            secondPayment.id,
            "Controlled fixture bank correction",
            `controlled-invoice-reversal-${randomUUID()}`,
          );
          controlled = await invoices.get(owner.context, controlledDraft.id);
          assert.equal(controlled.amountPaid.toFixed(4), "30000.0000");
          assert.equal(controlled.outstandingAmount.toFixed(4), "50000.0000");
          assert.equal(controlled.paymentStatus, "PARTIALLY_PAID");
          await invoices.recordPayment(
            owner.context,
            owner.userId,
            {
              invoiceId: controlledDraft.id,
              amount: "50000",
              method: "BANK_TRANSFER",
              paymentDate: "2026-11-24",
            },
            `controlled-invoice-pay-${randomUUID()}`,
          );

          const controlledPayments = await prisma.customerPayment.findMany({
            where: {
              organizationId: owner.context.organizationId,
              customerId: controlledCustomer.id,
            },
            include: { reversal: true },
          });
          const minor = (value) => {
            const [whole, fraction = ""] = value.toString().split(".");
            return BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
          };
          const grossPayments = controlledPayments.reduce(
            (total, payment) => total + minor(payment.amount),
            0n,
          );
          const reversedPayments = controlledPayments.reduce(
            (total, payment) =>
              total + (payment.reversal ? minor(payment.reversal.amount) : 0n),
            0n,
          );
          assert.equal(grossPayments, 13000000n);
          assert.equal(reversedPayments, 5000000n);
          assert.equal(controlledPayments.length, 3);
          assert.ok(
            controlledPayments.some(
              (payment) => payment.id === firstPayment.id,
            ),
          );
          controlled = await invoices.get(owner.context, controlledDraft.id);
          assert.equal(controlled.amountPaid.toFixed(4), "80000.0000");
          assert.equal(controlled.outstandingAmount.toFixed(4), "0.0000");
          assert.equal(controlled.paymentStatus, "PAID");
          const controlledSummary = await invoices.customerSummary(
            owner.context,
            controlledCustomer.id,
          );
          assert.equal(controlledSummary[0].invoiced, "80000.0000");
          assert.equal(controlledSummary[0].paid, "80000.0000");
          assert.equal(controlledSummary[0].outstanding, "0.0000");
          assert.equal(
            await prisma.stockMovement.count({
              where: { organizationId: owner.context.organizationId },
            }),
            movementsBefore,
          );
          const inventoryAfter = await prisma.inventoryBalance.findUnique({
            where: {
              organizationId_warehouseId_productId: {
                organizationId: owner.context.organizationId,
                warehouseId: warehouse.id,
                productId: product.id,
              },
            },
          });
          assert.equal(
            inventoryAfter.onHand.toString(),
            inventoryBefore.onHand.toString(),
          );
          assert.equal(
            inventoryAfter.reserved.toString(),
            inventoryBefore.reserved.toString(),
          );

          const taxRate = await invoices.createTaxRate(
            owner.context,
            owner.userId,
            {
              name: "Controlled QA tax",
              code: `QA-${randomUUID().slice(0, 8)}`,
              rate: "10",
            },
          );
          const taxCustomer = await customers.create(
            owner.context,
            owner.userId,
            { name: "Controlled tax snapshot fixture" },
          );
          const taxOrder = await salesOrders.create(
            owner.context,
            owner.userId,
            {
              customerId: taxCustomer.id,
              warehouseId: warehouse.id,
              currency: "NGN",
              lines: [
                { productId: product.id, quantity: "10", unitPrice: "8000" },
              ],
            },
            `controlled-tax-order-${randomUUID()}`,
          );
          await salesOrders.confirm(
            owner.context,
            owner.userId,
            taxOrder.id,
            `controlled-tax-confirm-${randomUUID()}`,
          );
          const taxDraft = await invoices.create(
            owner.context,
            owner.userId,
            {
              salesOrderId: taxOrder.id,
              lines: [
                {
                  salesOrderLineId: taxOrder.lines[0].id,
                  discountAmount: "5000",
                  taxRateId: taxRate.id,
                },
              ],
            },
            `controlled-tax-invoice-${randomUUID()}`,
          );
          assert.equal(taxDraft.subtotal.toString(), "80000");
          assert.equal(taxDraft.discountAmount.toString(), "5000");
          assert.equal(taxDraft.taxAmount.toString(), "7500");
          assert.equal(taxDraft.totalAmount.toString(), "82500");
          const taxIssued = await invoices.issue(
            owner.context,
            owner.userId,
            taxDraft.id,
            `controlled-tax-issue-${randomUUID()}`,
          );
          const pdf = await invoices.pdf(owner.context, taxDraft.id);
          const pdfText = pdf.content.toString("ascii");
          assert.ok(pdfText.includes(taxIssued.invoiceNumber));
          assert.ok(pdfText.includes("Total: 82500.0000 NGN"));
          await invoices.updateTaxRate(
            owner.context,
            owner.userId,
            taxRate.id,
            {
              isActive: false,
            },
          );
          const taxSnapshotAfterEdit = await invoices.get(
            owner.context,
            taxDraft.id,
          );
          assert.equal(
            taxSnapshotAfterEdit.lines[0].taxRateSnapshot.toString(),
            "10",
          );
          assert.equal(taxSnapshotAfterEdit.taxAmount.toString(), "7500");
          assert.equal(taxSnapshotAfterEdit.totalAmount.toString(), "82500");
        },
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

async function issueApiToken(prisma, context, userId, secret) {
  const sessionId = randomUUID();
  await prisma.refreshSession.create({
    data: {
      id: sessionId,
      userId,
      organizationId: context.organizationId,
      tokenHash: createHash("sha256").update(randomUUID()).digest("hex"),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  const tokens = new AccessTokenService(new JwtService(), secret);
  return (
    await tokens.issue({
      sub: userId,
      sid: sessionId,
      organizationId: context.organizationId,
    })
  ).token;
}

async function startApi(secret) {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolveClose, reject) =>
    reservation.close((error) => (error ? reject(error) : resolveClose())),
  );
  const child = spawn(process.execPath, ["dist/main.js"], {
    cwd: resolve(process.cwd(), "apps/api"),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      JWT_ACCESS_SECRET: secret,
      REPORT_EXPORT_WORKER_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => {
    output = `${output}${chunk}`.slice(-8000);
  });
  child.stderr.setEncoding("utf8").on("data", (chunk) => {
    output = `${output}${chunk}`.slice(-8000);
  });
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${url}/api/v1/status`, {
        signal: AbortSignal.timeout(500),
      });
      if (response.status === 200) return { child, url, output: () => output };
    } catch {
      if (child.exitCode !== null) break;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  child.kill("SIGTERM");
  throw new Error(`Isolated API failed to start: ${output}`);
}
