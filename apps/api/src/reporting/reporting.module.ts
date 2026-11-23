import { Module } from "@nestjs/common";
import { AuthModule } from "../identity/auth.module";
import { InventoryModule } from "../inventory/inventory.module";
import { OrganizationContextGuard } from "../organizations/organization-context.guard";
import { RoleCapabilityGuard } from "../organizations/access-policy";
import { ReportingController } from "./reporting.controller";
import { ReportingService } from "./reporting.service";

@Module({
  imports: [AuthModule, InventoryModule],
  controllers: [ReportingController],
  providers: [ReportingService, OrganizationContextGuard, RoleCapabilityGuard],
})
export class ReportingModule {}
