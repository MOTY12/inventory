import { Module } from "@nestjs/common";
import { AuthModule } from "../identity/auth.module";
import { OrganizationContextGuard } from "../organizations/organization-context.guard";
import {
  BranchManagementScopeGuard,
  RoleCapabilityGuard,
  WarehouseManagementScopeGuard,
  WarehouseScopeGuard,
} from "../organizations/access-policy";
import { LocationsController } from "./locations.controller";
import { LocationsService } from "./locations.service";

@Module({
  imports: [AuthModule],
  controllers: [LocationsController],
  providers: [
    LocationsService,
    OrganizationContextGuard,
    RoleCapabilityGuard,
    WarehouseScopeGuard,
    WarehouseManagementScopeGuard,
    BranchManagementScopeGuard,
  ],
})
export class LocationsModule {}
