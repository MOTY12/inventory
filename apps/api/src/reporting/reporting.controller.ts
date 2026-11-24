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
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { pipeline } from "node:stream/promises";
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
import { ReportExportsService } from "./report-exports.service";
import { CreateReportExportDto } from "./report-exports.dto";
import { PaginationQueryDto } from "../common/pagination-query.dto";

@ApiTags("reports")
@ApiBearerAuth()
@Controller("organizations/current/reports")
@UseGuards(AccessTokenGuard, OrganizationContextGuard, RoleCapabilityGuard)
@RequireCapabilities("reports:read")
export class ReportingController {
  constructor(
    private readonly reports: ReportingService,
    private readonly exports: ReportExportsService,
  ) {}

  @Post("exports")
  @ApiOperation({ summary: "Queue a private asynchronous CSV report export" })
  createExport(
    @Body() body: CreateReportExportDto,
    @Headers("idempotency-key") key: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.exports.create(request.organization!, body, key);
  }

  @Get("exports")
  @ApiOperation({ summary: "List exports in the active organization" })
  listExports(
    @Query() query: PaginationQueryDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.exports.list(
      request.organization!,
      query.page,
      query.page_size,
    );
  }

  @Post("exports/:exportId/retry")
  retryExport(
    @Param("exportId", ParseUUIDPipe) id: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.exports.retry(request.organization!, id);
  }

  @Get("exports/:exportId/download")
  async downloadExport(
    @Param("exportId", ParseUUIDPipe) id: string,
    @Req() request: OrganizationRequest,
    @Res() response: Response,
  ) {
    const { file, filename } = await this.exports.download(
      request.organization!,
      id,
    );
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    response.setHeader("Cache-Control", "private, no-store");
    if (file.contentLength !== undefined)
      response.setHeader("Content-Length", file.contentLength);
    await pipeline(file.body, response);
  }

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

  @Get("sales/summary")
  @RequireCapabilities("reports:read", "finance:read")
  @ApiOperation({
    summary: "Sales order, issued invoice, collections and receivables summary",
  })
  salesSummary(
    @Query() query: ReportFilterDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.reports.salesOverview(request.organization!, query);
  }

  @Get("purchases/summary")
  @RequireCapabilities("reports:read", "finance:read")
  @ApiOperation({ summary: "Purchase order and goods received summary" })
  purchasesSummary(
    @Query() query: ReportFilterDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.reports.purchasingOverview(request.organization!, query);
  }

  @Get("sales/products")
  @RequireCapabilities("reports:read", "finance:read")
  @ApiOperation({
    summary: "Unit- and currency-separated product sales performance",
  })
  salesProducts(
    @Query() query: ReportFilterDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.reports.salesProductPerformance(request.organization!, query);
  }

  @Get("sales/customers")
  @RequireCapabilities("reports:read", "finance:read")
  @ApiOperation({
    summary: "Customer sales and current receivables performance",
  })
  salesCustomers(
    @Query() query: ReportFilterDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.reports.customerPerformance(request.organization!, query);
  }

  @Get("purchases/suppliers")
  @RequireCapabilities("reports:read", "finance:read")
  @ApiOperation({
    summary: "Supplier purchase order and received value performance",
  })
  purchaseSuppliers(
    @Query() query: ReportFilterDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.reports.supplierPerformance(request.organization!, query);
  }

  @Get("purchases/products")
  @RequireCapabilities("reports:read", "finance:read")
  @ApiOperation({
    summary: "Unit- and currency-separated product purchasing performance",
  })
  purchaseProducts(
    @Query() query: ReportFilterDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.reports.purchaseProductPerformance(
      request.organization!,
      query,
    );
  }

  @Get("sales/trends")
  @RequireCapabilities("reports:read", "finance:read")
  @ApiOperation({
    summary: "Daily, weekly or monthly sales and collection trends",
  })
  salesTrends(
    @Query() query: ReportFilterDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.reports.salesTrends(request.organization!, query);
  }

  @Get("purchases/trends")
  @RequireCapabilities("reports:read", "finance:read")
  @ApiOperation({
    summary: "Daily, weekly or monthly purchasing and receipt trends",
  })
  purchasesTrends(
    @Query() query: ReportFilterDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.reports.purchasingTrends(request.organization!, query);
  }

  @Get("receivables/aging")
  @RequireCapabilities("reports:read", "finance:read")
  @ApiOperation({ summary: "Current-state receivables aging by currency" })
  receivablesAging(
    @Query() query: ReportFilterDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.reports.receivablesAging(request.organization!, query);
  }
}
