import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import {
  CatalogStatus,
  CustomerStatus,
  IdempotencyStatus,
  InventoryReservationStatus,
  MembershipRole,
  ProductType,
  SalesOrderStatus,
} from "../generated/prisma/enums";
import { PrismaService } from "../database/prisma.service";
import type { OrganizationContext } from "../organizations/organization-context.guard";
import { InventoryPostingService } from "../inventory/inventory-posting.service";
import {
  CreateSalesFulfillmentDto,
  CreateSalesOrderDto,
  SalesOrderListQueryDto,
  UpdateSalesOrderDto,
} from "./sales-orders.dto";

const detailInclude = {
  customer: true,
  warehouse: true,
  lines: {
    include: {
      product: { include: { baseUnit: true } },
      reservation: {
        include: { history: { orderBy: { occurredAt: "asc" as const } } },
      },
    },
    orderBy: { createdAt: "asc" as const },
  },
  statusHistory: { orderBy: { occurredAt: "asc" as const } },
};

@Injectable()
export class SalesOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: InventoryPostingService,
  ) {}

  private async requireWarehouse(
    ctx: OrganizationContext,
    tx: Prisma.TransactionClient | PrismaService,
    warehouseId: string,
  ) {
    const warehouse = await tx.warehouse.findFirst({
      where: {
        organizationId: ctx.organizationId,
        id: warehouseId,
        status: "ACTIVE",
      },
      select: { id: true, name: true },
    });
    if (!warehouse) throw new NotFoundException("Active warehouse not found");
    if (
      ctx.role !== MembershipRole.OWNER &&
      ctx.role !== MembershipRole.ADMIN
    ) {
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
      if (!grant) throw new NotFoundException("Warehouse not found");
    }
    return warehouse;
  }

  private async prepareLines(
    tx: Prisma.TransactionClient | PrismaService,
    ctx: OrganizationContext,
    input: CreateSalesOrderDto["lines"],
    currency: string,
  ) {
    if (new Set(input.map((line) => line.productId)).size !== input.length)
      throw new ConflictException("A product may appear only once per order");
    const products = await tx.product.findMany({
      where: {
        organizationId: ctx.organizationId,
        id: { in: input.map((line) => line.productId) },
        status: CatalogStatus.ACTIVE,
        type: ProductType.STOCKED,
        trackInventory: true,
      },
      include: { baseUnit: true, unitConversions: { include: { unit: true } } },
    });
    const byId = new Map(products.map((product) => [product.id, product]));
    if (byId.size !== input.length)
      throw new NotFoundException(
        "One or more active stocked products were not found",
      );
    return input.map((line) => {
      const product = byId.get(line.productId)!;
      const quantity = new Prisma.Decimal(line.quantity);
      const unitPrice = new Prisma.Decimal(line.unitPrice);
      if (quantity.lte(0) || quantity.decimalPlaces() > 6)
        throw new ConflictException(
          "Quantity must be positive with at most 6 decimal places",
        );
      if (unitPrice.isNegative() || unitPrice.decimalPlaces() > 4)
        throw new ConflictException(
          "Unit price must be non-negative with at most 4 decimal places",
        );
      if (product.saleCurrency && product.saleCurrency !== currency)
        throw new ConflictException(
          `Product ${product.sku} has a different configured sale currency`,
        );
      const unit = line.unitId
        ? line.unitId === product.baseUnitId
          ? product.baseUnit
          : product.unitConversions.find(
              (conversion) => conversion.unitId === line.unitId,
            )?.unit
        : product.baseUnit;
      if (!unit || unit.status !== CatalogStatus.ACTIVE)
        throw new NotFoundException(
          `An active unit conversion for ${product.sku} was not found`,
        );
      if (quantity.decimalPlaces() > unit.precision)
        throw new ConflictException(
          `Quantity precision exceeds the selected ${unit.code} unit precision`,
        );
      const factor =
        line.unitId && line.unitId !== product.baseUnitId
          ? product.unitConversions.find(
              (conversion) => conversion.unitId === line.unitId,
            )?.baseQuantity
          : new Prisma.Decimal(1);
      if (!factor)
        throw new NotFoundException(
          `An active unit conversion for ${product.sku} was not found`,
        );
      const baseQuantity = quantity.mul(factor);
      if (baseQuantity.decimalPlaces() > 6)
        throw new ConflictException(
          `Converted quantity for ${product.sku} exceeds base-unit precision`,
        );
      const lineTotal = quantity
        .mul(unitPrice)
        .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
      return {
        productId: product.id,
        unitId: unit.id,
        productName: product.name,
        sku: product.sku,
        unitCode: unit.code,
        orderedQuantity: quantity,
        baseQuantity,
        unitPrice,
        lineTotal,
      };
    });
  }

  async list(ctx: OrganizationContext, query: SalesOrderListQueryDto) {
    const visibleWarehouseIds =
      ctx.role === MembershipRole.OWNER || ctx.role === MembershipRole.ADMIN
        ? undefined
        : (
            await this.prisma.membershipWarehouseGrant.findMany({
              where: { organizationId: ctx.organizationId, userId: ctx.userId },
              select: { warehouseId: true },
            })
          ).map((grant) => grant.warehouseId);
    const where: Prisma.SalesOrderWhereInput = {
      organizationId: ctx.organizationId,
      ...(visibleWarehouseIds
        ? { warehouseId: { in: visibleWarehouseIds } }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.from || query.to
        ? {
            orderDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.q
        ? { number: { contains: query.q.trim(), mode: "insensitive" } }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.salesOrder.findMany({
        where,
        include: {
          customer: { select: { name: true } },
          warehouse: { select: { name: true } },
          lines: {
            select: {
              orderedQuantity: true,
              fulfilledQuantity: true,
              lineTotal: true,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.page_size,
        take: query.page_size,
      }),
      this.prisma.salesOrder.count({ where }),
    ]);
    return { data, total, page: query.page, page_size: query.page_size };
  }

  async get(ctx: OrganizationContext, id: string) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: detailInclude,
    });
    if (!order) throw new NotFoundException("Sales order not found");
    await this.requireWarehouse(ctx, this.prisma, order.warehouseId);
    return order;
  }

  async auditHistory(ctx: OrganizationContext, id: string) {
    await this.get(ctx, id);
    return this.prisma.auditEvent.findMany({
      where: {
        organizationId: ctx.organizationId,
        entityType: "SALES_ORDER",
        entityId: id,
      },
      include: { actor: { select: { email: true } } },
      orderBy: { occurredAt: "desc" },
      take: 100,
    });
  }

  private async nextNumber(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ) {
    const rows = await tx.$queryRaw<{ next_number: bigint }[]>(Prisma.sql`
      INSERT INTO sales_order_sequences (organization_id,next_number)
      VALUES (${organizationId}::uuid,2)
      ON CONFLICT (organization_id)
      DO UPDATE SET next_number=sales_order_sequences.next_number+1
      RETURNING next_number-1 AS next_number
    `);
    return `SO-${String(rows[0].next_number).padStart(6, "0")}`;
  }

  async create(
    ctx: OrganizationContext,
    actor: string,
    input: CreateSalesOrderDto,
    key: string,
    attempt = 0,
  ): Promise<unknown> {
    this.requireKey(key);
    await this.requireWarehouse(ctx, this.prisma, input.warehouseId);
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: input.customerId,
        organizationId: ctx.organizationId,
        status: CustomerStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException("Active customer not found");
    const payloadHash = hash({ command: "create", input });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const replay = await this.replay(tx, ctx, key, payloadHash);
        if (replay) return replay;
        await tx.idempotencyRecord.create({
          data: { organizationId: ctx.organizationId, key, payloadHash },
        });
        await this.requireWarehouse(ctx, tx, input.warehouseId);
        const validCustomer = await tx.customer.findFirst({
          where: {
            id: input.customerId,
            organizationId: ctx.organizationId,
            status: CustomerStatus.ACTIVE,
          },
          select: { id: true },
        });
        if (!validCustomer)
          throw new NotFoundException("Active customer not found");
        const lines = await this.prepareLines(
          tx,
          ctx,
          input.lines,
          input.currency,
        );
        const subtotal = lines
          .reduce(
            (total, line) => total.plus(line.lineTotal),
            new Prisma.Decimal(0),
          )
          .toDecimalPlaces(4);
        const number = await this.nextNumber(tx, ctx.organizationId);
        const order = await tx.salesOrder.create({
          data: {
            organizationId: ctx.organizationId,
            customerId: input.customerId,
            warehouseId: input.warehouseId,
            createdByUserId: actor,
            number,
            currency: input.currency,
            orderDate: input.orderDate ? new Date(input.orderDate) : new Date(),
            expectedFulfillmentAt: input.expectedFulfillmentAt
              ? new Date(input.expectedFulfillmentAt)
              : null,
            notes: input.notes?.trim() || null,
            subtotal,
            total: subtotal,
            lines: { create: lines },
          },
        });
        await tx.salesOrderStatusHistory.create({
          data: {
            organizationId: ctx.organizationId,
            salesOrderId: order.id,
            fromStatus: null,
            toStatus: SalesOrderStatus.DRAFT,
            actorUserId: actor,
          },
        });
        await this.event(tx, ctx, actor, order.id, "CREATED", { number });
        await tx.idempotencyRecord.update({
          where: {
            organizationId_key: { organizationId: ctx.organizationId, key },
          },
          data: {
            status: IdempotencyStatus.COMPLETED,
            resultType: "SALES_ORDER",
            resultId: order.id,
            response: { salesOrderId: order.id },
            completedAt: new Date(),
          },
        });
        return this.getInTransaction(tx, ctx, order.id);
      });
    } catch (error) {
      if (isSerialization(error) && attempt < 2)
        return this.create(ctx, actor, input, key, attempt + 1);
      if (isUnique(error)) {
        const replay = await this.replay(this.prisma, ctx, key, payloadHash);
        if (replay) return replay;
        throw new ConflictException(
          "Sales order number or idempotency key conflicts with an existing record",
        );
      }
      throw error;
    }
  }

  async update(
    ctx: OrganizationContext,
    actor: string,
    id: string,
    input: UpdateSalesOrderDto,
  ) {
    const current = await this.prisma.salesOrder.findFirst({
      where: {
        id,
        organizationId: ctx.organizationId,
        status: SalesOrderStatus.DRAFT,
      },
      select: { id: true, updatedAt: true },
    });
    if (!current) throw new NotFoundException("Draft sales order not found");
    await this.requireWarehouse(ctx, this.prisma, input.warehouseId);
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: input.customerId,
        organizationId: ctx.organizationId,
        status: CustomerStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException("Active customer not found");
    const lines = await this.prepareLines(
      this.prisma,
      ctx,
      input.lines,
      input.currency,
    );
    const subtotal = lines
      .reduce(
        (total, line) => total.plus(line.lineTotal),
        new Prisma.Decimal(0),
      )
      .toDecimalPlaces(4);
    await this.prisma.$transaction(
      async (tx) => {
        const updated = await tx.salesOrder.updateMany({
          where: {
            id,
            organizationId: ctx.organizationId,
            status: SalesOrderStatus.DRAFT,
            updatedAt: current.updatedAt,
          },
          data: {
            customerId: input.customerId,
            warehouseId: input.warehouseId,
            currency: input.currency,
            orderDate: input.orderDate ? new Date(input.orderDate) : new Date(),
            expectedFulfillmentAt: input.expectedFulfillmentAt
              ? new Date(input.expectedFulfillmentAt)
              : null,
            notes: input.notes?.trim() || null,
            subtotal,
            total: subtotal,
          },
        });
        if (updated.count !== 1)
          throw new ConflictException(
            "Sales order changed; reload and try again",
          );
        await tx.salesOrderLine.deleteMany({
          where: { organizationId: ctx.organizationId, salesOrderId: id },
        });
        await tx.salesOrderLine.createMany({
          data: lines.map((line) => ({
            ...line,
            organizationId: ctx.organizationId,
            salesOrderId: id,
          })),
        });
        await this.event(tx, ctx, actor, id, "UPDATED", {
          lineCount: lines.length,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.get(ctx, id);
  }

  async confirm(
    ctx: OrganizationContext,
    actor: string,
    id: string,
    key: string,
    attempt = 0,
  ): Promise<unknown> {
    this.requireKey(key);
    const payloadHash = hash({ command: "confirm", id });
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const replay = await this.replay(tx, ctx, key, payloadHash);
          if (replay) return;
          await tx.idempotencyRecord.create({
            data: { organizationId: ctx.organizationId, key, payloadHash },
          });
          const rows = await tx.$queryRaw<
            { id: string; status: SalesOrderStatus; warehouse_id: string }[]
          >(Prisma.sql`
          SELECT id,status,warehouse_id FROM sales_orders
          WHERE id=${id}::uuid AND organization_id=${ctx.organizationId}::uuid FOR UPDATE
        `);
          const order = rows[0];
          if (!order) throw new NotFoundException("Sales order not found");
          await this.requireWarehouse(ctx, tx, order.warehouse_id);
          if (order.status !== SalesOrderStatus.DRAFT)
            throw new ConflictException("Only draft orders can be confirmed");
          const customer = await tx.customer.findFirst({
            where: {
              id: (await tx.salesOrder.findUniqueOrThrow({ where: { id } }))
                .customerId,
              organizationId: ctx.organizationId,
              status: CustomerStatus.ACTIVE,
            },
            select: { id: true },
          });
          if (!customer)
            throw new ConflictException(
              "The customer must remain active when confirming an order",
            );
          const lines = await tx.salesOrderLine.findMany({
            where: { organizationId: ctx.organizationId, salesOrderId: id },
            include: {
              product: {
                select: { status: true, type: true, trackInventory: true },
              },
            },
            orderBy: { productId: "asc" },
          });
          if (!lines.length)
            throw new ConflictException(
              "An order must contain at least one line",
            );
          for (const line of lines) {
            if (
              line.product.status !== CatalogStatus.ACTIVE ||
              line.product.type !== ProductType.STOCKED ||
              !line.product.trackInventory
            )
              throw new ConflictException(
                `Product ${line.sku} is no longer available for sale`,
              );
            await this.posting.applyReservationDelta(
              tx,
              ctx,
              order.warehouse_id,
              line.productId,
              line.baseQuantity,
            );
            const reservation = await tx.inventoryReservation.create({
              data: {
                organizationId: ctx.organizationId,
                salesOrderId: id,
                salesOrderLineId: line.id,
                warehouseId: order.warehouse_id,
                productId: line.productId,
                quantity: line.baseQuantity,
              },
            });
            await tx.inventoryReservationHistory.create({
              data: {
                organizationId: ctx.organizationId,
                reservationId: reservation.id,
                fromStatus: null,
                toStatus: InventoryReservationStatus.ACTIVE,
                quantityDelta: line.baseQuantity,
                actorUserId: actor,
                reason: "ORDER_CONFIRMED",
              },
            });
          }
          await tx.salesOrder.update({
            where: { id },
            data: {
              status: SalesOrderStatus.CONFIRMED,
              confirmedAt: new Date(),
            },
          });
          await tx.salesOrderStatusHistory.create({
            data: {
              organizationId: ctx.organizationId,
              salesOrderId: id,
              fromStatus: SalesOrderStatus.DRAFT,
              toStatus: SalesOrderStatus.CONFIRMED,
              actorUserId: actor,
            },
          });
          await this.event(tx, ctx, actor, id, "CONFIRMED", {
            lineCount: lines.length,
          });
          await this.completeKey(tx, ctx, key, id);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isSerialization(error) && attempt < 2)
        return this.confirm(ctx, actor, id, key, attempt + 1);
      if (isUnique(error)) {
        const replay = await this.replay(this.prisma, ctx, key, payloadHash);
        if (replay) return replay;
        throw new ConflictException("Idempotency key was already used");
      }
      throw error;
    }
    return this.get(ctx, id);
  }

  async cancel(
    ctx: OrganizationContext,
    actor: string,
    id: string,
    key: string,
    attempt = 0,
  ): Promise<unknown> {
    this.requireKey(key);
    const payloadHash = hash({ command: "cancel", id });
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const replay = await this.replay(tx, ctx, key, payloadHash);
          if (replay) return;
          await tx.idempotencyRecord.create({
            data: { organizationId: ctx.organizationId, key, payloadHash },
          });
          const rows = await tx.$queryRaw<
            { status: SalesOrderStatus; warehouse_id: string }[]
          >(Prisma.sql`
          SELECT status,warehouse_id FROM sales_orders
          WHERE id=${id}::uuid AND organization_id=${ctx.organizationId}::uuid FOR UPDATE
        `);
          const order = rows[0];
          if (!order) throw new NotFoundException("Sales order not found");
          await this.requireWarehouse(ctx, tx, order.warehouse_id);
          if (
            order.status !== SalesOrderStatus.DRAFT &&
            order.status !== SalesOrderStatus.CONFIRMED
          )
            throw new ConflictException(
              "Only draft or unfulfilled confirmed orders can be cancelled",
            );
          const reservations = await tx.inventoryReservation.findMany({
            where: {
              organizationId: ctx.organizationId,
              salesOrderId: id,
              status: InventoryReservationStatus.ACTIVE,
            },
            orderBy: [{ warehouseId: "asc" }, { productId: "asc" }],
          });
          for (const reservation of reservations) {
            const remaining = reservation.quantity
              .minus(reservation.fulfilledQuantity)
              .minus(reservation.releasedQuantity);
            if (remaining.gt(0)) {
              await this.posting.applyReservationDelta(
                tx,
                ctx,
                reservation.warehouseId,
                reservation.productId,
                remaining.negated(),
              );
              await tx.inventoryReservation.update({
                where: { id: reservation.id },
                data: {
                  releasedQuantity: { increment: remaining },
                  status: InventoryReservationStatus.RELEASED,
                },
              });
              await tx.inventoryReservationHistory.create({
                data: {
                  organizationId: ctx.organizationId,
                  reservationId: reservation.id,
                  fromStatus: InventoryReservationStatus.ACTIVE,
                  toStatus: InventoryReservationStatus.RELEASED,
                  quantityDelta: remaining.negated(),
                  actorUserId: actor,
                  reason: "ORDER_CANCELLED",
                },
              });
            }
          }
          await tx.salesOrder.update({
            where: { id },
            data: {
              status: SalesOrderStatus.CANCELLED,
              cancelledAt: new Date(),
            },
          });
          await tx.salesOrderStatusHistory.create({
            data: {
              organizationId: ctx.organizationId,
              salesOrderId: id,
              fromStatus: order.status,
              toStatus: SalesOrderStatus.CANCELLED,
              actorUserId: actor,
            },
          });
          await this.event(tx, ctx, actor, id, "CANCELLED", {
            reservationsReleased: reservations.length,
          });
          await this.completeKey(tx, ctx, key, id);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isSerialization(error) && attempt < 2)
        return this.cancel(ctx, actor, id, key, attempt + 1);
      if (isUnique(error)) {
        const replay = await this.replay(this.prisma, ctx, key, payloadHash);
        if (replay) return replay;
        throw new ConflictException("Idempotency key was already used");
      }
      throw error;
    }
    return this.get(ctx, id);
  }

  async fulfillments(ctx: OrganizationContext, id: string) {
    await this.get(ctx, id);
    return this.prisma.salesFulfillment.findMany({
      where: { organizationId: ctx.organizationId, salesOrderId: id },
      include: {
        postedBy: { include: { user: { select: { email: true } } } },
        lines: {
          include: {
            salesOrderLine: {
              select: { productName: true, sku: true, unitCode: true },
            },
            movement: true,
          },
        },
      },
      orderBy: { postedAt: "asc" },
    });
  }

  async fulfill(
    ctx: OrganizationContext,
    actor: string,
    orderId: string,
    key: string,
    input: CreateSalesFulfillmentDto,
    attempt = 0,
  ): Promise<unknown> {
    this.requireKey(key);
    if (input.lines.length > 100)
      throw new ConflictException(
        "A fulfillment cannot contain more than 100 lines",
      );
    if (
      new Set(input.lines.map((line) => line.salesOrderLineId)).size !==
      input.lines.length
    )
      throw new ConflictException(
        "A sales order line may appear only once per fulfillment",
      );
    const payloadHash = hash({ command: "fulfill", orderId, input });
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const prior = await tx.idempotencyRecord.findUnique({
            where: {
              organizationId_key: { organizationId: ctx.organizationId, key },
            },
          });
          if (prior) {
            if (prior.payloadHash !== payloadHash)
              throw new ConflictException(
                "Idempotency key was already used with a different payload",
              );
            if (prior.status !== IdempotencyStatus.COMPLETED || !prior.resultId)
              throw new ConflictException(
                "A command with this key is still in progress",
              );
            const previous = await tx.salesFulfillment.findFirst({
              where: {
                organizationId: ctx.organizationId,
                id: prior.resultId,
                salesOrderId: orderId,
              },
              include: { lines: true },
            });
            if (!previous)
              throw new ConflictException(
                "Stored fulfillment result is unavailable",
              );
            return;
          }
          await tx.idempotencyRecord.create({
            data: { organizationId: ctx.organizationId, key, payloadHash },
          });
          const locked = await tx.$queryRaw<
            { status: SalesOrderStatus; warehouse_id: string }[]
          >(Prisma.sql`
            SELECT status,warehouse_id FROM sales_orders
            WHERE id=${orderId}::uuid AND organization_id=${ctx.organizationId}::uuid FOR UPDATE
          `);
          const order = locked[0];
          if (!order) throw new NotFoundException("Sales order not found");
          await this.requireWarehouse(ctx, tx, order.warehouse_id);
          if (
            order.status !== SalesOrderStatus.CONFIRMED &&
            order.status !== SalesOrderStatus.PARTIALLY_FULFILLED
          )
            throw new ConflictException(
              "Only confirmed orders can be fulfilled",
            );
          const lineIds = input.lines.map((line) => line.salesOrderLineId);
          const orderLines = await tx.salesOrderLine.findMany({
            where: {
              organizationId: ctx.organizationId,
              salesOrderId: orderId,
              warehouseId: order.warehouse_id,
              id: { in: lineIds },
            },
            include: {
              unit: { select: { precision: true } },
              reservation: true,
            },
            orderBy: { productId: "asc" },
          });
          if (orderLines.length !== input.lines.length)
            throw new NotFoundException(
              "One or more sales order lines were not found",
            );
          const byId = new Map(orderLines.map((line) => [line.id, line]));
          const prepared = input.lines
            .map((item) => {
              const line = byId.get(item.salesOrderLineId)!;
              const quantity = new Prisma.Decimal(item.quantity);
              if (
                quantity.lte(0) ||
                quantity.decimalPlaces() > line.unit.precision
              )
                throw new ConflictException(
                  `Fulfillment quantity for ${line.sku} must be positive and match ${line.unitCode} precision`,
                );
              if (
                line.fulfilledQuantity.plus(quantity).gt(line.orderedQuantity)
              )
                throw new ConflictException(
                  `Fulfillment exceeds the outstanding quantity for ${line.sku}`,
                );
              if (
                !line.reservation ||
                line.reservation.status !== InventoryReservationStatus.ACTIVE
              )
                throw new ConflictException(
                  `An active reservation for ${line.sku} is unavailable`,
                );
              const baseQuantity = quantity
                .mul(line.baseQuantity)
                .div(line.orderedQuantity);
              if (baseQuantity.decimalPlaces() > 6)
                throw new ConflictException(
                  `Converted fulfillment quantity for ${line.sku} exceeds base-unit precision`,
                );
              const reservationRemaining = line.reservation.quantity
                .minus(line.reservation.fulfilledQuantity)
                .minus(line.reservation.releasedQuantity);
              if (baseQuantity.gt(reservationRemaining))
                throw new ConflictException(
                  `Fulfillment exceeds the remaining reserved quantity for ${line.sku}`,
                );
              return {
                line,
                reservation: line.reservation,
                quantity,
                baseQuantity,
              };
            })
            .sort((a, b) => a.line.productId.localeCompare(b.line.productId));

          const fulfillment = await tx.salesFulfillment.create({
            data: {
              organizationId: ctx.organizationId,
              salesOrderId: orderId,
              idempotencyKey: key,
              note: input.note?.trim() || null,
              postedByUserId: actor,
            },
          });
          for (const item of prepared) {
            const fulfillmentLineId = randomUUID();
            const movementKey = `sales-fulfill:${createHash("sha256").update(`${key}:${item.line.id}`).digest("hex")}`;
            const movement = await this.posting.postWarehouseMovement(
              ctx,
              actor,
              movementKey,
              {
                warehouseId: order.warehouse_id,
                productId: item.line.productId,
                documentType: "SALES_FULFILLMENT",
                documentId: fulfillment.id,
                documentLineId: fulfillmentLineId,
                movementType: "SALE_FULFILLMENT",
                quantityDelta: item.baseQuantity.negated().toFixed(6),
                reservedDelta: item.baseQuantity.negated().toFixed(6),
              },
              tx,
            );
            await tx.salesFulfillmentLine.create({
              data: {
                id: fulfillmentLineId,
                organizationId: ctx.organizationId,
                fulfillmentId: fulfillment.id,
                salesOrderLineId: item.line.id,
                reservationId: item.reservation.id,
                productId: item.line.productId,
                quantity: item.quantity,
                baseQuantity: item.baseQuantity,
                movementId: movement.id,
              },
            });
            const fulfilled = item.line.fulfilledQuantity.plus(item.quantity);
            await tx.salesOrderLine.update({
              where: { id: item.line.id },
              data: { fulfilledQuantity: fulfilled },
            });
            const reservationFulfilled =
              item.reservation.fulfilledQuantity.plus(item.baseQuantity);
            const reservationStatus = reservationFulfilled
              .plus(item.reservation.releasedQuantity)
              .equals(item.reservation.quantity)
              ? InventoryReservationStatus.CONSUMED
              : InventoryReservationStatus.ACTIVE;
            await tx.inventoryReservation.update({
              where: { id: item.reservation.id },
              data: {
                fulfilledQuantity: reservationFulfilled,
                status: reservationStatus,
              },
            });
            await tx.inventoryReservationHistory.create({
              data: {
                organizationId: ctx.organizationId,
                reservationId: item.reservation.id,
                fromStatus: item.reservation.status,
                toStatus: reservationStatus,
                quantityDelta: item.baseQuantity.negated(),
                actorUserId: actor,
                reason: "FULFILLMENT_POSTED",
              },
            });
          }
          const afterLines = await tx.salesOrderLine.findMany({
            where: {
              organizationId: ctx.organizationId,
              salesOrderId: orderId,
            },
            select: { orderedQuantity: true, fulfilledQuantity: true },
          });
          const complete = afterLines.every((line) =>
            line.fulfilledQuantity.equals(line.orderedQuantity),
          );
          const nextStatus = complete
            ? SalesOrderStatus.FULFILLED
            : SalesOrderStatus.PARTIALLY_FULFILLED;
          if (nextStatus !== order.status) {
            await tx.salesOrder.update({
              where: { id: orderId },
              data: { status: nextStatus },
            });
            await tx.salesOrderStatusHistory.create({
              data: {
                organizationId: ctx.organizationId,
                salesOrderId: orderId,
                fromStatus: order.status,
                toStatus: nextStatus,
                actorUserId: actor,
              },
            });
          }
          await this.event(tx, ctx, actor, orderId, "FULFILLMENT_POSTED", {
            fulfillmentId: fulfillment.id,
            lineCount: prepared.length,
            status: nextStatus,
          });
          await tx.idempotencyRecord.update({
            where: {
              organizationId_key: { organizationId: ctx.organizationId, key },
            },
            data: {
              status: IdempotencyStatus.COMPLETED,
              resultType: "SALES_FULFILLMENT",
              resultId: fulfillment.id,
              response: { fulfillmentId: fulfillment.id },
              completedAt: new Date(),
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isSerialization(error) && attempt < 2)
        return this.fulfill(ctx, actor, orderId, key, input, attempt + 1);
      if (isUnique(error)) {
        const prior = await this.prisma.idempotencyRecord.findUnique({
          where: {
            organizationId_key: { organizationId: ctx.organizationId, key },
          },
        });
        if (prior?.payloadHash !== payloadHash)
          throw new ConflictException(
            "Idempotency key was already used with a different payload",
          );
        if (prior?.status === IdempotencyStatus.COMPLETED && prior.resultId)
          return this.prisma.salesFulfillment.findFirst({
            where: {
              organizationId: ctx.organizationId,
              id: prior.resultId,
              salesOrderId: orderId,
            },
            include: { lines: true },
          });
        throw new ConflictException("Idempotency key was already used");
      }
      throw error;
    }
    const result = await this.prisma.salesFulfillment.findFirst({
      where: {
        organizationId: ctx.organizationId,
        idempotencyKey: key,
        salesOrderId: orderId,
      },
      include: { lines: true },
    });
    if (!result)
      throw new ConflictException("Fulfillment result could not be loaded");
    return result;
  }

  async reconcileReservations(
    ctx: OrganizationContext,
    warehouseId: string,
    productId: string,
  ) {
    await this.requireWarehouse(ctx, this.prisma, warehouseId);
    const [balance, aggregate] = await Promise.all([
      this.prisma.inventoryBalance.findUnique({
        where: {
          organizationId_warehouseId_productId: {
            organizationId: ctx.organizationId,
            warehouseId,
            productId,
          },
        },
      }),
      this.prisma.inventoryReservation.aggregate({
        where: {
          organizationId: ctx.organizationId,
          warehouseId,
          productId,
          status: InventoryReservationStatus.ACTIVE,
        },
        _sum: {
          quantity: true,
          fulfilledQuantity: true,
          releasedQuantity: true,
        },
      }),
    ]);
    const active = (aggregate._sum.quantity ?? new Prisma.Decimal(0))
      .minus(aggregate._sum.fulfilledQuantity ?? 0)
      .minus(aggregate._sum.releasedQuantity ?? 0);
    return {
      warehouseId,
      productId,
      balanceReserved: balance?.reserved ?? new Prisma.Decimal(0),
      activeReservations: active,
      reconciled: (balance?.reserved ?? new Prisma.Decimal(0)).equals(active),
    };
  }

  private requireKey(key: string) {
    if (!key || key.length > 160)
      throw new ConflictException("A valid Idempotency-Key is required");
  }

  private async replay(
    tx: Prisma.TransactionClient | PrismaService,
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
    if (prior.status !== IdempotencyStatus.COMPLETED || !prior.resultId)
      throw new ConflictException(
        "A command with this key is still in progress",
      );
    const order = await tx.salesOrder.findFirst({
      where: { organizationId: ctx.organizationId, id: prior.resultId },
      include: detailInclude,
    });
    if (!order)
      throw new ConflictException("Stored sales order result is unavailable");
    return order;
  }

  private async completeKey(
    tx: Prisma.TransactionClient,
    ctx: OrganizationContext,
    key: string,
    id: string,
  ) {
    await tx.idempotencyRecord.update({
      where: {
        organizationId_key: { organizationId: ctx.organizationId, key },
      },
      data: {
        status: IdempotencyStatus.COMPLETED,
        resultType: "SALES_ORDER",
        resultId: id,
        response: { salesOrderId: id },
        completedAt: new Date(),
      },
    });
  }

  private async getInTransaction(
    tx: Prisma.TransactionClient,
    ctx: OrganizationContext,
    id: string,
  ) {
    return tx.salesOrder.findFirstOrThrow({
      where: { id, organizationId: ctx.organizationId },
      include: detailInclude,
    });
  }

  private async event(
    tx: Prisma.TransactionClient,
    ctx: OrganizationContext,
    actor: string,
    id: string,
    action: string,
    metadata: Prisma.InputJsonObject,
  ) {
    await tx.auditEvent.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: actor,
        entityType: "SALES_ORDER",
        entityId: id,
        action,
        metadata,
      },
    });
    await tx.outboxEvent.create({
      data: {
        organizationId: ctx.organizationId,
        eventType: `sales.order.${action.toLowerCase()}`,
        aggregateType: "SALES_ORDER",
        aggregateId: id,
        payload: { salesOrderId: id, ...metadata },
      },
    });
  }
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isUnique(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function isSerialization(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as {
    code?: unknown;
    meta?: { code?: unknown; message?: unknown };
  };
  return (
    candidate.code === "P2034" ||
    candidate.meta?.code === "40001" ||
    (typeof candidate.meta?.message === "string" &&
      candidate.meta.message.includes("40001"))
  );
}
