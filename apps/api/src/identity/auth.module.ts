import { Module } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { PrismaModule } from "../database/prisma.module";
import { AccessTokenService } from "./access-token.service";
import { AccessTokenGuard } from "./access-token.guard";
import { AuthController } from "./auth.controller";
import { AuthRateLimiter } from "./auth-rate-limiter";
import { AuthService } from "./auth.service";
import { DevelopmentEmailDelivery, EMAIL_DELIVERY } from "./email-delivery";
import { PasswordHasher } from "./password-hasher";

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    PasswordHasher,
    AuthRateLimiter,
    {
      provide: AccessTokenService,
      useFactory: (jwt: JwtService) => {
        const secret = process.env.JWT_ACCESS_SECRET;
        if (!secret) throw new Error("JWT_ACCESS_SECRET must be configured");
        return new AccessTokenService(jwt, secret);
      },
      inject: [JwtService],
    },
    {
      provide: EMAIL_DELIVERY,
      useFactory: () => {
        if (process.env.NODE_ENV === "production") {
          throw new Error(
            "A production email delivery provider must be configured",
          );
        }
        return new DevelopmentEmailDelivery();
      },
    },
    AuthService,
    AccessTokenGuard,
  ],
  exports: [AuthService, AccessTokenGuard],
})
export class AuthModule {}
