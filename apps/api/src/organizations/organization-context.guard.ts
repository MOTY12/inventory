import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../database/prisma.service";
import { AuthenticatedRequest } from "../identity/access-token.guard";
import { MembershipRole } from "../generated/prisma/enums";
import { requireCapability } from "./access-policy";

export type OrganizationContext = {
  organizationId: string;
  membershipId: string;
  userId: string;
  role: MembershipRole;
};

export type OrganizationRequest = AuthenticatedRequest & {
  organization?: OrganizationContext;
  warehouseId?: string;
};

@Injectable()
export class OrganizationContextGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OrganizationRequest>();
    const claims = request.auth;
    if (!claims?.organizationId) {
      throw new ForbiddenException("Select an active organization first");
    }

    const membership = await this.prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: claims.organizationId,
          userId: claims.sub,
        },
      },
      select: { id: true, role: true, status: true },
    });
    if (!membership || membership.status !== "ACTIVE") {
      throw new ForbiddenException("Active organization membership required");
    }
    request.organization = {
      organizationId: claims.organizationId,
      membershipId: membership.id,
      userId: claims.sub,
      role: membership.role,
    };
    return true;
  }
}

export function requireOrganizationAdmin(request: OrganizationRequest): void {
  if (!request.organization)
    throw new ForbiddenException("Organization context is unavailable");
  requireCapability(request.organization.role, "members:manage");
}

export function organizationContext(
  request: Request & OrganizationRequest,
): OrganizationContext {
  if (!request.organization) {
    throw new ForbiddenException("Organization context is unavailable");
  }
  return request.organization;
}
