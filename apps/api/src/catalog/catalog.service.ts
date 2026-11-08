import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { CatalogStatus } from "../generated/prisma/enums";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import type { OrganizationContext } from "../organizations/organization-context.guard";
import {
  CatalogListQueryDto,
  CreateCategoryDto,
  CreateProductConversionDto,
  CreateProductDto,
  CreateUnitDto,
  UpdateProductDto,
} from "./catalog.dto";
import { ProductType } from "../generated/prisma/enums";

export type CatalogImportedProduct = {
  name: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  categoryId: string | null;
  baseUnitId: string;
  defaultCost: string | null;
  costCurrency: string | null;
  defaultSalePrice: string | null;
  saleCurrency: string | null;
  status: CatalogStatus;
};

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listProducts(context: OrganizationContext, query: CatalogListQueryDto) {
    const term = query.q?.trim();
    const where = {
      organizationId: context.organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" as const } },
              { sku: { contains: term, mode: "insensitive" as const } },
              { barcode: { contains: term, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.page_size,
        take: query.page_size,
        include: {
          category: { select: { id: true, name: true } },
          baseUnit: {
            select: { id: true, code: true, name: true, precision: true },
          },
          unitConversions: {
            include: { unit: { select: { id: true, code: true, name: true } } },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);
    return { data, total, page: query.page, page_size: query.page_size };
  }

  async getProduct(context: OrganizationContext, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId: context.organizationId },
      include: {
        category: { select: { id: true, name: true } },
        baseUnit: {
          select: { id: true, code: true, name: true, precision: true },
        },
        unitConversions: {
          include: {
            unit: {
              select: { id: true, code: true, name: true, precision: true },
            },
          },
        },
      },
    });
    if (!product) throw new NotFoundException("Product not found");
    return product;
  }

  async listProductConversions(
    context: OrganizationContext,
    productId: string,
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId: context.organizationId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException("Product not found");
    return this.prisma.productUnitConversion.findMany({
      where: { organizationId: context.organizationId, productId },
      include: {
        unit: { select: { id: true, code: true, name: true, precision: true } },
      },
      orderBy: { unit: { name: "asc" } },
    });
  }

  async updateProduct(
    context: OrganizationContext,
    actorUserId: string,
    productId: string,
    input: UpdateProductDto,
  ) {
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.sku !== undefined) {
      data.sku = input.sku.trim();
      data.skuNormalized = input.sku.trim().toLocaleUpperCase("en-US");
    }
    if (input.barcode !== undefined) {
      const barcode = input.barcode.trim() || null;
      data.barcode = barcode;
      data.barcodeNormalized = barcode?.toLocaleUpperCase("en-US") ?? null;
    }
    if (input.description !== undefined)
      data.description = input.description.trim() || null;
    if (input.type !== undefined) data.type = input.type;
    if (input.trackInventory !== undefined)
      data.trackInventory = input.trackInventory;
    if (input.categoryId !== undefined)
      data.categoryId = input.categoryId || null;
    if (input.baseUnitId !== undefined) data.baseUnitId = input.baseUnitId;
    if (input.defaultCost !== undefined) data.defaultCost = input.defaultCost;
    if (input.costCurrency !== undefined)
      data.costCurrency = input.costCurrency.toUpperCase();
    if (input.defaultSalePrice !== undefined)
      data.defaultSalePrice = input.defaultSalePrice;
    if (input.saleCurrency !== undefined)
      data.saleCurrency = input.saleCurrency.toUpperCase();
    if (input.defaultCost !== undefined || input.costCurrency !== undefined)
      validateMoneyPair(input.defaultCost, input.costCurrency, "Cost");
    if (
      input.defaultSalePrice !== undefined ||
      input.saleCurrency !== undefined
    )
      validateMoneyPair(
        input.defaultSalePrice,
        input.saleCurrency,
        "Sale price",
      );
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.product.findFirst({
          where: { id: productId, organizationId: context.organizationId },
          select: {
            id: true,
            status: true,
            type: true,
            trackInventory: true,
            baseUnitId: true,
            _count: { select: { unitConversions: true } },
          },
        });
        if (!existing) throw new NotFoundException("Product not found");
        if (existing.status !== CatalogStatus.ACTIVE)
          throw new ConflictException("Archived products cannot be edited");
        const type = input.type ?? existing.type;
        const tracks = input.trackInventory ?? existing.trackInventory;
        if (type === ProductType.NON_STOCK && tracks)
          throw new ConflictException(
            "Non-stock products cannot track inventory",
          );
        if (input.baseUnitId) {
          if (
            input.baseUnitId !== existing.baseUnitId &&
            existing._count.unitConversions > 0
          ) {
            throw new ConflictException(
              "Remove or recreate product conversions before changing its base unit",
            );
          }
          const unit = await tx.unit.findFirst({
            where: {
              id: input.baseUnitId,
              organizationId: context.organizationId,
              status: CatalogStatus.ACTIVE,
            },
            select: { id: true },
          });
          if (!unit) throw new NotFoundException("Base unit not found");
        }
        if (input.categoryId) {
          const category = await tx.category.findFirst({
            where: {
              id: input.categoryId,
              organizationId: context.organizationId,
              status: CatalogStatus.ACTIVE,
            },
            select: { id: true },
          });
          if (!category) throw new NotFoundException("Category not found");
        }
        const updated = await tx.product.update({
          where: { id: productId },
          data,
          include: { category: true, baseUnit: true },
        });
        await tx.auditEvent.create({
          data: {
            organizationId: context.organizationId,
            actorUserId,
            entityType: "PRODUCT",
            entityId: productId,
            action: "UPDATED",
            metadata: { fields: Object.keys(data) },
          },
        });
        return updated;
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException("SKU or barcode already exists");
      throw error;
    }
  }

  async archiveProduct(
    context: OrganizationContext,
    actorUserId: string,
    productId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, organizationId: context.organizationId },
        select: { id: true, status: true },
      });
      if (!product) throw new NotFoundException("Product not found");
      if (product.status === CatalogStatus.ARCHIVED) return product;
      const archived = await tx.product.update({
        where: { id: productId },
        data: { status: CatalogStatus.ARCHIVED },
        select: { id: true, status: true },
      });
      await tx.auditEvent.create({
        data: {
          organizationId: context.organizationId,
          actorUserId,
          entityType: "PRODUCT",
          entityId: productId,
          action: "ARCHIVED",
          metadata: {},
        },
      });
      return archived;
    });
  }

  async createProduct(
    context: OrganizationContext,
    actorUserId: string,
    input: CreateProductDto,
  ) {
    const sku = input.sku.trim();
    const barcode = input.barcode?.trim() || null;
    validateMoneyPair(input.defaultCost, input.costCurrency, "Cost");
    validateMoneyPair(input.defaultSalePrice, input.saleCurrency, "Sale price");
    try {
      return await this.prisma.$transaction(async (tx) => {
        const unit = await tx.unit.findFirst({
          where: {
            id: input.baseUnitId,
            organizationId: context.organizationId,
            status: CatalogStatus.ACTIVE,
          },
          select: { id: true },
        });
        if (!unit) throw new NotFoundException("Base unit not found");
        if (input.categoryId) {
          const category = await tx.category.findFirst({
            where: {
              id: input.categoryId,
              organizationId: context.organizationId,
              status: CatalogStatus.ACTIVE,
            },
            select: { id: true },
          });
          if (!category) throw new NotFoundException("Category not found");
        }
        const type = input.type ?? ProductType.STOCKED;
        const trackInventory =
          input.trackInventory ?? type === ProductType.STOCKED;
        if (type === ProductType.NON_STOCK && trackInventory) {
          throw new ConflictException(
            "Non-stock products cannot track inventory",
          );
        }
        const product = await tx.product.create({
          data: {
            organizationId: context.organizationId,
            name: input.name.trim(),
            sku,
            skuNormalized: sku.toLocaleUpperCase("en-US"),
            barcode,
            barcodeNormalized: barcode?.toLocaleUpperCase("en-US") ?? null,
            description: input.description?.trim() || null,
            type,
            trackInventory,
            categoryId: input.categoryId ?? null,
            baseUnitId: input.baseUnitId,
            defaultCost: input.defaultCost,
            costCurrency: input.costCurrency?.toUpperCase(),
            defaultSalePrice: input.defaultSalePrice,
            saleCurrency: input.saleCurrency?.toUpperCase(),
          },
          include: { category: true, baseUnit: true },
        });
        await tx.auditEvent.create({
          data: {
            organizationId: context.organizationId,
            actorUserId,
            entityType: "PRODUCT",
            entityId: product.id,
            action: "CREATED",
            metadata: {
              name: product.name,
              sku: product.sku,
              type: product.type,
            },
          },
        });
        return product;
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException("SKU or barcode already exists");
      throw error;
    }
  }

  async createProductsFromImport(
    tx: Prisma.TransactionClient,
    context: OrganizationContext,
    actorUserId: string,
    rows: CatalogImportedProduct[],
  ) {
    const created = [];
    for (const row of rows) {
      validateMoneyPair(
        row.defaultCost ?? undefined,
        row.costCurrency ?? undefined,
        "Cost",
      );
      validateMoneyPair(
        row.defaultSalePrice ?? undefined,
        row.saleCurrency ?? undefined,
        "Sale price",
      );
      const unit = await tx.unit.findFirst({
        where: {
          id: row.baseUnitId,
          organizationId: context.organizationId,
          status: CatalogStatus.ACTIVE,
        },
        select: { id: true },
      });
      if (!unit)
        throw new NotFoundException(
          "An imported base unit is no longer active",
        );
      if (row.categoryId) {
        const category = await tx.category.findFirst({
          where: {
            id: row.categoryId,
            organizationId: context.organizationId,
            status: CatalogStatus.ACTIVE,
          },
          select: { id: true },
        });
        if (!category)
          throw new NotFoundException(
            "An imported category is no longer active",
          );
      }
      const product = await tx.product.create({
        data: {
          organizationId: context.organizationId,
          name: row.name,
          sku: row.sku,
          skuNormalized: row.sku.toLocaleUpperCase("en-US"),
          barcode: row.barcode,
          barcodeNormalized: row.barcode?.toLocaleUpperCase("en-US") ?? null,
          description: row.description,
          type: ProductType.STOCKED,
          trackInventory: true,
          categoryId: row.categoryId,
          baseUnitId: row.baseUnitId,
          defaultCost: row.defaultCost,
          costCurrency: row.costCurrency,
          defaultSalePrice: row.defaultSalePrice,
          saleCurrency: row.saleCurrency,
          status: row.status,
        },
      });
      await tx.auditEvent.create({
        data: {
          organizationId: context.organizationId,
          actorUserId,
          entityType: "PRODUCT",
          entityId: product.id,
          action: "CREATED_FROM_IMPORT",
          metadata: { sku: product.sku, name: product.name },
        },
      });
      created.push(product);
    }
    return created;
  }

  async addProductConversion(
    context: OrganizationContext,
    actorUserId: string,
    productId: string,
    input: CreateProductConversionDto,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.findFirst({
          where: {
            id: productId,
            organizationId: context.organizationId,
            status: CatalogStatus.ACTIVE,
          },
          select: { id: true, baseUnitId: true },
        });
        if (!product) throw new NotFoundException("Product not found");
        if (input.unitId === product.baseUnitId)
          throw new ConflictException(
            "The base unit does not need a conversion",
          );
        const unit = await tx.unit.findFirst({
          where: {
            id: input.unitId,
            organizationId: context.organizationId,
            status: CatalogStatus.ACTIVE,
          },
          select: { id: true },
        });
        if (!unit) throw new NotFoundException("Unit not found");
        const conversion = await tx.productUnitConversion.create({
          data: {
            organizationId: context.organizationId,
            productId,
            unitId: input.unitId,
            baseQuantity: input.baseQuantity,
          },
          include: { unit: true },
        });
        await tx.auditEvent.create({
          data: {
            organizationId: context.organizationId,
            actorUserId,
            entityType: "PRODUCT_UNIT_CONVERSION",
            entityId: productId,
            action: "CREATED",
            metadata: {
              unitId: input.unitId,
              baseQuantity: input.baseQuantity,
            },
          },
        });
        return conversion;
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException(
          "A conversion already exists for this product and unit",
        );
      throw error;
    }
  }

  async listCategories(
    context: OrganizationContext,
    query: CatalogListQueryDto,
  ) {
    const where = {
      organizationId: context.organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.q?.trim()
        ? { name: { contains: query.q.trim(), mode: "insensitive" as const } }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.page_size,
        take: query.page_size,
        include: { parent: { select: { id: true, name: true } } },
      }),
      this.prisma.category.count({ where }),
    ]);
    return { data, total, page: query.page, page_size: query.page_size };
  }

  async createCategory(
    context: OrganizationContext,
    actorUserId: string,
    input: CreateCategoryDto,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const parentId = input.parentId || null;
        if (parentId) {
          const parent = await tx.category.findFirst({
            where: {
              id: parentId,
              organizationId: context.organizationId,
              status: CatalogStatus.ACTIVE,
            },
            select: { id: true },
          });
          if (!parent) throw new NotFoundException("Parent category not found");
        }
        const category = await tx.category.create({
          data: {
            organizationId: context.organizationId,
            name: input.name.trim(),
            parentId,
          },
        });
        await tx.auditEvent.create({
          data: {
            organizationId: context.organizationId,
            actorUserId,
            entityType: "CATEGORY",
            entityId: category.id,
            action: "CREATED",
            metadata: { name: category.name, parentId },
          },
        });
        return category;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("A category with that name already exists");
      }
      throw error;
    }
  }

  async listUnits(context: OrganizationContext, query: CatalogListQueryDto) {
    const where = {
      organizationId: context.organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.q?.trim()
        ? {
            OR: [
              {
                name: {
                  contains: query.q.trim(),
                  mode: "insensitive" as const,
                },
              },
              {
                code: {
                  contains: query.q.trim(),
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.unit.findMany({
        where,
        orderBy: [{ name: "asc" }, { code: "asc" }],
        skip: (query.page - 1) * query.page_size,
        take: query.page_size,
      }),
      this.prisma.unit.count({ where }),
    ]);
    return { data, total, page: query.page, page_size: query.page_size };
  }

  async createUnit(
    context: OrganizationContext,
    actorUserId: string,
    input: CreateUnitDto,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const unit = await tx.unit.create({
          data: {
            organizationId: context.organizationId,
            code: input.code.trim().toUpperCase(),
            name: input.name.trim(),
            precision: input.precision ?? 0,
          },
        });
        await tx.auditEvent.create({
          data: {
            organizationId: context.organizationId,
            actorUserId,
            entityType: "UNIT",
            entityId: unit.id,
            action: "CREATED",
            metadata: {
              code: unit.code,
              name: unit.name,
              precision: unit.precision,
            },
          },
        });
        return unit;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("A unit with that code already exists");
      }
      throw error;
    }
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

function validateMoneyPair(
  amount: string | undefined,
  currency: string | undefined,
  label: string,
) {
  if ((amount === undefined) !== (currency === undefined)) {
    throw new ConflictException(
      `${label} and currency must be supplied together`,
    );
  }
}
