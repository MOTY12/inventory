import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../database/prisma.service";
import { AccessTokenClaims, AccessTokenService } from "./access-token.service";

export type AuthenticatedRequest = Request & { auth?: AccessTokenClaims };

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly tokens: AccessTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new UnauthorizedException();

    let claims: AccessTokenClaims;
    try {
      claims = await this.tokens.verify(match[1]);
    } catch {
      throw new UnauthorizedException();
    }

    const session = await this.prisma.refreshSession.findFirst({
      where: {
        id: claims.sid,
        userId: claims.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { status: "ACTIVE", emailVerifiedAt: { not: null } },
      },
      select: { id: true },
    });
    if (!session) throw new UnauthorizedException();
    request.auth = claims;
    return true;
  }
}
