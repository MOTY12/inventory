import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import {
  IdempotencyStatus,
  InvoiceDocumentStatus,
  SalesOrderStatus,
} from "../generated/prisma/enums";
import { PrismaService } from "../database/prisma.service";
import { renderInvoicePdf } from "./invoice-pdf";
import {
  calculateInvoiceLine,
  currencyPrecision,
} from "./invoice-calculations";
import type { OrganizationContext } from "../organizations/organization-context.guard";
import {
  CreateInvoiceDto,
  CreateTaxRateDto,
  InvoiceListQueryDto,
  PaymentListQueryDto,
  RecordPaymentDto,
  UpdateInvoiceDto,
  UpdateTaxRateDto,
} from "./invoices.dto";

const invoiceInclude = {
  customer: true,
  salesOrder: { select: { id: true, number: true, warehouseId: true } },
  lines: { orderBy: { id: "asc" as const } },
  allocations: {
    include: {
      payment: { include: { reversal: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
};

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: OrganizationContext, query: InvoiceListQueryDto) {
    const warehouseIds = await this.visibleWarehouses(ctx, this.prisma);
    const where: Prisma.InvoiceWhereInput = {
      organizationId: ctx.organizationId,
      ...(warehouseIds
        ? { salesOrder: { warehouseId: { in: warehouseIds } } }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.currency ? { currency: query.currency } : {}),
      ...(query.from || query.to
        ? {
            issueDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { invoiceNumber: { contains: query.q, mode: "insensitive" } },
              {
                customer: { name: { contains: query.q, mode: "insensitive" } },
              },
              {
                salesOrder: {
                  number: { contains: query.q, mode: "insensitive" },
                },
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        include: invoiceInclude,
        orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.page_size,
        take: query.page_size,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return {
      data: rows.map((row) => presentInvoice(row)),
      page: query.page,
      pageSize: query.page_size,
      total,
    };
  }

  async summary(ctx: OrganizationContext) {
    const warehouseIds = await this.visibleWarehouses(ctx, this.prisma);
    const rows = await this.prisma.invoice.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: InvoiceDocumentStatus.ISSUED,
        ...(warehouseIds
          ? { salesOrder: { warehouseId: { in: warehouseIds } } }
          : {}),
      },
      include: {
        allocations: { include: { payment: { select: { reversal: true } } } },
      },
    });
    const buckets = new Map<
      string,
      {
        invoiced: Prisma.Decimal;
        collected: Prisma.Decimal;
        outstanding: Prisma.Decimal;
        overdue: Prisma.Decimal;
      }
    >();
    const today = new Date(new Date().toISOString().slice(0, 10));
    for (const invoice of rows) {
      const bucket = buckets.get(invoice.currency) ?? {
        invoiced: dec(0),
        collected: dec(0),
        outstanding: dec(0),
        overdue: dec(0),
      };
      const paid = invoice.allocations.reduce(
        (sum, allocation) =>
          allocation.payment.reversal ? sum : sum.plus(allocation.amount),
        dec(0),
      );
      const due = invoice.totalAmount.minus(paid);
      bucket.invoiced = bucket.invoiced.plus(invoice.totalAmount);
      bucket.collected = bucket.collected.plus(paid);
      bucket.outstanding = bucket.outstanding.plus(due);
      if (
        invoice.status === InvoiceDocumentStatus.ISSUED &&
        due.gt(0) &&
        invoice.dueDate &&
        invoice.dueDate < today
      )
        bucket.overdue = bucket.overdue.plus(due);
      buckets.set(invoice.currency, bucket);
    }
    return [...buckets].map(([currency, values]) => ({
      currency,
      invoiced: values.invoiced.toFixed(4),
      collected: values.collected.toFixed(4),
      outstanding: values.outstanding.toFixed(4),
      overdue: values.overdue.toFixed(4),
    }));
  }

  async get(ctx: OrganizationContext, id: string) {
    const warehouseIds = await this.visibleWarehouses(ctx, this.prisma);
    const row = await this.prisma.invoice.findFirst({
      where: {
        organizationId: ctx.organizationId,
        id,
        ...(warehouseIds
          ? { salesOrder: { warehouseId: { in: warehouseIds } } }
          : {}),
      },
      include: invoiceInclude,
    });
    if (!row) throw new NotFoundException("Invoice not found");
    return presentInvoice(row);
  }

  async pdf(ctx: OrganizationContext, id: string) {
    const invoice = await this.get(ctx, id);
    if (
      invoice.status === InvoiceDocumentStatus.DRAFT ||
      !invoice.invoiceNumber
    )
      throw new ConflictException("Only issued invoices can be downloaded");
    const customer = jsonRecord(invoice.customerSnapshot);
    const business = jsonRecord(invoice.businessSnapshot);
    const lines = [
      String(business.name ?? "Business"),
      "INVOICE",
      `Invoice number: ${invoice.invoiceNumber}`,
      `Issue date: ${invoice.issueDate?.toISOString().slice(0, 10) ?? ""}`,
      `Due date: ${invoice.dueDate?.toISOString().slice(0, 10) ?? ""}`,
      `Sales order: ${invoice.salesOrder.number}`,
      `Customer: ${String(customer.name ?? invoice.customer.name)}`,
      `Email: ${String(customer.email ?? "")}`,
      `Billing address: ${[customer.billingAddressLine1, customer.billingAddressLine2, customer.billingCity, customer.billingRegion, customer.billingPostalCode, customer.billingCountryCode].filter(Boolean).join(", ")}`,
      "",
      "Items:",
      ...invoice.lines.map(
        (line) =>
          `${line.skuSnapshot} ${line.productNameSnapshot} | ${line.quantity.toString()} ${line.unitSnapshot} x ${line.unitPrice.toFixed(4)} | discount ${line.discountAmount.toFixed(4)} | tax ${line.taxRateSnapshot.toFixed(6)}% = ${line.lineTotal.toFixed(4)} ${invoice.currency}`,
      ),
      "",
      `Subtotal: ${invoice.subtotal.toFixed(4)} ${invoice.currency}`,
      `Discounts: ${invoice.discountAmount.toFixed(4)} ${invoice.currency}`,
      `Tax: ${invoice.taxAmount.toFixed(4)} ${invoice.currency}`,
      `Total: ${invoice.totalAmount.toFixed(4)} ${invoice.currency}`,
      `Paid: ${invoice.amountPaid.toFixed(4)} ${invoice.currency}`,
      `Outstanding: ${invoice.outstandingAmount.toFixed(4)} ${invoice.currency}`,
      "",
      "Payments:",
      ...invoice.allocations.map(
        (allocation) =>
          `${allocation.payment.paymentDate.toISOString().slice(0, 10)} | ${allocation.payment.paymentMethod} | ${allocation.amount.toFixed(4)} ${invoice.currency}${allocation.payment.reversal ? " | REVERSED" : ""}`,
      ),
      ...(invoice.notes ? ["", `Notes: ${invoice.notes}`] : []),
    ];
    return {
      filename: `${invoice.invoiceNumber.toLowerCase()}.pdf`,
      content: renderInvoicePdf(lines),
    };
  }

  async eligibleOrders(ctx: OrganizationContext) {
    const warehouseIds = await this.visibleWarehouses(ctx, this.prisma);
    return this.prisma.salesOrder.findMany({
      where: {
        organizationId: ctx.organizationId,
        ...(warehouseIds ? { warehouseId: { in: warehouseIds } } : {}),
        status: {
          in: [
            SalesOrderStatus.CONFIRMED,
            SalesOrderStatus.PARTIALLY_FULFILLED,
            SalesOrderStatus.FULFILLED,
          ],
        },
        invoices: { none: { status: { not: InvoiceDocumentStatus.VOID } } },
      },
      include: { customer: true, lines: { orderBy: { createdAt: "asc" } } },
      orderBy: [{ orderDate: "desc" }, { id: "desc" }],
      take: 100,
    });
  }

  async create(
    ctx: OrganizationContext,
    actor: string,
    input: CreateInvoiceDto,
    key: string,
  ) {
    const payloadHash = hash({ command: "invoice.create", input });
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const replay = await this.replayInvoice(tx, ctx, key, payloadHash);
        if (replay) return replay;
        await this.beginKey(tx, ctx, key, payloadHash);
        const order = await tx.salesOrder.findFirst({
          where: {
            organizationId: ctx.organizationId,
            id: input.salesOrderId,
            status: {
              in: [
                SalesOrderStatus.CONFIRMED,
                SalesOrderStatus.PARTIALLY_FULFILLED,
                SalesOrderStatus.FULFILLED,
              ],
            },
          },
          include: { customer: true, lines: { orderBy: { createdAt: "asc" } } },
        });
        if (!order)
          throw new NotFoundException("Confirmed sales order not found");
        await this.assertWarehouse(ctx, order.warehouseId, tx);
        const active = await tx.invoice.findFirst({
          where: {
            organizationId: ctx.organizationId,
            salesOrderId: order.id,
            status: { not: InvoiceDocumentStatus.VOID },
          },
          select: { id: true },
        });
        if (active)
          throw new ConflictException(
            "This sales order already has an active invoice",
          );
        const lines = await this.prepareLines(
          tx,
          ctx,
          order.lines,
          input.lines,
          order.currency,
        );
        const totals = lines.reduce(
          (sum, line) => ({
            subtotal: sum.subtotal.plus(line.gross),
            discount: sum.discount.plus(line.discount),
            tax: sum.tax.plus(line.tax),
            total: sum.total.plus(line.total),
          }),
          { subtotal: dec(0), discount: dec(0), tax: dec(0), total: dec(0) },
        );
        const invoice = await tx.invoice.create({
          data: {
            organizationId: ctx.organizationId,
            salesOrderId: order.id,
            customerId: order.customerId,
            currency: order.currency,
            subtotal: totals.subtotal,
            discountAmount: totals.discount,
            taxAmount: totals.tax,
            totalAmount: totals.total,
            dueDate: input.dueDate ? new Date(input.dueDate) : null,
            notes: input.notes?.trim() || null,
            createdByUserId: actor,
            lines: { create: lines.map((line) => line.createData) },
          },
          include: invoiceInclude,
        });
        await this.audit(
          tx,
          ctx,
          actor,
          "INVOICE",
          invoice.id,
          "DRAFT_CREATED",
          {
            salesOrderId: order.id,
            totalAmount: totals.total.toFixed(4),
          },
        );
        await this.completeKey(tx, ctx, key, invoice.id, "INVOICE");
        return invoice;
      });
      return presentInvoice(row);
    } catch (error) {
      const replay = await this.tryReplayInvoice(ctx, key, payloadHash);
      if (replay) return replay;
      if (unique(error))
        throw new ConflictException(
          "Invoice command conflicts with an existing record",
        );
      throw error;
    }
  }

  async updateDraft(
    ctx: OrganizationContext,
    actor: string,
    id: string,
    input: UpdateInvoiceDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const prior = await tx.invoice.findFirst({
        where: { organizationId: ctx.organizationId, id },
        include: {
          salesOrder: {
            include: {
              customer: true,
              lines: { orderBy: { createdAt: "asc" } },
            },
          },
        },
      });
      if (!prior) throw new NotFoundException("Invoice not found");
      await this.assertWarehouse(ctx, prior.salesOrder.warehouseId, tx);
      if (prior.status !== InvoiceDocumentStatus.DRAFT)
        throw new ConflictException("Only draft invoices may be edited");
      if (prior.salesOrderId !== input.salesOrderId)
        throw new ConflictException(
          "An invoice cannot be moved to another sales order",
        );
      const lines = await this.prepareLines(
        tx,
        ctx,
        prior.salesOrder.lines,
        input.lines,
        prior.salesOrder.currency,
      );
      const totals = lines.reduce(
        (sum, line) => ({
          subtotal: sum.subtotal.plus(line.gross),
          discount: sum.discount.plus(line.discount),
          tax: sum.tax.plus(line.tax),
          total: sum.total.plus(line.total),
        }),
        { subtotal: dec(0), discount: dec(0), tax: dec(0), total: dec(0) },
      );
      await tx.invoiceLine.deleteMany({
        where: { organizationId: ctx.organizationId, invoiceId: id },
      });
      const row = await tx.invoice.update({
        where: { id },
        data: {
          subtotal: totals.subtotal,
          discountAmount: totals.discount,
          taxAmount: totals.tax,
          totalAmount: totals.total,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          notes: input.notes?.trim() || null,
          lines: { create: lines.map((line) => line.createData) },
        },
        include: invoiceInclude,
      });
      await this.audit(tx, ctx, actor, "INVOICE", id, "DRAFT_UPDATED", {
        totalAmount: totals.total.toFixed(4),
      });
      return presentInvoice(row);
    });
  }

  async issue(
    ctx: OrganizationContext,
    actor: string,
    id: string,
    key: string,
  ) {
    const payloadHash = hash({ command: "invoice.issue", id });
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const replay = await this.replayInvoice(tx, ctx, key, payloadHash);
        if (replay) return replay;
        await this.beginKey(tx, ctx, key, payloadHash);
        await tx.$queryRaw`SELECT id FROM invoices WHERE organization_id = ${ctx.organizationId}::uuid AND id = ${id}::uuid FOR UPDATE`;
        const invoice = await tx.invoice.findFirst({
          where: { organizationId: ctx.organizationId, id },
          include: { customer: true, salesOrder: true, lines: true },
        });
        if (!invoice) throw new NotFoundException("Invoice not found");
        await this.assertWarehouse(ctx, invoice.salesOrder.warehouseId, tx);
        if (invoice.status !== InvoiceDocumentStatus.DRAFT)
          throw new ConflictException("Only draft invoices may be issued");
        const seq = await tx.invoiceSequence.upsert({
          where: { organizationId: ctx.organizationId },
          create: { organizationId: ctx.organizationId, nextNumber: 2n },
          update: { nextNumber: { increment: 1n } },
        });
        const number = seq.nextNumber - 1n;
        const org = await tx.organization.findUniqueOrThrow({
          where: { id: ctx.organizationId },
          select: { name: true, slug: true },
        });
        const issuedAt = new Date();
        const updated = await tx.invoice.update({
          where: { id },
          data: {
            invoiceNumber: `INV-${number.toString().padStart(6, "0")}`,
            status: InvoiceDocumentStatus.ISSUED,
            issueDate: issuedAt,
            issuedAt,
            issuedByUserId: actor,
            customerSnapshot: customerSnapshot(invoice.customer),
            businessSnapshot: { name: org.name, slug: org.slug },
          },
          include: invoiceInclude,
        });
        await this.audit(tx, ctx, actor, "INVOICE", id, "ISSUED", {
          invoiceNumber: updated.invoiceNumber!,
        });
        await this.completeKey(tx, ctx, key, id, "INVOICE");
        return updated;
      });
      return presentInvoice(row);
    } catch (error) {
      const replay = await this.tryReplayInvoice(ctx, key, payloadHash);
      if (replay) return replay;
      if (unique(error))
        throw new ConflictException(
          "Invoice issuance conflicts with an existing record",
        );
      throw error;
    }
  }

  async void(
    ctx: OrganizationContext,
    actor: string,
    id: string,
    reason: string,
    key: string,
  ) {
    const payloadHash = hash({ command: "invoice.void", id, reason });
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const replay = await this.replayInvoice(tx, ctx, key, payloadHash);
        if (replay) return replay;
        await this.beginKey(tx, ctx, key, payloadHash);
        await tx.$queryRaw`SELECT id FROM invoices WHERE organization_id = ${ctx.organizationId}::uuid AND id = ${id}::uuid FOR UPDATE`;
        const invoice = await tx.invoice.findFirst({
          where: { organizationId: ctx.organizationId, id },
          include: { salesOrder: { select: { warehouseId: true } } },
        });
        if (!invoice) throw new NotFoundException("Invoice not found");
        await this.assertWarehouse(ctx, invoice.salesOrder.warehouseId, tx);
        if (invoice.status !== InvoiceDocumentStatus.ISSUED)
          throw new ConflictException("Only issued invoices may be voided");
        const paid = await this.effectivePaid(tx, ctx.organizationId, id);
        if (paid.gt(0))
          throw new ConflictException(
            "Invoices with effective payments cannot be voided",
          );
        const updated = await tx.invoice.update({
          where: { id },
          data: {
            status: InvoiceDocumentStatus.VOID,
            voidedAt: new Date(),
            voidedByUserId: actor,
            voidReason: reason.trim(),
          },
          include: invoiceInclude,
        });
        await this.audit(tx, ctx, actor, "INVOICE", id, "VOIDED", {
          reason: reason.trim(),
        });
        await this.completeKey(tx, ctx, key, id, "INVOICE");
        return updated;
      });
      return presentInvoice(row);
    } catch (error) {
      const replay = await this.tryReplayInvoice(ctx, key, payloadHash);
      if (replay) return replay;
      if (unique(error))
        throw new ConflictException(
          "Invoice void conflicts with an existing record",
        );
      throw error;
    }
  }

  async listTaxRates(ctx: OrganizationContext) {
    return this.prisma.taxRate.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
  }

  async createTaxRate(
    ctx: OrganizationContext,
    actor: string,
    input: CreateTaxRateDto,
  ) {
    const rate = dec(input.rate);
    if (rate.lt(0) || rate.gt(100))
      throw new BadRequestException(
        "Tax rate must be between 0 and 100 percent",
      );
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.taxRate.create({
          data: {
            organizationId: ctx.organizationId,
            name: input.name.trim(),
            code: input.code.trim().toUpperCase(),
            rate,
            description: input.description?.trim() || null,
          },
        });
        await this.audit(tx, ctx, actor, "TAX_RATE", row.id, "CREATED", {
          code: row.code,
          rate: rate.toFixed(6),
        });
        return row;
      });
    } catch (error) {
      if (unique(error))
        throw new ConflictException(
          "Tax rate code already exists in this organization",
        );
      throw error;
    }
  }

  async updateTaxRate(
    ctx: OrganizationContext,
    actor: string,
    id: string,
    input: UpdateTaxRateDto,
  ) {
    const rate = input.rate === undefined ? undefined : dec(input.rate);
    if (rate && (rate.lt(0) || rate.gt(100)))
      throw new BadRequestException(
        "Tax rate must be between 0 and 100 percent",
      );
    try {
      return await this.prisma.$transaction(async (tx) => {
        const prior = await tx.taxRate.findFirst({
          where: { organizationId: ctx.organizationId, id },
        });
        if (!prior) throw new NotFoundException("Tax rate not found");
        const row = await tx.taxRate.update({
          where: { id },
          data: {
            ...(input.name !== undefined ? { name: input.name.trim() } : {}),
            ...(input.code !== undefined
              ? { code: input.code.trim().toUpperCase() }
              : {}),
            ...(rate !== undefined ? { rate } : {}),
            ...(input.description !== undefined
              ? { description: input.description?.trim() || null }
              : {}),
            ...(input.isActive !== undefined
              ? { isActive: input.isActive }
              : {}),
          },
        });
        await this.audit(tx, ctx, actor, "TAX_RATE", id, "UPDATED", {
          fields: Object.keys(input),
        });
        return row;
      });
    } catch (error) {
      if (unique(error))
        throw new ConflictException(
          "Tax rate code already exists in this organization",
        );
      throw error;
    }
  }

  async recordPayment(
    ctx: OrganizationContext,
    actor: string,
    input: RecordPaymentDto,
    key: string,
  ) {
    const payloadHash = hash({ command: "payment.record", input });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const replay = await this.replayPayment(tx, ctx, key, payloadHash);
        if (replay) return replay;
        await this.beginKey(tx, ctx, key, payloadHash);
        await tx.$queryRaw`SELECT id FROM invoices WHERE organization_id = ${ctx.organizationId}::uuid AND id = ${input.invoiceId}::uuid FOR UPDATE`;
        const invoice = await tx.invoice.findFirst({
          where: { organizationId: ctx.organizationId, id: input.invoiceId },
          include: { salesOrder: { select: { warehouseId: true } } },
        });
        if (!invoice) throw new NotFoundException("Invoice not found");
        await this.assertWarehouse(ctx, invoice.salesOrder.warehouseId, tx);
        if (invoice.status !== InvoiceDocumentStatus.ISSUED)
          throw new ConflictException(
            "Payments can be recorded only for issued invoices",
          );
        const amount = dec(input.amount);
        const precision = currencyPrecision(invoice.currency) ?? 2;
        if (amount.lte(0) || amount.decimalPlaces() > precision)
          throw new BadRequestException(
            `Payment must be positive with at most ${precision} decimal places`,
          );
        const paid = await this.effectivePaid(
          tx,
          ctx.organizationId,
          invoice.id,
        );
        if (amount.gt(invoice.totalAmount.minus(paid)))
          throw new ConflictException(
            "Payment exceeds the invoice outstanding balance",
          );
        const payment = await tx.customerPayment.create({
          data: {
            organizationId: ctx.organizationId,
            customerId: invoice.customerId,
            paymentReference: input.paymentReference?.trim() || null,
            paymentMethod: input.method,
            currency: invoice.currency,
            amount,
            paymentDate: new Date(input.paymentDate),
            notes: input.notes?.trim() || null,
            recordedByUserId: actor,
            allocations: { create: { invoiceId: invoice.id, amount } },
          },
          include: { allocations: true, reversal: true },
        });
        await this.audit(
          tx,
          ctx,
          actor,
          "CUSTOMER_PAYMENT",
          payment.id,
          "RECORDED",
          {
            invoiceId: invoice.id,
            amount: amount.toFixed(4),
            currency: invoice.currency,
          },
        );
        await this.audit(
          tx,
          ctx,
          actor,
          "INVOICE",
          invoice.id,
          "PAYMENT_RECORDED",
          { paymentId: payment.id, amount: amount.toFixed(4) },
        );
        await this.completeKey(tx, ctx, key, payment.id, "CUSTOMER_PAYMENT");
        return payment;
      });
    } catch (error) {
      const replay = await this.tryReplayPayment(ctx, key, payloadHash);
      if (replay) return replay;
      if (unique(error))
        throw new ConflictException(
          "Payment command conflicts with an existing record",
        );
      throw error;
    }
  }

  async reversePayment(
    ctx: OrganizationContext,
    actor: string,
    id: string,
    reason: string,
    key: string,
  ) {
    const payloadHash = hash({ command: "payment.reverse", id, reason });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const replay = await this.replayPayment(tx, ctx, key, payloadHash);
        if (replay) return replay;
        await this.beginKey(tx, ctx, key, payloadHash);
        const payments = await tx.$queryRaw<
          Array<{ id: string; invoice_id: string }>
        >`
          SELECT p.id, a.invoice_id FROM customer_payments p
          JOIN payment_allocations a ON a.organization_id = p.organization_id AND a.payment_id = p.id
          WHERE p.organization_id = ${ctx.organizationId}::uuid AND p.id = ${id}::uuid
          FOR UPDATE OF p`;
        const link = payments[0];
        if (!link) throw new NotFoundException("Payment not found");
        const linkedInvoice = await tx.invoice.findFirst({
          where: { organizationId: ctx.organizationId, id: link.invoice_id },
          select: { salesOrder: { select: { warehouseId: true } } },
        });
        if (!linkedInvoice) throw new NotFoundException("Payment not found");
        await this.assertWarehouse(
          ctx,
          linkedInvoice.salesOrder.warehouseId,
          tx,
        );
        const payment = await tx.customerPayment.findFirst({
          where: { organizationId: ctx.organizationId, id },
          include: { allocations: true, reversal: true },
        });
        if (!payment) throw new NotFoundException("Payment not found");
        if (payment.reversal)
          throw new ConflictException("Payment has already been reversed");
        if (
          payment.allocations.length !== 1 ||
          !payment.allocations[0].amount.equals(payment.amount)
        )
          throw new ConflictException(
            "Payment allocation cannot be fully reconciled for reversal",
          );
        const reversal = await tx.paymentReversal.create({
          data: {
            organizationId: ctx.organizationId,
            paymentId: id,
            amount: payment.amount,
            reason: reason.trim(),
            reversedByUserId: actor,
          },
        });
        await this.audit(tx, ctx, actor, "CUSTOMER_PAYMENT", id, "REVERSED", {
          reversalId: reversal.id,
          amount: payment.amount.toFixed(4),
          reason: reason.trim(),
        });
        await this.audit(
          tx,
          ctx,
          actor,
          "INVOICE",
          link.invoice_id,
          "PAYMENT_REVERSED",
          { paymentId: id, reversalId: reversal.id },
        );
        await this.completeKey(tx, ctx, key, id, "CUSTOMER_PAYMENT");
        return { ...payment, reversal };
      });
    } catch (error) {
      const replay = await this.tryReplayPayment(ctx, key, payloadHash);
      if (replay) return replay;
      if (unique(error))
        throw new ConflictException(
          "Payment reversal conflicts with an existing record",
        );
      throw error;
    }
  }

  async listCustomerInvoices(ctx: OrganizationContext, customerId: string) {
    const warehouseIds = await this.visibleWarehouses(ctx, this.prisma);
    const customer = await this.prisma.customer.findFirst({
      where: { organizationId: ctx.organizationId, id: customerId },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException("Customer not found");
    const rows = await this.prisma.invoice.findMany({
      where: {
        organizationId: ctx.organizationId,
        customerId,
        ...(warehouseIds
          ? { salesOrder: { warehouseId: { in: warehouseIds } } }
          : {}),
      },
      include: invoiceInclude,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(presentInvoice);
  }

  async listPayments(ctx: OrganizationContext, query: PaymentListQueryDto) {
    const warehouseIds = await this.visibleWarehouses(ctx, this.prisma);
    const where: Prisma.CustomerPaymentWhereInput = {
      organizationId: ctx.organizationId,
      ...(warehouseIds
        ? {
            allocations: {
              some: {
                invoice: { salesOrder: { warehouseId: { in: warehouseIds } } },
              },
            },
          }
        : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.currency ? { currency: query.currency } : {}),
      ...(query.method ? { paymentMethod: query.method } : {}),
      ...(query.from || query.to
        ? {
            paymentDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.customerPayment.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true } },
          allocations: {
            include: {
              invoice: {
                select: { id: true, invoiceNumber: true, status: true },
              },
            },
          },
          reversal: true,
        },
        orderBy: [
          { paymentDate: "desc" },
          { createdAt: "desc" },
          { id: "desc" },
        ],
        skip: (query.page - 1) * query.page_size,
        take: query.page_size,
      }),
      this.prisma.customerPayment.count({ where }),
    ]);
    return { data, page: query.page, pageSize: query.page_size, total };
  }

  async getPayment(ctx: OrganizationContext, id: string) {
    const warehouseIds = await this.visibleWarehouses(ctx, this.prisma);
    const payment = await this.prisma.customerPayment.findFirst({
      where: {
        organizationId: ctx.organizationId,
        id,
        ...(warehouseIds
          ? {
              allocations: {
                some: {
                  invoice: {
                    salesOrder: { warehouseId: { in: warehouseIds } },
                  },
                },
              },
            }
          : {}),
      },
      include: {
        customer: true,
        allocations: {
          include: {
            invoice: {
              select: {
                id: true,
                invoiceNumber: true,
                status: true,
                currency: true,
                totalAmount: true,
                salesOrder: { select: { warehouseId: true } },
              },
            },
          },
        },
        reversal: true,
      },
    });
    if (!payment) throw new NotFoundException("Payment not found");
    return payment;
  }

  async invoicePayments(ctx: OrganizationContext, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { organizationId: ctx.organizationId, id: invoiceId },
      select: { id: true, salesOrder: { select: { warehouseId: true } } },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    await this.assertWarehouse(
      ctx,
      invoice.salesOrder.warehouseId,
      this.prisma,
    );
    return this.prisma.paymentAllocation.findMany({
      where: { organizationId: ctx.organizationId, invoiceId },
      include: {
        payment: {
          include: {
            reversal: true,
            recordedBy: { select: { user: { select: { email: true } } } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async invoiceAudit(ctx: OrganizationContext, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { organizationId: ctx.organizationId, id: invoiceId },
      select: { id: true, salesOrder: { select: { warehouseId: true } } },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    await this.assertWarehouse(
      ctx,
      invoice.salesOrder.warehouseId,
      this.prisma,
    );
    return this.prisma.auditEvent.findMany({
      where: {
        organizationId: ctx.organizationId,
        entityType: "INVOICE",
        entityId: invoiceId,
      },
      orderBy: { occurredAt: "desc" },
      take: 100,
      include: { actor: { select: { email: true } } },
    });
  }

  async listCustomerPayments(ctx: OrganizationContext, customerId: string) {
    const warehouseIds = await this.visibleWarehouses(ctx, this.prisma);
    const customer = await this.prisma.customer.findFirst({
      where: { organizationId: ctx.organizationId, id: customerId },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException("Customer not found");
    return this.prisma.customerPayment.findMany({
      where: {
        organizationId: ctx.organizationId,
        customerId,
        ...(warehouseIds
          ? {
              allocations: {
                some: {
                  invoice: {
                    salesOrder: { warehouseId: { in: warehouseIds } },
                  },
                },
              },
            }
          : {}),
      },
      include: {
        allocations: {
          include: {
            invoice: {
              select: { id: true, invoiceNumber: true, currency: true },
            },
          },
        },
        reversal: true,
      },
      orderBy: { paymentDate: "desc" },
    });
  }

  async customerSummary(ctx: OrganizationContext, customerId: string) {
    const invoices = await this.listCustomerInvoices(ctx, customerId);
    const result = new Map<
      string,
      {
        invoiced: Prisma.Decimal;
        paid: Prisma.Decimal;
        outstanding: Prisma.Decimal;
        overdue: Prisma.Decimal;
      }
    >();
    for (const invoice of invoices) {
      if (invoice.status === InvoiceDocumentStatus.VOID) continue;
      const currency = invoice.currency;
      const sum = result.get(currency) ?? {
        invoiced: dec(0),
        paid: dec(0),
        outstanding: dec(0),
        overdue: dec(0),
      };
      sum.invoiced = sum.invoiced.plus(invoice.totalAmount);
      sum.paid = sum.paid.plus(invoice.amountPaid);
      sum.outstanding = sum.outstanding.plus(invoice.outstandingAmount);
      if (invoice.isOverdue)
        sum.overdue = sum.overdue.plus(invoice.outstandingAmount);
      result.set(currency, sum);
    }
    return [...result.entries()].map(([currency, amounts]) => ({
      currency,
      ...Object.fromEntries(
        Object.entries(amounts).map(([k, v]) => [k, v.toFixed(4)]),
      ),
    }));
  }

  private async prepareLines(
    tx: Prisma.TransactionClient,
    ctx: OrganizationContext,
    orderLines: Array<{
      id: string;
      productId: string;
      productName: string;
      sku: string;
      unitCode: string;
      orderedQuantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
    }>,
    inputs: CreateInvoiceDto["lines"],
    currency: string,
  ) {
    if (
      new Set(inputs.map((line) => line.salesOrderLineId)).size !==
      inputs.length
    )
      throw new BadRequestException(
        "Invoice lines must not contain duplicates",
      );
    if (
      inputs.length !== orderLines.length ||
      orderLines.some(
        (line) => !inputs.some((i) => i.salesOrderLineId === line.id),
      )
    )
      throw new BadRequestException(
        "Invoice must include every sales order line exactly once",
      );
    const rateIds = [
      ...new Set(
        inputs.flatMap((line) => (line.taxRateId ? [line.taxRateId] : [])),
      ),
    ];
    const rates = rateIds.length
      ? await tx.taxRate.findMany({
          where: {
            organizationId: ctx.organizationId,
            id: { in: rateIds },
            isActive: true,
          },
        })
      : [];
    const byRate = new Map(rates.map((rate) => [rate.id, rate]));
    if (byRate.size !== rateIds.length)
      throw new NotFoundException(
        "Active tax rate not found in this organization",
      );
    return inputs.map((input) => {
      const orderLine = orderLines.find(
        (line) => line.id === input.salesOrderLineId,
      )!;
      const quantity = orderLine.orderedQuantity;
      const unitPrice = orderLine.unitPrice;
      const discount = dec(input.discountAmount ?? "0");
      const rate = input.taxRateId ? byRate.get(input.taxRateId)!.rate : dec(0);
      const { gross, lineSubtotal, tax, total } = calculateInvoiceLine({
        quantity,
        unitPrice,
        discountAmount: discount,
        taxRatePercent: rate,
        currency,
      });
      return {
        gross,
        discount,
        tax,
        total,
        createData: {
          salesOrderLineId: orderLine.id,
          productId: orderLine.productId,
          taxRateId: input.taxRateId ?? null,
          productNameSnapshot: orderLine.productName,
          skuSnapshot: orderLine.sku,
          unitSnapshot: orderLine.unitCode,
          quantity,
          unitPrice,
          discountAmount: discount,
          taxRateSnapshot: rate,
          lineSubtotal,
          taxAmount: tax,
          lineTotal: total,
        },
      };
    });
  }

  private async effectivePaid(
    tx: Prisma.TransactionClient,
    organizationId: string,
    invoiceId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ total: Prisma.Decimal }>>`
      SELECT COALESCE(SUM(a.amount), 0)::numeric AS total
      FROM payment_allocations a
      JOIN customer_payments p ON p.organization_id = a.organization_id AND p.id = a.payment_id
      LEFT JOIN payment_reversals r ON r.organization_id = p.organization_id AND r.payment_id = p.id
      WHERE a.organization_id = ${organizationId}::uuid AND a.invoice_id = ${invoiceId}::uuid AND r.id IS NULL`;
    return rows[0]?.total ?? dec(0);
  }

  private async visibleWarehouses(
    ctx: OrganizationContext,
    tx: Prisma.TransactionClient | PrismaService,
  ): Promise<string[] | null> {
    if (ctx.role === "OWNER" || ctx.role === "ADMIN") return null;
    const grants = await tx.membershipWarehouseGrant.findMany({
      where: { organizationId: ctx.organizationId, userId: ctx.userId },
      select: { warehouseId: true },
    });
    return grants.map((grant) => grant.warehouseId);
  }

  private async assertWarehouse(
    ctx: OrganizationContext,
    warehouseId: string,
    tx: Prisma.TransactionClient | PrismaService,
  ) {
    if (ctx.role === "OWNER" || ctx.role === "ADMIN") return;
    const grant = await tx.membershipWarehouseGrant.findUnique({
      where: {
        organizationId_userId_warehouseId: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          warehouseId,
        },
      },
      select: { warehouseId: true },
    });
    if (!grant) throw new NotFoundException("Invoice not found");
  }

  private async audit(
    tx: Prisma.TransactionClient,
    ctx: OrganizationContext,
    actor: string,
    entityType: string,
    entityId: string,
    action: string,
    metadata: Prisma.InputJsonObject,
  ) {
    await tx.auditEvent.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: actor,
        entityType,
        entityId,
        action,
        metadata,
      },
    });
  }

  private async beginKey(
    tx: Prisma.TransactionClient,
    ctx: OrganizationContext,
    key: string,
    payloadHash: string,
  ) {
    if (!key?.trim() || key.length > 160)
      throw new BadRequestException(
        "A valid Idempotency-Key header is required",
      );
    await tx.idempotencyRecord.create({
      data: { organizationId: ctx.organizationId, key, payloadHash },
    });
  }

  private async completeKey(
    tx: Prisma.TransactionClient,
    ctx: OrganizationContext,
    key: string,
    id: string,
    type: string,
  ) {
    await tx.idempotencyRecord.update({
      where: {
        organizationId_key: { organizationId: ctx.organizationId, key },
      },
      data: {
        status: IdempotencyStatus.COMPLETED,
        resultType: type,
        resultId: id,
        response: { id },
        completedAt: new Date(),
      },
    });
  }

  private async replayInvoice(
    tx: Prisma.TransactionClient,
    ctx: OrganizationContext,
    key: string,
    payloadHash: string,
  ) {
    const prior = await tx.idempotencyRecord.findUnique({
      where: {
        organizationId_key: { organizationId: ctx.organizationId, key },
      },
    });
    if (!prior) return null;
    if (prior.payloadHash !== payloadHash)
      throw new ConflictException(
        "Idempotency key was already used with a different payload",
      );
    if (
      prior.status !== IdempotencyStatus.COMPLETED ||
      prior.resultType !== "INVOICE" ||
      !prior.resultId
    )
      throw new ConflictException(
        "A command with this key is still in progress",
      );
    const invoice = await tx.invoice.findFirst({
      where: { organizationId: ctx.organizationId, id: prior.resultId },
      include: invoiceInclude,
    });
    if (!invoice)
      throw new ConflictException(
        "Stored invoice command result is unavailable",
      );
    await this.assertWarehouse(ctx, invoice.salesOrder.warehouseId, tx);
    return invoice;
  }

  private async replayPayment(
    tx: Prisma.TransactionClient,
    ctx: OrganizationContext,
    key: string,
    payloadHash: string,
  ) {
    if (!key?.trim() || key.length > 160)
      throw new BadRequestException(
        "A valid Idempotency-Key header is required",
      );
    const prior = await tx.idempotencyRecord.findUnique({
      where: {
        organizationId_key: { organizationId: ctx.organizationId, key },
      },
    });
    if (!prior) return null;
    if (prior.payloadHash !== payloadHash)
      throw new ConflictException(
        "Idempotency key was already used with a different payload",
      );
    if (
      prior.status !== IdempotencyStatus.COMPLETED ||
      prior.resultType !== "CUSTOMER_PAYMENT" ||
      !prior.resultId
    )
      throw new ConflictException(
        "A command with this key is still in progress",
      );
    const payment = await tx.customerPayment.findFirst({
      where: { organizationId: ctx.organizationId, id: prior.resultId },
      include: {
        allocations: {
          include: {
            invoice: {
              select: { salesOrder: { select: { warehouseId: true } } },
            },
          },
        },
        reversal: true,
      },
    });
    if (!payment)
      throw new ConflictException(
        "Stored payment command result is unavailable",
      );
    for (const allocation of payment.allocations) {
      await this.assertWarehouse(
        ctx,
        allocation.invoice.salesOrder.warehouseId,
        tx,
      );
    }
    return payment;
  }

  private async tryReplayInvoice(
    ctx: OrganizationContext,
    key: string,
    payloadHash: string,
  ) {
    if (!key) return null;
    return this.prisma
      .$transaction((tx) => this.replayInvoice(tx, ctx, key, payloadHash))
      .then((row) => (row ? presentInvoice(row) : null))
      .catch(() => null);
  }

  private async tryReplayPayment(
    ctx: OrganizationContext,
    key: string,
    payloadHash: string,
  ) {
    if (!key) return null;
    return this.prisma
      .$transaction((tx) => this.replayPayment(tx, ctx, key, payloadHash))
      .catch(() => null);
  }
}

function presentInvoice<
  T extends {
    status: InvoiceDocumentStatus;
    totalAmount: Prisma.Decimal;
    currency: string;
    dueDate: Date | null;
    allocations: Array<{
      amount: Prisma.Decimal;
      payment: { reversal: unknown | null };
    }>;
  },
>(row: T) {
  const amountPaid = row.allocations.reduce(
    (sum, allocation) =>
      allocation.payment.reversal ? sum : sum.plus(allocation.amount),
    dec(0),
  );
  const outstandingAmount =
    row.status === InvoiceDocumentStatus.VOID
      ? dec(0)
      : row.totalAmount.minus(amountPaid);
  const isOverdue =
    row.status !== InvoiceDocumentStatus.DRAFT &&
    row.status !== InvoiceDocumentStatus.VOID &&
    outstandingAmount.gt(0) &&
    !!row.dueDate &&
    row.dueDate < new Date(new Date().toISOString().slice(0, 10));
  const paymentStatus =
    row.status === InvoiceDocumentStatus.DRAFT
      ? "DRAFT"
      : row.status === InvoiceDocumentStatus.VOID
        ? "VOID"
        : outstandingAmount.eq(0)
          ? "PAID"
          : amountPaid.gt(0)
            ? "PARTIALLY_PAID"
            : "UNPAID";
  return { ...row, amountPaid, outstandingAmount, paymentStatus, isOverdue };
}

function customerSnapshot(customer: {
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingCity: string | null;
  billingRegion: string | null;
  billingPostalCode: string | null;
  billingCountryCode: string | null;
}): Prisma.InputJsonObject {
  return {
    name: customer.name,
    contactName: customer.contactName,
    email: customer.email,
    phone: customer.phone,
    billingAddressLine1: customer.billingAddressLine1,
    billingAddressLine2: customer.billingAddressLine2,
    billingCity: customer.billingCity,
    billingRegion: customer.billingRegion,
    billingPostalCode: customer.billingPostalCode,
    billingCountryCode: customer.billingCountryCode,
  };
}

function jsonRecord(
  value: Prisma.JsonValue | null,
): Record<string, string | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, string | null>;
}

function dec(value: string | number | Prisma.Decimal) {
  return new Prisma.Decimal(value);
}
function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function unique(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
