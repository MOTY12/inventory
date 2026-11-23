import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  MembershipStatus,
  ReportExportStatus,
  ReportExportType,
  UserStatus,
} from "../generated/prisma/enums";
import { PrismaService } from "../database/prisma.service";
import { roleHasCapability } from "../organizations/access-policy";
import type { OrganizationContext } from "../organizations/organization-context.guard";
import { ReportExportStorage } from "./report-export-storage";
import { ReportFilterDto } from "./reporting.dto";
import { ReportingService } from "./reporting.service";
import {
  csvNumber,
  csvText,
  serializeCsvRow,
  type CsvCell,
} from "./report-csv";

export type ReportExportJobData = { exportId: string; retrySequence: number };

const BATCH_SIZE = 100;
const MAX_ATTEMPTS = 3;
const exportHeaders: Record<ReportExportType, string[]> = {
  [ReportExportType.INVENTORY_SUMMARY]: [
    "Product ID",
    "Product",
    "SKU",
    "Category",
    "Warehouse",
    "Warehouse code",
    "Unit",
    "On hand",
    "Reserved",
    "Available",
    "Average unit cost",
    "Cost currency",
    "Inventory value",
  ],
  [ReportExportType.MOVEMENTS]: [
    "Movement ID",
    "Occurred at",
    "Type",
    "Product",
    "SKU",
    "Unit",
    "Warehouse",
    "Warehouse code",
    "Quantity in",
    "Quantity out",
    "Quantity delta",
    "Document type",
    "Document ID",
    "Document line ID",
    "Unit cost",
    "Cost currency",
    "Actor",
  ],
  [ReportExportType.VALUATION]: [
    "Product ID",
    "Product",
    "SKU",
    "Warehouse",
    "Warehouse code",
    "Quantity on hand",
    "Average unit cost",
    "Cost currency",
    "Inventory value",
  ],
  [ReportExportType.LOW_STOCK]: [
    "Alert ID",
    "Status",
    "Product ID",
    "Product",
    "SKU",
    "Warehouse",
    "Warehouse code",
    "Unit",
    "On hand",
    "Reserved",
    "Available",
    "Minimum quantity",
    "Target quantity",
    "Suggested quantity",
    "Last evaluated at",
  ],
};

