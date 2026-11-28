import {
  Body,
  Controller,
  Get,
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
  BranchManagementScopeGuard,
  RequireCapabilities,
  RoleCapabilityGuard,
  WarehouseManagementScopeGuard,
  WarehouseScopeGuard,
} from "../organizations/access-policy";
import {
  BranchListQueryDto,
  CreateBranchDto,
  CreateWarehouseDto,
  UpdateBranchDto,
  UpdateWarehouseDto,
  WarehouseListQueryDto,
} from "./location.dto";
import { LocationsService } from "./locations.service";

@ApiTags("locations")
@ApiBearerAuth()
@Controller("organizations/current")
@UseGuards(AccessTokenGuard, OrganizationContextGuard, RoleCapabilityGuard)
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get("branches")
  @RequireCapabilities("warehouses:read")
  @ApiOperation({ summary: "List branches visible to the active member" })
  listBranches(
    @Query() query: BranchListQueryDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.locations.listBranches(request.organization!, query);
  }

  @Post("branches")
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities("warehouses:manage")
  @ApiOperation({ summary: "Create a branch in the active organization" })
  createBranch(
    @Body() input: CreateBranchDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.locations.createBranch(
      request.organization!,
      request.auth!.sub,
      input,
    );
  }

  @Get("branches/:branchId")
  @RequireCapabilities("warehouses:read")
  @ApiOperation({ summary: "Get a branch and its visible warehouses" })
  getBranch(
    @Param("branchId", ParseUUIDPipe) branchId: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.locations.getBranch(request.organization!, branchId);
  }

  @Patch("branches/:branchId")
  @UseGuards(BranchManagementScopeGuard)
  @RequireCapabilities("warehouses:manage")
  @ApiOperation({ summary: "Update or archive a branch" })
  updateBranch(
    @Param("branchId", ParseUUIDPipe) branchId: string,
    @Body() input: UpdateBranchDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.locations.updateBranch(
      request.organization!,
      request.auth!.sub,
      branchId,
      input,
    );
  }

  @Get("warehouses")
  @RequireCapabilities("warehouses:read")
  @ApiOperation({ summary: "Search warehouses visible to the active member" })
  listWarehouses(
    @Query() query: WarehouseListQueryDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.locations.listWarehouses(request.organization!, query);
  }

  @Post("warehouses")
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities("warehouses:manage")
  @ApiOperation({ summary: "Create a warehouse in an active branch" })
  createWarehouse(
    @Body() input: CreateWarehouseDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.locations.createWarehouse(
      request.organization!,
      request.auth!.sub,
      input,
    );
  }

  @Get("warehouses/:warehouseId")
  @UseGuards(WarehouseScopeGuard)
  @RequireCapabilities("warehouses:read")
  @ApiOperation({ summary: "Get a warehouse after location-scope checks" })
  getWarehouse(
    @Param("warehouseId", ParseUUIDPipe) warehouseId: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.locations.getWarehouse(request.organization!, warehouseId);
  }

  @Patch("warehouses/:warehouseId")
  @UseGuards(WarehouseManagementScopeGuard)
  @RequireCapabilities("warehouses:manage")
  @ApiOperation({ summary: "Update or archive a warehouse" })
  updateWarehouse(
    @Param("warehouseId", ParseUUIDPipe) warehouseId: string,
    @Body() input: UpdateWarehouseDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.locations.updateWarehouse(
      request.organization!,
      request.auth!.sub,
      warehouseId,
      input,
    );
  }
}
