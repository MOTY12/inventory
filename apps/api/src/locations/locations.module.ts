import { Module } from "@nestjs/common";
import { AuthModule } from "../identity/auth.module";
import { OrganizationContextGuard } from "../organizations/organization-context.guard";
import {
  RoleCapabilityGuard,
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
  ],
})
export class LocationsModule {}
