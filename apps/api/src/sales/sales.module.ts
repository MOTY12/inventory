import { Module } from "@nestjs/common";
import { AuthModule } from "../identity/auth.module";
import { OrganizationContextGuard } from "../organizations/organization-context.guard";
import { RoleCapabilityGuard } from "../organizations/access-policy";
import { InventoryModule } from "../inventory/inventory.module";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";
import { SalesOrdersController } from "./sales-orders.controller";
import { SalesOrdersService } from "./sales-orders.service";

@Module({
  imports: [AuthModule, InventoryModule],
  controllers: [CustomersController, SalesOrdersController],
  providers: [
    CustomersService,
    SalesOrdersService,
    OrganizationContextGuard,
    RoleCapabilityGuard,
  ],
})
export class SalesModule {}
