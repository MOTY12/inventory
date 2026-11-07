import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { Prisma } from "../generated/prisma/client";
import {
  CatalogStatus,
  ProductType,
  StockMovementType,
  StockTransferStatus,
  MembershipRole,
} from "../generated/prisma/enums";
import { PrismaService } from "../database/prisma.service";
import type { OrganizationContext } from "../organizations/organization-context.guard";
import type {
  CreateTransferDto,
  ReceiveTransferDto,
  TransferQueryDto,
} from "./transfers.dto";

@Injectable()
export class StockTransfersService {
  constructor(private readonly prisma: PrismaService) {}
  private async accessible(ctx: OrganizationContext, ids: string[]) {
    const warehouses = await this.prisma.warehouse.findMany({
      where: {
        organizationId: ctx.organizationId,
        id: { in: ids },
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (warehouses.length !== new Set(ids).size)
      throw new NotFoundException("Active warehouse not found");
    if (ctx.role === MembershipRole.OWNER || ctx.role === MembershipRole.ADMIN)
      return;
    const grants = await this.prisma.membershipWarehouseGrant.findMany({
      where: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        warehouseId: { in: ids },
      },
      select: { warehouseId: true },
    });
    if (new Set(grants.map((x) => x.warehouseId)).size !== new Set(ids).size)
      throw new NotFoundException("Warehouse not found");
  }
  private async sequence(tx: Prisma.TransactionClient, org: string) {
    const rows = await tx.$queryRaw<{ next_number: bigint }[]>(
      Prisma.sql`INSERT INTO stock_transfer_sequences (organization_id,next_number) VALUES (${org}::uuid,2) ON CONFLICT (organization_id) DO UPDATE SET next_number=stock_transfer_sequences.next_number+1 RETURNING next_number-1 AS next_number`,
    );
    return `TR-${String(rows[0].next_number).padStart(6, "0")}`;
  }
  async list(ctx: OrganizationContext, query: TransferQueryDto) {
    const accessibleIds =
      ctx.role === MembershipRole.OWNER || ctx.role === MembershipRole.ADMIN
        ? undefined
        : (
            await this.prisma.membershipWarehouseGrant.findMany({
              where: { organizationId: ctx.organizationId, userId: ctx.userId },
              select: { warehouseId: true },
            })
          ).map((grant) => grant.warehouseId);
    const where: Prisma.StockTransferWhereInput = {
      organizationId: ctx.organizationId,
      ...(accessibleIds
        ? {
            OR: [
              { sourceWarehouseId: { in: accessibleIds } },
              { destinationWarehouseId: { in: accessibleIds } },
            ],
          }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.warehouseId
        ? {
            AND: [
              {
                OR: [
                  { sourceWarehouseId: query.warehouseId },
                  { destinationWarehouseId: query.warehouseId },
                ],
              },
            ],
          }
        : {}),
      ...(query.q
        ? { number: { contains: query.q.trim(), mode: "insensitive" } }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.stockTransfer.findMany({
        where,
        include: {
          sourceWarehouse: true,
          destinationWarehouse: true,
          _count: { select: { lines: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.page_size,
        take: query.page_size,
      }),
      this.prisma.stockTransfer.count({ where }),
    ]);
    return { data, total, page: query.page, page_size: query.page_size };
  }
  async get(ctx: OrganizationContext, id: string) {
    const t = await this.prisma.stockTransfer.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: {
        sourceWarehouse: true,
        destinationWarehouse: true,
        lines: {
          include: {
            product: { include: { baseUnit: true } },
            dispatchLines: true,
            receiptLines: true,
          },
        },
        dispatch: { include: { lines: true } },
        receipts: { include: { lines: true }, orderBy: { receivedAt: "asc" } },
        statusHistory: { orderBy: { occurredAt: "asc" } },
      },
    });
    if (!t) throw new NotFoundException("Stock transfer not found");
    await this.accessible(ctx, [t.sourceWarehouseId, t.destinationWarehouseId]);
    return t;
  }
  async create(
    ctx: OrganizationContext,
    actor: string,
    input: CreateTransferDto,
  ) {
    if (input.sourceWarehouseId === input.destinationWarehouseId)
      throw new ConflictException(
        "Source and destination warehouses must differ",
      );
    if (
      new Set(input.lines.map((l) => l.productId)).size !== input.lines.length
    )
      throw new ConflictException("A product may appear only once");
    await this.accessible(ctx, [
      input.sourceWarehouseId,
      input.destinationWarehouseId,
    ]);
    const products = await this.prisma.product.findMany({
      where: {
        organizationId: ctx.organizationId,
        id: { in: input.lines.map((l) => l.productId) },
        status: CatalogStatus.ACTIVE,
        type: ProductType.STOCKED,
        trackInventory: true,
      },
      include: { baseUnit: true },
    });
    if (products.length !== input.lines.length)
      throw new NotFoundException("Active stocked product not found");
    const byId = new Map(products.map((p) => [p.id, p]));
    const lines = input.lines.map((l) => {
      const q = new Prisma.Decimal(l.quantity),
        p = byId.get(l.productId)!;
      if (q.lte(0) || q.decimalPlaces() > p.baseUnit.precision)
        throw new ConflictException(
          "Transfer quantity is invalid for the product unit",
        );
      return { productId: l.productId, requestedQuantity: q };
    });
    return this.prisma.$transaction(
      async (tx) => {
        const number = await this.sequence(tx, ctx.organizationId);
        const t = await tx.stockTransfer.create({
          data: {
            organizationId: ctx.organizationId,
            number,
            sourceWarehouseId: input.sourceWarehouseId,
            destinationWarehouseId: input.destinationWarehouseId,
            note: input.note?.trim(),
            createdByUserId: actor,
            lines: { create: lines },
          },
        });
        await this.transition(
          tx,
          ctx,
          actor,
          t.id,
          null,
          StockTransferStatus.DRAFT,
          "Draft created",
        );
        await this.audit(tx, ctx, actor, t.id, "CREATED", { number });
        return t;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async submit(ctx: OrganizationContext, actor: string, id: string) {
    const t = await this.get(ctx, id);
    if (t.status !== StockTransferStatus.DRAFT)
      throw new ConflictException("Only draft transfers can be submitted");
    return this.prisma.$transaction(async (tx) => {
      await tx.stockTransfer.update({
        where: {
          organizationId_id: { organizationId: ctx.organizationId, id },
        },
        data: {
          status: StockTransferStatus.SUBMITTED,
          submittedAt: new Date(),
        },
      });
      await this.transition(
        tx,
        ctx,
        actor,
        id,
        t.status,
        StockTransferStatus.SUBMITTED,
      );
      await this.audit(tx, ctx, actor, id, "SUBMITTED", {});
      return this.get(ctx, id);
    });
  }
  async cancel(ctx: OrganizationContext, actor: string, id: string) {
    const t = await this.get(ctx, id);
    if (
      !(
        [
          StockTransferStatus.DRAFT,
          StockTransferStatus.SUBMITTED,
        ] as StockTransferStatus[]
      ).includes(t.status)
    )
      throw new ConflictException("A dispatched transfer cannot be cancelled");
    return this.prisma.$transaction(async (tx) => {
      await tx.stockTransfer.update({
        where: {
          organizationId_id: { organizationId: ctx.organizationId, id },
        },
        data: { status: StockTransferStatus.CANCELLED },
      });
      await this.transition(
        tx,
        ctx,
        actor,
        id,
        t.status,
        StockTransferStatus.CANCELLED,
      );
      await this.audit(tx, ctx, actor, id, "CANCELLED", {});
      return { id, status: StockTransferStatus.CANCELLED };
    });
  }
  async dispatch(
    ctx: OrganizationContext,
    actor: string,
    id: string,
    key: string,
  ) {
    if (!key || key.length > 160)
      throw new ConflictException("A valid Idempotency-Key is required");
    const t = await this.get(ctx, id);
    const hash = createHash("sha256")
      .update(id + ":dispatch")
      .digest("hex");
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM stock_transfers WHERE organization_id=${ctx.organizationId}::uuid AND id=${id}::uuid FOR UPDATE`,
        );
        const prior = await tx.idempotencyRecord.findUnique({
          where: {
            organizationId_key: { organizationId: ctx.organizationId, key },
          },
        });
        if (prior) {
          if (prior.payloadHash !== hash)
            throw new ConflictException("Idempotency key payload mismatch");
          if (prior.resultId)
            return { id: t.id, status: StockTransferStatus.IN_TRANSIT };
          throw new ConflictException("Command is in progress");
        }
        await tx.idempotencyRecord.create({
          data: { organizationId: ctx.organizationId, key, payloadHash: hash },
        });
        const current = await tx.stockTransfer.findFirst({
          where: { id, organizationId: ctx.organizationId },
          include: { lines: true },
        });
        if (!current || current.status !== StockTransferStatus.SUBMITTED)
          throw new ConflictException(
            "Transfer must be submitted before dispatch",
          );
        const pairs = current.lines
          .map((x) => ({ w: current.sourceWarehouseId, p: x.productId }))
          .sort((a, b) => `${a.w}${a.p}`.localeCompare(`${b.w}${b.p}`));
        const costs = new Map<
          string,
          { cost: Prisma.Decimal | null; currency: string | null }
        >();
        for (const pair of pairs) {
          await tx.inventoryBalance.upsert({
            where: {
              organizationId_warehouseId_productId: {
                organizationId: ctx.organizationId,
                warehouseId: pair.w,
                productId: pair.p,
              },
            },
            create: {
              organizationId: ctx.organizationId,
              warehouseId: pair.w,
              productId: pair.p,
            },
            update: {},
          });
          const rows = await tx.$queryRaw<
            {
              on_hand: Prisma.Decimal;
              reserved: Prisma.Decimal;
              average_cost: Prisma.Decimal | null;
              cost_currency: string | null;
            }[]
          >(
            Prisma.sql`SELECT on_hand,reserved,average_cost,cost_currency FROM inventory_balances WHERE organization_id=${ctx.organizationId}::uuid AND warehouse_id=${pair.w}::uuid AND product_id=${pair.p}::uuid FOR UPDATE`,
          );
          const line = current.lines.find((x) => x.productId === pair.p)!;
          if (
            rows[0].on_hand.minus(rows[0].reserved).lt(line.requestedQuantity)
          )
            throw new ConflictException(
              "Insufficient available stock for dispatch",
            );
          costs.set(pair.p, {
            cost: rows[0].average_cost,
            currency: rows[0].cost_currency,
          });
        }
        const dispatch = await tx.stockTransferDispatch.create({
          data: {
            organizationId: ctx.organizationId,
            transferId: id,
            dispatchedByUserId: actor,
          },
        });
        for (const line of current.lines) {
          const bal = await tx.inventoryBalance.findUniqueOrThrow({
            where: {
              organizationId_warehouseId_productId: {
                organizationId: ctx.organizationId,
                warehouseId: current.sourceWarehouseId,
                productId: line.productId,
              },
            },
          });
          const cost = costs.get(line.productId)!;
          const movement = await tx.stockMovement.create({
            data: {
              organizationId: ctx.organizationId,
              warehouseId: current.sourceWarehouseId,
              productId: line.productId,
              documentType: "STOCK_TRANSFER",
              documentId: id,
              documentLineId: line.id,
              movementType: StockMovementType.TRANSFER_OUT,
              quantityDelta: line.requestedQuantity.negated(),
              costPerBaseUnit: cost.cost,
              costCurrency: cost.currency,
              actorUserId: actor,
            },
          });
          await tx.inventoryBalance.update({
            where: {
              organizationId_warehouseId_productId: {
                organizationId: ctx.organizationId,
                warehouseId: current.sourceWarehouseId,
                productId: line.productId,
              },
            },
            data: {
              onHand: bal.onHand.minus(line.requestedQuantity),
              inTransit: bal.inTransit.plus(line.requestedQuantity),
              version: { increment: 1 },
            },
          });
          await tx.stockTransferDispatchLine.create({
            data: {
              organizationId: ctx.organizationId,
              dispatchId: dispatch.id,
              transferLineId: line.id,
              quantity: line.requestedQuantity,
              movementId: movement.id,
              costPerBaseUnit: cost.cost,
              costCurrency: cost.currency,
            },
          });
          await this.movementEvents(
            tx,
            ctx,
            actor,
            movement.id,
            current.sourceWarehouseId,
            line.productId,
            line.requestedQuantity.negated(),
          );
        }
        await tx.stockTransfer.update({
          where: {
            organizationId_id: { organizationId: ctx.organizationId, id },
          },
          data: {
            status: StockTransferStatus.IN_TRANSIT,
            dispatchedAt: new Date(),
          },
        });
        await this.transition(
          tx,
          ctx,
          actor,
          id,
          current.status,
          StockTransferStatus.IN_TRANSIT,
        );
        await this.audit(tx, ctx, actor, id, "DISPATCHED", {});
        await tx.outboxEvent.create({
          data: {
            organizationId: ctx.organizationId,
            eventType: "inventory.transfer.dispatched",
            aggregateType: "STOCK_TRANSFER",
            aggregateId: id,
            payload: { transferId: id },
          },
        });
        await tx.idempotencyRecord.update({
          where: {
            organizationId_key: { organizationId: ctx.organizationId, key },
          },
          data: {
            status: "COMPLETED",
            resultType: "STOCK_TRANSFER",
            resultId: id,
            completedAt: new Date(),
          },
        });
        return { id, status: StockTransferStatus.IN_TRANSIT };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async receive(
    ctx: OrganizationContext,
    actor: string,
    id: string,
    key: string,
    input: ReceiveTransferDto,
  ) {
    if (!key || key.length > 160)
      throw new ConflictException("A valid Idempotency-Key is required");
    const hash = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    await this.get(ctx, id);
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM stock_transfers WHERE organization_id=${ctx.organizationId}::uuid AND id=${id}::uuid FOR UPDATE`,
        );
        const existing = await tx.stockTransferReceipt.findFirst({
          where: { organizationId: ctx.organizationId, idempotencyKey: key },
        });
        if (existing) {
          if (existing.transferId !== id)
            throw new ConflictException("Idempotency key was already used");
          const old = await tx.idempotencyRecord.findUnique({
            where: {
              organizationId_key: { organizationId: ctx.organizationId, key },
            },
          });
          if (old && old.payloadHash !== hash)
            throw new ConflictException("Idempotency key payload mismatch");
          return existing;
        }
        const t = await tx.stockTransfer.findFirst({
          where: { id, organizationId: ctx.organizationId },
          include: {
            lines: { include: { dispatchLines: true, receiptLines: true } },
          },
        });
        if (!t) throw new NotFoundException("Stock transfer not found");
        if (
          !(
            [
              StockTransferStatus.IN_TRANSIT,
              StockTransferStatus.PARTIALLY_RECEIVED,
            ] as StockTransferStatus[]
          ).includes(t.status)
        )
          throw new ConflictException("Transfer is not awaiting receipt");
        await tx.idempotencyRecord.create({
          data: { organizationId: ctx.organizationId, key, payloadHash: hash },
        });
        const receipt = await tx.stockTransferReceipt.create({
          data: {
            organizationId: ctx.organizationId,
            transferId: id,
            idempotencyKey: key,
            note: input.note?.trim(),
            receivedByUserId: actor,
          },
        });
        for (const inputLine of input.lines) {
          const line = t.lines.find((x) => x.id === inputLine.transferLineId);
          if (!line) throw new NotFoundException("Transfer line not found");
          const q = new Prisma.Decimal(inputLine.quantity);
          const received = line.receiptLines.reduce(
            (a, x) => a.plus(x.quantity),
            new Prisma.Decimal(0),
          );
          if (q.lte(0) || received.plus(q).gt(line.requestedQuantity))
            throw new ConflictException("Receipt exceeds dispatched quantity");
          const dispatch = line.dispatchLines[0];
          if (!dispatch)
            throw new ConflictException(
              "Transfer line has not been dispatched",
            );
          const source = await tx.inventoryBalance.findUniqueOrThrow({
            where: {
              organizationId_warehouseId_productId: {
                organizationId: ctx.organizationId,
                warehouseId: t.sourceWarehouseId,
                productId: line.productId,
              },
            },
          });
          if (source.inTransit.lt(q))
            throw new ConflictException("In-transit balance is insufficient");
          await tx.inventoryBalance.upsert({
            where: {
              organizationId_warehouseId_productId: {
                organizationId: ctx.organizationId,
                warehouseId: t.destinationWarehouseId,
                productId: line.productId,
              },
            },
            create: {
              organizationId: ctx.organizationId,
              warehouseId: t.destinationWarehouseId,
              productId: line.productId,
            },
            update: {},
          });
          const dest = await tx.inventoryBalance.findUniqueOrThrow({
            where: {
              organizationId_warehouseId_productId: {
                organizationId: ctx.organizationId,
                warehouseId: t.destinationWarehouseId,
                productId: line.productId,
              },
            },
          });
          if (
            dest.averageCost &&
            dispatch.costCurrency &&
            dest.costCurrency !== dispatch.costCurrency
          )
            throw new ConflictException(
              "Transfer cost currency does not match destination balance",
            );
          const next = dest.onHand.plus(q);
          const average = dispatch.costPerBaseUnit
            ? dest.onHand.isZero()
              ? dispatch.costPerBaseUnit
              : dest.averageCost
                ? dest.averageCost
                    .mul(dest.onHand)
                    .plus(dispatch.costPerBaseUnit.mul(q))
                    .div(next)
                    .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)
                : dispatch.costPerBaseUnit
            : dest.averageCost;
          const movement = await tx.stockMovement.create({
            data: {
              organizationId: ctx.organizationId,
              warehouseId: t.destinationWarehouseId,
              productId: line.productId,
              documentType: "STOCK_TRANSFER",
              documentId: id,
              documentLineId: line.id,
              movementType: StockMovementType.TRANSFER_IN,
              quantityDelta: q,
              costPerBaseUnit: dispatch.costPerBaseUnit,
              costCurrency: dispatch.costCurrency,
              actorUserId: actor,
            },
          });
          await tx.inventoryBalance.update({
            where: {
              organizationId_warehouseId_productId: {
                organizationId: ctx.organizationId,
                warehouseId: t.sourceWarehouseId,
                productId: line.productId,
              },
            },
            data: {
              inTransit: source.inTransit.minus(q),
              version: { increment: 1 },
            },
          });
          await tx.inventoryBalance.update({
            where: {
              organizationId_warehouseId_productId: {
                organizationId: ctx.organizationId,
                warehouseId: t.destinationWarehouseId,
                productId: line.productId,
              },
            },
            data: {
              onHand: next,
              averageCost: average,
              costCurrency: dispatch.costCurrency ?? dest.costCurrency,
              version: { increment: 1 },
            },
          });
          await tx.stockTransferReceiptLine.create({
            data: {
              organizationId: ctx.organizationId,
              receiptId: receipt.id,
              transferLineId: line.id,
              quantity: q,
              movementId: movement.id,
            },
          });
          await this.movementEvents(
            tx,
            ctx,
            actor,
            movement.id,
            t.destinationWarehouseId,
            line.productId,
            q,
          );
        }
        const updated = await tx.stockTransfer.findFirstOrThrow({
          where: { id, organizationId: ctx.organizationId },
          include: { lines: { include: { receiptLines: true } } },
        });
        const done = updated.lines.every((l) =>
          l.receiptLines
            .reduce((a, x) => a.plus(x.quantity), new Prisma.Decimal(0))
            .equals(l.requestedQuantity),
        );
        const next = done
          ? StockTransferStatus.RECEIVED
          : StockTransferStatus.PARTIALLY_RECEIVED;
        await tx.stockTransfer.update({
          where: {
            organizationId_id: { organizationId: ctx.organizationId, id },
          },
          data: { status: next, ...(done ? { completedAt: new Date() } : {}) },
        });
        await this.transition(tx, ctx, actor, id, t.status, next, input.note);
        await this.audit(tx, ctx, actor, id, "RECEIVED", {
          receiptId: receipt.id,
        });
        await tx.outboxEvent.create({
          data: {
            organizationId: ctx.organizationId,
            eventType: "inventory.transfer.received",
            aggregateType: "STOCK_TRANSFER",
            aggregateId: id,
            payload: { transferId: id, receiptId: receipt.id },
          },
        });
        await tx.idempotencyRecord.update({
          where: {
            organizationId_key: { organizationId: ctx.organizationId, key },
          },
          data: {
            status: "COMPLETED",
            resultType: "STOCK_TRANSFER_RECEIPT",
            resultId: receipt.id,
            completedAt: new Date(),
          },
        });
        return receipt;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  private async transition(
    tx: Prisma.TransactionClient,
    ctx: OrganizationContext,
    actor: string,
    id: string,
    from: StockTransferStatus | null,
    to: StockTransferStatus,
    note?: string,
  ) {
    await tx.stockTransferStatusHistory.create({
      data: {
        organizationId: ctx.organizationId,
        transferId: id,
        fromStatus: from,
        toStatus: to,
        actorUserId: actor,
        note,
      },
    });
  }
  private async audit(
    tx: Prisma.TransactionClient,
    ctx: OrganizationContext,
    actor: string,
    id: string,
    action: string,
    metadata: Prisma.InputJsonValue,
  ) {
    await tx.auditEvent.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: actor,
        entityType: "STOCK_TRANSFER",
        entityId: id,
        action,
        metadata,
      },
    });
  }
  private async movementEvents(
    tx: Prisma.TransactionClient,
    ctx: OrganizationContext,
    actor: string,
    id: string,
    warehouseId: string,
    productId: string,
    delta: Prisma.Decimal,
  ) {
    await tx.auditEvent.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: actor,
        entityType: "STOCK_MOVEMENT",
        entityId: id,
        action: "POSTED",
        metadata: {
          movementType: delta.isNegative() ? "TRANSFER_OUT" : "TRANSFER_IN",
          warehouseId,
          productId,
          quantityDelta: delta.toFixed(6),
        },
      },
    });
    await tx.outboxEvent.create({
      data: {
        organizationId: ctx.organizationId,
        eventType: "inventory.movement.posted",
        aggregateType: "STOCK_MOVEMENT",
        aggregateId: id,
        payload: { movementId: id, warehouseId, productId },
      },
    });
  }
}
