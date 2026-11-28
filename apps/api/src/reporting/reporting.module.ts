import { Module } from "@nestjs/common";
import { AuthModule } from "../identity/auth.module";
import { InventoryModule } from "../inventory/inventory.module";
import { OrganizationContextGuard } from "../organizations/organization-context.guard";
import { RoleCapabilityGuard } from "../organizations/access-policy";
import { ReportingController } from "./reporting.controller";
import { ReportingService } from "./reporting.service";
import { ReportExportStorage } from "./report-export-storage";
import { ReportExportProcessor } from "./report-export.processor";
import { ReportExportsService } from "./report-exports.service";

@Module({
  imports: [AuthModule, InventoryModule],
  controllers: [ReportingController],
  providers: [
    ReportingService,
    ReportExportStorage,
    ReportExportProcessor,
    ReportExportsService,
    OrganizationContextGuard,
    RoleCapabilityGuard,
  ],
})
export class ReportingModule {}
