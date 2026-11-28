import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AccessTokenGuard } from "../identity/access-token.guard";
import {
  RequireCapabilities,
  RoleCapabilityGuard,
} from "../organizations/access-policy";
import {
  OrganizationContextGuard,
  OrganizationRequest,
} from "../organizations/organization-context.guard";
import {
  CreateCustomerDto,
  CustomerListQueryDto,
  UpdateCustomerDto,
} from "./customers.dto";
import { CustomersService } from "./customers.service";

@ApiTags("customers")
@ApiBearerAuth()
@Controller("organizations/current/sales/customers")
@UseGuards(AccessTokenGuard, OrganizationContextGuard, RoleCapabilityGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}
  @Get() @RequireCapabilities("sales:read") list(
    @Query() query: CustomerListQueryDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.customers.list(request.organization!, query);
  }
  @Post() @RequireCapabilities("sales:write") create(
    @Body() body: CreateCustomerDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.customers.create(
      request.organization!,
      request.auth!.sub,
      body,
    );
  }
  @Get(":customerId") @RequireCapabilities("sales:read") get(
    @Param("customerId", ParseUUIDPipe) id: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.customers.get(request.organization!, id);
  }
  @Get(":customerId/audit") @RequireCapabilities("sales:read") audit(
    @Param("customerId", ParseUUIDPipe) id: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.customers.auditHistory(request.organization!, id);
  }
  @Patch(":customerId") @RequireCapabilities("sales:write") update(
    @Param("customerId", ParseUUIDPipe) id: string,
    @Body() body: UpdateCustomerDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.customers.update(
      request.organization!,
      request.auth!.sub,
      id,
      body,
    );
  }
  @Patch(":customerId/archive") @RequireCapabilities("sales:write") archive(
    @Param("customerId", ParseUUIDPipe) id: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.customers.archive(request.organization!, request.auth!.sub, id);
  }
}
