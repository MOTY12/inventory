import { createHash } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import {
  CatalogStatus,
  MembershipRole,
  ProductType,
  PurchaseOrderStatus,
  StockMovementType,
} from "../generated/prisma/enums";
import { PrismaService } from "../database/prisma.service";
import { InventoryPostingService } from "../inventory/inventory-posting.service";
import type { OrganizationContext } from "../organizations/organization-context.guard";
import {
  CreateGoodsReceiptDto,
  CreatePurchaseOrderDto,
  PurchaseOrderListQueryDto,
  UpdatePurchaseOrderDto,
} from "./purchase-orders.dto";

const detailInclude = {
  supplier: { select: { id: true, name: true } },
  warehouse: { select: { id: true, name: true, code: true } },
  lines: {
    orderBy: { createdAt: "asc" as const },
    include: {
      product: {
        select: { id: true, name: true, sku: true, baseUnitId: true },
      },
      unit: { select: { id: true, code: true, name: true } },
    },
  },
  receipts: {
    orderBy: { receivedAt: "desc" as const },
    include: { lines: true },
  },
};

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryPosting: InventoryPostingService,
  ) {}

  async list(
    context: OrganizationContext,
    actorUserId: string,
    query: PurchaseOrderListQueryDto,
  ) {
    const term = query.q?.trim();
    const warehouseScope = await this.visibleWarehouseIds(context, actorUserId);
    const where = {
      organizationId: context.organizationId,
      ...(warehouseScope ? { warehouseId: { in: warehouseScope } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(term
        ? {
            OR: [
              { number: { contains: term, mode: "insensitive" as const } },
              {
                supplier: {
                  name: { contains: term, mode: "insensitive" as const },
                },
              },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.page_size,
        take: query.page_size,
        include: {
          supplier: { select: { name: true } },
          warehouse: { select: { name: true } },
          _count: { select: { lines: true, receipts: true } },
        },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return { data, total, page: query.page, page_size: query.page_size };
  }

  async get(context: OrganizationContext, actorUserId: string, id: string) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId: context.organizationId },
      include: detailInclude,
    });
    if (!order) throw new NotFoundException("Purchase order not found");
    await this.requireWarehouse(context, actorUserId, order.warehouseId);
    return order;
  }

  async create(
    context: OrganizationContext,
    actorUserId: string,
    input: CreatePurchaseOrderDto,
  ) {
    const warehouse = await this.requireWarehouse(
      context,
      actorUserId,
      input.warehouseId,
    );
    const supplier = await this.prisma.supplier.findFirst({
      where: {
        id: input.supplierId,
        organizationId: context.organizationId,
        status: CatalogStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!supplier) throw new NotFoundException("Active supplier not found");
    return this.prisma.$transaction(async (tx) => {
      const sequence = await tx.$queryRaw<{ next_number: bigint }[]>(Prisma.sql`
        INSERT INTO purchase_order_sequences (organization_id, next_number)
        VALUES (${context.organizationId}::uuid, 1)
        ON CONFLICT (organization_id)
        DO UPDATE SET next_number = purchase_order_sequences.next_number + 1
        RETURNING next_number
      `);
      const number = `PO-${String(sequence[0].next_number).padStart(6, "0")}`;
      const lines = await this.prepareLines(tx, context, input.lines);
      const order = await tx.purchaseOrder.create({
        data: {
          organizationId: context.organizationId,
          supplierId: supplier.id,
          warehouseId: warehouse.id,
          createdByUserId: actorUserId,
          number,
          currency: input.currency,
          expectedDeliveryAt: input.expectedDeliveryAt
            ? new Date(input.expectedDeliveryAt)
            : null,
          subtotal: lines.reduce(
            (total, line) => total.plus(line.lineTotal),
            new Prisma.Decimal(0),
          ),
          lines: { create: lines },
        },
        include: detailInclude,
      });
      await this.audit(tx, context, actorUserId, order.id, "CREATED", {
        number,
      });
      return order;
    });
  }

  async update(
    context: OrganizationContext,
    actorUserId: string,
    id: string,
    input: UpdatePurchaseOrderDto,
  ) {
    const current = await this.findDraft(context, id);
    await this.requireWarehouse(context, actorUserId, input.warehouseId);
    const supplier = await this.prisma.supplier.findFirst({
      where: {
        id: input.supplierId,
        organizationId: context.organizationId,
        status: CatalogStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!supplier) throw new NotFoundException("Active supplier not found");
    const lines = await this.prepareLines(this.prisma, context, input.lines);
    return this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.purchaseOrder.updateMany({
          where: {
            id,
            organizationId: context.organizationId,
            status: PurchaseOrderStatus.DRAFT,
            updatedAt: current.updatedAt,
          },
          data: {
            supplierId: supplier.id,
            warehouseId: input.warehouseId,
            currency: input.currency,
            expectedDeliveryAt: input.expectedDeliveryAt
              ? new Date(input.expectedDeliveryAt)
              : null,
            subtotal: lines.reduce(
              (total, line) => total.plus(line.lineTotal),
              new Prisma.Decimal(0),
            ),
          },
        });
        if (locked.count !== 1)
          throw new ConflictException(
            "Purchase order changed; reload and try again",
          );
        await tx.purchaseOrderLine.deleteMany({
          where: {
            organizationId: context.organizationId,
            purchaseOrderId: id,
          },
        });
        await tx.purchaseOrderLine.createMany({
          data: lines.map((line) => ({
            ...line,
            organizationId: context.organizationId,
            purchaseOrderId: id,
          })),
        });
        await this.audit(tx, context, actorUserId, id, "UPDATED", {
          lineCount: lines.length,
        });
        return tx.purchaseOrder.findFirstOrThrow({
          where: { id, organizationId: context.organizationId },
          include: detailInclude,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async submit(context: OrganizationContext, actorUserId: string, id: string) {
    return this.transition(
      context,
      actorUserId,
      id,
      PurchaseOrderStatus.DRAFT,
      PurchaseOrderStatus.SUBMITTED,
      { submittedAt: new Date() },
    );
  }

  async cancel(context: OrganizationContext, actorUserId: string, id: string) {
    const order = await this.get(context, actorUserId, id);
    if (
      !new Set<PurchaseOrderStatus>([
        PurchaseOrderStatus.DRAFT,
        PurchaseOrderStatus.SUBMITTED,
      ]).has(order.status)
    )
      throw new ConflictException(
        "Only draft or submitted orders can be cancelled",
      );
    if (order.receipts.length)
      throw new ConflictException("An order with receipts cannot be cancelled");
    return this.transition(
      context,
      actorUserId,
      id,
      order.status,
      PurchaseOrderStatus.CANCELLED,
      { cancelledAt: new Date() },
    );
  }

  async receipts(
    context: OrganizationContext,
    actorUserId: string,
    id: string,
  ) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId: context.organizationId },
      select: { warehouseId: true },
    });
    if (!order) throw new NotFoundException("Purchase order not found");
    await this.requireWarehouse(context, actorUserId, order.warehouseId);
    return this.prisma.goodsReceipt.findMany({
      where: { organizationId: context.organizationId, purchaseOrderId: id },
      orderBy: { receivedAt: "desc" },
      include: {
        lines: {
          include: {
            purchaseOrderLine: {
              include: {
                product: { select: { name: true, sku: true } },
                unit: { select: { code: true } },
              },
            },
          },
        },
      },
    });
  }

  async receive(
    context: OrganizationContext,
    actorUserId: string,
    id: string,
    idempotencyKey: string,
    input: CreateGoodsReceiptDto,
  ) {
    if (!idempotencyKey || idempotencyKey.length > 160)
      throw new ConflictException("A valid Idempotency-Key is required");
    const requested = input.lines
      .map((line) => ({
        purchaseOrderLineId: line.purchaseOrderLineId,
        quantity: new Prisma.Decimal(line.quantity).toFixed(6),
      }))
      .sort((a, b) =>
        a.purchaseOrderLineId.localeCompare(b.purchaseOrderLineId),
      );
    if (
      new Set(requested.map((line) => line.purchaseOrderLineId)).size !==
      requested.length
    )
      throw new ConflictException(
        "Each purchase order line can appear once per receipt",
      );
    const payloadHash = createHash("sha256")
      .update(
        JSON.stringify([
          id,
          requested,
          input.receivedAt ?? "",
          input.note ?? "",
        ]),
      )
      .digest("hex");
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const previous = await tx.goodsReceipt.findFirst({
            where: { organizationId: context.organizationId, idempotencyKey },
            include: { lines: true },
          });
          if (previous) {
            if (previous.payloadHash !== payloadHash)
              throw new ConflictException(
                "Idempotency key was used with a different receipt",
              );
            return previous;
          }
          const locked = await tx.$queryRaw<{ id: string }[]>(
            Prisma.sql`SELECT id FROM purchase_orders WHERE organization_id = ${context.organizationId}::uuid AND id = ${id}::uuid FOR UPDATE`,
          );
          if (!locked.length)
            throw new NotFoundException("Purchase order not found");
          const order = await tx.purchaseOrder.findFirst({
            where: { id, organizationId: context.organizationId },
            include: {
              lines: {
                include: {
                  product: {
                    select: {
                      id: true,
                      baseUnitId: true,
                      status: true,
                      type: true,
                      trackInventory: true,
                    },
                  },
                  unit: { select: { id: true, status: true, precision: true } },
                },
              },
            },
          });
          if (!order) throw new NotFoundException("Purchase order not found");
          if (
            !new Set<PurchaseOrderStatus>([
              PurchaseOrderStatus.SUBMITTED,
              PurchaseOrderStatus.PARTIALLY_RECEIVED,
            ]).has(order.status)
          )
            throw new ConflictException(
              "Only submitted orders can receive goods",
            );
          await this.requireWarehouse(context, actorUserId, order.warehouseId);
          const receipt = await tx.goodsReceipt.create({
            data: {
              organizationId: context.organizationId,
              purchaseOrderId: id,
              idempotencyKey,
              payloadHash,
              receivedByUserId: actorUserId,
              receivedAt: input.receivedAt
                ? new Date(input.receivedAt)
                : new Date(),
              note: input.note?.trim() || null,
            },
          });
          const lineMap = new Map(order.lines.map((line) => [line.id, line]));
          const receiptLines = [] as {
            id: string;
            purchaseOrderLineId: string;
            quantity: Prisma.Decimal;
            baseQuantity: Prisma.Decimal;
          }[];
          for (const item of input.lines) {
            const line = lineMap.get(item.purchaseOrderLineId);
            if (!line)
              throw new NotFoundException("Purchase order line not found");
            if (
              line.product.status !== CatalogStatus.ACTIVE ||
              line.product.type !== ProductType.STOCKED ||
              !line.product.trackInventory ||
              line.unit.status !== CatalogStatus.ACTIVE
            )
              throw new ConflictException(
                "An order product or unit is no longer receivable",
              );
            const quantity = new Prisma.Decimal(item.quantity);
            if (quantity.decimalPlaces() > line.unit.precision)
              throw new ConflictException(
                "Receipt quantity exceeds the selected unit precision",
              );
            if (!quantity.isPositive())
              throw new ConflictException("Receipt quantity must be positive");
            const factor =
              line.unitId === line.product.baseUnitId
                ? new Prisma.Decimal(1)
                : (
                    await tx.productUnitConversion.findUnique({
                      where: {
                        organizationId_productId_unitId: {
                          organizationId: context.organizationId,
                          productId: line.productId,
                          unitId: line.unitId,
                        },
                      },
                    })
                  )?.baseQuantity;
            if (!factor)
              throw new ConflictException(
                "Product unit conversion is no longer available",
              );
            const baseQuantity = quantity.mul(factor);
            if (
              line.receivedBaseQuantity
                .plus(baseQuantity)
                .greaterThan(line.baseQuantity)
            )
              throw new ConflictException(
                "Receipt exceeds the outstanding quantity",
              );
            const receiptLine = await tx.goodsReceiptLine.create({
              data: {
                organizationId: context.organizationId,
                receiptId: receipt.id,
                purchaseOrderLineId: line.id,
                quantity,
                baseQuantity,
              },
            });
            receiptLines.push({
              id: receiptLine.id,
              purchaseOrderLineId: line.id,
              quantity,
              baseQuantity,
            });
            await tx.purchaseOrderLine.update({
              where: { id: line.id },
              data: {
                receivedQuantity: line.receivedQuantity.plus(quantity),
                receivedBaseQuantity:
                  line.receivedBaseQuantity.plus(baseQuantity),
              },
            });
            const baseUnitCost = line.baseUnitCost.toFixed(4);
            const movement = await this.inventoryPosting.postWarehouseMovement(
              context,
              actorUserId,
              `goods-receipt:${receipt.id}:${line.id}`,
              {
                warehouseId: order.warehouseId,
                productId: line.productId,
                documentType: "PURCHASE_RECEIPT",
                documentId: receipt.id,
                documentLineId: receiptLine.id,
                movementType: StockMovementType.RECEIPT,
                quantityDelta: baseQuantity.toFixed(6),
                costPerBaseUnit: baseUnitCost,
                costCurrency: order.currency,
              },
              tx,
            );
            await tx.goodsReceiptLine.update({
              where: { id: receiptLine.id },
              data: { stockMovementId: movement.id },
            });
          }
          const freshLines = await tx.purchaseOrderLine.findMany({
            where: {
              organizationId: context.organizationId,
              purchaseOrderId: id,
            },
            select: { baseQuantity: true, receivedBaseQuantity: true },
          });
          const fullyReceived = freshLines.every((line) =>
            line.receivedBaseQuantity.greaterThanOrEqualTo(line.baseQuantity),
          );
          const previousStatus = order.status;
          const nextStatus = fullyReceived
            ? PurchaseOrderStatus.RECEIVED
            : PurchaseOrderStatus.PARTIALLY_RECEIVED;
          await tx.purchaseOrder.update({
            where: { id },
            data: { status: nextStatus },
          });
          await this.audit(
            tx,
            context,
            actorUserId,
            receipt.id,
            "RECEIVED",
            { purchaseOrderId: id, lineCount: receiptLines.length },
            "GOODS_RECEIPT",
          );
          await this.audit(tx, context, actorUserId, id, nextStatus, {
            from: previousStatus,
            receiptId: receipt.id,
          });
          await tx.outboxEvent.create({
            data: {
              organizationId: context.organizationId,
              eventType: "procurement.goods-receipt.posted",
              aggregateType: "GOODS_RECEIPT",
              aggregateId: receipt.id,
              payload: { purchaseOrderId: id, receiptId: receipt.id },
            },
          });
          return tx.goodsReceipt.findFirstOrThrow({
            where: { id: receipt.id, organizationId: context.organizationId },
            include: { lines: true },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isSerializationFailure(error))
        throw new ConflictException(
          "This receipt conflicted with another stock operation; retry with the same Idempotency-Key",
        );
      if (isUniqueViolation(error)) {
        const previous = await this.prisma.goodsReceipt.findFirst({
          where: { organizationId: context.organizationId, idempotencyKey },
          include: { lines: true },
        });
        if (previous?.payloadHash === payloadHash) return previous;
        if (previous)
          throw new ConflictException(
            "Idempotency key was used with a different receipt",
          );
      }
      throw error;
    }
  }

  private async transition(
    context: OrganizationContext,
    actorUserId: string,
    id: string,
    from: PurchaseOrderStatus,
    to: PurchaseOrderStatus,
    data: Prisma.PurchaseOrderUpdateManyMutationInput,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const result = await tx.purchaseOrder.updateMany({
          where: { id, organizationId: context.organizationId, status: from },
          data: { ...data, status: to },
        });
        if (result.count !== 1)
          throw new ConflictException(
            "Purchase order state changed; reload and try again",
          );
        await this.audit(tx, context, actorUserId, id, to, { from });
        return tx.purchaseOrder.findFirstOrThrow({
          where: { id, organizationId: context.organizationId },
          include: detailInclude,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async findDraft(context: OrganizationContext, id: string) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId: context.organizationId },
    });
    if (!order) throw new NotFoundException("Purchase order not found");
    if (order.status !== PurchaseOrderStatus.DRAFT)
      throw new ConflictException("Only draft purchase orders can be edited");
    return order;
  }

  private async requireWarehouse(
    context: OrganizationContext,
    actorUserId: string,
    warehouseId: string,
  ) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: {
        id: warehouseId,
        organizationId: context.organizationId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!warehouse) throw new NotFoundException("Active warehouse not found");
    if (
      !new Set<MembershipRole>([
        MembershipRole.OWNER,
        MembershipRole.ADMIN,
      ]).has(context.role)
    ) {
      const grant = await this.prisma.membershipWarehouseGrant.findUnique({
        where: {
          organizationId_userId_warehouseId: {
            organizationId: context.organizationId,
            userId: actorUserId,
            warehouseId,
          },
        },
        select: { warehouseId: true },
      });
      if (!grant) throw new ForbiddenException("Warehouse access is required");
    }
    return warehouse;
  }

  private async visibleWarehouseIds(
    context: OrganizationContext,
    actorUserId: string,
  ) {
    if (
      new Set<MembershipRole>([MembershipRole.OWNER, MembershipRole.ADMIN]).has(
        context.role,
      )
    )
      return undefined;
    const grants = await this.prisma.membershipWarehouseGrant.findMany({
      where: { organizationId: context.organizationId, userId: actorUserId },
      select: { warehouseId: true },
    });
    return grants.map((grant) => grant.warehouseId);
  }

  private async prepareLines(
    tx: Prisma.TransactionClient | PrismaService,
    context: OrganizationContext,
    inputs: CreatePurchaseOrderDto["lines"],
  ) {
    if (!inputs.length || inputs.length > 100)
      throw new ConflictException("An order must have between 1 and 100 lines");
    const keys = inputs.map((line) => `${line.productId}:${line.unitId}`);
    if (new Set(keys).size !== keys.length)
      throw new ConflictException(
        "Duplicate product and unit lines are not allowed",
      );
    const prepared = [] as {
      productId: string;
      unitId: string;
      orderedQuantity: Prisma.Decimal;
      receivedQuantity: Prisma.Decimal;
      receivedBaseQuantity: Prisma.Decimal;
      baseQuantity: Prisma.Decimal;
      unitCost: Prisma.Decimal;
      baseUnitCost: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
    }[];
    for (const input of inputs) {
      const product = await tx.product.findFirst({
        where: {
          id: input.productId,
          organizationId: context.organizationId,
          status: CatalogStatus.ACTIVE,
          type: ProductType.STOCKED,
          trackInventory: true,
        },
        select: { id: true, baseUnitId: true },
      });
      if (!product)
        throw new NotFoundException("Active stocked product not found");
      const unit = await tx.unit.findFirst({
        where: {
          id: input.unitId,
          organizationId: context.organizationId,
          status: CatalogStatus.ACTIVE,
        },
        select: { id: true, precision: true },
      });
      if (!unit) throw new NotFoundException("Active unit not found");
      const factor =
        input.unitId === product.baseUnitId
          ? new Prisma.Decimal(1)
          : (
              await tx.productUnitConversion.findUnique({
                where: {
                  organizationId_productId_unitId: {
                    organizationId: context.organizationId,
                    productId: product.id,
                    unitId: input.unitId,
                  },
                },
              })
            )?.baseQuantity;
      if (!factor)
        throw new ConflictException(
          "The selected unit is not configured for this product",
        );
      const quantity = new Prisma.Decimal(input.quantity);
      const unitCost = new Prisma.Decimal(input.unitCost);
      const baseQuantity = quantity.mul(factor);
      if (
        quantity.decimalPlaces() > unit.precision ||
        !quantity.isPositive() ||
        !baseQuantity.isPositive() ||
        unitCost.isNegative() ||
        baseQuantity.decimalPlaces() > 6
      )
        throw new ConflictException(
          "Order quantity or cost is outside supported precision",
        );
      prepared.push({
        productId: product.id,
        unitId: unit.id,
        orderedQuantity: quantity,
        receivedQuantity: new Prisma.Decimal(0),
        receivedBaseQuantity: new Prisma.Decimal(0),
        baseQuantity,
        unitCost,
        baseUnitCost: unitCost
          .div(factor)
          .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP),
        lineTotal: quantity
          .mul(unitCost)
          .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP),
      });
    }
    return prepared;
  }

  private audit(
    tx: Prisma.TransactionClient,
    context: OrganizationContext,
    actorUserId: string,
    entityId: string,
    action: string,
    metadata: Prisma.InputJsonValue,
    entityType = "PURCHASE_ORDER",
  ) {
    return tx.auditEvent.create({
      data: {
        organizationId: context.organizationId,
        actorUserId,
        entityType,
        entityId,
        action,
        metadata,
      },
    });
  }
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function isSerializationFailure(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  );
}
