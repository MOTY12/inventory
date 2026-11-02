import { Module } from "@nestjs/common";
import { AuthModule } from "../identity/auth.module";
import { OrganizationContextGuard } from "../organizations/organization-context.guard";
import { RoleCapabilityGuard } from "../organizations/access-policy";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";

@Module({
  imports: [AuthModule],
  controllers: [CatalogController],
  providers: [CatalogService, OrganizationContextGuard, RoleCapabilityGuard],
})
export class CatalogModule {}
