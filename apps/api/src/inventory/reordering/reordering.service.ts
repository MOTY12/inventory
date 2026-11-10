import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import {
  CatalogStatus,
  LowStockAlertEventType,
  LowStockAlertStatus,
  MembershipRole,
  ProductType,
  ReorderRuleStatus,
  WarehouseStatus,
} from "../../generated/prisma/enums";
import { PrismaService } from "../../database/prisma.service";
import type { OrganizationContext } from "../../organizations/organization-context.guard";
import type {
  CreateReorderRuleDto,
  LowStockListQueryDto,
  ReorderRuleListQueryDto,
  UpdateReorderRuleDto,
} from "./reordering.dto";

const PAGE_LIMIT = 100;
const SERIALIZATION_RETRIES = 5;

@Injectable()
export class ReorderingService {
  private readonly logger = new Logger(ReorderingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    context: OrganizationContext,
    actorUserId: string,
    input: CreateReorderRuleDto,
  ) {
    await this.requireWarehouse(context, input.warehouseId);
    const product = await this.requireProduct(
      context.organizationId,
      input.productId,
    );
    const quantities = this.validateQuantities(
      input.minimumQuantity,
      input.targetQuantity,
      product.baseUnit.precision,
    );
    let rule;
    try {
      rule = await this.prisma.$transaction(async (tx) => {
        const created = await tx.reorderRule.create({
          data: {
            organizationId: context.organizationId,
            productId: input.productId,
            warehouseId: input.warehouseId,
            minimumQuantity: quantities.minimum,
            targetQuantity: quantities.target,
            status: input.status ?? ReorderRuleStatus.ACTIVE,
            createdByUserId: actorUserId,
          },
        });
        await tx.auditEvent.create({
          data: {
            organizationId: context.organizationId,
            actorUserId,
            entityType: "REORDER_RULE",
            entityId: created.id,
            action: "CREATED",
            metadata: {
              productId: created.productId,
              warehouseId: created.warehouseId,
              minimumQuantity: quantities.minimum.toFixed(6),
              targetQuantity: quantities.target.toFixed(6),
              status: created.status,
            },
          },
        });
        return created;
      });
    } catch (error) {
      if (isUnique(error))
        throw new ConflictException(
          "A reorder rule already exists for this product and warehouse",
        );
      throw error;
    }
    await this.evaluateRule(context.organizationId, rule.id, actorUserId);
    return this.getRule(context, rule.id);
  }

