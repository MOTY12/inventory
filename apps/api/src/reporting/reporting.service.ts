import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { MembershipRole, ReportExportType } from "../generated/prisma/enums";
import { PrismaService } from "../database/prisma.service";
import type { OrganizationContext } from "../organizations/organization-context.guard";
import type { LowStockListQueryDto } from "../inventory/reordering/reordering.dto";
import { roleHasCapability } from "../organizations/access-policy";
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
    await this.validateReportResources(context, query);
    const warehouses = await this.authorizedWarehouses(
      context,
      query.warehouse_id,
    );
    const cutoff = query.as_of ? this.asOfCutoff(query.as_of) : null;
    const pageWhere = this.productFilters(query);
    const warehouseWhere = this.warehouseFilter(
      warehouses,
      "b.warehouse_id",
      query.branch_id,
    );

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
    await this.validateReportResources(context, query);
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
        // The required membership/user relation is inferred as `never` by Prisma's generated types here.
        actor: (movement.actorMembership.user as { email: string }).email,
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
    reportType: ReportExportType,
  ) {
    this.validateDateRange(query);
    await this.validateReportResources(context, query);
    const financeExport =
      reportType === ReportExportType.SALES_PRODUCTS ||
      reportType === ReportExportType.SALES_CUSTOMERS ||
      reportType === ReportExportType.PURCHASE_PRODUCTS ||
      reportType === ReportExportType.PURCHASE_SUPPLIERS;
    if (financeExport && !roleHasCapability(context.role, "finance:read")) {
      throw new ForbiddenException("Financial export requires finance:read");
    }
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
    await this.validateReportResources(context, query);
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
    const warehouseFilter = this.warehouseFilter(
      warehouses,
      "so.warehouse_id",
      query.branch_id,
    );
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

  async salesProductPerformance(
    context: OrganizationContext,
    query: ReportFilterDto,
  ) {
    this.validateDateRange(query);
    await this.validateReportResources(context, query);
    const warehouses = await this.authorizedWarehouses(
      context,
      query.warehouse_id,
    );
    if (warehouses?.length === 0) return this.emptyPage(query);
    const warehouseFilter = this.warehouseFilter(
      warehouses,
      "so.warehouse_id",
      query.branch_id,
    );
    const branchFilter = query.branch_id
      ? Prisma.sql`AND w.branch_id=${query.branch_id}::uuid`
      : Prisma.empty;
    const categoryFilter = query.category_id
      ? Prisma.sql`AND p.category_id=${query.category_id}::uuid`
      : Prisma.empty;
    const productFilter = query.product_id
      ? Prisma.sql`AND p.id=${query.product_id}::uuid`
      : Prisma.empty;
    const customerFilter = query.customer_id
      ? Prisma.sql`AND so.customer_id=${query.customer_id}::uuid`
      : Prisma.empty;
    const currencyFilter = query.currency
      ? Prisma.sql`AND so.currency=${query.currency}`
      : Prisma.empty;
    const searchFilter = query.q
      ? Prisma.sql`AND (p.name ILIKE ${`%${query.q}%`} OR p.sku ILIKE ${`%${query.q}%`})`
      : Prisma.empty;
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? this.endOfUtcDay(query.to) : null;
    const statusFilter = query.status
      ? Prisma.sql`AND so.status=${query.status}::"SalesOrderStatus"`
      : Prisma.empty;
    const data = await this.prisma.$queryRaw<
      Record<string, unknown>[]
    >(Prisma.sql`
      WITH orders AS (
        SELECT so.organization_id,so.currency,sol.product_id,sol.unit_code,
          COUNT(DISTINCT so.id)::bigint AS order_count,
          SUM(sol.ordered_quantity) AS ordered_quantity,
          SUM(sol.fulfilled_quantity) AS fulfilled_quantity,
          SUM(sol.line_total) FILTER (WHERE so.status<>'CANCELLED') AS order_value
        FROM sales_orders so JOIN sales_order_lines sol ON sol.organization_id=so.organization_id AND sol.sales_order_id=so.id
        JOIN warehouses w ON w.organization_id=so.organization_id AND w.id=so.warehouse_id
        JOIN products p ON p.organization_id=sol.organization_id AND p.id=sol.product_id
        WHERE so.organization_id=${context.organizationId}::uuid ${warehouseFilter} ${branchFilter}
          ${categoryFilter} ${productFilter} ${customerFilter} ${currencyFilter} ${searchFilter}
          ${from ? Prisma.sql`AND so.order_date>=${from}::date` : Prisma.empty}
          ${to ? Prisma.sql`AND so.order_date<=${to}::date` : Prisma.empty} ${statusFilter}
        GROUP BY so.organization_id,so.currency,sol.product_id,sol.unit_code
      ), invoices AS (
        SELECT i.organization_id,i.currency,il.product_id,il.unit_snapshot AS unit_code,
          SUM(il.quantity) AS invoiced_quantity,SUM(il.line_total) AS invoice_value,
          SUM(il.discount_amount) AS discount_amount,SUM(il.tax_amount) AS tax_amount
        FROM invoices i JOIN invoice_lines il ON il.organization_id=i.organization_id AND il.invoice_id=i.id
        JOIN sales_orders so ON so.organization_id=i.organization_id AND so.id=i.sales_order_id
        JOIN warehouses w ON w.organization_id=so.organization_id AND w.id=so.warehouse_id
        JOIN products p ON p.organization_id=il.organization_id AND p.id=il.product_id
        WHERE i.organization_id=${context.organizationId}::uuid AND i.status='ISSUED' ${warehouseFilter} ${branchFilter}
          ${categoryFilter} ${productFilter} ${customerFilter} ${currencyFilter} ${searchFilter}
          ${from ? Prisma.sql`AND i.issue_date>=${from}::date` : Prisma.empty}
          ${to ? Prisma.sql`AND i.issue_date<=${to}::date` : Prisma.empty}
        GROUP BY i.organization_id,i.currency,il.product_id,il.unit_snapshot
      ), combined AS (
        SELECT COALESCE(o.product_id,iv.product_id) AS product_id,
          COALESCE(o.currency,iv.currency) AS currency,COALESCE(o.unit_code,iv.unit_code) AS unit_code,
          COALESCE(o.order_count,0)::bigint AS order_count,COALESCE(o.ordered_quantity,0::numeric) AS ordered_quantity,
          COALESCE(o.fulfilled_quantity,0::numeric) AS fulfilled_quantity,COALESCE(o.order_value,0::numeric) AS order_value,
          COALESCE(iv.invoiced_quantity,0::numeric) AS invoiced_quantity,COALESCE(iv.invoice_value,0::numeric) AS invoice_value,
          COALESCE(iv.discount_amount,0::numeric) AS discount_amount,COALESCE(iv.tax_amount,0::numeric) AS tax_amount
        FROM orders o FULL OUTER JOIN invoices iv ON iv.organization_id=o.organization_id AND iv.product_id=o.product_id AND iv.currency=o.currency AND iv.unit_code=o.unit_code
      )
      SELECT x.*,p.name AS product_name,p.sku,c.id AS category_id,c.name AS category_name,
        COUNT(*) OVER()::bigint AS total
      FROM combined x JOIN products p ON p.organization_id=${context.organizationId}::uuid AND p.id=x.product_id
      LEFT JOIN categories c ON c.organization_id=p.organization_id AND c.id=p.category_id
      ORDER BY ${this.salesProductSort(query.sort_by)}
      LIMIT ${query.page_size} OFFSET ${(query.page - 1) * query.page_size}
    `);
    const total = Number(data[0]?.total ?? 0);
    return {
      data: data.map((row) => this.jsonSafeRow(row)),
      total,
      page: query.page,
      page_size: query.page_size,
    };
  }

  async customerPerformance(
    context: OrganizationContext,
    query: ReportFilterDto,
  ) {
    this.validateDateRange(query);
    await this.validateReportResources(context, query);
    const warehouses = await this.authorizedWarehouses(
      context,
      query.warehouse_id,
    );
    if (warehouses?.length === 0) return this.emptyPage(query);
    const warehouseFilter = this.warehouseFilter(
      warehouses,
      "so.warehouse_id",
      query.branch_id,
    );
    const branchFilter = query.branch_id
      ? Prisma.sql`AND w.branch_id=${query.branch_id}::uuid`
      : Prisma.empty;
    const customerFilter = query.customer_id
      ? Prisma.sql`AND cu.id=${query.customer_id}::uuid`
      : Prisma.empty;
    const currencyFilter = query.currency
      ? Prisma.sql`AND so.currency=${query.currency}`
      : Prisma.empty;
    const searchFilter = query.q
      ? Prisma.sql`AND cu.name ILIKE ${`%${query.q}%`}`
      : Prisma.empty;
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? this.endOfUtcDay(query.to) : null;
    const statusFilter = query.status
      ? Prisma.sql`AND so.status=${query.status}::"SalesOrderStatus"`
      : Prisma.empty;
    const data = await this.prisma.$queryRaw<
      Record<string, unknown>[]
    >(Prisma.sql`
      WITH order_metrics AS (
        SELECT so.customer_id,so.currency,COUNT(*)::bigint AS sales_order_count,
          COUNT(*) FILTER (WHERE so.status IN ('CONFIRMED','PARTIALLY_FULFILLED','FULFILLED'))::bigint AS confirmed_order_count,
          COUNT(*) FILTER (WHERE so.status='FULFILLED')::bigint AS fulfilled_order_count,
          SUM(so.total) FILTER (WHERE so.status<>'CANCELLED') AS order_value,MAX(so.order_date) AS last_order_date
        FROM sales_orders so JOIN warehouses w ON w.organization_id=so.organization_id AND w.id=so.warehouse_id
        JOIN customers cu ON cu.organization_id=so.organization_id AND cu.id=so.customer_id
        WHERE so.organization_id=${context.organizationId}::uuid ${warehouseFilter} ${branchFilter} ${customerFilter} ${currencyFilter} ${searchFilter}
          ${from ? Prisma.sql`AND so.order_date>=${from}::date` : Prisma.empty} ${to ? Prisma.sql`AND so.order_date<=${to}::date` : Prisma.empty} ${statusFilter}
        GROUP BY so.customer_id,so.currency
      ), invoice_metrics AS (
        SELECT i.customer_id,i.currency,SUM(i.total_amount) AS invoiced_value
        FROM invoices i JOIN sales_orders so ON so.organization_id=i.organization_id AND so.id=i.sales_order_id
        JOIN warehouses w ON w.organization_id=so.organization_id AND w.id=so.warehouse_id
        JOIN customers cu ON cu.organization_id=i.organization_id AND cu.id=i.customer_id
        WHERE i.organization_id=${context.organizationId}::uuid AND i.status='ISSUED' ${warehouseFilter} ${branchFilter} ${customerFilter} ${currencyFilter} ${searchFilter}
          ${from ? Prisma.sql`AND i.issue_date>=${from}::date` : Prisma.empty} ${to ? Prisma.sql`AND i.issue_date<=${to}::date` : Prisma.empty}
        GROUP BY i.customer_id,i.currency
      ), invoice_balances AS (
        SELECT i.id,i.customer_id,i.currency,i.due_date,i.total_amount-COALESCE(a.paid,0::numeric) AS outstanding
        FROM invoices i JOIN sales_orders so ON so.organization_id=i.organization_id AND so.id=i.sales_order_id
        JOIN warehouses w ON w.organization_id=so.organization_id AND w.id=so.warehouse_id
        JOIN customers cu ON cu.organization_id=i.organization_id AND cu.id=i.customer_id
        LEFT JOIN LATERAL (
          SELECT SUM(pa.amount-CASE WHEN pr.id IS NULL THEN 0::numeric ELSE pr.amount END) AS paid
          FROM payment_allocations pa JOIN customer_payments cp ON cp.organization_id=pa.organization_id AND cp.id=pa.payment_id
          LEFT JOIN payment_reversals pr ON pr.organization_id=cp.organization_id AND pr.payment_id=cp.id
          WHERE pa.organization_id=i.organization_id AND pa.invoice_id=i.id
        ) a ON TRUE
        WHERE i.organization_id=${context.organizationId}::uuid AND i.status='ISSUED' ${warehouseFilter} ${branchFilter} ${customerFilter} ${currencyFilter} ${searchFilter}
      ), receivable_metrics AS (
        SELECT customer_id,currency,SUM(outstanding) FILTER (WHERE outstanding>0) AS outstanding,
          SUM(outstanding) FILTER (WHERE outstanding>0 AND due_date<CURRENT_DATE) AS overdue
        FROM invoice_balances GROUP BY customer_id,currency
      ), payment_metrics AS (
        SELECT i.customer_id,p.currency,SUM(p.amount) FILTER (WHERE pr.id IS NULL) AS effective_payments
        FROM customer_payments p JOIN payment_allocations pa ON pa.organization_id=p.organization_id AND pa.payment_id=p.id
        JOIN invoices i ON i.organization_id=pa.organization_id AND i.id=pa.invoice_id
        JOIN sales_orders so ON so.organization_id=i.organization_id AND so.id=i.sales_order_id
        JOIN warehouses w ON w.organization_id=so.organization_id AND w.id=so.warehouse_id
        JOIN customers cu ON cu.organization_id=i.organization_id AND cu.id=i.customer_id
        LEFT JOIN payment_reversals pr ON pr.organization_id=p.organization_id AND pr.payment_id=p.id
        WHERE p.organization_id=${context.organizationId}::uuid AND i.status='ISSUED' ${warehouseFilter} ${branchFilter} ${customerFilter} ${currencyFilter} ${searchFilter}
          ${from ? Prisma.sql`AND p.payment_date>=${from}::date` : Prisma.empty} ${to ? Prisma.sql`AND p.payment_date<=${to}::date` : Prisma.empty}
        GROUP BY i.customer_id,p.currency
      ), combined AS (
        SELECT COALESCE(o.customer_id,i.customer_id,r.customer_id,pm.customer_id) AS customer_id,
          COALESCE(o.currency,i.currency,r.currency,pm.currency) AS currency,o.sales_order_count,o.confirmed_order_count,o.fulfilled_order_count,o.order_value,o.last_order_date,
          COALESCE(i.invoiced_value,0::numeric) AS invoiced_value,COALESCE(pm.effective_payments,0::numeric) AS effective_payments,
          COALESCE(r.outstanding,0::numeric) AS outstanding,COALESCE(r.overdue,0::numeric) AS overdue
        FROM order_metrics o FULL OUTER JOIN invoice_metrics i ON i.customer_id=o.customer_id AND i.currency=o.currency
        FULL OUTER JOIN receivable_metrics r ON r.customer_id=COALESCE(o.customer_id,i.customer_id) AND r.currency=COALESCE(o.currency,i.currency)
        FULL OUTER JOIN payment_metrics pm ON pm.customer_id=COALESCE(o.customer_id,i.customer_id,r.customer_id) AND pm.currency=COALESCE(o.currency,i.currency,r.currency)
      )
      SELECT c.*,cu.name AS customer_name,COUNT(*) OVER()::bigint AS total
      FROM combined c JOIN customers cu ON cu.organization_id=${context.organizationId}::uuid AND cu.id=c.customer_id
      ORDER BY ${this.customerSort(query.sort_by)} LIMIT ${query.page_size} OFFSET ${(query.page - 1) * query.page_size}
    `);
    const total = Number(data[0]?.total ?? 0);
    return {
      data: data.map((row) => this.jsonSafeRow(row)),
      total,
      page: query.page,
      page_size: query.page_size,
      balance_basis: "current_state",
    };
  }

  async supplierPerformance(
    context: OrganizationContext,
    query: ReportFilterDto,
  ) {
    this.validateDateRange(query);
    await this.validateReportResources(context, query);
    const warehouses = await this.authorizedWarehouses(
      context,
      query.warehouse_id,
    );
    if (warehouses?.length === 0) return this.emptyPage(query);
    const warehouseFilter = this.warehouseFilter(
      warehouses,
      "po.warehouse_id",
      query.branch_id,
    );
    const branchFilter = query.branch_id
      ? Prisma.sql`AND w.branch_id=${query.branch_id}::uuid`
      : Prisma.empty;
    const supplierFilter = query.supplier_id
      ? Prisma.sql`AND s.id=${query.supplier_id}::uuid`
      : Prisma.empty;
    const currencyFilter = query.currency
      ? Prisma.sql`AND po.currency=${query.currency}`
      : Prisma.empty;
    const searchFilter = query.q
      ? Prisma.sql`AND s.name ILIKE ${`%${query.q}%`}`
      : Prisma.empty;
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? this.endOfUtcDay(query.to) : null;
    const statusFilter = query.status
      ? Prisma.sql`AND po.status=${query.status}::"PurchaseOrderStatus"`
      : Prisma.empty;
    const data = await this.prisma.$queryRaw<
      Record<string, unknown>[]
    >(Prisma.sql`
      WITH orders AS (
        SELECT po.supplier_id,po.currency,COUNT(*)::bigint AS purchase_order_count,
          COUNT(*) FILTER (WHERE po.status IN ('SUBMITTED'))::bigint AS open_purchase_orders,
          COUNT(*) FILTER (WHERE po.status='PARTIALLY_RECEIVED')::bigint AS partially_received_purchase_orders,
          COUNT(*) FILTER (WHERE po.status='RECEIVED')::bigint AS fully_received_purchase_orders,
          COUNT(*) FILTER (WHERE po.status='CANCELLED')::bigint AS cancelled_purchase_orders,
          SUM(po.subtotal) FILTER (WHERE po.status<>'CANCELLED') AS ordered_value,MAX(po.order_date) AS last_purchase_order_date
        FROM purchase_orders po JOIN warehouses w ON w.organization_id=po.organization_id AND w.id=po.warehouse_id
        JOIN suppliers s ON s.organization_id=po.organization_id AND s.id=po.supplier_id
        WHERE po.organization_id=${context.organizationId}::uuid ${warehouseFilter} ${branchFilter} ${supplierFilter} ${currencyFilter} ${searchFilter}
          ${from ? Prisma.sql`AND po.order_date>=${from}::date` : Prisma.empty} ${to ? Prisma.sql`AND po.order_date<=${to}::date` : Prisma.empty} ${statusFilter}
        GROUP BY po.supplier_id,po.currency
      ), received AS (
        SELECT po.supplier_id,po.currency,SUM(grl.quantity*pol.unit_cost) AS received_value
        FROM goods_receipts gr JOIN goods_receipt_lines grl ON grl.organization_id=gr.organization_id AND grl.receipt_id=gr.id
        JOIN purchase_orders po ON po.organization_id=gr.organization_id AND po.id=gr.purchase_order_id
        JOIN purchase_order_lines pol ON pol.organization_id=grl.organization_id AND pol.id=grl.purchase_order_line_id
        JOIN warehouses w ON w.organization_id=po.organization_id AND w.id=po.warehouse_id
        JOIN suppliers s ON s.organization_id=po.organization_id AND s.id=po.supplier_id
        WHERE po.organization_id=${context.organizationId}::uuid ${warehouseFilter} ${branchFilter} ${supplierFilter} ${currencyFilter} ${searchFilter}
          ${from ? Prisma.sql`AND po.order_date>=${from}::date` : Prisma.empty} ${to ? Prisma.sql`AND po.order_date<=${to}::date` : Prisma.empty} ${statusFilter}
          ${from ? Prisma.sql`AND gr.received_at>=${from}` : Prisma.empty} ${to ? Prisma.sql`AND gr.received_at<=${to}` : Prisma.empty}
        GROUP BY po.supplier_id,po.currency
      )
      SELECT o.*,s.name AS supplier_name,COALESCE(r.received_value,0::numeric) AS received_value,
        GREATEST(o.ordered_value-COALESCE(r.received_value,0::numeric),0::numeric) AS outstanding_order_value,
        COUNT(*) OVER()::bigint AS total
      FROM orders o JOIN suppliers s ON s.organization_id=${context.organizationId}::uuid AND s.id=o.supplier_id
      LEFT JOIN received r ON r.supplier_id=o.supplier_id AND r.currency=o.currency
      ORDER BY ${this.supplierSort(query.purchasing_sort_by)} LIMIT ${query.page_size} OFFSET ${(query.page - 1) * query.page_size}
    `);
    const total = Number(data[0]?.total ?? 0);
    return {
      data: data.map((row) => this.jsonSafeRow(row)),
      total,
      page: query.page,
      page_size: query.page_size,
      outstanding_value_is_payable: false,
    };
  }

  async purchaseProductPerformance(
    context: OrganizationContext,
    query: ReportFilterDto,
  ) {
    this.validateDateRange(query);
    await this.validateReportResources(context, query);
    const warehouses = await this.authorizedWarehouses(
      context,
      query.warehouse_id,
    );
    if (warehouses?.length === 0) return this.emptyPage(query);
    const warehouseFilter = this.warehouseFilter(
      warehouses,
      "po.warehouse_id",
      query.branch_id,
    );
    const branchFilter = query.branch_id
      ? Prisma.sql`AND w.branch_id=${query.branch_id}::uuid`
      : Prisma.empty;
    const supplierFilter = query.supplier_id
      ? Prisma.sql`AND po.supplier_id=${query.supplier_id}::uuid`
      : Prisma.empty;
    const productFilter = query.product_id
      ? Prisma.sql`AND p.id=${query.product_id}::uuid`
      : Prisma.empty;
    const categoryFilter = query.category_id
      ? Prisma.sql`AND p.category_id=${query.category_id}::uuid`
      : Prisma.empty;
    const currencyFilter = query.currency
      ? Prisma.sql`AND po.currency=${query.currency}`
      : Prisma.empty;
    const searchFilter = query.q
      ? Prisma.sql`AND (p.name ILIKE ${`%${query.q}%`} OR p.sku ILIKE ${`%${query.q}%`})`
      : Prisma.empty;
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? this.endOfUtcDay(query.to) : null;
    const statusFilter = query.status
      ? Prisma.sql`AND po.status=${query.status}::"PurchaseOrderStatus"`
      : Prisma.empty;
    const data = await this.prisma.$queryRaw<
      Record<string, unknown>[]
    >(Prisma.sql`
      WITH ordered AS (
        SELECT pol.product_id,u.code AS unit_code,po.currency,COUNT(DISTINCT po.id)::bigint AS purchase_order_count,
          SUM(pol.ordered_quantity) AS ordered_quantity,
          SUM(pol.ordered_quantity*pol.unit_cost) FILTER (WHERE po.status<>'CANCELLED') AS order_value,
          SUM(GREATEST(pol.ordered_quantity-pol.received_quantity,0::numeric)) FILTER (WHERE po.status NOT IN ('CANCELLED','RECEIVED')) AS outstanding_quantity,
          SUM(GREATEST(pol.ordered_quantity-pol.received_quantity,0::numeric)*pol.unit_cost) FILTER (WHERE po.status NOT IN ('CANCELLED','RECEIVED')) AS outstanding_value
        FROM purchase_orders po JOIN purchase_order_lines pol ON pol.organization_id=po.organization_id AND pol.purchase_order_id=po.id
        JOIN units u ON u.organization_id=pol.organization_id AND u.id=pol.unit_id
        JOIN products p ON p.organization_id=pol.organization_id AND p.id=pol.product_id
        JOIN warehouses w ON w.organization_id=po.organization_id AND w.id=po.warehouse_id
        WHERE po.organization_id=${context.organizationId}::uuid ${warehouseFilter} ${branchFilter} ${supplierFilter} ${productFilter} ${categoryFilter} ${currencyFilter} ${searchFilter}
          ${from ? Prisma.sql`AND po.order_date>=${from}::date` : Prisma.empty} ${to ? Prisma.sql`AND po.order_date<=${to}::date` : Prisma.empty} ${statusFilter}
        GROUP BY pol.product_id,u.code,po.currency
      ), received AS (
        SELECT pol.product_id,u.code AS unit_code,po.currency,SUM(grl.quantity) AS received_quantity,SUM(grl.quantity*pol.unit_cost) AS received_value
        FROM goods_receipts gr JOIN goods_receipt_lines grl ON grl.organization_id=gr.organization_id AND grl.receipt_id=gr.id
        JOIN purchase_orders po ON po.organization_id=gr.organization_id AND po.id=gr.purchase_order_id
        JOIN purchase_order_lines pol ON pol.organization_id=grl.organization_id AND pol.id=grl.purchase_order_line_id
        JOIN units u ON u.organization_id=pol.organization_id AND u.id=pol.unit_id
        JOIN products p ON p.organization_id=pol.organization_id AND p.id=pol.product_id
        JOIN warehouses w ON w.organization_id=po.organization_id AND w.id=po.warehouse_id
        WHERE po.organization_id=${context.organizationId}::uuid ${warehouseFilter} ${branchFilter} ${supplierFilter} ${productFilter} ${categoryFilter} ${currencyFilter} ${searchFilter}
          ${from ? Prisma.sql`AND po.order_date>=${from}::date` : Prisma.empty} ${to ? Prisma.sql`AND po.order_date<=${to}::date` : Prisma.empty} ${statusFilter}
          ${from ? Prisma.sql`AND gr.received_at>=${from}` : Prisma.empty} ${to ? Prisma.sql`AND gr.received_at<=${to}` : Prisma.empty}
        GROUP BY pol.product_id,u.code,po.currency
      ), combined AS (
        SELECT COALESCE(o.product_id,r.product_id) AS product_id,COALESCE(o.unit_code,r.unit_code) AS unit_code,COALESCE(o.currency,r.currency) AS currency,
          COALESCE(o.purchase_order_count,0)::bigint AS purchase_order_count,COALESCE(o.ordered_quantity,0::numeric) AS ordered_quantity,
          COALESCE(r.received_quantity,0::numeric) AS received_quantity,COALESCE(o.outstanding_quantity,0::numeric) AS outstanding_quantity,
          COALESCE(o.order_value,0::numeric) AS order_value,COALESCE(r.received_value,0::numeric) AS received_value,COALESCE(o.outstanding_value,0::numeric) AS outstanding_value
        FROM ordered o FULL OUTER JOIN received r ON r.product_id=o.product_id AND r.unit_code=o.unit_code AND r.currency=o.currency
      )
      SELECT x.*,p.name AS product_name,p.sku,c.id AS category_id,c.name AS category_name,COUNT(*) OVER()::bigint AS total
      FROM combined x JOIN products p ON p.organization_id=${context.organizationId}::uuid AND p.id=x.product_id
      LEFT JOIN categories c ON c.organization_id=p.organization_id AND c.id=p.category_id
      ORDER BY ${this.purchaseProductSort(query.purchasing_sort_by)} LIMIT ${query.page_size} OFFSET ${(query.page - 1) * query.page_size}
    `);
    const total = Number(data[0]?.total ?? 0);
    return {
      data: data.map((row) => this.jsonSafeRow(row)),
      total,
      page: query.page,
      page_size: query.page_size,
    };
  }

  async purchasingOverview(
    context: OrganizationContext,
    query: ReportFilterDto,
  ) {
    this.validateDateRange(query);
    await this.validateReportResources(context, query);
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
    const warehouseFilter = this.warehouseFilter(
      warehouses,
      "po.warehouse_id",
      query.branch_id,
    );
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
    await this.validateReportResources(context, query);
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
    const warehouseFilter = this.warehouseFilter(
      warehouses,
      "so.warehouse_id",
      query.branch_id,
    );
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
    await this.validateReportResources(context, query);
    const warehouses = await this.authorizedWarehouses(
      context,
      query.warehouse_id,
    );
    if (warehouses?.length === 0)
      return { period: query.period ?? "day", orders: [], received: [] };
    const bucket = query.period ?? "day";
    const warehouseFilter = this.warehouseFilter(
      warehouses,
      "po.warehouse_id",
      query.branch_id,
    );
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
    await this.validateReportResources(context, query);
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
    const warehouseFilter = this.warehouseFilter(
      warehouses,
      "so.warehouse_id",
      query.branch_id,
    );
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
        no_due_date_outstanding: Prisma.Decimal;
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
      COALESCE(SUM(outstanding) FILTER (WHERE due_date IS NULL),0::numeric) AS no_due_date_outstanding,
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

  private salesProductSort(sort?: ReportFilterDto["sort_by"]): Prisma.Sql {
    switch (sort) {
      case "ordered_quantity":
        return Prisma.sql`x.ordered_quantity DESC,p.name ASC,p.id ASC,x.currency ASC,x.unit_code ASC`;
      case "fulfilled_quantity":
        return Prisma.sql`x.fulfilled_quantity DESC,p.name ASC,p.id ASC,x.currency ASC,x.unit_code ASC`;
      case "order_count":
        return Prisma.sql`x.order_count DESC,p.name ASC,p.id ASC,x.currency ASC,x.unit_code ASC`;
      case "name":
        return Prisma.sql`p.name ASC,p.id ASC,x.currency ASC,x.unit_code ASC`;
      default:
        return Prisma.sql`x.invoice_value DESC,p.name ASC,p.id ASC,x.currency ASC,x.unit_code ASC`;
    }
  }

  private jsonSafeRow(row: Record<string, unknown>) {
    return Object.fromEntries(
      Object.entries(row)
        .filter(([key]) => key !== "total")
        .map(([key, value]) => [
          key,
          typeof value === "bigint" ? Number(value) : value,
        ]),
    );
  }

  private customerSort(sort?: ReportFilterDto["sort_by"]): Prisma.Sql {
    if (sort === "name")
      return Prisma.sql`cu.name ASC,cu.id ASC,c.currency ASC`;
    if (sort === "order_count")
      return Prisma.sql`COALESCE(c.sales_order_count,0) DESC,cu.name ASC,cu.id ASC,c.currency ASC`;
    return Prisma.sql`COALESCE(c.invoiced_value,0::numeric) DESC,cu.name ASC,cu.id ASC,c.currency ASC`;
  }

  private supplierSort(
    sort?: ReportFilterDto["purchasing_sort_by"],
  ): Prisma.Sql {
    if (sort === "name") return Prisma.sql`s.name ASC,s.id ASC,o.currency ASC`;
    if (sort === "received_value")
      return Prisma.sql`COALESCE(r.received_value,0::numeric) DESC,s.name ASC,s.id ASC,o.currency ASC`;
    if (sort === "order_count")
      return Prisma.sql`o.purchase_order_count DESC,s.name ASC,s.id ASC,o.currency ASC`;
    return Prisma.sql`o.ordered_value DESC NULLS LAST,s.name ASC,s.id ASC,o.currency ASC`;
  }

  private purchaseProductSort(
    sort?: ReportFilterDto["purchasing_sort_by"],
  ): Prisma.Sql {
    if (sort === "received_value")
      return Prisma.sql`x.received_value DESC,p.name ASC,p.id ASC,x.currency ASC,x.unit_code ASC`;
    if (sort === "order_count")
      return Prisma.sql`x.purchase_order_count DESC,p.name ASC,p.id ASC,x.currency ASC,x.unit_code ASC`;
    if (sort === "name")
      return Prisma.sql`p.name ASC,p.id ASC,x.currency ASC,x.unit_code ASC`;
    return Prisma.sql`x.order_value DESC NULLS LAST,p.name ASC,p.id ASC,x.currency ASC,x.unit_code ASC`;
  }

  private async validateReportResources(
    context: OrganizationContext,
    query: ReportFilterDto,
  ) {
    const checks: Array<
      [string | undefined, (id: string) => Promise<boolean>]
    > = [
      [
        query.branch_id,
        (id) =>
          this.prisma.branch
            .count({ where: { id, organizationId: context.organizationId } })
            .then((count) => count > 0),
      ],
      [
        query.product_id,
        (id) =>
          this.prisma.product
            .count({ where: { id, organizationId: context.organizationId } })
            .then((count) => count > 0),
      ],
      [
        query.category_id,
        (id) =>
          this.prisma.category
            .count({ where: { id, organizationId: context.organizationId } })
            .then((count) => count > 0),
      ],
      [
        query.customer_id,
        (id) =>
          this.prisma.customer
            .count({ where: { id, organizationId: context.organizationId } })
            .then((count) => count > 0),
      ],
      [
        query.supplier_id,
        (id) =>
          this.prisma.supplier
            .count({ where: { id, organizationId: context.organizationId } })
            .then((count) => count > 0),
      ],
    ];
    for (const [id, exists] of checks)
      if (id && !(await exists(id)))
        throw new NotFoundException(
          "Report filter resource was not found in this organization",
        );
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

  private warehouseFilter(
    warehouses: WarehouseScope,
    column: string,
    branchId?: string,
  ) {
    const scope =
      warehouses === null
        ? Prisma.empty
        : warehouses.length
          ? Prisma.sql`AND ${Prisma.raw(column)} IN (${Prisma.join(warehouses)})`
          : Prisma.sql`AND false`;
    const branch = branchId
      ? Prisma.sql`AND EXISTS (SELECT 1 FROM warehouses branch_scope WHERE branch_scope.id=${Prisma.raw(column)} AND branch_scope.branch_id=${branchId}::uuid)`
      : Prisma.empty;
    return Prisma.sql`${scope} ${branch}`;
  }

  private historicalSnapshotCte(
    context: OrganizationContext,
    query: ReportFilterDto,
    warehouses: WarehouseScope,
    cutoff: Date,
  ) {
    const warehouseFilter = this.warehouseFilter(
      warehouses,
      "m.warehouse_id",
      query.branch_id,
    );
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
