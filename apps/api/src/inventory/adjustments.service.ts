import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import {
  CatalogStatus,
  ProductType,
  StockAdjustmentStatus,
} from "../generated/prisma/enums";
import { PrismaService } from "../database/prisma.service";
import type { OrganizationContext } from "../organizations/organization-context.guard";
import type { PaginationQueryDto } from "../common/pagination-query.dto";
import type { CreateStockAdjustmentDto } from "./adjustments.dto";
import { InventoryPostingService } from "./inventory-posting.service";

@Injectable()
export class StockAdjustmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: InventoryPostingService,
  ) {}

  async list(
    context: OrganizationContext,
    warehouseId: string,
    query: PaginationQueryDto,
  ) {
    const where = { organizationId: context.organizationId, warehouseId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.stockAdjustment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.page_size,
        take: query.page_size,
      }),
      this.prisma.stockAdjustment.count({ where }),
    ]);
    return { data, total, page: query.page, page_size: query.page_size };
  }

  async create(
    context: OrganizationContext,
    actorUserId: string,
    warehouseId: string,
    input: CreateStockAdjustmentDto,
  ) {
    const counted = new Prisma.Decimal(input.countedQuantity);
    if (
      counted.decimalPlaces() > 6 ||
      counted.greaterThan("99999999999999.999999")
    )
      throw new ConflictException("Count exceeds supported precision");
    const [warehouse, product] = await Promise.all([
      this.prisma.warehouse.findFirst({
        where: {
          id: warehouseId,
          organizationId: context.organizationId,
          status: "ACTIVE",
        },
        select: { id: true },
      }),
      this.prisma.product.findFirst({
        where: {
          id: input.productId,
          organizationId: context.organizationId,
          status: CatalogStatus.ACTIVE,
          type: ProductType.STOCKED,
          trackInventory: true,
        },
        select: { id: true, baseUnit: { select: { precision: true } } },
      }),
    ]);
    if (!warehouse) throw new NotFoundException("Active warehouse not found");
    if (!product)
      throw new NotFoundException("Active stocked product not found");
    if (counted.decimalPlaces() > product.baseUnit.precision)
      throw new ConflictException("Count exceeds the product unit precision");
    const balance = await this.prisma.inventoryBalance.findUnique({
      where: {
        organizationId_warehouseId_productId: {
          organizationId: context.organizationId,
          warehouseId,
          productId: product.id,
        },
      },
      select: { onHand: true },
    });
    const system = balance?.onHand ?? new Prisma.Decimal(0);
    if (counted.equals(system))
      throw new ConflictException(
        "Physical count matches system quantity; no adjustment is needed",
      );
    return this.prisma.$transaction(async (tx) => {
      const adjustment = await tx.stockAdjustment.create({
        data: {
          organizationId: context.organizationId,
          warehouseId,
          productId: product.id,
          reason: input.reason.trim(),
          systemQuantity: system,
          countedQuantity: counted,
          createdByUserId: actorUserId,
        },
      });
      await tx.auditEvent.create({
        data: {
          organizationId: context.organizationId,
          actorUserId,
          entityType: "STOCK_ADJUSTMENT",
          entityId: adjustment.id,
          action: "COUNT_RECORDED",
          metadata: {
            warehouseId,
            productId: product.id,
            systemQuantity: system.toFixed(6),
            countedQuantity: counted.toFixed(6),
            reason: input.reason.trim(),
          },
        },
      });
      return adjustment;
    });
  }

  async post(
    context: OrganizationContext,
    actorUserId: string,
    warehouseId: string,
    adjustmentId: string,
  ) {
    const adjustment = await this.prisma.stockAdjustment.findFirst({
      where: {
        id: adjustmentId,
        organizationId: context.organizationId,
        warehouseId,
      },
    });
    if (!adjustment) throw new NotFoundException("Stock adjustment not found");
    if (adjustment.status !== StockAdjustmentStatus.DRAFT)
      throw new ConflictException("Adjustment is already posted");
    const delta = adjustment.countedQuantity.minus(adjustment.systemQuantity);
    return this.posting.postWarehouseMovement(
      context,
      actorUserId,
      `stock-adjustment:${adjustment.id}`,
      {
        warehouseId,
        productId: adjustment.productId,
        documentType: "STOCK_ADJUSTMENT",
        documentId: adjustment.id,
        movementType: "ADJUSTMENT",
        quantityDelta: delta.toFixed(6),
        adjustmentId: adjustment.id,
        expectedOnHand: adjustment.systemQuantity.toFixed(6),
      },
    );
  }
}