  async update(
    context: OrganizationContext,
    actorUserId: string,
    ruleId: string,
    input: UpdateReorderRuleDto,
  ) {
    const existing = await this.findRule(context, ruleId);
    await this.requireWarehouse(context, existing.warehouseId);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM reorder_rules
        WHERE id = ${ruleId}::uuid
          AND organization_id = ${context.organizationId}::uuid
        FOR UPDATE
      `);
      const current = await tx.reorderRule.findFirst({
        where: { id: ruleId, organizationId: context.organizationId },
      });
      if (!current) throw new NotFoundException("Reorder rule not found");
      const product = await tx.product.findFirst({
        where: {
          id: current.productId,
          organizationId: context.organizationId,
        },
        select: { baseUnit: { select: { precision: true } } },
      });
      if (!product) throw new NotFoundException("Product not found");
      const quantities = this.validateQuantities(
        input.minimumQuantity ?? current.minimumQuantity.toString(),
        input.targetQuantity ?? current.targetQuantity.toString(),
        product.baseUnit.precision,
      );
      const updated = await tx.reorderRule.update({
        where: { id: ruleId },
        data: {
          minimumQuantity: quantities.minimum,
          targetQuantity: quantities.target,
          ...(input.status ? { status: input.status } : {}),
        },
      });
      await tx.auditEvent.create({
        data: {
          organizationId: context.organizationId,
          actorUserId,
          entityType: "REORDER_RULE",
          entityId: ruleId,
          action: "UPDATED",
          metadata: {
            before: {
              minimumQuantity: current.minimumQuantity.toFixed(6),
              targetQuantity: current.targetQuantity.toFixed(6),
              status: current.status,
            },
            after: {
              minimumQuantity: updated.minimumQuantity.toFixed(6),
              targetQuantity: updated.targetQuantity.toFixed(6),
              status: updated.status,
            },
          },
        },
      });
    });
    await this.evaluateRule(context.organizationId, ruleId, actorUserId);
    return this.getRule(context, ruleId);
  }

  async listRules(
    context: OrganizationContext,
    query: ReorderRuleListQueryDto,
  ) {
    const warehouseIds = await this.visibleWarehouseIds(context);
    const where: Prisma.ReorderRuleWhereInput = {
      organizationId: context.organizationId,
      ...(warehouseIds ? { warehouseId: { in: warehouseIds } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.q
        ? {
            OR: [
              { product: { name: { contains: query.q, mode: "insensitive" } } },
              { product: { sku: { contains: query.q, mode: "insensitive" } } },
              {
                warehouse: { name: { contains: query.q, mode: "insensitive" } },
              },
              {
                warehouse: { code: { contains: query.q, mode: "insensitive" } },
              },
            ],
          }
        : {}),
    };
    if (warehouseIds && warehouseIds.length === 0)
      return {
        data: [],
        total: 0,
        page: query.page,
        page_size: query.page_size,
      };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.reorderRule.findMany({
        where,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              status: true,
              type: true,
              trackInventory: true,
              baseUnit: { select: { code: true, precision: true } },
              inventoryBalances: {
                where: { organizationId: context.organizationId },
                select: { warehouseId: true, onHand: true, reserved: true },
              },
            },
          },
          warehouse: {
            select: { id: true, name: true, code: true, status: true },
          },
          alert: { select: { status: true, lastEvaluatedAt: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: (query.page - 1) * query.page_size,
        take: query.page_size,
      }),
      this.prisma.reorderRule.count({ where }),
    ]);
    const data = rows.map((rule) => {
      const balance = rule.product.inventoryBalances.find(
        (item) => item.warehouseId === rule.warehouseId,
      );
      const { inventoryBalances: _balances, ...product } = rule.product;
      void _balances;
      return {
        ...rule,
        product,
        availableQuantity: (balance?.onHand ?? new Prisma.Decimal(0)).minus(
          balance?.reserved ?? new Prisma.Decimal(0),
        ),
      };
    });
    return { data, total, page: query.page, page_size: query.page_size };
  }

  async listAlerts(context: OrganizationContext, query: LowStockListQueryDto) {
    const warehouseIds = await this.visibleWarehouseIds(context);
    const status = query.status ?? "OPEN";
    const where: Prisma.LowStockAlertWhereInput = {
      organizationId: context.organizationId,
      status,
      rule: {
        ...(status === "OPEN" ? { status: ReorderRuleStatus.ACTIVE } : {}),
        ...(warehouseIds ? { warehouseId: { in: warehouseIds } } : {}),
        ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        ...(query.q
          ? {
              OR: [
                {
                  product: { name: { contains: query.q, mode: "insensitive" } },
                },
                {
                  product: { sku: { contains: query.q, mode: "insensitive" } },
                },
                {
                  warehouse: {
                    name: { contains: query.q, mode: "insensitive" },
                  },
                },
                {
                  warehouse: {
                    code: { contains: query.q, mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
      },
    };
    if (warehouseIds && warehouseIds.length === 0)
      return {
        data: [],
        total: 0,
        summary: { products: 0, warehouses: 0 },
        page: query.page,
        page_size: query.page_size,
      };
    const [rows, total, summaryRows] = await this.prisma.$transaction([
      this.prisma.lowStockAlert.findMany({
        where,
        include: {
          rule: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  status: true,
                  baseUnit: { select: { code: true } },
                  inventoryBalances: {
                    where: { organizationId: context.organizationId },
                    select: { warehouseId: true, onHand: true, reserved: true },
                  },
                },
              },
              warehouse: { select: { id: true, name: true, code: true } },
            },
          },
        },
        orderBy: [{ lastEvaluatedAt: "desc" }, { id: "asc" }],
        skip: (query.page - 1) * query.page_size,
        take: query.page_size,
      }),
      this.prisma.lowStockAlert.count({ where }),
      this.prisma.lowStockAlert.findMany({
        where,
        select: { rule: { select: { productId: true, warehouseId: true } } },
      }),
    ]);
    const data = rows.map((alert) => {
      const balance = alert.rule.product.inventoryBalances.find(
        (item) => item.warehouseId === alert.rule.warehouseId,
      );
      const onHand = balance?.onHand ?? new Prisma.Decimal(0);
      const reserved = balance?.reserved ?? new Prisma.Decimal(0);
      const available = onHand.minus(reserved);
      const suggested = Prisma.Decimal.max(
        alert.rule.targetQuantity.minus(available),
        new Prisma.Decimal(0),
      );
      return {
        ...alert,
        product: alert.rule.product,
        warehouse: alert.rule.warehouse,
        minimumQuantity: alert.rule.minimumQuantity,
        targetQuantity: alert.rule.targetQuantity,
        onHandQuantity: onHand,
        reservedQuantity: reserved,
        availableQuantity: available,
        incomingQuantity: new Prisma.Decimal(0),
        projectedAvailableQuantity: available,
        suggestedQuantity: suggested,
        formula:
          "Available = on hand - reserved. Projected available excludes purchase orders and in-transit stock.",
      };
    });
    return {
      data,
      total,
      summary: {
        products: new Set(summaryRows.map((item) => item.rule.productId)).size,
        warehouses: new Set(summaryRows.map((item) => item.rule.warehouseId))
          .size,
      },
      page: query.page,
      page_size: query.page_size,
    };
  }

  async history(context: OrganizationContext, ruleId: string) {
    const rule = await this.findRule(context, ruleId);
    await this.requireWarehouse(context, rule.warehouseId);
    const alert = await this.prisma.lowStockAlert.findUnique({
      where: {
        organizationId_reorderRuleId: {
          organizationId: context.organizationId,
          reorderRuleId: ruleId,
        },
      },
      select: { id: true },
    });
    if (!alert) return [];
    return this.prisma.lowStockAlertHistory.findMany({
      where: { organizationId: context.organizationId, alertId: alert.id },
      include: { actor: { include: { user: { select: { email: true } } } } },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: 100,
    });
  }

  async evaluateOrganization(context: OrganizationContext) {
    const warehouseIds = await this.visibleWarehouseIds(context);
    return this.evaluateRules(
      context.organizationId,
      warehouseIds,
      context.userId,
    );
  }

  async evaluateAll() {
    return this.evaluateRules(undefined, null, null);
  }

  private async evaluateRules(
    organizationId: string | undefined,
    warehouseIds: string[] | null,
    actorUserId: string | null,
  ) {
    const result = {
      evaluated: 0,
      opened: 0,
      reopened: 0,
      resolved: 0,
      updated: 0,
      unchanged: 0,
      failed: 0,
    };
    if (warehouseIds && warehouseIds.length === 0) return result;
    let cursor: string | undefined;
    for (;;) {
      const rules = await this.prisma.reorderRule.findMany({
        where: {
          ...(organizationId ? { organizationId } : {}),
          ...(warehouseIds ? { warehouseId: { in: warehouseIds } } : {}),
        },
        select: { id: true, organizationId: true },
        orderBy: { id: "asc" },
        take: PAGE_LIMIT,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!rules.length) break;
      for (const rule of rules) {
        try {
          const event = await this.evaluateRule(
            rule.organizationId,
            rule.id,
            actorUserId,
          );
          result.evaluated += 1;
          if (event === "OPENED") result.opened += 1;
          else if (event === "REOPENED") result.reopened += 1;
          else if (event === "RESOLVED") result.resolved += 1;
          else if (event === "UPDATED") result.updated += 1;
          else result.unchanged += 1;
        } catch (error) {
          result.failed += 1;
          this.logger.error(
            JSON.stringify({
              message:
                "Low-stock rule evaluation failed; it will retry on the next pass",
              organizationId: rule.organizationId,
              reorderRuleId: rule.id,
              error: error instanceof Error ? error.message : "unknown error",
            }),
          );
        }
      }
      cursor = rules[rules.length - 1]?.id;
      if (rules.length < PAGE_LIMIT) break;
    }
    return result;
  }

  private async evaluateRule(
    organizationId: string,
    ruleId: string,
    actorUserId: string | null,
    attempt = 0,
  ): Promise<"OPENED" | "REOPENED" | "RESOLVED" | "UPDATED" | "UNCHANGED"> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
            SELECT id FROM reorder_rules
            WHERE organization_id = ${organizationId}::uuid AND id = ${ruleId}::uuid
            FOR UPDATE
          `);
          if (!locked.length) return "UNCHANGED";
          const rule = await tx.reorderRule.findUniqueOrThrow({
            where: { id: ruleId },
            include: {
              product: {
                select: { status: true, type: true, trackInventory: true },
              },
              warehouse: { select: { status: true } },
            },
          });
          const balance = await tx.inventoryBalance.findUnique({
            where: {
              organizationId_warehouseId_productId: {
                organizationId,
                warehouseId: rule.warehouseId,
                productId: rule.productId,
              },
            },
            select: { onHand: true, reserved: true },
          });
          const onHand = balance?.onHand ?? new Prisma.Decimal(0);
          const reserved = balance?.reserved ?? new Prisma.Decimal(0);
          const available = onHand.minus(reserved);
          const low =
            rule.status === ReorderRuleStatus.ACTIVE &&
            rule.product.status === CatalogStatus.ACTIVE &&
            rule.product.type === ProductType.STOCKED &&
            rule.product.trackInventory &&
            rule.warehouse.status === WarehouseStatus.ACTIVE &&
            available.lt(rule.minimumQuantity);
          const suggested = Prisma.Decimal.max(
            rule.targetQuantity.minus(available),
            new Prisma.Decimal(0),
          );
          const now = new Date();
          const prior = await tx.lowStockAlert.findUnique({
            where: {
              organizationId_reorderRuleId: {
                organizationId,
                reorderRuleId: ruleId,
              },
            },
          });
          const snapshot = {
            onHandQuantity: onHand,
            reservedQuantity: reserved,
            availableQuantity: available,
            minimumQuantity: rule.minimumQuantity,
            targetQuantity: rule.targetQuantity,
            suggestedQuantity: suggested,
            lastEvaluatedAt: now,
          };
          let event:
            "OPENED" | "REOPENED" | "RESOLVED" | "UPDATED" | "UNCHANGED" =
            "UNCHANGED";
          let eventReason: string | null = null;
          let alertId = prior?.id;
          if (low && !prior) {
            const alert = await tx.lowStockAlert.create({
              data: {
                organizationId,
                reorderRuleId: ruleId,
                ...snapshot,
              },
            });
            alertId = alert.id;
            event = "OPENED";
          } else if (low && prior?.status === LowStockAlertStatus.RESOLVED) {
            await tx.lowStockAlert.update({
              where: { id: prior.id },
              data: {
                ...snapshot,
                status: LowStockAlertStatus.OPEN,
                resolutionReason: null,
                openedAt: now,
                resolvedAt: null,
              },
            });
            event = "REOPENED";
          } else if (low && prior?.status === LowStockAlertStatus.OPEN) {
            const changed =
              !prior.onHandQuantity.equals(onHand) ||
              !prior.reservedQuantity.equals(reserved) ||
              !prior.availableQuantity.equals(available) ||
              !prior.minimumQuantity.equals(rule.minimumQuantity) ||
              !prior.targetQuantity.equals(rule.targetQuantity) ||
              !prior.suggestedQuantity.equals(suggested);
            await tx.lowStockAlert.update({
              where: { id: prior.id },
              data: snapshot,
            });
            if (changed) event = "UPDATED";
          } else if (!low && prior?.status === LowStockAlertStatus.OPEN) {
            const reason =
              rule.status !== ReorderRuleStatus.ACTIVE
                ? "RULE_DISABLED"
                : rule.product.status !== CatalogStatus.ACTIVE ||
                    rule.product.type !== ProductType.STOCKED ||
                    !rule.product.trackInventory
                  ? "PRODUCT_UNAVAILABLE"
                  : rule.warehouse.status !== WarehouseStatus.ACTIVE
                    ? "WAREHOUSE_UNAVAILABLE"
                    : "STOCK_RECOVERED";
            eventReason = reason;
            await tx.lowStockAlert.update({
              where: { id: prior.id },
              data: {
                ...snapshot,
                status: LowStockAlertStatus.RESOLVED,
                resolutionReason: reason,
                resolvedAt: now,
              },
            });
            event = "RESOLVED";
          } else if (prior) {
            await tx.lowStockAlert.update({
              where: { id: prior.id },
              data: { lastEvaluatedAt: now },
            });
          }
          await tx.reorderRule.update({
            where: { id: ruleId },
            data: { lastEvaluatedAt: now },
          });
          if (alertId && event !== "UNCHANGED") {
            await tx.lowStockAlertHistory.create({
              data: {
                organizationId,
                reorderRuleId: ruleId,
                alertId,
                eventType: event as LowStockAlertEventType,
                reason: eventReason,
                onHandQuantity: onHand,
                reservedQuantity: reserved,
                availableQuantity: available,
                minimumQuantity: rule.minimumQuantity,
                targetQuantity: rule.targetQuantity,
                suggestedQuantity: suggested,
                actorUserId,
              },
            });
          }
          return event;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isSerialization(error) && attempt < SERIALIZATION_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
        return this.evaluateRule(
          organizationId,
          ruleId,
          actorUserId,
          attempt + 1,
        );
      }
      throw error;
    }
  }

  private async getRule(context: OrganizationContext, id: string) {
    const rule = await this.findRule(context, id);
    await this.requireWarehouse(context, rule.warehouseId);
    return this.prisma.reorderRule.findUniqueOrThrow({
      where: { id },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            baseUnit: { select: { code: true } },
          },
        },
        warehouse: { select: { id: true, name: true, code: true } },
        alert: { select: { id: true, status: true, lastEvaluatedAt: true } },
      },
    });
  }

  private async findRule(context: OrganizationContext, id: string) {
    const rule = await this.prisma.reorderRule.findFirst({
      where: { id, organizationId: context.organizationId },
      select: {
        id: true,
        productId: true,
        warehouseId: true,
        minimumQuantity: true,
        targetQuantity: true,
        status: true,
      },
    });
    if (!rule) throw new NotFoundException("Reorder rule not found");
    return rule;
  }

  private async requireProduct(organizationId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        organizationId,
        id: productId,
        status: CatalogStatus.ACTIVE,
        type: ProductType.STOCKED,
        trackInventory: true,
      },
      select: { id: true, baseUnit: { select: { precision: true } } },
    });
    if (!product)
      throw new NotFoundException("Active stocked product not found");
    return product;
  }

  private async requireWarehouse(
    context: OrganizationContext,
    warehouseId: string,
  ) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: {
        id: warehouseId,
        organizationId: context.organizationId,
        status: WarehouseStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!warehouse) throw new NotFoundException("Active warehouse not found");
    if (
      context.role === MembershipRole.OWNER ||
      context.role === MembershipRole.ADMIN
    )
      return;
    const grant = await this.prisma.membershipWarehouseGrant.findUnique({
      where: {
        organizationId_userId_warehouseId: {
          organizationId: context.organizationId,
          userId: context.userId,
          warehouseId,
        },
      },
      select: { warehouseId: true },
    });
    if (!grant) throw new NotFoundException("Active warehouse not found");
  }

  private async visibleWarehouseIds(
    context: OrganizationContext,
  ): Promise<string[] | null> {
    if (
      context.role === MembershipRole.OWNER ||
      context.role === MembershipRole.ADMIN
    )
      return null;
    const grants = await this.prisma.membershipWarehouseGrant.findMany({
      where: { organizationId: context.organizationId, userId: context.userId },
      select: { warehouseId: true },
    });
    return grants.map((grant) => grant.warehouseId);
  }

  private validateQuantities(
    minimum: string,
    target: string,
    precision: number,
  ) {
    const min = new Prisma.Decimal(minimum);
    const max = new Prisma.Decimal(target);
    if (min.isNegative() || max.lte(min))
      throw new ConflictException(
        "Target quantity must be greater than a non-negative minimum",
      );
    if (min.decimalPlaces() > precision || max.decimalPlaces() > precision)
      throw new ConflictException(
        `Quantities exceed the product unit precision (${precision})`,
      );
    return { minimum: min, target: max };
  }
}

function isUnique(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

function isSerialization(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error))
    return false;
  const candidate = error as {
    code?: string;
    message?: string;
    meta?: { code?: string; message?: string };
  };
  const message = `${candidate.message ?? ""} ${candidate.meta?.message ?? ""}`;
  return (
    ["P2034", "40001", "40P01"].includes(candidate.code ?? "") ||
    (candidate.code === "P2010" &&
      (["40001", "40P01"].includes(candidate.meta?.code ?? "") ||
        message.includes("could not serialize access") ||
        message.includes("deadlock detected")))
  );
}
