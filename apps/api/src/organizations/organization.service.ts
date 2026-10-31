import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { MembershipRole } from "../generated/prisma/enums";
import { PrismaService } from "../database/prisma.service";
import { AccessTokenService } from "../identity/access-token.service";
import { EMAIL_DELIVERY, EmailDelivery } from "../identity/email-delivery";
import { hashRefreshToken, issueRefreshToken } from "../identity/refresh-token";
import { Inject } from "@nestjs/common";
import { OrganizationContext } from "./organization-context.guard";
import { InviteMemberDto } from "./organization.dto";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type OrganizationInput = { name: string; slug?: string };

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessTokens: AccessTokenService,
    @Inject(EMAIL_DELIVERY) private readonly emailDelivery: EmailDelivery,
  ) {}

  async create(userId: string, sessionId: string, input: OrganizationInput) {
    const slug = normalizeSlug(input.slug ?? input.name);
    try {
      const organization = await this.prisma.$transaction(
        async (transaction) => {
          const created = await transaction.organization.create({
            data: { name: input.name.trim(), slug },
          });
          await transaction.membership.create({
            data: {
              organizationId: created.id,
              userId,
              role: MembershipRole.OWNER,
              status: "ACTIVE",
            },
          });
          const sessionUpdated = await transaction.refreshSession.updateMany({
            where: { id: sessionId, userId, revokedAt: null },
            data: { organizationId: created.id },
          });
          if (sessionUpdated.count !== 1) throw new UnauthorizedException();
          return created;
        },
      );
      const accessToken = await this.accessTokens.issue({
        sub: userId,
        sid: sessionId,
        organizationId: organization.id,
      });
      return { organization, accessToken: accessToken.token };
    } catch (error) {
      if (isPrismaCode(error, "P2002")) {
        throw new ConflictException({
          code: "ORGANIZATION_SLUG_TAKEN",
          message: "An organization with that slug already exists",
        });
      }
      throw error;
    }
  }

  listForUser(userId: string) {
    return this.prisma.membership.findMany({
      where: { userId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        organization: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  async selectOrganization(
    userId: string,
    sessionId: string,
    organizationId: string,
  ) {
    const membership = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { status: true },
    });
    if (!membership || membership.status !== "ACTIVE")
      throw new NotFoundException();
    const updated = await this.prisma.refreshSession.updateMany({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { organizationId },
    });
    if (updated.count !== 1) throw new UnauthorizedException();
    const token = await this.accessTokens.issue({
      sub: userId,
      sid: sessionId,
      organizationId,
    });
    return { accessToken: token.token };
  }

  getCurrent(context: OrganizationContext) {
    return this.prisma.organization.findUnique({
      where: { id: context.organizationId },
      select: { id: true, name: true, slug: true, createdAt: true },
    });
  }

  async updateCurrent(context: OrganizationContext, name: string | undefined) {
    if (name === undefined) return this.getCurrent(context);
    return this.prisma.organization.update({
      where: { id: context.organizationId },
      data: { name: name.trim() },
      select: { id: true, name: true, slug: true, createdAt: true },
    });
  }

  listMembers(context: OrganizationContext) {
    return this.prisma.membership.findMany({
      where: { organizationId: context.organizationId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        role: true,
        status: true,
        createdAt: true,
        user: { select: { id: true, email: true } },
      },
    });
  }

  async invite(
    userId: string,
    context: OrganizationContext,
    input: InviteMemberDto,
  ) {
    if (input.role === "ADMIN" && context.role !== "OWNER") {
      throw new ForbiddenException("Only an owner can invite an administrator");
    }
    const emailNormalized = input.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { emailNormalized },
      select: { id: true },
    });
    const currentMembership = existingUser
      ? await this.prisma.membership.findUnique({
          where: {
            organizationId_userId: {
              organizationId: context.organizationId,
              userId: existingUser.id,
            },
          },
          select: { status: true },
        })
      : null;
    if (currentMembership?.status === "ACTIVE") {
      throw new ConflictException("This user is already a member");
    }

    const token = issueRefreshToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const invitation = await this.prisma.$transaction(async (transaction) => {
      await transaction.organizationInvitation.updateMany({
        where: {
          organizationId: context.organizationId,
          emailNormalized,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      return transaction.organizationInvitation.create({
        data: {
          organizationId: context.organizationId,
          invitedByUserId: userId,
          emailNormalized,
          role: input.role,
          tokenHash: token.tokenHash,
          expiresAt,
        },
        select: {
          id: true,
          emailNormalized: true,
          role: true,
          expiresAt: true,
        },
      });
    });
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: context.organizationId },
      select: { name: true },
    });
    await this.emailDelivery.send({
      type: "organization-invitation",
      to: emailNormalized,
      token: token.token,
      organizationName: organization.name,
      expiresAt,
    });
    return invitation;
  }

  listInvitations(context: OrganizationContext) {
    return this.prisma.organizationInvitation.findMany({
      where: {
        organizationId: context.organizationId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        emailNormalized: true,
        role: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  async revokeInvitation(
    context: OrganizationContext,
    invitationId: string,
  ): Promise<void> {
    const result = await this.prisma.organizationInvitation.updateMany({
      where: {
        id: invitationId,
        organizationId: context.organizationId,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    if (result.count !== 1) throw new NotFoundException();
  }

  async acceptInvitation(userId: string, sessionId: string, rawToken: string) {
    const now = new Date();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailNormalized: true, status: true, emailVerifiedAt: true },
    });
    if (!user || user.status !== "ACTIVE" || !user.emailVerifiedAt) {
      throw new UnauthorizedException();
    }
    const tokenHash = hashRefreshToken(rawToken);
    const accepted = await this.prisma.$transaction(async (transaction) => {
      const invitation = await transaction.organizationInvitation.findUnique({
        where: { tokenHash },
      });
      if (
        !invitation ||
        invitation.revokedAt ||
        invitation.acceptedAt ||
        invitation.expiresAt <= now
      ) {
        throw new NotFoundException("Invitation is invalid or expired");
      }
      if (invitation.emailNormalized !== user.emailNormalized) {
        throw new ForbiddenException(
          "Invitation belongs to a different email address",
        );
      }
      const consumed = await transaction.organizationInvitation.updateMany({
        where: {
          id: invitation.id,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { acceptedAt: now },
      });
      if (consumed.count !== 1)
        throw new ConflictException("Invitation was already used");

      const existing = await transaction.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId,
          },
        },
      });
      const membership =
        existing?.status === "ACTIVE"
          ? existing
          : await transaction.membership.upsert({
              where: {
                organizationId_userId: {
                  organizationId: invitation.organizationId,
                  userId,
                },
              },
              create: {
                organizationId: invitation.organizationId,
                userId,
                role: invitation.role,
                status: "ACTIVE",
              },
              update: { role: invitation.role, status: "ACTIVE" },
            });
      const sessionUpdated = await transaction.refreshSession.updateMany({
        where: { id: sessionId, userId, revokedAt: null },
        data: { organizationId: invitation.organizationId },
      });
      if (sessionUpdated.count !== 1) throw new UnauthorizedException();
      return { invitation, membership };
    });
    const access = await this.accessTokens.issue({
      sub: userId,
      sid: sessionId,
      organizationId: accepted.invitation.organizationId,
    });
    return {
      organizationId: accepted.invitation.organizationId,
      membershipId: accepted.membership.id,
      accessToken: access.token,
    };
  }

  async deactivateMember(
    context: OrganizationContext,
    membershipId: string,
  ): Promise<void> {
    const member = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      select: { organizationId: true, role: true, status: true },
    });
    if (
      !member ||
      member.organizationId !== context.organizationId ||
      member.status !== "ACTIVE"
    ) {
      throw new NotFoundException();
    }
    if (member.role === "OWNER")
      throw new ForbiddenException("Organization owners cannot be deactivated");
    if (member.role === "ADMIN" && context.role !== "OWNER") {
      throw new ForbiddenException(
        "Only an owner can deactivate an administrator",
      );
    }
    await this.prisma.membership.updateMany({
      where: {
        id: membershipId,
        organizationId: context.organizationId,
        status: "ACTIVE",
      },
      data: { status: "DEACTIVATED" },
    });
  }
}

function normalizeSlug(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || `organization-${randomUUID().slice(0, 8)}`;
}

function isPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
