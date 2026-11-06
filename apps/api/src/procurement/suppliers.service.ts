import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { CatalogStatus } from "../generated/prisma/enums";
import { PrismaService } from "../database/prisma.service";
import type { OrganizationContext } from "../organizations/organization-context.guard";
import {
  CreateSupplierDto,
  SupplierListQueryDto,
  UpdateSupplierDto,
} from "./suppliers.dto";

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(context: OrganizationContext, query: SupplierListQueryDto) {
    const term = query.q?.trim();
    const where = {
      organizationId: context.organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" as const } },
              { contactName: { contains: term, mode: "insensitive" as const } },
              { email: { contains: term, mode: "insensitive" as const } },
              { phone: { contains: term } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.page_size,
        take: query.page_size,
      }),
      this.prisma.supplier.count({ where }),
    ]);
    return { data, total, page: query.page, page_size: query.page_size };
  }

  async get(context: OrganizationContext, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId: context.organizationId },
    });
    if (!supplier) throw new NotFoundException("Supplier not found");
    return supplier;
  }

  async auditHistory(context: OrganizationContext, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId: context.organizationId },
      select: { id: true },
    });
    if (!supplier) throw new NotFoundException("Supplier not found");
    return this.prisma.auditEvent.findMany({
      where: {
        organizationId: context.organizationId,
        entityType: "SUPPLIER",
        entityId: supplierId,
      },
      orderBy: { occurredAt: "desc" },
      take: 50,
      include: { actor: { select: { email: true } } },
    });
  }

  async create(
    context: OrganizationContext,
    actorUserId: string,
    input: CreateSupplierDto,
  ) {
    const data = supplierData(input);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const supplier = await tx.supplier.create({
          data: {
            organizationId: context.organizationId,
            ...data,
            name: input.name.trim(),
            nameNormalized: normalizeName(input.name),
          },
        });
        await tx.auditEvent.create({
          data: {
            organizationId: context.organizationId,
            actorUserId,
            entityType: "SUPPLIER",
            entityId: supplier.id,
            action: "CREATED",
            metadata: { name: supplier.name },
          },
        });
        return supplier;
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException("A supplier with this name already exists");
      throw error;
    }
  }

  async update(
    context: OrganizationContext,
    actorUserId: string,
    supplierId: string,
    input: UpdateSupplierDto,
  ) {
    const data = supplierData(input);
    if (input.name !== undefined) {
      data.name = input.name.trim();
      data.nameNormalized = normalizeName(input.name);
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.supplier.findFirst({
          where: { id: supplierId, organizationId: context.organizationId },
          select: { id: true, status: true },
        });
        if (!existing) throw new NotFoundException("Supplier not found");
        if (existing.status !== CatalogStatus.ACTIVE)
          throw new ConflictException("Archived suppliers cannot be edited");
        const supplier = await tx.supplier.update({
          where: { id: supplierId },
          data,
        });
        await tx.auditEvent.create({
          data: {
            organizationId: context.organizationId,
            actorUserId,
            entityType: "SUPPLIER",
            entityId: supplier.id,
            action: "UPDATED",
            metadata: { fields: Object.keys(data) },
          },
        });
        return supplier;
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException("A supplier with this name already exists");
      throw error;
    }
  }

  async archive(
    context: OrganizationContext,
    actorUserId: string,
    supplierId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findFirst({
        where: { id: supplierId, organizationId: context.organizationId },
        select: { id: true, status: true },
      });
      if (!supplier) throw new NotFoundException("Supplier not found");
      if (supplier.status === CatalogStatus.ARCHIVED) return supplier;
      const archived = await tx.supplier.update({
        where: { id: supplier.id },
        data: { status: CatalogStatus.ARCHIVED },
        select: { id: true, status: true },
      });
      await tx.auditEvent.create({
        data: {
          organizationId: context.organizationId,
          actorUserId,
          entityType: "SUPPLIER",
          entityId: supplier.id,
          action: "ARCHIVED",
        },
      });
      return archived;
    });
  }
}

function supplierData(input: CreateSupplierDto | UpdateSupplierDto) {
  const data: Record<string, unknown> = {};
  for (const field of [
    "contactName",
    "email",
    "phone",
    "website",
    "addressLine1",
    "addressLine2",
    "city",
    "region",
    "postalCode",
    "countryCode",
    "termsNotes",
  ] as const) {
    const value = input[field];
    if (value !== undefined)
      data[field] = typeof value === "string" ? value.trim() || null : value;
  }
  if (typeof input.email === "string")
    data.email = input.email.trim().toLowerCase();
  if (typeof input.countryCode === "string")
    data.countryCode = input.countryCode.trim().toUpperCase();
  return data;
}

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleUpperCase("en-US");
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
