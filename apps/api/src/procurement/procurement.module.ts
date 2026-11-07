import { Module } from "@nestjs/common";
import { AuthModule } from "../identity/auth.module";
import { OrganizationContextGuard } from "../organizations/organization-context.guard";
import { RoleCapabilityGuard } from "../organizations/access-policy";
import { InventoryModule } from "../inventory/inventory.module";
import { PurchaseOrdersController } from "./purchase-orders.controller";
import { PurchaseOrdersService } from "./purchase-orders.service";
import { SuppliersController } from "./suppliers.controller";
import { SuppliersService } from "./suppliers.service";

@Module({
  imports: [AuthModule, InventoryModule],
  controllers: [SuppliersController, PurchaseOrdersController],
  providers: [
    SuppliersService,
    PurchaseOrdersService,
    OrganizationContextGuard,
    RoleCapabilityGuard,
  ],
})
export class ProcurementModule {}
