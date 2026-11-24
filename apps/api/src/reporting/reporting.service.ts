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
    return this.movementsAt(context, query);
  }

  async movementsAt(
    context: OrganizationContext,
    query: ReportFilterDto,
    cutoffAt?: Date,
    exportWarehouseScope?: string[],
  ) {
    this.validateDateRange(query);
    const authorized = await this.authorizedWarehouses(
      context,
      query.warehouse_id,
    );
    // Export workers pass the warehouse IDs captured when the export was
    // requested. Intersect that snapshot with current authorization so a
    // worker cannot gain access to warehouses added or granted later.
    const warehouses = exportWarehouseScope
      ? authorized === null
        ? exportWarehouseScope
        : exportWarehouseScope.filter((id) => authorized.includes(id))
      : authorized;
    if (warehouses?.length === 0) return this.emptyPage(query);
    const from = query.from ? new Date(query.from) : undefined;
    const requestedTo = query.to ? this.endOfUtcDay(query.to) : undefined;
    const to =
      cutoffAt && requestedTo
        ? new Date(Math.min(cutoffAt.getTime(), requestedTo.getTime()))
        : (requestedTo ?? cutoffAt);
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

  async authorizeExport(
    context: OrganizationContext,
    query: ReportFilterDto,
    reportType: "INVENTORY_SUMMARY" | "MOVEMENTS" | "VALUATION" | "LOW_STOCK",
  ) {
    this.validateDateRange(query);
    if (reportType === "LOW_STOCK" && (query.as_of || query.from || query.to)) {
      throw new BadRequestException(
        "Low-stock alerts are current snapshots and do not support date cutoffs",
      );
    }
    const authorized = await this.authorizedWarehouses(
      context,
      query.warehouse_id,
    );
    if (authorized !== null) return authorized;
    const warehouses = await this.prisma.warehouse.findMany({
      where: { organizationId: context.organizationId, status: "ACTIVE" },
      orderBy: { id: "asc" },
      select: { id: true },
    });
    return warehouses.map((warehouse) => warehouse.id);
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

  async salesOverview(context: OrganizationContext, query: ReportFilterDto) {
    this.validateDateRange(query);
    if (
      query.status &&
      ![
        "DRAFT",
        "CONFIRMED",
        "PARTIALLY_FULFILLED",
        "FULFILLED",
        "CANCELLED",
      ].includes(query.status)
    )
      throw new BadRequestException(
        "The status filter is not valid for sales reports",
      );
    const warehouses = await this.authorizedWarehouses(
      context,
      query.warehouse_id,
    );
    if (warehouses?.length === 0)
      return {
        order_status: [],
        order_value: [],
        invoice_value: [],
        collections: [],
        receivables: [],
        as_of: new Date().toISOString(),
        balance_basis: "current_state",
      };
    const warehouseFilter = this.warehouseFilter(warehouses, "so.warehouse_id");
    const customerFilter = query.customer_id
      ? Prisma.sql`AND so.customer_id=${query.customer_id}::uuid`
      : Prisma.empty;
    const currencyFilter = query.currency
      ? Prisma.sql`AND so.currency=${query.currency}`
      : Prisma.empty;
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? this.endOfUtcDay(query.to) : null;
    const statusFilter = query.status
      ? Prisma.sql`AND so.status=${query.status}::"SalesOrderStatus"`
      : Prisma.empty;
    const [orderStatus, orderValue, invoiceValue, collections, receivables] =
      await Promise.all([
        this.prisma.$queryRaw<{ status: string; count: bigint }[]>(Prisma.sql`
        SELECT so.status::text AS status, COUNT(*) AS count FROM sales_orders so
        WHERE so.organization_id=${context.organizationId}::uuid ${warehouseFilter} ${customerFilter} ${currencyFilter}
          ${from ? Prisma.sql`AND so.order_date>=${from}::date` : Prisma.empty} ${to ? Prisma.sql`AND so.order_date<=${to}::date` : Prisma.empty} ${statusFilter}
        GROUP BY so.status ORDER BY so.status::text`),
        this.prisma.$queryRaw<
          {
            currency: string;
            order_count: bigint;
            order_value: Prisma.Decimal;
          }[]
        >(Prisma.sql`
        SELECT so.currency, COUNT(*) AS order_count, COALESCE(SUM(so.total),0::numeric) AS order_value
        FROM sales_orders so WHERE so.organization_id=${context.organizationId}::uuid AND so.status<>'CANCELLED'
          ${warehouseFilter} ${customerFilter} ${currencyFilter}
          ${from ? Prisma.sql`AND so.order_date>=${from}::date` : Prisma.empty} ${to ? Prisma.sql`AND so.order_date<=${to}::date` : Prisma.empty} ${statusFilter}
        GROUP BY so.currency ORDER BY so.currency`),
        this.prisma.$queryRaw<
          {
            currency: string;
            invoice_count: bigint;
            invoice_value: Prisma.Decimal;
          }[]
        >(Prisma.sql`
        SELECT i.currency, COUNT(*) AS invoice_count, COALESCE(SUM(i.total_amount),0::numeric) AS invoice_value
        FROM invoices i JOIN sales_orders so ON so.organization_id=i.organization_id AND so.id=i.sales_order_id
        WHERE i.organization_id=${context.organizationId}::uuid AND i.status='ISSUED'
          ${warehouseFilter} ${customerFilter} ${currencyFilter}
          ${from ? Prisma.sql`AND i.issue_date>=${from}::date` : Prisma.empty} ${to ? Prisma.sql`AND i.issue_date<=${to}::date` : Prisma.empty}
        GROUP BY i.currency ORDER BY i.currency`),
        this.prisma.$queryRaw<
          {
            currency: string;
            collected: Prisma.Decimal;
            reversed: Prisma.Decimal;
          }[]
        >(Prisma.sql`
        SELECT p.currency, COALESCE(SUM(CASE WHEN r.id IS NULL THEN p.amount ELSE 0::numeric END),0::numeric) AS collected,
          COALESCE(SUM(CASE WHEN r.id IS NOT NULL THEN r.amount ELSE 0::numeric END),0::numeric) AS reversed
        FROM customer_payments p JOIN payment_allocations a ON a.organization_id=p.organization_id AND a.payment_id=p.id
        JOIN invoices i ON i.organization_id=a.organization_id AND i.id=a.invoice_id
        JOIN sales_orders so ON so.organization_id=i.organization_id AND so.id=i.sales_order_id
        LEFT JOIN payment_reversals r ON r.organization_id=p.organization_id AND r.payment_id=p.id
        WHERE p.organization_id=${context.organizationId}::uuid AND i.status='ISSUED'
          ${warehouseFilter} ${customerFilter} ${currencyFilter}
          ${from ? Prisma.sql`AND p.payment_date>=${from}::date` : Prisma.empty} ${to ? Prisma.sql`AND p.payment_date<=${to}::date` : Prisma.empty}
        GROUP BY p.currency ORDER BY p.currency`),
        this.prisma.$queryRaw<
          {
            currency: string;
            outstanding: Prisma.Decimal;
            overdue: Prisma.Decimal;
            invoice_count: bigint;
            without_due_date: bigint;
          }[]
        >(Prisma.sql`
        WITH effective AS (SELECT a.organization_id,a.invoice_id,SUM(CASE WHEN r.id IS NULL THEN a.amount ELSE 0::numeric END) AS paid
          FROM payment_allocations a JOIN customer_payments p ON p.organization_id=a.organization_id AND p.id=a.payment_id
          LEFT JOIN payment_reversals r ON r.organization_id=p.organization_id AND r.payment_id=p.id
          GROUP BY a.organization_id,a.invoice_id)
        SELECT i.currency, COALESCE(SUM(i.total_amount-COALESCE(e.paid,0::numeric)),0::numeric) AS outstanding,
          COALESCE(SUM(CASE WHEN i.due_date<CURRENT_DATE THEN i.total_amount-COALESCE(e.paid,0::numeric) ELSE 0::numeric END),0::numeric) AS overdue,
          COUNT(*) FILTER (WHERE i.total_amount>COALESCE(e.paid,0::numeric)) AS invoice_count,
          COUNT(*) FILTER (WHERE i.due_date IS NULL AND i.total_amount>COALESCE(e.paid,0::numeric)) AS without_due_date
        FROM invoices i JOIN sales_orders so ON so.organization_id=i.organization_id AND so.id=i.sales_order_id
        LEFT JOIN effective e ON e.organization_id=i.organization_id AND e.invoice_id=i.id
        WHERE i.organization_id=${context.organizationId}::uuid AND i.status='ISSUED'
          ${warehouseFilter} ${customerFilter} ${currencyFilter}
          ${from ? Prisma.sql`AND i.issue_date>=${from}::date` : Prisma.empty} ${to ? Prisma.sql`AND i.issue_date<=${to}::date` : Prisma.empty}
        GROUP BY i.currency ORDER BY i.currency`),
      ]);
    return {
      order_status: orderStatus.map((row) => ({
        status: row.status,
        count: Number(row.count),
      })),
      order_value: orderValue.map((row) => ({
        ...row,
        order_count: Number(row.order_count),
      })),
      invoice_value: invoiceValue.map((row) => ({
        ...row,
        invoice_count: Number(row.invoice_count),
      })),
      collections,
      receivables: receivables.map((row) => ({
        ...row,
        invoice_count: Number(row.invoice_count),
        without_due_date: Number(row.without_due_date),
      })),
      as_of: new Date().toISOString(),
      balance_basis: "current_state",
    };
  }

  async purchasingOverview(
    context: OrganizationContext,
    query: ReportFilterDto,
  ) {
    this.validateDateRange(query);
    if (
      query.status &&
      ![
        "DRAFT",
        "SUBMITTED",
        "PARTIALLY_RECEIVED",
        "RECEIVED",
        "CANCELLED",
      ].includes(query.status)
    )
      throw new BadRequestException(
        "The status filter is not valid for purchasing reports",
      );
    const warehouses = await this.authorizedWarehouses(
      context,
      query.warehouse_id,
    );
    if (warehouses?.length === 0)
      return {
        order_status: [],
        order_value: [],
        received_value: [],
        outstanding: [],
        as_of: new Date().toISOString(),
      };
    const warehouseFilter = this.warehouseFilter(warehouses, "po.warehouse_id");
    const supplierFilter = query.supplier_id
      ? Prisma.sql`AND po.supplier_id=${query.supplier_id}::uuid`
      : Prisma.empty;
    const currencyFilter = query.currency
      ? Prisma.sql`AND po.currency=${query.currency}`
      : Prisma.empty;
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? this.endOfUtcDay(query.to) : null;
    const statusFilter = query.status
      ? Prisma.sql`AND po.status=${query.status}::"PurchaseOrderStatus"`
      : Prisma.empty;
    const [orderStatus, orderValue, receivedValue, outstanding] =
      await Promise.all([
        this.prisma.$queryRaw<
          { status: string; count: bigint }[]
        >(Prisma.sql`SELECT po.status::text AS status,COUNT(*) AS count FROM purchase_orders po
        WHERE po.organization_id=${context.organizationId}::uuid ${warehouseFilter} ${supplierFilter} ${currencyFilter}
        ${from ? Prisma.sql`AND po.order_date>=${from}::date` : Prisma.empty} ${to ? Prisma.sql`AND po.order_date<=${to}::date` : Prisma.empty} ${statusFilter}
        GROUP BY po.status ORDER BY po.status::text`),
        this.prisma.$queryRaw<
          {
            currency: string;
            order_count: bigint;
            order_value: Prisma.Decimal;
          }[]
        >(Prisma.sql`SELECT po.currency,COUNT(*) AS order_count,COALESCE(SUM(po.subtotal),0::numeric) AS order_value
        FROM purchase_orders po WHERE po.organization_id=${context.organizationId}::uuid AND po.status<>'CANCELLED' ${warehouseFilter} ${supplierFilter} ${currencyFilter}
        ${from ? Prisma.sql`AND po.order_date>=${from}::date` : Prisma.empty} ${to ? Prisma.sql`AND po.order_date<=${to}::date` : Prisma.empty} ${statusFilter}
        GROUP BY po.currency ORDER BY po.currency`),
        this.prisma.$queryRaw<
          { currency: string; received_value: Prisma.Decimal }[]
        >(Prisma.sql`SELECT po.currency,COALESCE(SUM(grl.quantity*pol.unit_cost),0::numeric) AS received_value
        FROM goods_receipt_lines grl JOIN goods_receipts gr ON gr.organization_id=grl.organization_id AND gr.id=grl.receipt_id
        JOIN purchase_orders po ON po.organization_id=gr.organization_id AND po.id=gr.purchase_order_id
        JOIN purchase_order_lines pol ON pol.organization_id=grl.organization_id AND pol.id=grl.purchase_order_line_id
        WHERE po.organization_id=${context.organizationId}::uuid ${warehouseFilter} ${supplierFilter} ${currencyFilter}
        ${from ? Prisma.sql`AND gr.received_at>=${from}` : Prisma.empty} ${to ? Prisma.sql`AND gr.received_at<=${to}` : Prisma.empty}
        GROUP BY po.currency ORDER BY po.currency`),
        this.prisma.$queryRaw<
          {
            currency: string;
            unit_code: string;
            outstanding_value: Prisma.Decimal;
            outstanding_quantity: Prisma.Decimal;
          }[]
        >(Prisma.sql`SELECT po.currency,
        COALESCE(SUM((pol.ordered_quantity-pol.received_quantity)*pol.unit_cost),0::numeric) AS outstanding_value,
        u.code AS unit_code, COALESCE(SUM(pol.ordered_quantity-pol.received_quantity),0::numeric) AS outstanding_quantity
        FROM purchase_orders po JOIN purchase_order_lines pol ON pol.organization_id=po.organization_id AND pol.purchase_order_id=po.id
        JOIN units u ON u.organization_id=pol.organization_id AND u.id=pol.unit_id
        WHERE po.organization_id=${context.organizationId}::uuid AND po.status NOT IN ('CANCELLED','RECEIVED') ${warehouseFilter} ${supplierFilter} ${currencyFilter}
        ${from ? Prisma.sql`AND po.order_date>=${from}::date` : Prisma.empty} ${to ? Prisma.sql`AND po.order_date<=${to}::date` : Prisma.empty} ${statusFilter}
        GROUP BY po.currency,u.code ORDER BY po.currency,u.code`),
      ]);
    return {
      order_status: orderStatus.map((row) => ({
        status: row.status,
        count: Number(row.count),
      })),
      order_value: orderValue.map((row) => ({
        ...row,
        order_count: Number(row.order_count),
      })),
      received_value: receivedValue,
      outstanding,
      as_of: new Date().toISOString(),
      outstanding_value_is_payable: false,
    };
  }

  async salesTrends(context: OrganizationContext, query: ReportFilterDto) {
    this.validateDateRange(query);
    const warehouses = await this.authorizedWarehouses(
      context,
      query.warehouse_id,
    );
    if (warehouses?.length === 0)
      return {
        period: query.period ?? "day",
        orders: [],
        fulfilled: [],
        invoices: [],
        collections: [],
      };
    const bucket = query.period ?? "day";
    const warehouseFilter = this.warehouseFilter(warehouses, "so.warehouse_id");
    const customerFilter = query.customer_id
      ? Prisma.sql`AND so.customer_id=${query.customer_id}::uuid`
      : Prisma.empty;
    const currencyFilter = query.currency
      ? Prisma.sql`AND so.currency=${query.currency}`
      : Prisma.empty;
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? this.endOfUtcDay(query.to) : null;
    const [orders, fulfilled, invoices, collections] = await Promise.all([
      this.prisma.$queryRaw<
        {
          period: Date;
          currency: string;
          order_count: bigint;
          order_value: Prisma.Decimal;
        }[]
      >(Prisma.sql`
        SELECT date_trunc(${bucket},so.order_date::timestamp)::date AS period,so.currency,COUNT(*) AS order_count,
          COALESCE(SUM(so.total) FILTER (WHERE so.status<>'CANCELLED'),0::numeric) AS order_value
        FROM sales_orders so
        WHERE so.organization_id=${context.organizationId}::uuid ${warehouseFilter} ${customerFilter} ${currencyFilter}
          ${from ? Prisma.sql`AND so.order_date>=${from}::date` : Prisma.empty} ${to ? Prisma.sql`AND so.order_date<=${to}::date` : Prisma.empty}
        GROUP BY 1,2 ORDER BY 1,2 LIMIT 500`),
      this.prisma.$queryRaw<
        {
          period: Date;
          currency: string;
          unit_code: string;
          fulfilled_quantity: Prisma.Decimal;
        }[]
      >(Prisma.sql`
        SELECT date_trunc(${bucket},f.posted_at AT TIME ZONE 'UTC')::date AS period,so.currency,sol.unit_code,
          COALESCE(SUM(fl.quantity),0::numeric) AS fulfilled_quantity
        FROM sales_fulfillments f
        JOIN sales_orders so ON so.organization_id=f.organization_id AND so.id=f.sales_order_id
        JOIN sales_fulfillment_lines fl ON fl.organization_id=f.organization_id AND fl.fulfillment_id=f.id
        JOIN sales_order_lines sol ON sol.organization_id=fl.organization_id AND sol.id=fl.sales_order_line_id
        WHERE so.organization_id=${context.organizationId}::uuid ${warehouseFilter} ${customerFilter} ${currencyFilter}
          ${from ? Prisma.sql`AND f.posted_at>=${from}` : Prisma.empty} ${to ? Prisma.sql`AND f.posted_at<=${to}` : Prisma.empty}
        GROUP BY 1,2,3 ORDER BY 1,2,3 LIMIT 500`),
      this.prisma.$queryRaw<
        { period: Date; currency: string; invoice_value: Prisma.Decimal }[]
      >(Prisma.sql`
        SELECT date_trunc(${bucket},i.issue_date::timestamp)::date AS period,i.currency,
          COALESCE(SUM(i.total_amount),0::numeric) AS invoice_value
        FROM invoices i JOIN sales_orders so ON so.organization_id=i.organization_id AND so.id=i.sales_order_id
        WHERE i.organization_id=${context.organizationId}::uuid AND i.status='ISSUED'
          ${warehouseFilter} ${customerFilter} ${currencyFilter}
          ${from ? Prisma.sql`AND i.issue_date>=${from}::date` : Prisma.empty} ${to ? Prisma.sql`AND i.issue_date<=${to}::date` : Prisma.empty}
        GROUP BY 1,2 ORDER BY 1,2 LIMIT 500`),
      this.prisma.$queryRaw<
        {
          period: Date;
          currency: string;
          collected: Prisma.Decimal;
          reversed: Prisma.Decimal;
        }[]
      >(Prisma.sql`
        SELECT date_trunc(${bucket},p.payment_date::timestamp)::date AS period,p.currency,
          COALESCE(SUM(CASE WHEN r.id IS NULL THEN p.amount ELSE 0::numeric END),0::numeric) AS collected,
          COALESCE(SUM(CASE WHEN r.id IS NOT NULL THEN r.amount ELSE 0::numeric END),0::numeric) AS reversed
        FROM customer_payments p JOIN payment_allocations a ON a.organization_id=p.organization_id AND a.payment_id=p.id
        JOIN invoices i ON i.organization_id=a.organization_id AND i.id=a.invoice_id
        JOIN sales_orders so ON so.organization_id=i.organization_id AND so.id=i.sales_order_id
        LEFT JOIN payment_reversals r ON r.organization_id=p.organization_id AND r.payment_id=p.id
        WHERE p.organization_id=${context.organizationId}::uuid AND i.status='ISSUED'
          ${warehouseFilter} ${customerFilter} ${currencyFilter}
          ${from ? Prisma.sql`AND p.payment_date>=${from}::date` : Prisma.empty} ${to ? Prisma.sql`AND p.payment_date<=${to}::date` : Prisma.empty}
        GROUP BY 1,2 ORDER BY 1,2 LIMIT 500`),
    ]);
    return {
      period: bucket,
      orders: orders.map((row) => ({
        ...row,
        order_count: Number(row.order_count),
      })),
      fulfilled,
      invoices,
      collections,
    };
  }

  async purchasingTrends(context: OrganizationContext, query: ReportFilterDto) {
    this.validateDateRange(query);
    const warehouses = await this.authorizedWarehouses(
      context,
      query.warehouse_id,
    );
    if (warehouses?.length === 0)
      return { period: query.period ?? "day", orders: [], received: [] };
    const bucket = query.period ?? "day";
    const warehouseFilter = this.warehouseFilter(warehouses, "po.warehouse_id");
    const supplierFilter = query.supplier_id
      ? Prisma.sql`AND po.supplier_id=${query.supplier_id}::uuid`
      : Prisma.empty;
    const currencyFilter = query.currency
      ? Prisma.sql`AND po.currency=${query.currency}`
      : Prisma.empty;
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? this.endOfUtcDay(query.to) : null;
    const [orders, received] = await Promise.all([
      this.prisma.$queryRaw<
        {
          period: Date;
          currency: string;
          order_count: bigint;
          order_value: Prisma.Decimal;
        }[]
      >(Prisma.sql`
        SELECT date_trunc(${bucket},po.order_date::timestamp)::date AS period,po.currency,COUNT(*) AS order_count,
          COALESCE(SUM(po.subtotal) FILTER (WHERE po.status<>'CANCELLED'),0::numeric) AS order_value
        FROM purchase_orders po WHERE po.organization_id=${context.organizationId}::uuid ${warehouseFilter} ${supplierFilter} ${currencyFilter}
          ${from ? Prisma.sql`AND po.order_date>=${from}::date` : Prisma.empty} ${to ? Prisma.sql`AND po.order_date<=${to}::date` : Prisma.empty}
        GROUP BY 1,2 ORDER BY 1,2 LIMIT 500`),
      this.prisma.$queryRaw<
        { period: Date; currency: string; received_value: Prisma.Decimal }[]
      >(Prisma.sql`
        SELECT date_trunc(${bucket},gr.received_at AT TIME ZONE 'UTC')::date AS period,po.currency,
          COALESCE(SUM(grl.quantity*pol.unit_cost),0::numeric) AS received_value
        FROM goods_receipt_lines grl JOIN goods_receipts gr ON gr.organization_id=grl.organization_id AND gr.id=grl.receipt_id
        JOIN purchase_orders po ON po.organization_id=gr.organization_id AND po.id=gr.purchase_order_id
        JOIN purchase_order_lines pol ON pol.organization_id=grl.organization_id AND pol.id=grl.purchase_order_line_id
        WHERE po.organization_id=${context.organizationId}::uuid ${warehouseFilter} ${supplierFilter} ${currencyFilter}
          ${from ? Prisma.sql`AND gr.received_at>=${from}` : Prisma.empty} ${to ? Prisma.sql`AND gr.received_at<=${to}` : Prisma.empty}
        GROUP BY 1,2 ORDER BY 1,2 LIMIT 500`),
    ]);
    return {
      period: bucket,
      orders: orders.map((row) => ({
        ...row,
        order_count: Number(row.order_count),
      })),
      received,
    };
  }

  async receivablesAging(context: OrganizationContext, query: ReportFilterDto) {
    this.validateDateRange(query);
    const warehouses = await this.authorizedWarehouses(
      context,
      query.warehouse_id,
    );
    if (warehouses?.length === 0)
      return {
        as_of: new Date().toISOString(),
        basis: "current_state",
        data: [],
      };
    const warehouseFilter = this.warehouseFilter(warehouses, "so.warehouse_id");
    const customerFilter = query.customer_id
      ? Prisma.sql`AND i.customer_id=${query.customer_id}::uuid`
      : Prisma.empty;
    const currencyFilter = query.currency
      ? Prisma.sql`AND i.currency=${query.currency}`
      : Prisma.empty;
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? this.endOfUtcDay(query.to) : null;
    const data = await this.prisma.$queryRaw<
      {
        currency: string;
        no_due_date: bigint;
        not_yet_due: Prisma.Decimal;
        days_1_30: Prisma.Decimal;
        days_31_60: Prisma.Decimal;
        days_61_90: Prisma.Decimal;
        over_90: Prisma.Decimal;
      }[]
    >(Prisma.sql`WITH effective AS (
      SELECT a.organization_id,a.invoice_id,SUM(CASE WHEN r.id IS NULL THEN a.amount ELSE 0::numeric END) AS paid
      FROM payment_allocations a JOIN customer_payments p ON p.organization_id=a.organization_id AND p.id=a.payment_id
      LEFT JOIN payment_reversals r ON r.organization_id=p.organization_id AND r.payment_id=p.id GROUP BY a.organization_id,a.invoice_id
    ), balance AS (
      SELECT i.id,i.currency,i.due_date,i.total_amount-COALESCE(e.paid,0::numeric) AS outstanding FROM invoices i
      JOIN sales_orders so ON so.organization_id=i.organization_id AND so.id=i.sales_order_id LEFT JOIN effective e ON e.organization_id=i.organization_id AND e.invoice_id=i.id
      WHERE i.organization_id=${context.organizationId}::uuid AND i.status='ISSUED' AND i.total_amount>COALESCE(e.paid,0::numeric)
        ${warehouseFilter} ${customerFilter} ${currencyFilter} ${from ? Prisma.sql`AND i.issue_date>=${from}::date` : Prisma.empty} ${to ? Prisma.sql`AND i.issue_date<=${to}::date` : Prisma.empty}
    ) SELECT currency,COUNT(*) FILTER (WHERE due_date IS NULL) AS no_due_date,
      COALESCE(SUM(outstanding) FILTER (WHERE due_date IS NOT NULL AND due_date>=CURRENT_DATE),0::numeric) AS not_yet_due,
      COALESCE(SUM(outstanding) FILTER (WHERE due_date<CURRENT_DATE AND due_date>=CURRENT_DATE-30),0::numeric) AS days_1_30,
      COALESCE(SUM(outstanding) FILTER (WHERE due_date<CURRENT_DATE-30 AND due_date>=CURRENT_DATE-60),0::numeric) AS days_31_60,
      COALESCE(SUM(outstanding) FILTER (WHERE due_date<CURRENT_DATE-60 AND due_date>=CURRENT_DATE-90),0::numeric) AS days_61_90,
      COALESCE(SUM(outstanding) FILTER (WHERE due_date<CURRENT_DATE-90),0::numeric) AS over_90
      FROM balance GROUP BY currency ORDER BY currency`);
    return {
      as_of: new Date().toISOString(),
      basis: "current_state",
      data: data.map((row) => ({
        ...row,
        no_due_date: Number(row.no_due_date),
      })),
    };
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
