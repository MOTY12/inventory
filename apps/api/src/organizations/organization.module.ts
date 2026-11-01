import { Module } from "@nestjs/common";
import { AuthModule } from "../identity/auth.module";
import { PrismaModule } from "../database/prisma.module";
import { OrganizationContextGuard } from "./organization-context.guard";
import { RoleCapabilityGuard, WarehouseScopeGuard } from "./access-policy";
import { OrganizationController } from "./organization.controller";
import { OrganizationService } from "./organization.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [OrganizationController],
  providers: [
    OrganizationService,
    OrganizationContextGuard,
    RoleCapabilityGuard,
    WarehouseScopeGuard,
  ],
})
export class OrganizationModule {}
