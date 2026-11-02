import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { CatalogStatus } from "../generated/prisma/enums";
import { PrismaService } from "../database/prisma.service";
import type { OrganizationContext } from "../organizations/organization-context.guard";
import {
  CatalogListQueryDto,
  CreateCategoryDto,
  CreateProductConversionDto,
  CreateProductDto,
  CreateUnitDto,
} from "./catalog.dto";
import { ProductType } from "../generated/prisma/enums";

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

  async createProduct(
    context: OrganizationContext,
    actorUserId: string,
    input: CreateProductDto,
  ) {
    const sku = input.sku.trim();
    const barcode = input.barcode?.trim() || null;
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
