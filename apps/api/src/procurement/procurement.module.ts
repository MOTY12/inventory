import { Module } from "@nestjs/common";
import { AuthModule } from "../identity/auth.module";
import { OrganizationContextGuard } from "../organizations/organization-context.guard";
import { RoleCapabilityGuard } from "../organizations/access-policy";
import { SuppliersController } from "./suppliers.controller";
import { SuppliersService } from "./suppliers.service";

@Module({
  imports: [AuthModule],
  controllers: [SuppliersController],
  providers: [SuppliersService, OrganizationContextGuard, RoleCapabilityGuard],
})
export class ProcurementModule {}
