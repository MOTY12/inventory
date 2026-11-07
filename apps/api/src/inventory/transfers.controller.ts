import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
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
  CreateTransferDto,
  ReceiveTransferDto,
  TransferQueryDto,
} from "./transfers.dto";
import { StockTransfersService } from "./transfers.service";

@ApiTags("inventory transfers")
@ApiBearerAuth()
@Controller("organizations/current/inventory/transfers")
@UseGuards(AccessTokenGuard, OrganizationContextGuard, RoleCapabilityGuard)
export class StockTransfersController {
  constructor(private readonly transfers: StockTransfersService) {}
  @Get() @RequireCapabilities("inventory:read") list(
    @Query() q: TransferQueryDto,
    @Req() r: OrganizationRequest,
  ) {
    return this.transfers.list(r.organization!, q);
  }
  @Post() @RequireCapabilities("inventory:write") create(
    @Body() b: CreateTransferDto,
    @Req() r: OrganizationRequest,
  ) {
    return this.transfers.create(r.organization!, r.auth!.sub, b);
  }
  @Get(":id") @RequireCapabilities("inventory:read") get(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() r: OrganizationRequest,
  ) {
    return this.transfers.get(r.organization!, id);
  }
  @Post(":id/submit") @RequireCapabilities("inventory:write") submit(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() r: OrganizationRequest,
  ) {
    return this.transfers.submit(r.organization!, r.auth!.sub, id);
  }
  @Post(":id/cancel") @RequireCapabilities("inventory:write") cancel(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() r: OrganizationRequest,
  ) {
    return this.transfers.cancel(r.organization!, r.auth!.sub, id);
  }
  @Post(":id/dispatch") @RequireCapabilities("inventory:write") dispatch(
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") key: string,
    @Req() r: OrganizationRequest,
  ) {
    return this.transfers.dispatch(r.organization!, r.auth!.sub, id, key);
  }
  @Post(":id/receipts") @RequireCapabilities("inventory:write") receive(
    @Param("id", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") key: string,
    @Body() b: ReceiveTransferDto,
    @Req() r: OrganizationRequest,
  ) {
    return this.transfers.receive(r.organization!, r.auth!.sub, id, key, b);
  }
}
