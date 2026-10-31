import { JwtService } from "@nestjs/jwt";

export interface AccessTokenClaims {
  sub: string;
  sid: string;
  organizationId?: string;
}

const TOKEN_ISSUER = "inventory-saas";
const TOKEN_AUDIENCE = "inventory-web";
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export class AccessTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly signingSecret: string,
  ) {
    if (Buffer.byteLength(signingSecret, "utf8") < 32) {
      throw new Error("JWT access signing secret must be at least 32 bytes");
    }
  }

  async issue(
    claims: AccessTokenClaims,
  ): Promise<{ token: string; expiresIn: number }> {
    const token = await this.jwtService.signAsync(
      {
        sid: claims.sid,
        ...(claims.organizationId ? { org: claims.organizationId } : {}),
      },
      {
        secret: this.signingSecret,
        algorithm: "HS256",
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
        subject: claims.sub,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    );

    return { token, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }

  verify(token: string): Promise<AccessTokenClaims> {
    return this.jwtService
      .verifyAsync<AccessTokenClaims & { org?: string }>(token, {
        secret: this.signingSecret,
        algorithms: ["HS256"],
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
      })
      .then(({ sub, sid, org }) => {
        if (!sub || !sid) throw new Error("Invalid access token claims");
        return { sub, sid, ...(org ? { organizationId: org } : {}) };
      });
  }
}
