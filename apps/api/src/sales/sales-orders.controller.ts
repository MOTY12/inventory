import {
  Body,
  Controller,
  Get,
  Headers,
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
  CreateSalesFulfillmentDto,
  CreateSalesOrderDto,
  SalesOrderListQueryDto,
  UpdateSalesOrderDto,
} from "./sales-orders.dto";
import { SalesOrdersService } from "./sales-orders.service";

@ApiTags("sales-orders")
@ApiBearerAuth()
@Controller("organizations/current/sales/orders")
@UseGuards(AccessTokenGuard, OrganizationContextGuard, RoleCapabilityGuard)
export class SalesOrdersController {
  constructor(private readonly orders: SalesOrdersService) {}

  @Get()
  @RequireCapabilities("sales:read")
  list(
    @Query() query: SalesOrderListQueryDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.orders.list(request.organization!, query);
  }

  @Post()
  @RequireCapabilities("sales:write")
  create(
    @Body() body: CreateSalesOrderDto,
    @Headers("idempotency-key") key: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.orders.create(
      request.organization!,
      request.auth!.sub,
      body,
      key,
    );
  }

  @Get(":salesOrderId")
  @RequireCapabilities("sales:read")
  get(
    @Param("salesOrderId", ParseUUIDPipe) id: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.orders.get(request.organization!, id);
  }

  @Get(":salesOrderId/audit")
  @RequireCapabilities("sales:read")
  audit(
    @Param("salesOrderId", ParseUUIDPipe) id: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.orders.auditHistory(request.organization!, id);
  }

  @Get(":salesOrderId/fulfillments")
  @RequireCapabilities("sales:read")
  fulfillments(
    @Param("salesOrderId", ParseUUIDPipe) id: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.orders.fulfillments(request.organization!, id);
  }

  @Patch(":salesOrderId")
  @RequireCapabilities("sales:write")
  update(
    @Param("salesOrderId", ParseUUIDPipe) id: string,
    @Body() body: UpdateSalesOrderDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.orders.update(
      request.organization!,
      request.auth!.sub,
      id,
      body,
    );
  }

  @Post(":salesOrderId/confirm")
  @RequireCapabilities("sales:write")
  confirm(
    @Param("salesOrderId", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") key: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.orders.confirm(
      request.organization!,
      request.auth!.sub,
      id,
      key,
    );
  }

  @Post(":salesOrderId/fulfillments")
  @RequireCapabilities("sales:write")
  fulfill(
    @Param("salesOrderId", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") key: string,
    @Body() body: CreateSalesFulfillmentDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.orders.fulfill(
      request.organization!,
      request.auth!.sub,
      id,
      key,
      body,
    );
  }

  @Post(":salesOrderId/cancel")
  @RequireCapabilities("sales:write")
  cancel(
    @Param("salesOrderId", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") key: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.orders.cancel(
      request.organization!,
      request.auth!.sub,
      id,
      key,
    );
  }
}
