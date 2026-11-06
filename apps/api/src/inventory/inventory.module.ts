import { Module } from "@nestjs/common";
import { AuthModule } from "../identity/auth.module";
import { OrganizationContextGuard } from "../organizations/organization-context.guard";
import {
  RoleCapabilityGuard,
  WarehouseScopeGuard,
} from "../organizations/access-policy";
import { InventoryController } from "./inventory.controller";
import { InventoryReadService } from "./inventory-read.service";
import { InventoryPostingService } from "./inventory-posting.service";
import { StockAdjustmentsService } from "./adjustments.service";

@Module({
  imports: [AuthModule],
  controllers: [InventoryController],
  providers: [
    InventoryReadService,
    InventoryPostingService,
    StockAdjustmentsService,
    OrganizationContextGuard,
    RoleCapabilityGuard,
    WarehouseScopeGuard,
  ],
  exports: [InventoryPostingService],
})
export class InventoryModule {}
