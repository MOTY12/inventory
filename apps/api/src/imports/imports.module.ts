import { Module } from "@nestjs/common";
import { AuthModule } from "../identity/auth.module";
import { CatalogModule } from "../catalog/catalog.module";
import { InventoryModule } from "../inventory/inventory.module";
import { OrganizationContextGuard } from "../organizations/organization-context.guard";
import { RoleCapabilityGuard } from "../organizations/access-policy";
import { ImportsController } from "./imports.controller";
import { ImportsService } from "./imports.service";

@Module({
  imports: [AuthModule, CatalogModule, InventoryModule],
  controllers: [ImportsController],
  providers: [ImportsService, OrganizationContextGuard, RoleCapabilityGuard],
})
export class ImportsModule {}
