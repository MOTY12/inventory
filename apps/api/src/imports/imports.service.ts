import { createHash, randomUUID } from "node:crypto";
import { basename } from "node:path";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import {
  CatalogStatus,
  IdempotencyStatus,
  ImportBatchKind,
  ImportBatchStatus,
  MembershipRole,
  ProductType,
} from "../generated/prisma/enums";
import { PrismaService } from "../database/prisma.service";
import {
  CatalogService,
  type CatalogImportedProduct,
} from "../catalog/catalog.service";
import { InventoryPostingService } from "../inventory/inventory-posting.service";
import type { OrganizationContext } from "../organizations/organization-context.guard";
import { parseCsv } from "./csv-parser";

const PRODUCT_FIELDS = [
  "sku",
  "name",
  "description",
  "barcode",
  "category",
  "baseUnit",
  "defaultSalePrice",
  "saleCurrency",
  "defaultCost",
  "costCurrency",
  "status",
] as const;
const OPENING_FIELDS = [
  "sku",
  "warehouseCode",
  "quantity",
  "unitCost",
  "currency",
  "reference",
] as const;
type ProductField = (typeof PRODUCT_FIELDS)[number];
type OpeningField = (typeof OPENING_FIELDS)[number];
type ProductRow = CatalogImportedProduct & {
  rowId: string;
  rowNumber: number;
  errors: string[];
};
type OpeningRow = {
  rowId: string;
  rowNumber: number;
  sku: string;
  productId: string | null;
  baseUnitCode: string | null;
  warehouseCode: string;
  warehouseId: string | null;
  quantity: string;
  unitCost: string;
  currency: string;
  reference: string | null;
  errors: string[];
};
type PreviewRow = ProductRow | OpeningRow;
type ColumnMapping = Record<string, string>;

