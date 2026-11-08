import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { CustomerStatus } from "../generated/prisma/enums";
import type { OrganizationContext } from "../organizations/organization-context.guard";
import {
  CreateCustomerDto,
  CustomerListQueryDto,
  UpdateCustomerDto,
} from "./customers.dto";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}
  async list(context: OrganizationContext, query: CustomerListQueryDto) {
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
      this.prisma.customer.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.page_size,
        take: query.page_size,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { data, total, page: query.page, page_size: query.page_size };
  }
  async get(ctx: OrganizationContext, id: string) {
    const row = await this.prisma.customer.findFirst({
      where: { organizationId: ctx.organizationId, id },
    });
    if (!row) throw new NotFoundException("Customer not found");
    return row;
  }
  async auditHistory(ctx: OrganizationContext, id: string) {
    if (
      !(await this.prisma.customer.findFirst({
        where: { organizationId: ctx.organizationId, id },
        select: { id: true },
      }))
    )
      throw new NotFoundException("Customer not found");
    return this.prisma.auditEvent.findMany({
      where: {
        organizationId: ctx.organizationId,
        entityType: "CUSTOMER",
        entityId: id,
      },
      orderBy: { occurredAt: "desc" },
      take: 50,
      include: { actor: { select: { email: true } } },
    });
  }
  async create(
    ctx: OrganizationContext,
    actor: string,
    input: CreateCustomerDto,
  ) {
    const data = customerData(input);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.customer.create({
          data: {
            organizationId: ctx.organizationId,
            ...data,
            name: input.name.trim(),
            nameNormalized: normalize(input.name),
            emailNormalized: input.email?.trim().toLowerCase() || null,
          },
        });
        await tx.auditEvent.create({
          data: {
            organizationId: ctx.organizationId,
            actorUserId: actor,
            entityType: "CUSTOMER",
            entityId: row.id,
            action: "CREATED",
            metadata: { name: row.name, type: row.type },
          },
        });
        return row;
      });
    } catch (error) {
      if (unique(error))
        throw new ConflictException(
          "A customer with this email already exists",
        );
      throw error;
    }
  }
  async update(
    ctx: OrganizationContext,
    actor: string,
    id: string,
    input: UpdateCustomerDto,
  ) {
    const data = customerData(input);
    if (input.name !== undefined) {
      data.name = input.name.trim();
      data.nameNormalized = normalize(input.name);
    }
    if (input.email !== undefined)
      data.emailNormalized = input.email?.trim().toLowerCase() || null;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const prior = await tx.customer.findFirst({
          where: { organizationId: ctx.organizationId, id },
          select: { id: true, status: true },
        });
        if (!prior) throw new NotFoundException("Customer not found");
        if (prior.status !== CustomerStatus.ACTIVE)
          throw new ConflictException("Archived customers cannot be edited");
        const row = await tx.customer.update({ where: { id }, data });
        await tx.auditEvent.create({
          data: {
            organizationId: ctx.organizationId,
            actorUserId: actor,
            entityType: "CUSTOMER",
            entityId: id,
            action: "UPDATED",
            metadata: { fields: Object.keys(data) },
          },
        });
        return row;
      });
    } catch (error) {
      if (unique(error))
        throw new ConflictException(
          "A customer with this email already exists",
        );
      throw error;
    }
  }
  async archive(ctx: OrganizationContext, actor: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const prior = await tx.customer.findFirst({
        where: { organizationId: ctx.organizationId, id },
        select: { id: true, status: true },
      });
      if (!prior) throw new NotFoundException("Customer not found");
      if (prior.status === CustomerStatus.ARCHIVED) return prior;
      const row = await tx.customer.update({
        where: { id },
        data: { status: CustomerStatus.ARCHIVED },
        select: { id: true, status: true },
      });
      await tx.auditEvent.create({
        data: {
          organizationId: ctx.organizationId,
          actorUserId: actor,
          entityType: "CUSTOMER",
          entityId: id,
          action: "ARCHIVED",
        },
      });
      return row;
    });
  }
}
function customerData(input: CreateCustomerDto | UpdateCustomerDto) {
  const data: Record<string, unknown> = {};
  for (const field of [
    "type",
    "contactName",
    "email",
    "phone",
    "billingAddressLine1",
    "billingAddressLine2",
    "billingCity",
    "billingRegion",
    "billingPostalCode",
    "billingCountryCode",
    "shippingAddressLine1",
    "shippingAddressLine2",
    "shippingCity",
    "shippingRegion",
    "shippingPostalCode",
    "shippingCountryCode",
    "notes",
  ] as const) {
    const value = input[field];
    if (value !== undefined)
      data[field] = typeof value === "string" ? value.trim() || null : value;
  }
  if (typeof input.email === "string")
    data.email = input.email.trim().toLowerCase();
  for (const field of ["billingCountryCode", "shippingCountryCode"] as const)
    if (typeof input[field] === "string")
      data[field] = input[field]!.trim().toUpperCase();
  return data;
}
function normalize(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleUpperCase("en-US");
}
function unique(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
