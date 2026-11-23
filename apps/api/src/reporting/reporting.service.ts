import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { MembershipRole } from "../generated/prisma/enums";
import { PrismaService } from "../database/prisma.service";
import type { OrganizationContext } from "../organizations/organization-context.guard";
import type { LowStockListQueryDto } from "../inventory/reordering/reordering.dto";
import { ReorderingService } from "../inventory/reordering/reordering.service";
import type { ReportFilterDto } from "./reporting.dto";

type WarehouseScope = string[] | null;
type ReportRow = {
  product_id: string;
  product_name: string;
  sku: string;
  category_id: string | null;
  category_name: string | null;
  warehouse_id: string;
  warehouse_name: string;
  warehouse_code: string;
  base_unit: string;
  on_hand: Prisma.Decimal;
  reserved: Prisma.Decimal;
  available: Prisma.Decimal;
  average_cost: Prisma.Decimal | null;
  cost_currency: string | null;
  inventory_value: Prisma.Decimal | null;
};

@Injectable()
export class ReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reordering: ReorderingService,
  ) {}

  async inventorySummary(context: OrganizationContext, query: ReportFilterDto) {
    this.validateDateRange(query);
    const warehouses = await this.authorizedWarehouses(
      context,
      query.warehouse_id,
    );
    const cutoff = query.as_of ? this.asOfCutoff(query.as_of) : null;
    const pageWhere = this.productFilters(query);
    const warehouseWhere = this.warehouseFilter(warehouses, "b.warehouse_id");

    if (cutoff) {
      const cte = this.historicalSnapshotCte(
        context,
        query,
        warehouses,
        cutoff,
      );
      const [
        data,
        totals,
        byWarehouse,
        byCategory,
        productCounts,
        currencyValues,
        countRows,
      ] = await this.prisma.$transaction(
        [
          this.prisma.$queryRaw<ReportRow[]>(Prisma.sql`
            ${cte}
            SELECT s.*, s.on_hand * s.average_cost AS inventory_value
            FROM snapshot s
            WHERE s.on_hand <> 0 OR s.reserved <> 0
            ORDER BY s.product_name ASC, s.sku ASC, s.warehouse_name ASC, s.product_id ASC
            LIMIT ${query.page_size} OFFSET ${(query.page - 1) * query.page_size}
          `),
          this.prisma.$queryRaw<
            {
              products: bigint;
              skus: bigint;
              on_hand: Prisma.Decimal;
              reserved: Prisma.Decimal;
              available: Prisma.Decimal;
              uncosted_quantity: Prisma.Decimal;
            }[]
          >(Prisma.sql`
            ${cte}
            SELECT COUNT(DISTINCT s.product_id) AS products,
              COUNT(DISTINCT s.sku) AS skus,
              COALESCE(SUM(s.on_hand), 0::numeric) AS on_hand,
              COALESCE(SUM(s.reserved), 0::numeric) AS reserved,
              COALESCE(SUM(s.available), 0::numeric) AS available,
              COALESCE(SUM(CASE WHEN s.average_cost IS NULL THEN s.on_hand ELSE 0::numeric END), 0::numeric) AS uncosted_quantity
            FROM snapshot s
            WHERE s.on_hand <> 0 OR s.reserved <> 0
          `),
          this.prisma.$queryRaw<
            {
              warehouse_id: string;
              warehouse_name: string;
              warehouse_code: string;
              on_hand: Prisma.Decimal;
              reserved: Prisma.Decimal;
              available: Prisma.Decimal;
            }[]
          >(Prisma.sql`
            ${cte}
            SELECT s.warehouse_id, s.warehouse_name, s.warehouse_code,
              SUM(s.on_hand) AS on_hand, SUM(s.reserved) AS reserved, SUM(s.available) AS available
            FROM snapshot s GROUP BY s.warehouse_id, s.warehouse_name, s.warehouse_code
            ORDER BY s.warehouse_name, s.warehouse_code LIMIT 100
          `),
          this.prisma.$queryRaw<
            {
              category_id: string | null;
              category_name: string | null;
              on_hand: Prisma.Decimal;
              reserved: Prisma.Decimal;
              available: Prisma.Decimal;
            }[]
          >(Prisma.sql`
            ${cte}
            SELECT s.category_id, s.category_name,
              SUM(s.on_hand) AS on_hand, SUM(s.reserved) AS reserved, SUM(s.available) AS available
            FROM snapshot s GROUP BY s.category_id, s.category_name
            ORDER BY s.category_name NULLS LAST, s.category_id LIMIT 100
          `),
          this.prisma.product.count({
            where: {
              organizationId: context.organizationId,
              type: "STOCKED",
              trackInventory: true,
              ...this.prismaProductWhere(query),
            },
          }),
          this.prisma.$queryRaw<
            {
              cost_currency: string | null;
              inventory_value: Prisma.Decimal;
            }[]
          >(Prisma.sql`
        ${cte}
        SELECT s.cost_currency,
          SUM(CASE WHEN s.average_cost IS NULL THEN 0::numeric ELSE s.on_hand * s.average_cost END) AS inventory_value
        FROM snapshot s GROUP BY s.cost_currency ORDER BY s.cost_currency NULLS LAST
      `),
          this.prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
            ${cte} SELECT COUNT(*) AS total FROM snapshot WHERE on_hand<>0 OR reserved<>0
          `),
        ],
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );
      const lowStockProducts = await this.lowStockProductCount(context, query);
      return {
        as_of: cutoff.toISOString(),
        historical: true,
        totals: this.summaryTotals(
          totals[0],
          Number(productCounts),
          currencyValues,
          lowStockProducts,
        ),
        by_warehouse: byWarehouse,
        by_category: byCategory,
        data,
        total: Number(countRows[0]?.total ?? 0),
        page: query.page,
        page_size: query.page_size,
      };
    }

    if (warehouses?.length === 0) return this.emptySummary(query);
    const productWhere = this.prismaProductWhere(query);
    const [
      data,
      total,
      productCount,
      totals,
      byWarehouse,
      byCategory,
      currencies,
    ] = await this.prisma.$transaction(
      [
        this.prisma.$queryRaw<ReportRow[]>(Prisma.sql`
          SELECT p.id AS product_id, p.name AS product_name, p.sku,
            p.category_id, c.name AS category_name, w.id AS warehouse_id,
            w.name AS warehouse_name, w.code AS warehouse_code, u.code AS base_unit,
            b.on_hand, b.reserved, b.on_hand - b.reserved AS available,
            b.average_cost, b.cost_currency, b.on_hand * b.average_cost AS inventory_value
          FROM inventory_balances b
          JOIN products p ON p.organization_id=b.organization_id AND p.id=b.product_id
          JOIN warehouses w ON w.organization_id=b.organization_id AND w.id=b.warehouse_id
          JOIN units u ON u.organization_id=p.organization_id AND u.id=p.base_unit_id
          LEFT JOIN categories c ON c.organization_id=p.organization_id AND c.id=p.category_id
          WHERE b.organization_id=${context.organizationId}::uuid
            AND p.type='STOCKED' AND p.track_inventory=true AND p.status='ACTIVE' AND w.status='ACTIVE'
            ${warehouseWhere} ${pageWhere}
          ORDER BY p.name, p.sku, w.name, p.id
          LIMIT ${query.page_size} OFFSET ${(query.page - 1) * query.page_size}
        `),
        this.prisma.inventoryBalance.count({
          where: {
            organizationId: context.organizationId,
            warehouse: { status: "ACTIVE" },
            product: {
              type: "STOCKED",
              trackInventory: true,
              status: "ACTIVE",
              ...productWhere,
            },
            ...(warehouses ? { warehouseId: { in: warehouses } } : {}),
          },
        }),
        this.prisma.product.count({
          where: {
            organizationId: context.organizationId,
            type: "STOCKED",
            trackInventory: true,
            status: "ACTIVE",
            ...productWhere,
          },
        }),
        this.prisma.$queryRaw<
          {
            products: bigint;
            skus: bigint;
            on_hand: Prisma.Decimal;
            reserved: Prisma.Decimal;
            available: Prisma.Decimal;
            uncosted_quantity: Prisma.Decimal;
          }[]
        >(Prisma.sql`
          SELECT COUNT(DISTINCT p.id) AS products, COUNT(DISTINCT p.sku_normalized) AS skus,
            COALESCE(SUM(b.on_hand),0::numeric) AS on_hand,
            COALESCE(SUM(b.reserved),0::numeric) AS reserved,
            COALESCE(SUM(b.on_hand-b.reserved),0::numeric) AS available,
            COALESCE(SUM(CASE WHEN b.average_cost IS NULL THEN b.on_hand ELSE 0::numeric END),0::numeric) AS uncosted_quantity
          FROM inventory_balances b
          JOIN products p ON p.organization_id=b.organization_id AND p.id=b.product_id
          JOIN warehouses w ON w.organization_id=b.organization_id AND w.id=b.warehouse_id
          LEFT JOIN categories c ON c.organization_id=p.organization_id AND c.id=p.category_id
          WHERE b.organization_id=${context.organizationId}::uuid
            AND p.type='STOCKED' AND p.track_inventory=true AND p.status='ACTIVE' AND w.status='ACTIVE'
            ${warehouseWhere} ${pageWhere}
        `),
        this.prisma.$queryRaw<
          {
            warehouse_id: string;
            warehouse_name: string;
            warehouse_code: string;
            on_hand: Prisma.Decimal;
            reserved: Prisma.Decimal;
            available: Prisma.Decimal;
          }[]
        >(Prisma.sql`
          SELECT w.id AS warehouse_id,w.name AS warehouse_name,w.code AS warehouse_code,
            SUM(b.on_hand) AS on_hand,SUM(b.reserved) AS reserved,SUM(b.on_hand-b.reserved) AS available
          FROM inventory_balances b
          JOIN products p ON p.organization_id=b.organization_id AND p.id=b.product_id
          JOIN warehouses w ON w.organization_id=b.organization_id AND w.id=b.warehouse_id
          LEFT JOIN categories c ON c.organization_id=p.organization_id AND c.id=p.category_id
          WHERE b.organization_id=${context.organizationId}::uuid
            AND p.type='STOCKED' AND p.track_inventory=true AND p.status='ACTIVE' AND w.status='ACTIVE'
            ${warehouseWhere} ${pageWhere}
          GROUP BY w.id,w.name,w.code ORDER BY w.name,w.code LIMIT 100
        `),
        this.prisma.$queryRaw<
          {
            category_id: string | null;
            category_name: string | null;
            on_hand: Prisma.Decimal;
            reserved: Prisma.Decimal;
            available: Prisma.Decimal;
          }[]
        >(Prisma.sql`
          SELECT p.category_id,c.name AS category_name,
            SUM(b.on_hand) AS on_hand,SUM(b.reserved) AS reserved,SUM(b.on_hand-b.reserved) AS available
          FROM inventory_balances b
          JOIN products p ON p.organization_id=b.organization_id AND p.id=b.product_id
          JOIN warehouses w ON w.organization_id=b.organization_id AND w.id=b.warehouse_id
          LEFT JOIN categories c ON c.organization_id=p.organization_id AND c.id=p.category_id
          WHERE b.organization_id=${context.organizationId}::uuid
            AND p.type='STOCKED' AND p.track_inventory=true AND p.status='ACTIVE' AND w.status='ACTIVE'
            ${warehouseWhere} ${pageWhere}
          GROUP BY p.category_id,c.name ORDER BY c.name NULLS LAST,p.category_id LIMIT 100
        `),
        this.prisma.$queryRaw<
          {
            cost_currency: string | null;
            inventory_value: Prisma.Decimal;
          }[]
        >(Prisma.sql`
      SELECT b.cost_currency,
        SUM(CASE WHEN b.average_cost IS NULL THEN 0::numeric ELSE b.on_hand*b.average_cost END) AS inventory_value
      FROM inventory_balances b
      JOIN products p ON p.organization_id=b.organization_id AND p.id=b.product_id
      JOIN warehouses w ON w.organization_id=b.organization_id AND w.id=b.warehouse_id
      LEFT JOIN categories c ON c.organization_id=p.organization_id AND c.id=p.category_id
      WHERE b.organization_id=${context.organizationId}::uuid
        AND p.type='STOCKED' AND p.track_inventory=true AND p.status='ACTIVE' AND w.status='ACTIVE'
        ${warehouseWhere} ${pageWhere}
      GROUP BY b.cost_currency ORDER BY b.cost_currency NULLS LAST
    `),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const lowStockProducts = await this.lowStockProductCount(context, query);
    return {
      as_of: new Date().toISOString(),
      historical: false,
      totals: this.summaryTotals(
        totals[0],
        Number(productCount),
        currencies,
        lowStockProducts,
      ),
      by_warehouse: byWarehouse,
      by_category: byCategory,
      data,
      total,
      page: query.page,
      page_size: query.page_size,
    };
  }

  async valuation(context: OrganizationContext, query: ReportFilterDto) {
    const result = await this.inventorySummary(context, query);
    return {
      as_of: result.as_of,
      historical: result.historical,
      totals: result.totals,
      data: result.data.map((row) => ({
        product_id: row.product_id,
        product_name: row.product_name,
        sku: row.sku,
        warehouse_id: row.warehouse_id,
        warehouse_name: row.warehouse_name,
        warehouse_code: row.warehouse_code,
        quantity_on_hand: row.on_hand,
        average_unit_cost: row.average_cost,
        cost_currency: row.cost_currency,
        inventory_value: row.inventory_value,
      })),
      total: result.total,
      page: result.page,
      page_size: result.page_size,
    };
  }

  async movements(context: OrganizationContext, query: ReportFilterDto) {
    this.validateDateRange(query);
    const warehouses = await this.authorizedWarehouses(
      context,
      query.warehouse_id,
    );
    if (warehouses?.length === 0) return this.emptyPage(query);
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? this.endOfUtcDay(query.to) : undefined;
    const where: Prisma.StockMovementWhereInput = {
      organizationId: context.organizationId,
      ...(warehouses ? { warehouseId: { in: warehouses } } : {}),
      ...(query.product_id ? { productId: query.product_id } : {}),
      ...(query.movement_type ? { movementType: query.movement_type } : {}),
      ...(from || to
        ? {
            occurredAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lt: to } : {}),
            },
          }
        : {}),
      ...(query.category_id
        ? { product: { categoryId: query.category_id } }
        : {}),
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
              { documentType: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction(
      [
        this.prisma.stockMovement.findMany({
          where,
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
          skip: (query.page - 1) * query.page_size,
          take: query.page_size,
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
            actorMembership: { include: { user: { select: { email: true } } } },
          },
        }),
        this.prisma.stockMovement.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      data: rows.map((movement) => ({
        ...movement,
        quantityIn: movement.quantityDelta.isPositive()
          ? movement.quantityDelta
          : new Prisma.Decimal(0),
        quantityOut: movement.quantityDelta.isNegative()
          ? movement.quantityDelta.abs()
          : new Prisma.Decimal(0),
        actor: movement.actorMembership.user.email,
        relatedTransaction: {
          documentType: movement.documentType,
          documentId: movement.documentId,
          documentLineId: movement.documentLineId,
        },
      })),
      total,
      page: query.page,
      page_size: query.page_size,
    };
  }

  async lowStock(context: OrganizationContext, query: ReportFilterDto) {
    if (query.as_of || query.from || query.to)
      throw new BadRequestException(
        "Low-stock alerts are current snapshots and do not support date cutoffs",
      );
    return this.reordering.listAlerts(context, {
      page: query.page,
      page_size: query.page_size,
      ...(query.warehouse_id ? { warehouseId: query.warehouse_id } : {}),
      ...(query.q ? { q: query.q } : {}),
      ...(query.product_id ? { productId: query.product_id } : {}),
      ...(query.category_id ? { categoryId: query.category_id } : {}),
    } as LowStockListQueryDto);
  }

  private async authorizedWarehouses(
    context: OrganizationContext,
    requestedId?: string,
  ): Promise<WarehouseScope> {
    const admin =
      context.role === MembershipRole.OWNER ||
      context.role === MembershipRole.ADMIN;
    if (requestedId) {
      const where: Prisma.WarehouseWhereInput = {
        id: requestedId,
        organizationId: context.organizationId,
        status: "ACTIVE",
        ...(!admin
          ? {
              grants: {
                some: {
                  organizationId: context.organizationId,
                  userId: context.userId,
                },
              },
            }
          : {}),
      };
      const warehouse = await this.prisma.warehouse.findFirst({
        where,
        select: { id: true },
      });
      if (!warehouse) throw new NotFoundException("Warehouse not found");
      return [warehouse.id];
    }
    if (admin) return null;
    const grants = await this.prisma.membershipWarehouseGrant.findMany({
      where: {
        organizationId: context.organizationId,
        userId: context.userId,
        warehouse: { status: "ACTIVE" },
      },
      select: { warehouseId: true },
    });
    return grants.map((grant) => grant.warehouseId);
  }

  private productFilters(query: ReportFilterDto) {
    return Prisma.sql`
      ${query.product_id ? Prisma.sql`AND p.id=${query.product_id}::uuid` : Prisma.empty}
      ${query.category_id ? Prisma.sql`AND p.category_id=${query.category_id}::uuid` : Prisma.empty}
      ${query.q ? Prisma.sql`AND (p.name ILIKE ${`%${query.q}%`} OR p.sku ILIKE ${`%${query.q}%`})` : Prisma.empty}
    `;
  }

  private prismaProductWhere(query: ReportFilterDto) {
    return {
      ...(query.product_id ? { id: query.product_id } : {}),
      ...(query.category_id ? { categoryId: query.category_id } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" as const } },
              { sku: { contains: query.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
  }

  private warehouseFilter(warehouses: WarehouseScope, column: string) {
    if (warehouses === null) return Prisma.empty;
    if (!warehouses.length) return Prisma.sql`AND false`;
    return Prisma.sql`AND ${Prisma.raw(column)} IN (${Prisma.join(warehouses)})`;
  }

  private historicalSnapshotCte(
    context: OrganizationContext,
    query: ReportFilterDto,
    warehouses: WarehouseScope,
    cutoff: Date,
  ) {
    const warehouseFilter = this.warehouseFilter(warehouses, "m.warehouse_id");
    const productFilter = this.productFilters(query);
    return Prisma.sql`
      WITH RECURSIVE ordered_movements AS (
        SELECT m.organization_id,m.warehouse_id,m.product_id,m.id,m.occurred_at,
          m.quantity_delta,m.cost_per_base_unit,m.cost_currency,
          ROW_NUMBER() OVER (PARTITION BY m.warehouse_id,m.product_id ORDER BY m.occurred_at,m.id) AS seq
        FROM stock_movements m
        JOIN products p ON p.organization_id=m.organization_id AND p.id=m.product_id
        LEFT JOIN categories c ON c.organization_id=p.organization_id AND c.id=p.category_id
        WHERE m.organization_id=${context.organizationId}::uuid
          AND m.occurred_at<=${cutoff}
          AND p.type='STOCKED' AND p.track_inventory=true
          ${warehouseFilter} ${productFilter}
      ), valuation_walk AS (
        SELECT o.organization_id,o.warehouse_id,o.product_id,o.seq,
          o.quantity_delta::numeric AS on_hand,
          o.cost_per_base_unit::numeric AS average_cost,o.cost_currency
        FROM ordered_movements o WHERE o.seq=1
        UNION ALL
        SELECT e.organization_id,e.warehouse_id,e.product_id,e.seq,
          w.on_hand+e.quantity_delta,
          CASE
            WHEN e.quantity_delta>0 AND w.on_hand=0 THEN e.cost_per_base_unit
            WHEN e.quantity_delta>0 AND e.cost_per_base_unit IS NOT NULL
              AND w.average_cost IS NOT NULL AND w.cost_currency=e.cost_currency
              AND w.on_hand+e.quantity_delta>0
              THEN ROUND((w.on_hand*w.average_cost+e.quantity_delta*e.cost_per_base_unit)/(w.on_hand+e.quantity_delta),4)
            ELSE w.average_cost
          END,
          CASE WHEN e.quantity_delta>0 AND w.on_hand=0 AND e.cost_per_base_unit IS NOT NULL
            THEN e.cost_currency ELSE w.cost_currency END
        FROM valuation_walk w
        JOIN ordered_movements e ON e.organization_id=w.organization_id
          AND e.warehouse_id=w.warehouse_id AND e.product_id=w.product_id AND e.seq=w.seq+1
      ), latest AS (
        SELECT DISTINCT ON (organization_id,warehouse_id,product_id)
          organization_id,warehouse_id,product_id,on_hand,average_cost,cost_currency
        FROM valuation_walk ORDER BY organization_id,warehouse_id,product_id,seq DESC
      ), snapshot AS (
        SELECT l.product_id,p.name AS product_name,p.sku,p.category_id,c.name AS category_name,
          l.warehouse_id,w.name AS warehouse_name,w.code AS warehouse_code,u.code AS base_unit,
          l.on_hand,
          COALESCE(r.reserved,0::numeric) AS reserved,
          l.on_hand-COALESCE(r.reserved,0::numeric) AS available,
          l.average_cost,l.cost_currency
        FROM latest l
        JOIN products p ON p.organization_id=l.organization_id AND p.id=l.product_id
        JOIN warehouses w ON w.organization_id=l.organization_id AND w.id=l.warehouse_id
        JOIN units u ON u.organization_id=p.organization_id AND u.id=p.base_unit_id
        LEFT JOIN categories c ON c.organization_id=p.organization_id AND c.id=p.category_id
        LEFT JOIN LATERAL (
          SELECT SUM(h.quantity_delta) AS reserved
          FROM inventory_reservation_history h
          JOIN inventory_reservations r ON r.organization_id=h.organization_id AND r.id=h.reservation_id
          WHERE h.organization_id=l.organization_id AND r.warehouse_id=l.warehouse_id
            AND r.product_id=l.product_id AND h.occurred_at<=${cutoff}
        ) r ON true
      )`;
  }

  private summaryTotals(
    row:
      | {
          products: bigint;
          skus: bigint;
          on_hand: Prisma.Decimal;
          reserved: Prisma.Decimal;
          available: Prisma.Decimal;
          uncosted_quantity: Prisma.Decimal;
        }
      | undefined,
    catalogProducts: number,
    values: { cost_currency: string | null; inventory_value: Prisma.Decimal }[],
    currentLowStockProducts: number,
  ) {
    return {
      products: catalogProducts,
      stocked_products_with_balance: Number(row?.products ?? 0),
      skus: catalogProducts,
      on_hand: row?.on_hand ?? new Prisma.Decimal(0),
      reserved: row?.reserved ?? new Prisma.Decimal(0),
      available: row?.available ?? new Prisma.Decimal(0),
      uncosted_quantity: row?.uncosted_quantity ?? new Prisma.Decimal(0),
      inventory_value_by_currency: values,
      current_low_stock_products: currentLowStockProducts,
    };
  }

  private async lowStockProductCount(
    context: OrganizationContext,
    query: ReportFilterDto,
  ) {
    const result = await this.reordering.listAlerts(context, {
      page: 1,
      page_size: 1,
      ...(query.warehouse_id ? { warehouseId: query.warehouse_id } : {}),
      ...(query.product_id ? { productId: query.product_id } : {}),
      ...(query.category_id ? { categoryId: query.category_id } : {}),
      ...(query.q ? { q: query.q } : {}),
    });
    return result.summary.products;
  }

  private emptyPage(query: ReportFilterDto) {
    return { data: [], total: 0, page: query.page, page_size: query.page_size };
  }

  private emptySummary(query: ReportFilterDto) {
    return {
      as_of: new Date().toISOString(),
      historical: false,
      totals: this.summaryTotals(undefined, 0, [], 0),
      by_warehouse: [],
      by_category: [],
      ...this.emptyPage(query),
    };
  }

  private validateDateRange(query: ReportFilterDto) {
    if (
      query.from &&
      query.to &&
      new Date(query.from) > this.endOfUtcDay(query.to)
    )
      throw new BadRequestException(
        "The start date must not be after the end date",
      );
  }

  private endOfUtcDay(value: string) {
    const date = new Date(value);
    date.setUTCHours(23, 59, 59, 999);
    return date;
  }

  private asOfCutoff(value: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? this.endOfUtcDay(value)
      : new Date(value);
  }
}
