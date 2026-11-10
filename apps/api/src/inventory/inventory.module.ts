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
import { StockTransfersController } from "./transfers.controller";
import { StockTransfersService } from "./transfers.service";
import { ReorderingController } from "./reordering/reordering.controller";
import { ReorderingScheduler } from "./reordering/reordering.scheduler";
import { ReorderingService } from "./reordering/reordering.service";

@Module({
  imports: [AuthModule],
  controllers: [
    InventoryController,
    StockTransfersController,
    ReorderingController,
  ],
  providers: [
    InventoryReadService,
    InventoryPostingService,
    StockAdjustmentsService,
    StockTransfersService,
    ReorderingService,
    ReorderingScheduler,
    OrganizationContextGuard,
    RoleCapabilityGuard,
    WarehouseScopeGuard,
  ],
  exports: [InventoryPostingService],
})
export class InventoryModule {}