const ALIASES: Record<ImportBatchKind, Record<string, string[]>> = {
  [ImportBatchKind.PRODUCTS]: {
    sku: ["sku", "product sku"],
    name: ["product name", "name", "item name"],
    description: ["description", "details"],
    barcode: ["barcode", "upc", "ean"],
    category: ["category", "product category"],
    baseUnit: ["base unit", "unit", "uom", "unit of measure"],
    defaultSalePrice: ["selling price", "sale price", "default sale price"],
    saleCurrency: ["sale currency", "currency"],
    defaultCost: ["cost", "unit cost", "default cost"],
    costCurrency: ["cost currency"],
    status: ["status", "active status"],
  },
  [ImportBatchKind.OPENING_BALANCES]: {
    sku: ["sku", "product sku"],
    warehouseCode: ["warehouse code", "warehouse"],
    quantity: ["opening quantity", "quantity", "opening stock"],
    unitCost: ["opening unit cost", "unit cost", "cost"],
    currency: ["cost currency", "currency"],
    reference: ["source", "reference", "source reference"],
  },
};

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly posting: InventoryPostingService,
  ) {}

  template(kind: ImportBatchKind) {
    return kind === ImportBatchKind.PRODUCTS
      ? "SKU,Product Name,Description,Barcode,Category,Base Unit,Selling Price,Sale Currency,Cost,Cost Currency,Status\nSKU-001,Sample item,Optional description,,General,PCS,2500.00,NGN,1200.00,NGN,ACTIVE\n"
      : "SKU,Warehouse Code,Opening Quantity,Opening Unit Cost,Cost Currency,Source Reference\nSKU-001,MAIN-01,25,1200.00,NGN,Opening stock count 2026-11-08\n";
  }

  async list(ctx: OrganizationContext) {
    return this.prisma.importBatch.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        createdBy: { include: { user: { select: { email: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async get(ctx: OrganizationContext, id: string) {
    const batch = await this.prisma.importBatch.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: {
        createdBy: { include: { user: { select: { email: true } } } },
      },
    });
    if (!batch) throw new NotFoundException("Import batch not found");
    return batch;
  }

  async auditHistory(ctx: OrganizationContext, id: string) {
    const batch = await this.prisma.importBatch.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!batch) throw new NotFoundException("Import batch not found");
    return this.prisma.auditEvent.findMany({
      where: {
        organizationId: ctx.organizationId,
        entityType: "IMPORT_BATCH",
        entityId: id,
      },
      select: {
        id: true,
        action: true,
        metadata: true,
        occurredAt: true,
        actor: { select: { email: true } },
      },
      orderBy: { occurredAt: "desc" },
    });
  }

  async preview(
    ctx: OrganizationContext,
    actor: string,
    kind: ImportBatchKind,
    file:
      | { originalname: string; mimetype: string; buffer: Buffer; size: number }
      | undefined,
    suppliedMapping?: string,
  ) {
    if (!file) throw new BadRequestException("Choose a CSV file to preview");
    if (!file.originalname.toLocaleLowerCase("en-US").endsWith(".csv"))
      throw new BadRequestException("Only .csv files are accepted");
    if (file.size > 5 * 1024 * 1024)
      throw new BadRequestException("CSV files must be 5 MB or smaller");
    const csv = parseCsv(file.buffer.toString("utf8"));
    const mapping = this.resolveMapping(kind, csv.headers, suppliedMapping);
    const rows =
      kind === ImportBatchKind.PRODUCTS
        ? await this.previewProducts(ctx, csv.headers, csv.rows, mapping)
        : await this.previewOpeningBalances(
            ctx,
            csv.headers,
            csv.rows,
            mapping,
          );
    const validRows = rows.filter((row) => row.errors.length === 0).length;
    const invalidRows = rows.length - validRows;
    const duplicateRows = rows.filter((row) =>
      row.errors.some((error) =>
        error.toLocaleLowerCase("en-US").includes("duplicate"),
      ),
    ).length;
    const warehouseTotals =
      kind === ImportBatchKind.OPENING_BALANCES
        ? this.openingSummary(rows as OpeningRow[])
        : [];
    const summary = {
      rowCount: rows.length,
      validRows,
      invalidRows,
      duplicateRows,
      warehousesAffected: warehouseTotals.map((item) => item.warehouseCode),
      openingTotalsByProductWarehouse: warehouseTotals,
    };
    const safeFileName = basename(file.originalname)
      .replace(/[\u0000-\u001f]/g, "_")
      .slice(0, 255);
    const batch = await this.prisma.importBatch.create({
      data: {
        organizationId: ctx.organizationId,
        kind,
        fileName: safeFileName,
        sourceHash: createHash("sha256").update(file.buffer).digest("hex"),
        mapping: mapping as Prisma.InputJsonValue,
        previewRows: rows as unknown as Prisma.InputJsonValue,
        summary: summary as Prisma.InputJsonValue,
        createdByUserId: actor,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    return { ...batch, headers: csv.headers, fields: this.mappingFields(kind) };
  }

  async commit(
    ctx: OrganizationContext,
    actor: string,
    id: string,
    key: string,
    expectedKind: ImportBatchKind,
    attempt = 0,
  ): Promise<Awaited<ReturnType<ImportsService["get"]>>> {
    if (!key || key.length > 160)
      throw new ConflictException("A valid Idempotency-Key is required");
    const payloadHash = createHash("sha256")
      .update(
        JSON.stringify(["import-commit", ctx.organizationId, id, expectedKind]),
      )
      .digest("hex");
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const prior = await tx.idempotencyRecord.findUnique({
            where: {
              organizationId_key: { organizationId: ctx.organizationId, key },
            },
          });
          if (prior) {
            if (prior.payloadHash !== payloadHash)
              throw new ConflictException(
                "Idempotency key was used for a different import",
              );
            if (
              prior.status !== IdempotencyStatus.COMPLETED ||
              prior.resultId !== id
            )
              throw new ConflictException(
                "Import retry is still being committed",
              );
            return;
          }
          await tx.idempotencyRecord.create({
            data: { organizationId: ctx.organizationId, key, payloadHash },
          });
          const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
            SELECT id FROM import_batches
            WHERE id=${id}::uuid AND organization_id=${ctx.organizationId}::uuid
            FOR UPDATE
          `);
          if (!locked.length)
            throw new NotFoundException("Import batch not found");
          const batch = await tx.importBatch.findUniqueOrThrow({
            where: { id },
          });
          if (batch.kind !== expectedKind)
            throw new NotFoundException("Import batch not found");
          if (batch.status !== ImportBatchStatus.PREVIEWED)
            throw new ConflictException(
              "This import batch has already been committed",
            );
          if (batch.expiresAt.getTime() <= Date.now())
            throw new ConflictException(
              "This preview expired; upload the CSV again",
            );
          const summary = batch.summary as {
            rowCount: number;
            validRows: number;
            invalidRows: number;
          };
          if (summary.invalidRows || summary.validRows !== summary.rowCount)
            throw new ConflictException(
              "Correct every invalid CSV row and preview the file again",
            );
          const rows = batch.previewRows as unknown as PreviewRow[];
          let createdCount = 0;
          if (batch.kind === ImportBatchKind.PRODUCTS) {
            await this.catalog.createProductsFromImport(
              tx,
              ctx,
              actor,
              rows as ProductRow[],
            );
            createdCount = rows.length;
          } else {
            for (const row of rows as OpeningRow[]) {
              if (!row.productId || !row.warehouseId)
                throw new ConflictException(
                  "An opening balance reference is no longer valid",
                );
              await this.requireWarehouse(tx, ctx, row.warehouseId);
              await this.posting.postOpeningBalanceIfUninitialized(
                tx,
                ctx,
                actor,
                `opening-import:${batch.id}:${row.rowId}`,
                {
                  batchId: batch.id,
                  lineId: row.rowId,
                  warehouseId: row.warehouseId,
                  productId: row.productId,
                  quantity: row.quantity,
                  unitCost: row.unitCost,
                  currency: row.currency,
                },
              );
              createdCount += 1;
            }
          }
          await tx.importBatch.update({
            where: { id },
            data: {
              status: ImportBatchStatus.COMMITTED,
              committedAt: new Date(),
            },
          });
          await tx.auditEvent.create({
            data: {
              organizationId: ctx.organizationId,
              actorUserId: actor,
              entityType: "IMPORT_BATCH",
              entityId: id,
              action: "COMMITTED",
              metadata: {
                kind: batch.kind,
                rowCount: createdCount,
                sourceHash: batch.sourceHash,
              },
            },
          });
          await tx.outboxEvent.create({
            data: {
              organizationId: ctx.organizationId,
              eventType: "imports.batch.committed",
              aggregateType: "IMPORT_BATCH",
              aggregateId: id,
              payload: {
                importBatchId: id,
                kind: batch.kind,
                rowCount: createdCount,
              },
            },
          });
          await tx.idempotencyRecord.update({
            where: {
              organizationId_key: { organizationId: ctx.organizationId, key },
            },
            data: {
              status: IdempotencyStatus.COMPLETED,
              resultType: "IMPORT_BATCH",
              resultId: id,
              response: { importBatchId: id, rowCount: createdCount },
              completedAt: new Date(),
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isSerialization(error) && attempt < 2)
        return this.commit(ctx, actor, id, key, expectedKind, attempt + 1);
      if (isUnique(error)) {
        const prior = await this.prisma.idempotencyRecord.findUnique({
          where: {
            organizationId_key: { organizationId: ctx.organizationId, key },
          },
        });
        if (prior?.payloadHash === payloadHash && prior.resultId === id)
          return this.get(ctx, id);
        throw new ConflictException(
          "A duplicate SKU, barcode, or import command was detected; no rows were committed",
        );
      }
      throw error;
    }
    return this.get(ctx, id);
  }

  mappingFields(kind: ImportBatchKind) {
    return (
      kind === ImportBatchKind.PRODUCTS ? PRODUCT_FIELDS : OPENING_FIELDS
    ).map((field) => ({
      key: field,
      required:
        kind === ImportBatchKind.PRODUCTS
          ? ["sku", "name", "baseUnit"].includes(field)
          : [
              "sku",
              "warehouseCode",
              "quantity",
              "unitCost",
              "currency",
            ].includes(field),
    }));
  }

  private resolveMapping(
    kind: ImportBatchKind,
    headers: string[],
    supplied?: string,
  ): ColumnMapping {
    let parsed: Record<string, unknown> = {};
    if (supplied) {
      try {
        const value: unknown = JSON.parse(supplied);
        if (typeof value !== "object" || value === null || Array.isArray(value))
          throw new Error("Expected a mapping object");
        parsed = value as Record<string, unknown>;
      } catch {
        throw new BadRequestException(
          "Column mapping must be a valid JSON object",
        );
      }
    }
    const fields =
      kind === ImportBatchKind.PRODUCTS ? PRODUCT_FIELDS : OPENING_FIELDS;
    const headerMap = new Map(
      headers.map((header) => [header.toLocaleLowerCase("en-US"), header]),
    );
    const mapping: ColumnMapping = {};
    for (const field of fields) {
      const selected = parsed[field];
      if (selected !== undefined) {
        if (typeof selected !== "string" || !headers.includes(selected))
          throw new BadRequestException(`Invalid column mapping for ${field}`);
        mapping[field] = selected;
      } else {
        const alias = ALIASES[kind][field].find((name) => headerMap.has(name));
        if (alias) mapping[field] = headerMap.get(alias)!;
      }
    }
    const required = this.mappingFields(kind).filter((field) => field.required);
    const missing = required.filter((field) => !mapping[field.key]);
    if (missing.length)
      throw new BadRequestException(
        `Map required columns: ${missing.map((field) => field.key).join(", ")}`,
      );
    return mapping;
  }

  private async previewProducts(
    ctx: OrganizationContext,
    headers: string[],
    csvRows: string[][],
    mapping: ColumnMapping,
  ): Promise<ProductRow[]> {
    const index = this.mappingIndexes(headers, mapping);
    const units = await this.prisma.unit.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: CatalogStatus.ACTIVE,
      },
      select: { id: true, code: true },
    });
    const categories = await this.prisma.category.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: CatalogStatus.ACTIVE,
      },
      select: { id: true, name: true },
    });
    const unitIds = new Map(
      units.map((unit) => [unit.code.toLocaleUpperCase("en-US"), unit.id]),
    );
    const categoryIds = new Map(
      categories.map((category) => [
        category.name.toLocaleUpperCase("en-US"),
        category.id,
      ]),
    );
    const rows: ProductRow[] = csvRows.map((cells, rowIndex) => {
      const value = (field: ProductField) => this.cell(cells, index[field]);
      const sku = value("sku");
      const name = value("name");
      const unitCode = value("baseUnit").toLocaleUpperCase("en-US");
      const categoryName = value("category");
      const barcode = value("barcode") || null;
      const description = value("description") || null;
      const salePrice = value("defaultSalePrice") || null;
      const saleCurrency =
        value("saleCurrency").toLocaleUpperCase("en-US") || null;
      const cost = value("defaultCost") || null;
      const costCurrency =
        value("costCurrency").toLocaleUpperCase("en-US") || null;
      const statusText = value("status").toLocaleUpperCase("en-US") || "ACTIVE";
      const errors: string[] = [];
      if (cells.length > headers.length)
        errors.push(
          `Expected ${headers.length} columns, received ${cells.length}`,
        );
      for (const field of [
        "sku",
        "name",
        "description",
        "barcode",
        "category",
        "baseUnit",
      ] as const) {
        if (/^[=+@-]/.test(value(field)))
          errors.push(`${field} contains a formula-like value`);
      }
      if (!sku) errors.push("SKU is required");
      if (sku.length > 80) errors.push("SKU exceeds 80 characters");
      if (!name) errors.push("Product name is required");
      if (name.length > 180) errors.push("Product name exceeds 180 characters");
      if (barcode && barcode.length > 100)
        errors.push("Barcode exceeds 100 characters");
      if (description && description.length > 2000)
        errors.push("Description exceeds 2000 characters");
      const baseUnitId = unitIds.get(unitCode) ?? null;
      if (!unitCode) errors.push("Base unit is required");
      else if (!baseUnitId)
        errors.push(`Unknown or inactive base unit: ${unitCode}`);
      const categoryId = categoryName
        ? (categoryIds.get(categoryName.toLocaleUpperCase("en-US")) ?? null)
        : null;
      if (categoryName && !categoryId)
        errors.push(`Unknown or inactive category: ${categoryName}`);
      this.validateOptionalMoney(
        salePrice,
        saleCurrency,
        "Selling price",
        errors,
      );
      this.validateOptionalMoney(cost, costCurrency, "Cost", errors);
      if (!/^(ACTIVE|ARCHIVED)$/.test(statusText))
        errors.push("Status must be ACTIVE or ARCHIVED");
      return {
        rowId: randomUUID(),
        rowNumber: rowIndex + 2,
        sku,
        name,
        barcode,
        description,
        categoryId,
        baseUnitId: baseUnitId ?? "",
        defaultSalePrice: salePrice,
        saleCurrency,
        defaultCost: cost,
        costCurrency,
        status:
          statusText === "ARCHIVED"
            ? CatalogStatus.ARCHIVED
            : CatalogStatus.ACTIVE,
        errors,
      };
    });
    const skus = [
      ...new Set(
        rows.map((row) => row.sku.toLocaleUpperCase("en-US")).filter(Boolean),
      ),
    ];
    const barcodes = [
      ...new Set(
        rows
          .map((row) => row.barcode?.toLocaleUpperCase("en-US") ?? "")
          .filter(Boolean),
      ),
    ];
    const existing =
      skus.length || barcodes.length
        ? await this.prisma.product.findMany({
            where: {
              organizationId: ctx.organizationId,
              OR: [
                ...(skus.length ? [{ skuNormalized: { in: skus } }] : []),
                ...(barcodes.length
                  ? [{ barcodeNormalized: { in: barcodes } }]
                  : []),
              ],
            },
            select: { skuNormalized: true, barcodeNormalized: true },
          })
        : [];
    const existingSku = new Set(
      existing.map((product) => product.skuNormalized),
    );
    const existingBarcode = new Set(
      existing
        .map((product) => product.barcodeNormalized)
        .filter((value): value is string => !!value),
    );
    for (const row of rows) {
      if (existingSku.has(row.sku.toLocaleUpperCase("en-US")))
        row.errors.push("SKU already exists in this organization");
      if (
        row.barcode &&
        existingBarcode.has(row.barcode.toLocaleUpperCase("en-US"))
      )
        row.errors.push("Barcode already exists in this organization");
    }
    this.markDuplicateRows(
      rows,
      (row) => row.sku.toLocaleUpperCase("en-US"),
      "Duplicate SKU in this file",
    );
    this.markDuplicateRows(
      rows,
      (row) => row.barcode?.toLocaleUpperCase("en-US") ?? "",
      "Duplicate barcode in this file",
    );
    return rows;
  }

  private async previewOpeningBalances(
    ctx: OrganizationContext,
    headers: string[],
    csvRows: string[][],
    mapping: ColumnMapping,
  ): Promise<OpeningRow[]> {
    const index = this.mappingIndexes(headers, mapping);
    const [products, warehouses] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          organizationId: ctx.organizationId,
          status: CatalogStatus.ACTIVE,
          type: ProductType.STOCKED,
          trackInventory: true,
        },
        include: { baseUnit: { select: { code: true, precision: true } } },
      }),
      this.visibleWarehouses(ctx),
    ]);
    const productMap = new Map(
      products.map((product) => [product.skuNormalized, product]),
    );
    const warehouseMap = new Map(
      warehouses.map((warehouse) => [
        warehouse.code.toLocaleUpperCase("en-US"),
        warehouse,
      ]),
    );
    const rows: OpeningRow[] = csvRows.map((cells, rowIndex) => {
      const value = (field: OpeningField) => this.cell(cells, index[field]);
      const sku = value("sku");
      const warehouseCode = value("warehouseCode").toLocaleUpperCase("en-US");
      const quantity = value("quantity");
      const unitCost = value("unitCost");
      const currency = value("currency").toLocaleUpperCase("en-US");
      const errors: string[] = [];
      if (cells.length > headers.length)
        errors.push(
          `Expected ${headers.length} columns, received ${cells.length}`,
        );
      for (const text of [sku, warehouseCode, value("reference")])
        if (/^[=+@-]/.test(text))
          errors.push("A text field contains a formula-like value");
      if (!sku) errors.push("SKU is required");
      const product = productMap.get(sku.toLocaleUpperCase("en-US"));
      if (sku && !product)
        errors.push(`Unknown or inactive stocked product SKU: ${sku}`);
      if (!warehouseCode) errors.push("Warehouse code is required");
      const warehouse = warehouseMap.get(warehouseCode);
      if (warehouseCode && !warehouse)
        errors.push(
          `Unknown, inactive, or unauthorized warehouse: ${warehouseCode}`,
        );
      if (!/^(?=.*[1-9])(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/.test(quantity))
        errors.push(
          "Opening quantity must be a positive decimal with up to 6 places",
        );
      if (!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/.test(unitCost))
        errors.push(
          "Opening unit cost must be a non-negative decimal with up to 4 places",
        );
      if (!/^[A-Z]{3}$/.test(currency))
        errors.push("Cost currency must be a 3-letter code");
      if (product && warehouse) {
        const quantityScale = new Prisma.Decimal(quantity || "0");
        if (quantityScale.decimalPlaces() > product.baseUnit.precision)
          errors.push(`Quantity exceeds ${product.baseUnit.code} precision`);
      }
      return {
        rowId: randomUUID(),
        rowNumber: rowIndex + 2,
        sku,
        productId: product?.id ?? null,
        baseUnitCode: product?.baseUnit.code ?? null,
        warehouseCode,
        warehouseId: warehouse?.id ?? null,
        quantity,
        unitCost,
        currency,
        reference: value("reference") || null,
        errors,
      };
    });
    const existingMovementPairs = rows
      .filter((row) => row.productId && row.warehouseId)
      .map((row) => ({
        productId: row.productId!,
        warehouseId: row.warehouseId!,
      }));
    if (existingMovementPairs.length) {
      const [movements, balances] = await Promise.all([
        this.prisma.stockMovement.findMany({
          where: {
            organizationId: ctx.organizationId,
            OR: existingMovementPairs,
          },
          select: { productId: true, warehouseId: true },
        }),
        this.prisma.inventoryBalance.findMany({
          where: {
            organizationId: ctx.organizationId,
            OR: existingMovementPairs,
          },
          select: {
            productId: true,
            warehouseId: true,
            onHand: true,
            reserved: true,
            inTransit: true,
            averageCost: true,
          },
        }),
      ]);
      const pairKey = (productId: string, warehouseId: string) =>
        `${productId}:${warehouseId}`;
      const movementKeys = new Set(
        movements.map((row) => pairKey(row.productId, row.warehouseId)),
      );
      const balanceKeys = new Set(
        balances
          .filter(
            (row) =>
              !row.onHand.isZero() ||
              !row.reserved.isZero() ||
              !row.inTransit.isZero() ||
              row.averageCost !== null,
          )
          .map((row) => pairKey(row.productId, row.warehouseId)),
      );
      for (const row of rows) {
        if (
          row.productId &&
          row.warehouseId &&
          (movementKeys.has(pairKey(row.productId, row.warehouseId)) ||
            balanceKeys.has(pairKey(row.productId, row.warehouseId)))
        )
          row.errors.push(
            "Opening stock is allowed only before inventory history exists for this product at this warehouse",
          );
      }
    }
    this.markDuplicateRows(
      rows,
      (row) =>
        row.productId && row.warehouseId
          ? `${row.productId}:${row.warehouseId}`
          : "",
      "Duplicate product and warehouse row in this file",
    );
    return rows;
  }

  private openingSummary(rows: OpeningRow[]) {
    const totals = new Map<
      string,
      {
        sku: string;
        warehouseCode: string;
        quantity: Prisma.Decimal;
        unit: string;
      }
    >();
    for (const row of rows) {
      if (
        row.errors.length ||
        !row.productId ||
        !row.warehouseId ||
        !/^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/.test(row.quantity)
      )
        continue;
      const key = `${row.productId}:${row.warehouseId}`;
      const total = totals.get(key) ?? {
        sku: row.sku,
        warehouseCode: row.warehouseCode,
        quantity: new Prisma.Decimal(0),
        unit: row.baseUnitCode ?? "",
      };
      total.quantity = total.quantity.plus(row.quantity);
      totals.set(key, total);
    }
    return [...totals.values()].map((total) => ({
      ...total,
      quantity: total.quantity.toFixed(6).replace(/0+$/, "").replace(/\.$/, ""),
    }));
  }

  private async visibleWarehouses(ctx: OrganizationContext) {
    const grants =
      ctx.role === MembershipRole.OWNER || ctx.role === MembershipRole.ADMIN
        ? null
        : await this.prisma.membershipWarehouseGrant.findMany({
            where: { organizationId: ctx.organizationId, userId: ctx.userId },
            select: { warehouseId: true },
          });
    return this.prisma.warehouse.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: "ACTIVE",
        ...(grants
          ? { id: { in: grants.map((grant) => grant.warehouseId) } }
          : {}),
      },
      select: { id: true, code: true, name: true },
    });
  }

  private async requireWarehouse(
    tx: Prisma.TransactionClient,
    ctx: OrganizationContext,
    warehouseId: string,
  ) {
    const warehouse = await tx.warehouse.findFirst({
      where: {
        id: warehouseId,
        organizationId: ctx.organizationId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!warehouse) throw new NotFoundException("Active warehouse not found");
    if (
      ctx.role !== MembershipRole.OWNER &&
      ctx.role !== MembershipRole.ADMIN
    ) {
      const grant = await tx.membershipWarehouseGrant.findUnique({
        where: {
          organizationId_userId_warehouseId: {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            warehouseId,
          },
        },
        select: { warehouseId: true },
      });
      if (!grant) throw new NotFoundException("Warehouse not found");
    }
  }

  private mappingIndexes(headers: string[], mapping: ColumnMapping) {
    return Object.fromEntries(
      Object.entries(mapping).map(([field, header]) => [
        field,
        headers.findIndex((candidate) => candidate === header),
      ]),
    ) as Record<string, number>;
  }

  private cell(row: string[], index: number | undefined) {
    return index === undefined || index < 0 ? "" : (row[index] ?? "").trim();
  }

  private validateOptionalMoney(
    value: string | null,
    currency: string | null,
    label: string,
    errors: string[],
  ) {
    if ((value === null) !== (currency === null)) {
      errors.push(`${label} and its currency must be supplied together`);
      return;
    }
    if (value !== null && !/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/.test(value))
      errors.push(
        `${label} must be a non-negative decimal with up to 4 places`,
      );
    if (currency !== null && !/^[A-Z]{3}$/.test(currency))
      errors.push(`${label} currency must be a 3-letter code`);
  }

  private markDuplicateRows<T extends { errors: string[] }>(
    rows: T[],
    keyOf: (row: T) => string,
    message: string,
  ) {
    const grouped = new Map<string, T[]>();
    for (const row of rows) {
      const key = keyOf(row);
      if (!key) continue;
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    }
    for (const groupedRows of grouped.values())
      if (groupedRows.length > 1)
        groupedRows.forEach((row) => row.errors.push(message));
  }
}

function isUnique(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function isSerialization(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  );
}
