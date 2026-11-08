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
import { InventoryPostingService } from "./inventory-posting.service";

@Injectable()
export class StockTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: InventoryPostingService,
  ) {}
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
    return this.prisma.$transaction(async (tx) => {
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
    });
  }
  async submit(ctx: OrganizationContext, actor: string, id: string) {
    await this.get(ctx, id);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM stock_transfers WHERE organization_id=${ctx.organizationId}::uuid AND id=${id}::uuid FOR UPDATE`,
      );
      const locked = await tx.stockTransfer.findFirst({
        where: { organizationId: ctx.organizationId, id },
      });
      if (!locked) throw new NotFoundException("Stock transfer not found");
      if (locked.status !== StockTransferStatus.DRAFT)
        throw new ConflictException("Only draft transfers can be submitted");
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
        locked.status,
        StockTransferStatus.SUBMITTED,
      );
      await this.audit(tx, ctx, actor, id, "SUBMITTED", {});
      return this.get(ctx, id);
    });
  }
  async cancel(ctx: OrganizationContext, actor: string, id: string) {
    await this.get(ctx, id);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM stock_transfers WHERE organization_id=${ctx.organizationId}::uuid AND id=${id}::uuid FOR UPDATE`,
      );
      const locked = await tx.stockTransfer.findFirst({
        where: { organizationId: ctx.organizationId, id },
      });
      if (!locked) throw new NotFoundException("Stock transfer not found");
      if (
        !(
          [
            StockTransferStatus.DRAFT,
            StockTransferStatus.SUBMITTED,
          ] as StockTransferStatus[]
        ).includes(locked.status)
      )
        throw new ConflictException(
          "A dispatched transfer cannot be cancelled",
        );
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
        locked.status,
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
          if (prior.resultId) {
            if (prior.status !== "COMPLETED" || prior.resultId !== id)
              throw new ConflictException(
                "Stored dispatch result is unavailable",
              );
            return { id: t.id, status: t.status };
          }
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
        const orderedLines = [...current.lines].sort((a, b) =>
          `${current.sourceWarehouseId}${a.productId}`.localeCompare(
            `${current.sourceWarehouseId}${b.productId}`,
          ),
        );
        const dispatch = await tx.stockTransferDispatch.create({
          data: {
            organizationId: ctx.organizationId,
            transferId: id,
            dispatchedByUserId: actor,
          },
        });
        for (const line of orderedLines) {
          const posted = await this.posting.postTransferOut(tx, ctx, actor, {
            transferId: id,
            transferLineId: line.id,
            warehouseId: current.sourceWarehouseId,
            productId: line.productId,
            quantity: line.requestedQuantity,
          });
          await tx.stockTransferDispatchLine.create({
            data: {
              organizationId: ctx.organizationId,
              dispatchId: dispatch.id,
              transferLineId: line.id,
              quantity: line.requestedQuantity,
              movementId: posted.movement.id,
              costPerBaseUnit: posted.costPerBaseUnit,
              costCurrency: posted.costCurrency,
            },
          });
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
    if (
      new Set(input.lines.map((line) => line.transferLineId)).size !==
      input.lines.length
    )
      throw new ConflictException(
        "A transfer line may appear only once per receipt",
      );
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
        const receiptRows = input.lines
          .map((inputLine) => {
            const line = t.lines.find((x) => x.id === inputLine.transferLineId);
            if (!line) throw new NotFoundException("Transfer line not found");
            const quantity = new Prisma.Decimal(inputLine.quantity);
            const received = line.receiptLines.reduce(
              (sum, receiptLine) => sum.plus(receiptLine.quantity),
              new Prisma.Decimal(0),
            );
            if (
              quantity.lte(0) ||
              received.plus(quantity).gt(line.requestedQuantity)
            )
              throw new ConflictException(
                "Receipt exceeds dispatched quantity",
              );
            const dispatchLine = line.dispatchLines[0];
            if (!dispatchLine)
              throw new ConflictException(
                "Transfer line has not been dispatched",
              );
            return { line, quantity, dispatchLine };
          })
          .sort((a, b) =>
            `${t.sourceWarehouseId}${a.line.productId}`.localeCompare(
              `${t.sourceWarehouseId}${b.line.productId}`,
            ),
          );
        for (const { line, quantity, dispatchLine } of receiptRows) {
          const movement = await this.posting.postTransferIn(tx, ctx, actor, {
            transferId: id,
            transferLineId: line.id,
            sourceWarehouseId: t.sourceWarehouseId,
            destinationWarehouseId: t.destinationWarehouseId,
            productId: line.productId,
            quantity,
            costPerBaseUnit: dispatchLine.costPerBaseUnit,
            costCurrency: dispatchLine.costCurrency,
          });
          await tx.stockTransferReceiptLine.create({
            data: {
              organizationId: ctx.organizationId,
              receiptId: receipt.id,
              transferLineId: line.id,
              quantity,
              movementId: movement.id,
            },
          });
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
}
