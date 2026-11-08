import { Module } from "@nestjs/common";
import { AuthModule } from "../identity/auth.module";
import { OrganizationContextGuard } from "../organizations/organization-context.guard";
import { RoleCapabilityGuard } from "../organizations/access-policy";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";

@Module({
  imports: [AuthModule],
  controllers: [CustomersController],
  providers: [CustomersService, OrganizationContextGuard, RoleCapabilityGuard],
})
export class SalesModule {}