@Injectable()
export class ReportExportProcessor {
  private readonly logger = new Logger(ReportExportProcessor.name);
  private readonly maxRows = Number(
    process.env.REPORT_EXPORT_MAX_ROWS ?? 1_000_000,
  );
  private readonly ttlMs =
    Number(process.env.REPORT_EXPORT_TTL_HOURS ?? 24) * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportingService,
    private readonly storage: ReportExportStorage,
  ) {}

  async process(job: Job<ReportExportJobData>) {
    const { exportId, retrySequence } = job.data;
    const record = await this.prisma.reportExport.findUnique({
      where: { id: exportId },
    });
    if (
      !record ||
      record.retrySequence !== retrySequence ||
      (record.status !== ReportExportStatus.PENDING &&
        record.status !== ReportExportStatus.PROCESSING)
    ) {
      return;
    }

    const membership = await this.prisma.membership.findFirst({
      where: {
        organizationId: record.organizationId,
        userId: record.requestedByUserId,
        status: MembershipStatus.ACTIVE,
        user: { status: UserStatus.ACTIVE },
      },
      select: { id: true, role: true },
    });
    if (!membership || !roleHasCapability(membership.role, "reports:read")) {
      await this.failPermanently(
        record.id,
        "Requester no longer has report access",
      );
      return;
    }

    const context: OrganizationContext = {
      organizationId: record.organizationId,
      membershipId: membership.id,
      userId: record.requestedByUserId,
      role: membership.role,
    };
    const filters = this.readFilters(record.filters);
    const warehouseScope = this.readWarehouseScope(record.warehouseScope);
    try {
      const currentlyAuthorized = await this.reports.authorizeExport(
        context,
        filters,
        record.reportType,
      );
      if (
        warehouseScope.some(
          (warehouseId) => !currentlyAuthorized.includes(warehouseId),
        )
      ) {
        await this.failPermanently(
          record.id,
          "Requester warehouse access changed before export processing",
        );
        return;
      }
      if (
        filters.warehouse_id &&
        !warehouseScope.includes(filters.warehouse_id)
      ) {
        await this.failPermanently(
          record.id,
          "Export warehouse scope is invalid",
        );
        return;
      }

      const startedAt = new Date();
      if (record.reportType === ReportExportType.LOW_STOCK) {
        await this.prisma.reportExport.update({
          where: { id: record.id },
          data: { snapshotAt: startedAt },
        });
      }
      await this.prisma.reportExport.update({
        where: { id: record.id },
        data: {
          status: ReportExportStatus.PROCESSING,
          startedAt,
          attemptCount: { increment: 1 },
          lastError: null,
        },
      });

      const directory = await mkdtemp(join(tmpdir(), "inventory-export-"));
      const localPath = join(directory, `${randomUUID()}.csv`);
      let rowCount = 0;
      try {
        const rows = this.csvRows(
          record.reportType,
          context,
          filters,
          warehouseScope,
          new Date(record.snapshotAt),
          (next) => {
            rowCount = next;
          },
        );
        await pipeline(
          Readable.from(rows),
          (await import("node:fs")).createWriteStream(localPath),
        );
        const file = await stat(localPath);
        if (file.size === 0) throw new Error("Generated CSV was empty");
        const objectKey = `organizations/${record.organizationId}/report-exports/${record.id}/report.csv`;
        await this.storage.putFile(objectKey, localPath, file.size);
        await this.prisma.reportExport.update({
          where: { id: record.id },
          data: {
            status: ReportExportStatus.COMPLETED,
            objectKey,
            rowCount,
            fileSizeBytes: BigInt(file.size),
            completedAt: new Date(),
            expiresAt: new Date(Date.now() + this.ttlMs),
            lastError: null,
          },
        });
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    } catch (cause) {
      const terminal = job.attemptsMade + 1 >= MAX_ATTEMPTS;
      const safeError = terminal
        ? "Export failed after the maximum number of attempts"
        : "Export processing failed and will retry";
      await this.prisma.reportExport.updateMany({
        where: { id: record.id, retrySequence },
        data: {
          status: terminal
            ? ReportExportStatus.FAILED
            : ReportExportStatus.PENDING,
          lastError: safeError,
        },
      });
      this.logger.error(
        JSON.stringify({
          message: "Report export attempt failed",
          exportId: record.id,
          organizationId: record.organizationId,
          attempt: job.attemptsMade + 1,
          error: cause instanceof Error ? cause.name : "unknown",
        }),
      );
      throw cause;
    }
  }

  async expireCompleted() {
    const now = new Date();
    const due = await this.prisma.reportExport.findMany({
      where: {
        status: ReportExportStatus.COMPLETED,
        expiresAt: { lte: now },
        objectKey: { not: null },
      },
      orderBy: { expiresAt: "asc" },
      take: 50,
      select: { id: true, objectKey: true },
    });
    for (const item of due) {
      if (!item.objectKey) continue;
      try {
        await this.storage.delete(item.objectKey);
        await this.prisma.reportExport.updateMany({
          where: {
            id: item.id,
            status: ReportExportStatus.COMPLETED,
            expiresAt: { lte: now },
          },
          data: { status: ReportExportStatus.EXPIRED, objectKey: null },
        });
      } catch (cause) {
        this.logger.error(
          JSON.stringify({
            message: "Expired report object cleanup failed",
            exportId: item.id,
            error: cause instanceof Error ? cause.message : "unknown",
          }),
        );
      }
    }
  }

  private async *csvRows(
    reportType: ReportExportType,
    context: OrganizationContext,
    filters: ReportFilterDto,
    warehouseScope: string[],
    snapshotAt: Date,
    setRowCount: (count: number) => void,
  ) {
    yield "\uFEFF";
    yield serializeCsvRow(
      exportHeaders[reportType].map((value) => csvText(value)),
    );
    let count = 0;
    // Movements have a global occurredAt/id ordering. Fetch against the
    // complete saved scope in one paged query instead of concatenating each
    // warehouse's independently paged results (which reorders the ledger).
    const pageScopes =
      reportType === ReportExportType.MOVEMENTS ? [undefined] : warehouseScope;
    for (const warehouseId of pageScopes) {
      for (let page = 1; ; page += 1) {
        const query = Object.assign(new ReportFilterDto(), filters, {
          ...(warehouseId ? { warehouse_id: warehouseId } : {}),
          page,
          page_size: BATCH_SIZE,
          ...(reportType !== ReportExportType.MOVEMENTS &&
          reportType !== ReportExportType.LOW_STOCK &&
          !filters.as_of
            ? { as_of: snapshotAt.toISOString() }
            : {}),
        });
        const result = await this.fetchPage(
          reportType,
          context,
          query,
          snapshotAt,
          reportType === ReportExportType.MOVEMENTS
            ? warehouseScope
            : undefined,
        );
        for (const row of result.data) {
          count += 1;
          if (count > this.maxRows)
            throw new Error("Export row limit exceeded");
          setRowCount(count);
          yield serializeCsvRow(this.rowCells(reportType, row));
        }
        if (
          page * BATCH_SIZE >= result.total ||
          result.data.length < BATCH_SIZE
        )
          break;
      }
    }
  }

  private fetchPage(
    type: ReportExportType,
    context: OrganizationContext,
    query: ReportFilterDto,
    snapshotAt: Date,
    warehouseScope?: string[],
  ): Promise<{ data: Record<string, unknown>[]; total: number }> {
    switch (type) {
      case ReportExportType.INVENTORY_SUMMARY:
        return this.reports.inventorySummary(context, query) as Promise<{
          data: Record<string, unknown>[];
          total: number;
        }>;
      case ReportExportType.MOVEMENTS:
        return this.reports.movementsAt(
          context,
          query,
          snapshotAt,
          warehouseScope,
        ) as Promise<{ data: Record<string, unknown>[]; total: number }>;
      case ReportExportType.VALUATION:
        return this.reports.valuation(context, query) as Promise<{
          data: Record<string, unknown>[];
          total: number;
        }>;
      case ReportExportType.LOW_STOCK:
        return this.reports.lowStock(context, query) as Promise<{
          data: Record<string, unknown>[];
          total: number;
        }>;
    }
  }

  private rowCells(
    type: ReportExportType,
    row: Record<string, unknown>,
  ): CsvCell[] {
    const nested = (key: string) => (row[key] ?? {}) as Record<string, unknown>;
    const text = (value: unknown) =>
      csvText(value == null ? "" : String(value));
    const number = (value: unknown) =>
      csvNumber(value == null ? "" : String(value));
    if (type === ReportExportType.INVENTORY_SUMMARY) {
      return [
        text(row.product_id),
        text(row.product_name),
        text(row.sku),
        text(row.category_name),
        text(row.warehouse_name),
        text(row.warehouse_code),
        text(row.base_unit),
        number(row.on_hand),
        number(row.reserved),
        number(row.available),
        number(row.average_cost),
        text(row.cost_currency),
        number(row.inventory_value),
      ];
    }
    if (type === ReportExportType.VALUATION) {
      return [
        text(row.product_id),
        text(row.product_name),
        text(row.sku),
        text(row.warehouse_name),
        text(row.warehouse_code),
        number(row.quantity_on_hand),
        number(row.average_unit_cost),
        text(row.cost_currency),
        number(row.inventory_value),
      ];
    }
    if (type === ReportExportType.MOVEMENTS) {
      const product = nested("product");
      const warehouse = nested("warehouse");
      return [
        text(row.id),
        text(row.occurredAt),
        text(row.movementType),
        text(product.name),
        text(product.sku),
        text(
          nested("product").baseUnit &&
            (nested("product").baseUnit as Record<string, unknown>).code,
        ),
        text(warehouse.name),
        text(warehouse.code),
        number(row.quantityIn),
        number(row.quantityOut),
        number(row.quantityDelta),
        text(row.documentType),
        text(row.documentId),
        text(row.documentLineId),
        number(row.costPerBaseUnit),
        text(row.costCurrency),
        text(row.actor),
      ];
    }
    const product = nested("product");
    const warehouse = nested("warehouse");
    return [
      text(row.id),
      text(row.status),
      text(product.id),
      text(product.name),
      text(product.sku),
      text(warehouse.name),
      text(warehouse.code),
      text((product.baseUnit as Record<string, unknown> | undefined)?.code),
      number(row.onHandQuantity),
      number(row.reservedQuantity),
      number(row.availableQuantity),
      number(row.minimumQuantity),
      number(row.targetQuantity),
      number(row.suggestedQuantity),
      text(row.lastEvaluatedAt),
    ];
  }

  private readFilters(value: unknown): ReportFilterDto {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return new ReportFilterDto();
    return Object.assign(new ReportFilterDto(), value);
  }

  private readWarehouseScope(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  }

  private async failPermanently(exportId: string, message: string) {
    await this.prisma.reportExport.update({
      where: { id: exportId },
      data: { status: ReportExportStatus.FAILED, lastError: message },
    });
  }
}
