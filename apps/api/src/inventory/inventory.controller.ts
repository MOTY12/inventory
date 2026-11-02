import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AccessTokenGuard } from "../identity/access-token.guard";
import {
  RequireCapabilities,
  RoleCapabilityGuard,
  WarehouseScopeGuard,
} from "../organizations/access-policy";
import {
  OrganizationContextGuard,
  OrganizationRequest,
} from "../organizations/organization-context.guard";
import { PaginationQueryDto } from "../common/pagination-query.dto";
import { InventoryReadService } from "./inventory-read.service";

@ApiTags("inventory")
@ApiBearerAuth()
@Controller("inventory/warehouses/:warehouseId")
@UseGuards(
  AccessTokenGuard,
  OrganizationContextGuard,
  RoleCapabilityGuard,
  WarehouseScopeGuard,
)
export class InventoryController {
  constructor(private readonly inventory: InventoryReadService) {}

  @Get("balances")
  @RequireCapabilities("inventory:read")
  @ApiOperation({ summary: "List balances for a warehouse" })
  balances(
    @Param("warehouseId", new ParseUUIDPipe()) warehouseId: string,
    @Query() query: PaginationQueryDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.inventory.listBalances(
      request.organization!,
      warehouseId,
      query,
    );
  }

  @Get("reconciliation")
  @RequireCapabilities("inventory:read")
  @ApiOperation({
    summary: "Compare warehouse balance projections with movement totals",
  })
  reconcile(
    @Param("warehouseId", new ParseUUIDPipe()) warehouseId: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.inventory.reconcile(request.organization!, warehouseId);
  }
}
