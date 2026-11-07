import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AccessTokenGuard } from "../identity/access-token.guard";
import {
  OrganizationContextGuard,
  OrganizationRequest,
} from "../organizations/organization-context.guard";
import {
  RequireCapabilities,
  RoleCapabilityGuard,
} from "../organizations/access-policy";
import {
  CreateGoodsReceiptDto,
  CreatePurchaseOrderDto,
  PurchaseOrderListQueryDto,
  UpdatePurchaseOrderDto,
} from "./purchase-orders.dto";
import { PurchaseOrdersService } from "./purchase-orders.service";

@ApiTags("purchase orders")
@ApiBearerAuth()
@Controller("organizations/current/procurement/purchase-orders")
@UseGuards(AccessTokenGuard, OrganizationContextGuard, RoleCapabilityGuard)
export class PurchaseOrdersController {
  constructor(private readonly orders: PurchaseOrdersService) {}

  @Get()
  @RequireCapabilities("procurement:read")
  @ApiOperation({
    summary: "Search purchase orders in the active organization",
  })
  list(
    @Query() query: PurchaseOrderListQueryDto,
    @Req() req: OrganizationRequest,
  ) {
    return this.orders.list(req.organization!, req.auth!.sub, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities("procurement:write")
  @ApiOperation({ summary: "Create a purchase order draft" })
  create(
    @Body() input: CreatePurchaseOrderDto,
    @Req() req: OrganizationRequest,
  ) {
    return this.orders.create(req.organization!, req.auth!.sub, input);
  }

  @Get(":purchaseOrderId")
  @RequireCapabilities("procurement:read")
  get(
    @Param("purchaseOrderId", ParseUUIDPipe) id: string,
    @Req() req: OrganizationRequest,
  ) {
    return this.orders.get(req.organization!, req.auth!.sub, id);
  }

  @Patch(":purchaseOrderId")
  @RequireCapabilities("procurement:write")
  update(
    @Param("purchaseOrderId", ParseUUIDPipe) id: string,
    @Body() input: UpdatePurchaseOrderDto,
    @Req() req: OrganizationRequest,
  ) {
    return this.orders.update(req.organization!, req.auth!.sub, id, input);
  }

  @Post(":purchaseOrderId/submit")
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities("procurement:write")
  submit(
    @Param("purchaseOrderId", ParseUUIDPipe) id: string,
    @Req() req: OrganizationRequest,
  ) {
    return this.orders.submit(req.organization!, req.auth!.sub, id);
  }

  @Post(":purchaseOrderId/cancel")
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities("procurement:write")
  cancel(
    @Param("purchaseOrderId", ParseUUIDPipe) id: string,
    @Req() req: OrganizationRequest,
  ) {
    return this.orders.cancel(req.organization!, req.auth!.sub, id);
  }

  @Post(":purchaseOrderId/receipts")
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities("procurement:write")
  receive(
    @Param("purchaseOrderId", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") key: string,
    @Body() input: CreateGoodsReceiptDto,
    @Req() req: OrganizationRequest,
  ) {
    return this.orders.receive(
      req.organization!,
      req.auth!.sub,
      id,
      key,
      input,
    );
  }

  @Get(":purchaseOrderId/receipts")
  @RequireCapabilities("procurement:read")
  receipts(
    @Param("purchaseOrderId", ParseUUIDPipe) id: string,
    @Req() req: OrganizationRequest,
  ) {
    return this.orders.receipts(req.organization!, req.auth!.sub, id);
  }
}
