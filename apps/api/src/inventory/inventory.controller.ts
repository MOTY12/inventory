import {
  Controller,
  Body,
  Get,
  Post,
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
import { StockAdjustmentsService } from "./adjustments.service";
import { CreateStockAdjustmentDto } from "./adjustments.dto";

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
  constructor(
    private readonly inventory: InventoryReadService,
    private readonly adjustments: StockAdjustmentsService,
  ) {}

  @Get("adjustments")
  @RequireCapabilities("inventory:read")
  @ApiOperation({
    summary: "List stock counts and adjustments for a warehouse",
  })
  adjustmentsList(
    @Param("warehouseId", new ParseUUIDPipe()) warehouseId: string,
    @Query() query: PaginationQueryDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.adjustments.list(request.organization!, warehouseId, query);
  }

  @Post("adjustments")
  @RequireCapabilities("inventory:write")
  @ApiOperation({
    summary: "Create a physical stock count with a variance preview",
  })
  createAdjustment(
    @Param("warehouseId", new ParseUUIDPipe()) warehouseId: string,
    @Body() body: CreateStockAdjustmentDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.adjustments.create(
      request.organization!,
      request.auth!.sub,
      warehouseId,
      body,
    );
  }

  @Post("adjustments/:adjustmentId/post")
  @RequireCapabilities("inventory:write")
  @ApiOperation({
    summary: "Post a count variance to the immutable stock ledger",
  })
  postAdjustment(
    @Param("warehouseId", new ParseUUIDPipe()) warehouseId: string,
    @Param("adjustmentId", new ParseUUIDPipe()) adjustmentId: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.adjustments.post(
      request.organization!,
      request.auth!.sub,
      warehouseId,
      adjustmentId,
    );
  }

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
