import { createHash } from "node:crypto";
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import {
  CatalogStatus,
  ProductType,
  StockMovementType,
  IdempotencyStatus,
} from "../generated/prisma/enums";
import { PrismaService } from "../database/prisma.service";
import type { OrganizationContext } from "../organizations/organization-context.guard";

export type PostWarehouseMovement = {
  warehouseId: string;
  productId: string;
  documentType: string;
  documentId: string;
  documentLineId?: string;
  movementType:
    "OPENING_BALANCE" | "RECEIPT" | "SALE_FULFILLMENT" | "ADJUSTMENT";
  quantityDelta: string;
  reservedDelta?: string;
  costPerBaseUnit?: string;
  costCurrency?: string;
  adjustmentId?: string;
  expectedOnHand?: string;
};

@Injectable()
export class InventoryPostingService {
  constructor(private readonly prisma: PrismaService) {}

  async postTransferOut(
    tx: Prisma.TransactionClient,
    context: OrganizationContext,
    actorUserId: string,
    input: {
      transferId: string;
      transferLineId: string;
      warehouseId: string;
      productId: string;
      quantity: Prisma.Decimal;
    },
  ) {
    const balance = await this.lockTransferBalance(
      tx,
      context,
      input.warehouseId,
      input.productId,
    );
    if (balance.on_hand.minus(balance.reserved).lt(input.quantity))
      throw new ConflictException("Insufficient available stock for dispatch");
    const movement = await tx.stockMovement.create({
      data: {
        organizationId: context.organizationId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        documentType: "STOCK_TRANSFER",
        documentId: input.transferId,
        documentLineId: input.transferLineId,
        movementType: StockMovementType.TRANSFER_OUT,
        quantityDelta: input.quantity.negated(),
        costPerBaseUnit: balance.average_cost,
        costCurrency: balance.cost_currency,
        actorUserId,
      },
    });
    await tx.inventoryBalance.update({
      where: {
        organizationId_warehouseId_productId: {
          organizationId: context.organizationId,
          warehouseId: input.warehouseId,
          productId: input.productId,
        },
      },
      data: {
        onHand: balance.on_hand.minus(input.quantity),
        inTransit: { increment: input.quantity },
        version: { increment: 1 },
      },
    });
    await this.transferMovementEvents(
      tx,
      context,
      actorUserId,
      movement.id,
      input.warehouseId,
      input.productId,
      input.quantity.negated(),
      StockMovementType.TRANSFER_OUT,
    );
    return {
      movement,
      costPerBaseUnit: balance.average_cost,
      costCurrency: balance.cost_currency,
    };
  }

