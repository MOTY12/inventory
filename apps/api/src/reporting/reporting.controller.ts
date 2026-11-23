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
}
