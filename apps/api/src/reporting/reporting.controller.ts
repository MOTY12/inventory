import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
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
import { ReportFilterDto } from "./reporting.dto";
import { ReportingService } from "./reporting.service";

@ApiTags("reports")
@ApiBearerAuth()
@Controller("organizations/current/reports")
@UseGuards(AccessTokenGuard, OrganizationContextGuard, RoleCapabilityGuard)
@RequireCapabilities("reports:read")
export class ReportingController {
  constructor(private readonly reports: ReportingService) {}

  @Get("inventory-summary")
  @ApiOperation({ summary: "Inventory quantities and valuation summary" })
  inventorySummary(
    @Query() query: ReportFilterDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.reports.inventorySummary(request.organization!, query);
  }

  @Get("valuation")
  @ApiOperation({ summary: "Weighted-average inventory valuation by cutoff" })
  valuation(
    @Query() query: ReportFilterDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.reports.valuation(request.organization!, query);
  }

  @Get("movements")
  @ApiOperation({ summary: "Search the immutable stock movement ledger" })
  movements(
    @Query() query: ReportFilterDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.reports.movements(request.organization!, query);
  }

  @Get("low-stock")
  @ApiOperation({ summary: "Low-stock alerts from configured reorder rules" })
  lowStock(
    @Query() query: ReportFilterDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.reports.lowStock(request.organization!, query);
  }
}
