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

export type OrganizationContext = {
  organizationId: string;
  membershipId: string;
  role: MembershipRole;
};

export type OrganizationRequest = AuthenticatedRequest & {
  organization?: OrganizationContext;
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
      role: membership.role,
    };
    return true;
  }
}

export function requireOrganizationAdmin(request: OrganizationRequest): void {
  if (
    request.organization?.role !== "OWNER" &&
    request.organization?.role !== "ADMIN"
  ) {
    throw new ForbiddenException("Organization administrator role required");
  }
}

export function organizationContext(
  request: Request & OrganizationRequest,
): OrganizationContext {
  if (!request.organization) {
    throw new ForbiddenException("Organization context is unavailable");
  }
  return request.organization;
}
