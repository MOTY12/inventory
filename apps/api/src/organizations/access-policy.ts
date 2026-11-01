import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { MembershipRole } from "../generated/prisma/enums";
import { PrismaService } from "../database/prisma.service";
import type { OrganizationRequest } from "./organization-context.guard";

export const CAPABILITIES = [
  "organization:read",
  "organization:manage",
  "members:read",
  "members:manage",
  "warehouses:read",
  "warehouses:manage",
  "catalog:read",
  "catalog:write",
  "inventory:read",
  "inventory:write",
  "procurement:read",
  "procurement:write",
  "sales:read",
  "sales:write",
  "finance:read",
  "finance:write",
  "reports:read",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const allCapabilities = new Set<Capability>(CAPABILITIES);
const readOnlyCapabilities = new Set<Capability>([
  "organization:read",
  "members:read",
  "warehouses:read",
  "catalog:read",
  "inventory:read",
  "procurement:read",
  "sales:read",
  "finance:read",
  "reports:read",
]);

const roleCapabilities: Record<MembershipRole, ReadonlySet<Capability>> = {
  [MembershipRole.OWNER]: allCapabilities,
  [MembershipRole.ADMIN]: allCapabilities,
  [MembershipRole.MANAGER]: new Set([
    "organization:read",
    "members:read",
    "warehouses:read",
    "warehouses:manage",
    "catalog:read",
    "catalog:write",
    "inventory:read",
    "inventory:write",
    "procurement:read",
    "procurement:write",
    "sales:read",
    "sales:write",
    "reports:read",
  ]),
  [MembershipRole.BUYER]: new Set([
    "organization:read",
    "warehouses:read",
    "catalog:read",
    "catalog:write",
    "inventory:read",
    "procurement:read",
    "procurement:write",
    "reports:read",
  ]),
  [MembershipRole.SALES]: new Set([
    "organization:read",
    "warehouses:read",
    "catalog:read",
    "inventory:read",
    "sales:read",
    "sales:write",
    "reports:read",
  ]),
  [MembershipRole.WAREHOUSE_CLERK]: new Set([
    "organization:read",
    "warehouses:read",
    "catalog:read",
    "inventory:read",
    "inventory:write",
    "procurement:read",
    "sales:read",
    "reports:read",
  ]),
  [MembershipRole.FINANCE]: new Set([
    "organization:read",
    "warehouses:read",
    "catalog:read",
    "inventory:read",
    "procurement:read",
    "sales:read",
    "finance:read",
    "finance:write",
    "reports:read",
  ]),
  [MembershipRole.READ_ONLY]: readOnlyCapabilities,
  [MembershipRole.MEMBER]: readOnlyCapabilities,
};

export function roleHasCapability(
  role: MembershipRole,
  capability: Capability,
): boolean {
  return roleCapabilities[role]?.has(capability) ?? false;
}

export function requireCapability(
  role: MembershipRole,
  capability: Capability,
): void {
  if (!roleHasCapability(role, capability)) {
    throw new ForbiddenException("This role cannot perform that action");
  }
}

const REQUIRED_CAPABILITIES = "inventory.required-capabilities";

export function RequireCapabilities(...capabilities: Capability[]) {
  return SetMetadata(REQUIRED_CAPABILITIES, capabilities);
}

@Injectable()
export class RoleCapabilityGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Capability[]>(
      REQUIRED_CAPABILITIES,
      [context.getHandler(), context.getClass()],
    );
    const request = context.switchToHttp().getRequest<OrganizationRequest>();
    const role = request.organization?.role;
    if (!required?.length || !role) {
      throw new ForbiddenException("Required access policy is unavailable");
    }
    required.forEach((capability) => requireCapability(role, capability));
    return true;
  }
}

@Injectable()
export class WarehouseScopeGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OrganizationRequest>();
    const organization = request.organization;
    if (!organization || !request.auth) {
      throw new ForbiddenException("Organization access is required");
    }
    const routeWarehouseId = request.params.warehouseId;
    const queryWarehouseId = request.query.warehouse_id;
    const warehouseId =
      typeof routeWarehouseId === "string"
        ? routeWarehouseId
        : typeof queryWarehouseId === "string"
          ? queryWarehouseId
          : undefined;
    if (!warehouseId) {
      throw new ForbiddenException("Warehouse scope is required");
    }

    const warehouse = await this.prisma.warehouse.findFirst({
      where: {
        id: warehouseId,
        organizationId: organization.organizationId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!warehouse) throw new NotFoundException();

    if (
      organization.role === MembershipRole.OWNER ||
      organization.role === MembershipRole.ADMIN
    ) {
      request.warehouseId = warehouse.id;
      return true;
    }

    const grant = await this.prisma.membershipWarehouseGrant.findUnique({
      where: {
        organizationId_userId_warehouseId: {
          organizationId: organization.organizationId,
          userId: request.auth.sub,
          warehouseId,
        },
      },
      select: { warehouseId: true },
    });
    if (!grant) throw new NotFoundException();
    request.warehouseId = grant.warehouseId;
    return true;
  }
}
