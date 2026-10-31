import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../database/prisma.service";
import { PasswordHasher } from "./password-hasher";
import { AccessTokenService } from "./access-token.service";
import { hashRefreshToken, issueRefreshToken } from "./refresh-token";
import { EMAIL_DELIVERY, EmailDelivery } from "./email-delivery";

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const INVALID_CREDENTIALS = "Invalid email or password";

type IssuedSession = {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  csrfToken: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordHasher,
    private readonly accessTokens: AccessTokenService,
    @Inject(EMAIL_DELIVERY) private readonly emailDelivery: EmailDelivery,
  ) {}

  async register(
    email: string,
    password: string,
  ): Promise<{ message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await this.passwords.hash(password);
    const token = issueRefreshToken();
    const expiresAt = new Date(Date.now() + VERIFY_TTL_MS);

    try {
      const user = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          emailNormalized: normalizedEmail,
          passwordHash,
          verificationTokens: {
            create: { tokenHash: token.tokenHash, expiresAt },
          },
        },
      });
      await this.emailDelivery.send({
        type: "verify-email",
        to: user.email,
        token: token.token,
        expiresAt,
      });
    } catch (error) {
      if (isPrismaCode(error, "P2002")) {
        return {
          message:
            "If the address can be registered, a verification email will be sent.",
        };
      }
      throw error;
    }
    return {
      message:
        "If the address can be registered, a verification email will be sent.",
    };
  }

  async login(email: string, password: string): Promise<IssuedSession> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: normalizedEmail },
    });
    if (!user) {
      await this.passwords.hash(password);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (!(await this.passwords.verify(user.passwordHash, password))) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (user.status !== "ACTIVE" || !user.emailVerifiedAt) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    return this.createSession(user.id);
  }

  async rotateRefreshToken(rawToken: string): Promise<IssuedSession> {
    const tokenHash = hashRefreshToken(rawToken);
    const now = new Date();
    const outcome = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.refreshSession.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (!current) return { kind: "invalid" as const };
      if (current.revokedAt) {
        return { kind: "reuse" as const, familyId: current.familyId };
      }
      if (current.expiresAt <= now || current.user.status !== "ACTIVE") {
        return { kind: "invalid" as const };
      }

      let organizationId = current.organizationId ?? undefined;
      if (organizationId) {
        const membership = await transaction.membership.findUnique({
          where: {
            organizationId_userId: {
              organizationId,
              userId: current.userId,
            },
          },
          select: { status: true },
        });
        if (membership?.status !== "ACTIVE") organizationId = undefined;
      }

      const revoked = await transaction.refreshSession.updateMany({
        where: { id: current.id, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now, lastUsedAt: now },
      });
      if (revoked.count !== 1) {
        return { kind: "reuse" as const, familyId: current.familyId };
      }

      const next = issueRefreshToken();
      const nextSessionId = randomUUID();
      const csrfToken = issueRefreshToken().token;
      await transaction.refreshSession.create({
        data: {
          id: nextSessionId,
          familyId: current.familyId,
          userId: current.userId,
          ...(organizationId ? { organizationId } : {}),
          tokenHash: next.tokenHash,
          expiresAt: new Date(now.getTime() + REFRESH_TTL_MS),
        },
      });
      const access = await this.accessTokens.issue({
        sub: current.userId,
        sid: nextSessionId,
        ...(organizationId ? { organizationId } : {}),
      });
      return {
        kind: "success" as const,
        session: {
          accessToken: access.token,
          expiresIn: access.expiresIn,
          refreshToken: next.token,
          csrfToken,
        },
      };
    });

    if (outcome.kind === "reuse") {
      await this.prisma.refreshSession.updateMany({
        where: { familyId: outcome.familyId, revokedAt: null },
        data: { revokedAt: now },
      });
    }
    if (outcome.kind !== "success")
      throw new UnauthorizedException("Invalid refresh session");
    return outcome.session;
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.prisma.refreshSession.updateMany({
      where: { tokenHash: hashRefreshToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async verifyEmail(rawToken: string): Promise<{ message: string }> {
    const now = new Date();
    const result = await this.prisma.$transaction(async (transaction) => {
      const token = await transaction.emailVerificationToken.findUnique({
        where: { tokenHash: hashRefreshToken(rawToken) },
      });
      if (!token || token.consumedAt || token.expiresAt <= now) return false;
      const consumed = await transaction.emailVerificationToken.updateMany({
        where: { id: token.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) return false;
      const activated = await transaction.user.updateMany({
        where: {
          id: token.userId,
          status: "PENDING_VERIFICATION",
          emailVerifiedAt: null,
        },
        data: { emailVerifiedAt: now, status: "ACTIVE" },
      });
      return activated.count === 1;
    });
    if (!result)
      throw new UnauthorizedException(
        "Verification link is invalid or expired",
      );
    return { message: "Email verified. You can now sign in." };
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: normalizedEmail },
    });
    if (user && user.status === "PENDING_VERIFICATION") {
      const issued = issueRefreshToken();
      const expiresAt = new Date(Date.now() + VERIFY_TTL_MS);
      await this.prisma.$transaction(async (transaction) => {
        await transaction.emailVerificationToken.updateMany({
          where: { userId: user.id, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        await transaction.emailVerificationToken.create({
          data: { userId: user.id, tokenHash: issued.tokenHash, expiresAt },
        });
      });
      await this.emailDelivery.send({
        type: "verify-email",
        to: user.email,
        token: issued.token,
        expiresAt,
      });
    }
    return { message: "If verification is pending, a new email will be sent." };
  }

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: normalizedEmail },
    });
    if (user && user.status === "ACTIVE") {
      const issued = issueRefreshToken();
      const expiresAt = new Date(Date.now() + RESET_TTL_MS);
      await this.prisma.$transaction(async (transaction) => {
        await transaction.passwordResetToken.updateMany({
          where: { userId: user.id, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        await transaction.passwordResetToken.create({
          data: { userId: user.id, tokenHash: issued.tokenHash, expiresAt },
        });
      });
      await this.emailDelivery.send({
        type: "reset-password",
        to: user.email,
        token: issued.token,
        expiresAt,
      });
    }
    return {
      message: "If the account exists, a password reset email will be sent.",
    };
  }

  async resetPassword(
    rawToken: string,
    password: string,
  ): Promise<{ message: string }> {
    const now = new Date();
    const tokenHash = hashRefreshToken(rawToken);
    const candidate = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!candidate || candidate.consumedAt || candidate.expiresAt <= now)
      throw new UnauthorizedException("Reset link is invalid or expired");
    const passwordHash = await this.passwords.hash(password);
    const result = await this.prisma.$transaction(async (transaction) => {
      const token = await transaction.passwordResetToken.findUnique({
        where: { tokenHash },
      });
      if (!token || token.consumedAt || token.expiresAt <= now) return false;
      const consumed = await transaction.passwordResetToken.updateMany({
        where: { id: token.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) return false;
      await transaction.user.update({
        where: { id: token.userId },
        data: { passwordHash },
      });
      await transaction.refreshSession.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      return true;
    });
    if (!result)
      throw new UnauthorizedException("Reset link is invalid or expired");
    return { message: "Password updated. Sign in with your new password." };
  }

  async getUser(
    userId: string,
  ): Promise<{ id: string; email: string; emailVerifiedAt: Date | null }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerifiedAt: true },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  private async createSession(userId: string): Promise<IssuedSession> {
    const refresh = issueRefreshToken();
    const sessionId = randomUUID();
    const csrfToken = issueRefreshToken().token;
    const memberships = await this.prisma.membership.findMany({
      where: { userId, status: "ACTIVE" },
      select: { organizationId: true },
      take: 2,
    });
    const organizationId =
      memberships.length === 1 ? memberships[0].organizationId : undefined;
    await this.prisma.refreshSession.create({
      data: {
        id: sessionId,
        userId,
        familyId: randomUUID(),
        ...(organizationId ? { organizationId } : {}),
        tokenHash: refresh.tokenHash,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    const access = await this.accessTokens.issue({
      sub: userId,
      sid: sessionId,
      ...(organizationId ? { organizationId } : {}),
    });
    return {
      accessToken: access.token,
      expiresIn: access.expiresIn,
      refreshToken: refresh.token,
      csrfToken,
    };
  }
}

function isPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
