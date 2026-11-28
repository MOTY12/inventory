import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { BranchStatus, WarehouseStatus } from "../generated/prisma/enums";
import type { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import { OrganizationContext } from "../organizations/organization-context.guard";
import {
  BranchListQueryDto,
  CreateBranchDto,
  CreateWarehouseDto,
  UpdateBranchDto,
  UpdateWarehouseDto,
  WarehouseListQueryDto,
} from "./location.dto";

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listBranches(context: OrganizationContext, query: BranchListQueryDto) {
    const where = this.branchVisibilityWhere(context, query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.branch.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.page_size,
        take: query.page_size,
      }),
      this.prisma.branch.count({ where }),
    ]);
    return { data, total, page: query.page, page_size: query.page_size };
  }

  async getBranch(context: OrganizationContext, branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: this.branchVisibilityWhere(
        context,
        { page: 1, page_size: 1 },
        branchId,
      ),
      include: {
        warehouses: {
          where: {
            status: WarehouseStatus.ACTIVE,
            ...(isAdmin(context)
              ? {}
              : {
                  grants: {
                    some: {
                      organizationId: context.organizationId,
                      userId: context.userId,
                    },
                  },
                }),
          },
          select: {
            id: true,
            branchId: true,
            name: true,
            code: true,
            status: true,
          },
          orderBy: [{ name: "asc" }, { code: "asc" }],
        },
      },
    });
    if (!branch) throw new NotFoundException();
    return branch;
  }

  async createBranch(
    context: OrganizationContext,
    actorUserId: string,
    input: CreateBranchDto,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const branch = await tx.branch.create({
          data: {
            organizationId: context.organizationId,
            name: input.name.trim(),
            address: input.address?.trim() || null,
          },
        });
        await this.audit(
          tx,
          context.organizationId,
          actorUserId,
          "BRANCH",
          branch.id,
          "CREATED",
          {
            name: branch.name,
          },
        );
        return branch;
      });
    } catch (error) {
      throw mapUniqueConflict(error, "A branch with that name already exists");
    }
  }

  async updateBranch(
    context: OrganizationContext,
    actorUserId: string,
    branchId: string,
    input: UpdateBranchDto,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockBranch(tx, context.organizationId, branchId);
        const existing = await tx.branch.findFirst({
          where: { id: branchId, organizationId: context.organizationId },
          select: { id: true, name: true, address: true, status: true },
        });
        if (!existing) throw new NotFoundException();
        if (input.status === BranchStatus.ARCHIVED) {
          const activeWarehouses = await tx.warehouse.count({
            where: {
              organizationId: context.organizationId,
              branchId,
              status: WarehouseStatus.ACTIVE,
            },
          });
          if (activeWarehouses > 0) {
            throw new ConflictException(
              "Archive active warehouses before archiving this branch",
            );
          }
        }
        const branch = await tx.branch.update({
          where: { id: branchId },
          data: {
            ...(input.name === undefined ? {} : { name: input.name.trim() }),
            ...(input.address === undefined
              ? {}
              : { address: input.address.trim() || null }),
            ...(input.status === undefined ? {} : { status: input.status }),
          },
        });
        await this.audit(
          tx,
          context.organizationId,
          actorUserId,
          "BRANCH",
          branch.id,
          "UPDATED",
          {
            before: existing,
            after: {
              name: branch.name,
              address: branch.address,
              status: branch.status,
            },
          },
        );
        return branch;
      });
    } catch (error) {
      throw mapUniqueConflict(error, "A branch with that name already exists");
    }
  }

  async listWarehouses(
    context: OrganizationContext,
    query: WarehouseListQueryDto,
  ) {
    const where = {
      organizationId: context.organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.q
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
      ...(!isAdmin(context)
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
    const [data, total] = await this.prisma.$transaction([
      this.prisma.warehouse.findMany({
        where,
        orderBy: [{ name: "asc" }, { code: "asc" }],
        skip: (query.page - 1) * query.page_size,
        take: query.page_size,
        select: {
          id: true,
          branchId: true,
          name: true,
          code: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          branch: { select: { id: true, name: true } },
        },
      }),
      this.prisma.warehouse.count({ where }),
    ]);
    return { data, total, page: query.page, page_size: query.page_size };
  }

  async getWarehouse(context: OrganizationContext, warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: {
        id: warehouseId,
        organizationId: context.organizationId,
        status: WarehouseStatus.ACTIVE,
      },
      select: {
        id: true,
        branchId: true,
        name: true,
        code: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        branch: { select: { id: true, name: true } },
      },
    });
    if (!warehouse) throw new NotFoundException();
    return warehouse;
  }

  async createWarehouse(
    context: OrganizationContext,
    actorUserId: string,
    input: CreateWarehouseDto,
  ) {
    const code = input.code.trim().toUpperCase();
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockBranch(tx, context.organizationId, input.branchId);
        const branch = await tx.branch.findFirst({
          where: {
            id: input.branchId,
            organizationId: context.organizationId,
            status: BranchStatus.ACTIVE,
          },
          select: { id: true },
        });
        if (!branch)
          throw new NotFoundException(
            "Active branch not found in this organization",
          );
        const warehouse = await tx.warehouse.create({
          data: {
            organizationId: context.organizationId,
            branchId: branch.id,
            name: input.name.trim(),
            code,
          },
          select: {
            id: true,
            branchId: true,
            name: true,
            code: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        if (!isAdmin(context)) {
          await tx.membershipWarehouseGrant.create({
            data: {
              organizationId: context.organizationId,
              userId: actorUserId,
              warehouseId: warehouse.id,
            },
          });
        }
        await this.audit(
          tx,
          context.organizationId,
          actorUserId,
          "WAREHOUSE",
          warehouse.id,
          "CREATED",
          {
            name: warehouse.name,
            code: warehouse.code,
            branchId: warehouse.branchId,
          },
        );
        return warehouse;
      });
    } catch (error) {
      throw mapUniqueConflict(
        error,
        "A warehouse with that code already exists in this organization",
      );
    }
  }

  async updateWarehouse(
    context: OrganizationContext,
    actorUserId: string,
    warehouseId: string,
    input: UpdateWarehouseDto,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.warehouse.findFirst({
          where: { id: warehouseId, organizationId: context.organizationId },
          select: {
            id: true,
            branchId: true,
            name: true,
            code: true,
            status: true,
          },
        });
        if (!existing) throw new NotFoundException();
        let branchId = input.branchId;
        if (branchId || input.status === WarehouseStatus.ACTIVE) {
          branchId ??= existing.branchId ?? undefined;
          if (!branchId)
            throw new ConflictException(
              "Assign a branch before activating this warehouse",
            );
          await this.lockBranch(tx, context.organizationId, branchId);
          const branch = await tx.branch.findFirst({
            where: {
              id: branchId,
              organizationId: context.organizationId,
              status: BranchStatus.ACTIVE,
            },
            select: { id: true },
          });
          if (!branch)
            throw new NotFoundException(
              "Active branch not found in this organization",
            );
          if (!isAdmin(context)) {
            const branchGrant = await tx.membershipWarehouseGrant.findFirst({
              where: {
                organizationId: context.organizationId,
                userId: context.userId,
                warehouse: { branchId },
              },
              select: { warehouseId: true },
            });
            if (!branchGrant) throw new NotFoundException();
          }
        }
        const warehouse = await tx.warehouse.update({
          where: { id: warehouseId },
          data: {
            ...(branchId === undefined ? {} : { branchId }),
            ...(input.name === undefined ? {} : { name: input.name.trim() }),
            ...(input.code === undefined
              ? {}
              : { code: input.code.trim().toUpperCase() }),
            ...(input.status === undefined ? {} : { status: input.status }),
          },
          select: {
            id: true,
            branchId: true,
            name: true,
            code: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        await this.audit(
          tx,
          context.organizationId,
          actorUserId,
          "WAREHOUSE",
          warehouse.id,
          "UPDATED",
          {
            before: existing,
            after: {
              branchId: warehouse.branchId,
              name: warehouse.name,
              code: warehouse.code,
              status: warehouse.status,
            },
          },
        );
        return warehouse;
      });
    } catch (error) {
      throw mapUniqueConflict(
        error,
        "A warehouse with that code already exists in this organization",
      );
    }
  }

  private branchVisibilityWhere(
    context: OrganizationContext,
    query: Partial<BranchListQueryDto>,
    id?: string,
  ) {
    return {
      organizationId: context.organizationId,
      ...(id ? { id } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? { name: { contains: query.q.trim(), mode: "insensitive" as const } }
        : {}),
      ...(!isAdmin(context)
        ? {
            warehouses: {
              some: {
                grants: {
                  some: {
                    organizationId: context.organizationId,
                    userId: context.userId,
                  },
                },
              },
            },
          }
        : {}),
    };
  }

  private audit(
    tx: Prisma.TransactionClient,
    organizationId: string,
    actorUserId: string,
    entityType: string,
    entityId: string,
    action: string,
    metadata: object,
  ) {
    return tx.auditEvent.create({
      data: {
        organizationId,
        actorUserId,
        entityType,
        entityId,
        action,
        metadata,
      },
    });
  }

  private async lockBranch(
    tx: Prisma.TransactionClient,
    organizationId: string,
    branchId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM branches
      WHERE id = ${branchId}::uuid AND organization_id = ${organizationId}::uuid
      FOR UPDATE
    `;
    if (!rows.length) throw new NotFoundException();
  }
}

function isAdmin(context: OrganizationContext) {
  return context.role === "OWNER" || context.role === "ADMIN";
}

function mapUniqueConflict(error: unknown, message: string): never {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  ) {
    throw new ConflictException(message);
  }
  throw error;
}
