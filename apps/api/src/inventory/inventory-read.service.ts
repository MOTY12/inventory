import { Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import type { OrganizationContext } from "../organizations/organization-context.guard";
import type { PaginationQueryDto } from "../common/pagination-query.dto";

@Injectable()
export class InventoryReadService {
  constructor(private readonly prisma: PrismaService) {}

  async listBalances(
    context: OrganizationContext,
    warehouseId: string,
    query: PaginationQueryDto,
  ) {
    const where = { organizationId: context.organizationId, warehouseId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventoryBalance.findMany({
        where,
        orderBy: [{ product: { name: "asc" } }, { productId: "asc" }],
        skip: (query.page - 1) * query.page_size,
        take: query.page_size,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              barcode: true,
              baseUnit: { select: { code: true, name: true } },
            },
          },
        },
      }),
      this.prisma.inventoryBalance.count({ where }),
    ]);
    return { data, total, page: query.page, page_size: query.page_size };
  }

  async reconcile(context: OrganizationContext, warehouseId: string) {
    const rows = await this.prisma.$queryRaw<
      {
        product_id: string;
        sku: string;
        name: string;
        projected_on_hand: Prisma.Decimal;
        ledger_on_hand: Prisma.Decimal;
        difference: Prisma.Decimal;
      }[]
    >(Prisma.sql`
      WITH movement_totals AS (
        SELECT product_id, SUM(quantity_delta) AS ledger_on_hand
        FROM stock_movements
        WHERE organization_id = ${context.organizationId}::uuid
          AND warehouse_id = ${warehouseId}::uuid
        GROUP BY product_id
      ), compared AS (
        SELECT COALESCE(b.product_id, m.product_id) AS product_id,
          COALESCE(b.on_hand, 0::numeric) AS projected_on_hand,
          COALESCE(m.ledger_on_hand, 0::numeric) AS ledger_on_hand
        FROM inventory_balances b
        FULL OUTER JOIN movement_totals m
          ON m.product_id = b.product_id
        WHERE (b.organization_id = ${context.organizationId}::uuid OR b.organization_id IS NULL)
          AND (b.warehouse_id = ${warehouseId}::uuid OR b.warehouse_id IS NULL)
      )
      SELECT c.product_id, p.sku, p.name, c.projected_on_hand, c.ledger_on_hand,
        c.projected_on_hand - c.ledger_on_hand AS difference
      FROM compared c
      JOIN products p ON p.organization_id = ${context.organizationId}::uuid AND p.id = c.product_id
      WHERE c.projected_on_hand <> c.ledger_on_hand
      ORDER BY p.sku
    `);
    return {
      warehouse_id: warehouseId,
      consistent: rows.length === 0,
      mismatch_count: rows.length,
      mismatches: rows,
    };
  }
}
