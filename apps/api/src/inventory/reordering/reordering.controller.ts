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
import { AccessTokenGuard } from "../../identity/access-token.guard";
import {
  OrganizationContextGuard,
  OrganizationRequest,
} from "../../organizations/organization-context.guard";
import {
  RequireCapabilities,
  RoleCapabilityGuard,
} from "../../organizations/access-policy";
import {
  CreateReorderRuleDto,
  LowStockListQueryDto,
  ReorderRuleListQueryDto,
  UpdateReorderRuleDto,
} from "./reordering.dto";
import { ReorderingService } from "./reordering.service";

@ApiTags("inventory reordering")
@ApiBearerAuth()
@Controller("organizations/current/inventory")
@UseGuards(AccessTokenGuard, OrganizationContextGuard, RoleCapabilityGuard)
export class ReorderingController {
  constructor(private readonly reordering: ReorderingService) {}

  @Get("reorder-rules")
  @RequireCapabilities("inventory:read")
  @ApiOperation({ summary: "List warehouse-scoped reorder rules" })
  rules(
    @Query() query: ReorderRuleListQueryDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.reordering.listRules(request.organization!, query);
  }

  @Post("reorder-rules")
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities("inventory:write")
  @ApiOperation({ summary: "Create a per-product, per-warehouse reorder rule" })
  createRule(
    @Body() body: CreateReorderRuleDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.reordering.create(
      request.organization!,
      request.auth!.sub,
      body,
    );
  }

  @Patch("reorder-rules/:ruleId")
  @RequireCapabilities("inventory:write")
  updateRule(
    @Param("ruleId", ParseUUIDPipe) ruleId: string,
    @Body() body: UpdateReorderRuleDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.reordering.update(
      request.organization!,
      request.auth!.sub,
      ruleId,
      body,
    );
  }

  @Get("reorder-rules/:ruleId/history")
  @RequireCapabilities("inventory:read")
  ruleHistory(
    @Param("ruleId", ParseUUIDPipe) ruleId: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.reordering.history(request.organization!, ruleId);
  }

  @Post("reorder-rules/evaluate")
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities("inventory:write")
  @ApiOperation({
    summary: "Evaluate this user's accessible reorder rules now",
  })
  evaluate(@Req() request: OrganizationRequest) {
    return this.reordering.evaluateOrganization(request.organization!);
  }

  @Get("low-stock")
  @RequireCapabilities("inventory:read")
  @ApiOperation({ summary: "List open or resolved low-stock alerts" })
  lowStock(
    @Query() query: LowStockListQueryDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.reordering.listAlerts(request.organization!, query);
  }
}