  async postTransferIn(
    tx: Prisma.TransactionClient,
    context: OrganizationContext,
    actorUserId: string,
    input: {
      transferId: string;
      transferLineId: string;
      sourceWarehouseId: string;
      destinationWarehouseId: string;
      productId: string;
      quantity: Prisma.Decimal;
      costPerBaseUnit: Prisma.Decimal | null;
      costCurrency: string | null;
    },
  ) {
    const keys = [input.sourceWarehouseId, input.destinationWarehouseId].sort();
    const balances = new Map<
      string,
      Awaited<ReturnType<InventoryPostingService["lockTransferBalance"]>>
    >();
    for (const warehouseId of keys) {
      await tx.inventoryBalance.upsert({
        where: {
          organizationId_warehouseId_productId: {
            organizationId: context.organizationId,
            warehouseId,
            productId: input.productId,
          },
        },
        create: {
          organizationId: context.organizationId,
          warehouseId,
          productId: input.productId,
        },
        update: {},
      });
      balances.set(
        warehouseId,
        await this.lockTransferBalance(
          tx,
          context,
          warehouseId,
          input.productId,
        ),
      );
    }
    const source = balances.get(input.sourceWarehouseId)!;
    const destination = balances.get(input.destinationWarehouseId)!;
    if (source.in_transit.lt(input.quantity))
      throw new ConflictException("In-transit balance is insufficient");
    if (
      destination.average_cost &&
      input.costCurrency &&
      destination.cost_currency !== input.costCurrency
    )
      throw new ConflictException(
        "Transfer cost currency does not match destination balance",
      );
    const nextOnHand = destination.on_hand.plus(input.quantity);
    let averageCost = destination.average_cost;
    if (input.costPerBaseUnit) {
      averageCost = destination.on_hand.isZero()
        ? input.costPerBaseUnit
        : destination.average_cost
          ? destination.average_cost
              .mul(destination.on_hand)
              .plus(input.costPerBaseUnit.mul(input.quantity))
              .div(nextOnHand)
              .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)
          : input.costPerBaseUnit;
    }
    const movement = await tx.stockMovement.create({
      data: {
        organizationId: context.organizationId,
        warehouseId: input.destinationWarehouseId,
        productId: input.productId,
        documentType: "STOCK_TRANSFER",
        documentId: input.transferId,
        documentLineId: input.transferLineId,
        movementType: StockMovementType.TRANSFER_IN,
        quantityDelta: input.quantity,
        costPerBaseUnit: input.costPerBaseUnit,
        costCurrency: input.costCurrency,
        actorUserId,
      },
    });
    await tx.inventoryBalance.update({
      where: {
        organizationId_warehouseId_productId: {
          organizationId: context.organizationId,
          warehouseId: input.sourceWarehouseId,
          productId: input.productId,
        },
      },
      data: {
        inTransit: source.in_transit.minus(input.quantity),
        version: { increment: 1 },
      },
    });
    await tx.inventoryBalance.update({
      where: {
        organizationId_warehouseId_productId: {
          organizationId: context.organizationId,
          warehouseId: input.destinationWarehouseId,
          productId: input.productId,
        },
      },
      data: {
        onHand: nextOnHand,
        averageCost,
        costCurrency: input.costCurrency ?? destination.cost_currency,
        version: { increment: 1 },
      },
    });
    await this.transferMovementEvents(
      tx,
      context,
      actorUserId,
      movement.id,
      input.destinationWarehouseId,
      input.productId,
      input.quantity,
      StockMovementType.TRANSFER_IN,
    );
    return movement;
  }

  private async lockTransferBalance(
    tx: Prisma.TransactionClient,
    context: OrganizationContext,
    warehouseId: string,
    productId: string,
  ) {
    await tx.inventoryBalance.upsert({
      where: {
        organizationId_warehouseId_productId: {
          organizationId: context.organizationId,
          warehouseId,
          productId,
        },
      },
      create: {
        organizationId: context.organizationId,
        warehouseId,
        productId,
      },
      update: {},
    });
    const rows = await tx.$queryRaw<
      {
        on_hand: Prisma.Decimal;
        reserved: Prisma.Decimal;
        in_transit: Prisma.Decimal;
        average_cost: Prisma.Decimal | null;
        cost_currency: string | null;
      }[]
    >(
      Prisma.sql`SELECT on_hand,reserved,in_transit,average_cost,cost_currency FROM inventory_balances WHERE organization_id=${context.organizationId}::uuid AND warehouse_id=${warehouseId}::uuid AND product_id=${productId}::uuid FOR UPDATE`,
    );
    if (!rows[0])
      throw new ConflictException("Could not lock inventory balance");
    return rows[0];
  }

  private async transferMovementEvents(
    tx: Prisma.TransactionClient,
    context: OrganizationContext,
    actorUserId: string,
    movementId: string,
    warehouseId: string,
    productId: string,
    delta: Prisma.Decimal,
    movementType: StockMovementType,
  ) {
    await tx.auditEvent.create({
      data: {
        organizationId: context.organizationId,
        actorUserId,
        entityType: "STOCK_MOVEMENT",
        entityId: movementId,
        action: "POSTED",
        metadata: {
          movementType,
          quantityDelta: delta.toFixed(6),
          warehouseId,
          productId,
        },
      },
    });
    await tx.outboxEvent.create({
      data: {
        organizationId: context.organizationId,
        eventType: "inventory.movement.posted",
        aggregateType: "STOCK_MOVEMENT",
        aggregateId: movementId,
        payload: { movementId, warehouseId, productId },
      },
    });
  }

  async postWarehouseMovement(
    context: OrganizationContext,
    actorUserId: string,
    idempotencyKey: string,
    input: PostWarehouseMovement,
    transaction?: Prisma.TransactionClient,
  ) {
    if (!idempotencyKey || idempotencyKey.length > 160)
      throw new ConflictException("A valid Idempotency-Key is required");
    const delta = new Prisma.Decimal(input.quantityDelta);
    if (delta.isZero())
      throw new ConflictException("Movement quantity must be nonzero");
    if (
      delta.decimalPlaces() > 6 ||
      delta.abs().greaterThan("99999999999999.999999")
    ) {
      throw new ConflictException(
        "Movement quantity exceeds supported precision",
      );
    }
    const inbound =
      input.movementType === StockMovementType.OPENING_BALANCE ||
      input.movementType === StockMovementType.RECEIPT;
    if (
      (inbound && delta.isNegative()) ||
      (input.movementType === StockMovementType.SALE_FULFILLMENT &&
        !delta.isNegative())
    ) {
      throw new ConflictException("Movement direction does not match its type");
    }
    const reservedDelta = new Prisma.Decimal(input.reservedDelta ?? "0");
    if (input.movementType === StockMovementType.SALE_FULFILLMENT) {
      if (!reservedDelta.equals(delta.abs().negated()))
        throw new ConflictException(
          "Sale fulfillment must consume the matching reservation",
        );
    } else if (!reservedDelta.isZero()) {
      throw new ConflictException(
        "Only fulfillment may consume reserved stock",
      );
    }
    if (
      (input.costPerBaseUnit === undefined) !==
      (input.costCurrency === undefined)
    ) {
      throw new ConflictException(
        "Movement cost and currency must be supplied together",
      );
    }
    if (delta.isNegative() && input.costPerBaseUnit !== undefined) {
      throw new ConflictException(
        "Outbound movement cost is derived from the warehouse average cost",
      );
    }
    if (input.costPerBaseUnit !== undefined) {
      const amount = new Prisma.Decimal(input.costPerBaseUnit);
      if (
        amount.isNegative() ||
        amount.decimalPlaces() > 4 ||
        amount.greaterThan("9999999999999999.9999")
      ) {
        throw new ConflictException(
          "Movement cost exceeds supported precision",
        );
      }
    }
    if (input.costCurrency && !/^[A-Z]{3}$/.test(input.costCurrency))
      throw new ConflictException(
        "Currency must be a three-letter uppercase code",
      );

    const hashInput = [
      input.warehouseId,
      input.productId,
      input.documentType,
      input.documentId,
      input.documentLineId ?? "",
      input.movementType,
      delta.toFixed(6),
      reservedDelta.toFixed(6),
      input.costPerBaseUnit ?? "",
      input.costCurrency ?? "",
      input.adjustmentId ?? "",
      input.expectedOnHand ?? "",
    ];
    const payloadHash = createHash("sha256")
      .update(JSON.stringify(hashInput))
      .digest("hex");

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const execute = async (tx: Prisma.TransactionClient) => {
          const prior = await tx.idempotencyRecord.findUnique({
            where: {
              organizationId_key: {
                organizationId: context.organizationId,
                key: idempotencyKey,
              },
            },
          });
          if (prior) {
            if (prior.payloadHash !== payloadHash)
              throw new ConflictException(
                "Idempotency key was already used with a different payload",
              );
            if (prior.status !== IdempotencyStatus.COMPLETED || !prior.resultId)
              throw new ConflictException(
                "A command with this idempotency key is still in progress",
              );
            const original = await tx.stockMovement.findFirst({
              where: {
                organizationId: context.organizationId,
                id: prior.resultId,
              },
            });
            if (!original)
              throw new ConflictException(
                "Stored idempotency result is unavailable",
              );
            return original;
          }

          await tx.idempotencyRecord.create({
            data: {
              organizationId: context.organizationId,
              key: idempotencyKey,
              payloadHash,
            },
          });
          const [warehouse, product] = await Promise.all([
            tx.warehouse.findFirst({
              where: {
                id: input.warehouseId,
                organizationId: context.organizationId,
                status: "ACTIVE",
              },
              select: { id: true },
            }),
            tx.product.findFirst({
              where: {
                id: input.productId,
                organizationId: context.organizationId,
                status: CatalogStatus.ACTIVE,
                trackInventory: true,
                type: ProductType.STOCKED,
              },
              select: { id: true },
            }),
          ]);
          if (!warehouse)
            throw new NotFoundException("Active warehouse not found");
          if (!product)
            throw new NotFoundException("Active stocked product not found");

          await tx.inventoryBalance.upsert({
            where: {
              organizationId_warehouseId_productId: {
                organizationId: context.organizationId,
                warehouseId: warehouse.id,
                productId: product.id,
              },
            },
            create: {
              organizationId: context.organizationId,
              warehouseId: warehouse.id,
              productId: product.id,
            },
            update: {},
          });
          const locked = await tx.$queryRaw<
            {
              on_hand: Prisma.Decimal;
              reserved: Prisma.Decimal;
              average_cost: Prisma.Decimal | null;
              cost_currency: string | null;
            }[]
          >(Prisma.sql`
            SELECT on_hand, reserved, average_cost, cost_currency
            FROM inventory_balances
            WHERE organization_id = ${context.organizationId}::uuid
              AND warehouse_id = ${warehouse.id}::uuid
              AND product_id = ${product.id}::uuid
            FOR UPDATE
          `);
          const current = locked[0];
          if (!current)
            throw new ConflictException("Could not lock the inventory balance");
          if (input.movementType === StockMovementType.ADJUSTMENT) {
            if (!input.adjustmentId || input.expectedOnHand === undefined)
              throw new ConflictException(
                "Adjustment document and count snapshot are required",
              );
            const adjustment = await tx.stockAdjustment.findFirst({
              where: {
                id: input.adjustmentId,
                organizationId: context.organizationId,
                warehouseId: warehouse.id,
                productId: product.id,
                status: "DRAFT",
              },
            });
            if (!adjustment)
              throw new ConflictException("Draft adjustment is unavailable");
            if (!current.on_hand.equals(input.expectedOnHand))
              throw new ConflictException(
                "Inventory changed after this count was recorded; create a fresh count",
              );
            if (
              !adjustment.countedQuantity
                .minus(adjustment.systemQuantity)
                .equals(delta)
            )
              throw new ConflictException(
                "Adjustment quantity does not match its count variance",
              );
          }
          const nextOnHand = current.on_hand.plus(delta);
          const nextReserved = current.reserved.plus(reservedDelta);
          if (nextReserved.isNegative() || nextOnHand.lessThan(nextReserved))
            throw new ConflictException(
              "Movement would violate the reserved stock balance",
            );

          const requestedCost = input.costPerBaseUnit
            ? new Prisma.Decimal(input.costPerBaseUnit)
            : null;
          let nextCost = current.average_cost;
          let nextCurrency = current.cost_currency;
          if (delta.isPositive() && requestedCost) {
            if (
              current.average_cost &&
              current.cost_currency !== input.costCurrency
            )
              throw new ConflictException(
                "Cannot combine stock costs in different currencies",
              );
            if (current.on_hand.isZero()) {
              nextCost = requestedCost;
              nextCurrency = input.costCurrency!;
            } else if (current.average_cost) {
              nextCost = current.average_cost
                .mul(current.on_hand)
                .plus(requestedCost.mul(delta))
                .div(nextOnHand)
                .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
            }
          }
          const movementCost = requestedCost ?? current.average_cost;
          const movementCurrency = requestedCost
            ? input.costCurrency!
            : current.cost_currency;
          const movement = await tx.stockMovement.create({
            data: {
              organizationId: context.organizationId,
              warehouseId: warehouse.id,
              productId: product.id,
              documentType: input.documentType,
              documentId: input.documentId,
              documentLineId: input.documentLineId,
              movementType: input.movementType,
              quantityDelta: delta,
              costPerBaseUnit: movementCost,
              costCurrency: movementCurrency,
              actorUserId,
            },
          });
          if (input.adjustmentId) {
            await tx.stockAdjustment.update({
              where: { id: input.adjustmentId },
              data: {
                status: "POSTED",
                postedMovementId: movement.id,
                postedAt: new Date(),
              },
            });
          }
          await tx.inventoryBalance.update({
            where: {
              organizationId_warehouseId_productId: {
                organizationId: context.organizationId,
                warehouseId: warehouse.id,
                productId: product.id,
              },
            },
            data: {
              onHand: nextOnHand,
              reserved: nextReserved,
              averageCost: nextCost,
              costCurrency: nextCurrency,
              version: { increment: 1 },
            },
          });
          await tx.auditEvent.create({
            data: {
              organizationId: context.organizationId,
              actorUserId,
              entityType: "STOCK_MOVEMENT",
              entityId: movement.id,
              action: "POSTED",
              metadata: {
                movementType: input.movementType,
                quantityDelta: delta.toFixed(6),
                warehouseId: warehouse.id,
                productId: product.id,
              },
            },
          });
          await tx.outboxEvent.create({
            data: {
              organizationId: context.organizationId,
              eventType: "inventory.movement.posted",
              aggregateType: "STOCK_MOVEMENT",
              aggregateId: movement.id,
              payload: {
                movementId: movement.id,
                productId: product.id,
                warehouseId: warehouse.id,
              },
            },
          });
          await tx.idempotencyRecord.update({
            where: {
              organizationId_key: {
                organizationId: context.organizationId,
                key: idempotencyKey,
              },
            },
            data: {
              status: IdempotencyStatus.COMPLETED,
              resultType: "STOCK_MOVEMENT",
              resultId: movement.id,
              response: { movementId: movement.id },
              completedAt: new Date(),
            },
          });
          return movement;
        };
        return await (transaction
          ? execute(transaction)
          : this.prisma.$transaction(execute, {
              isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            }));
      } catch (error) {
        if (isUniqueViolation(error)) {
          const existing = await this.prisma.idempotencyRecord.findUnique({
            where: {
              organizationId_key: {
                organizationId: context.organizationId,
                key: idempotencyKey,
              },
            },
          });
          if (existing && existing.payloadHash !== payloadHash)
            throw new ConflictException(
              "Idempotency key was already used with a different payload",
            );
          if (
            existing?.status === IdempotencyStatus.COMPLETED &&
            existing.resultId
          ) {
            const original = await this.prisma.stockMovement.findFirst({
              where: {
                organizationId: context.organizationId,
                id: existing.resultId,
              },
            });
            if (original) return original;
          }
        }
        if (!transaction && isSerializationFailure(error) && attempt < 2)
          continue;
        throw error;
      }
    }
    throw new ConflictException(
      "Inventory command could not be serialized; retry with the same idempotency key",
    );
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function isSerializationFailure(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  );
}
