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
  RequireCapabilities,
  RoleCapabilityGuard,
} from "../organizations/access-policy";
import {
  CreateSupplierDto,
  SupplierListQueryDto,
  UpdateSupplierDto,
} from "./suppliers.dto";
import { SuppliersService } from "./suppliers.service";

@ApiTags("suppliers")
@ApiBearerAuth()
@Controller("organizations/current/procurement/suppliers")
@UseGuards(AccessTokenGuard, OrganizationContextGuard, RoleCapabilityGuard)
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @RequireCapabilities("procurement:read")
  @ApiOperation({ summary: "List suppliers in the active organization" })
  list(
    @Query() query: SupplierListQueryDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.suppliers.list(request.organization!, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities("procurement:write")
  @ApiOperation({ summary: "Create a supplier" })
  create(
    @Body() input: CreateSupplierDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.suppliers.create(
      request.organization!,
      request.auth!.sub,
      input,
    );
  }

  @Get(":supplierId")
  @RequireCapabilities("procurement:read")
  @ApiOperation({ summary: "Get supplier details" })
  get(
    @Param("supplierId", new ParseUUIDPipe()) supplierId: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.suppliers.get(request.organization!, supplierId);
  }

  @Get(":supplierId/audit")
  @RequireCapabilities("procurement:read")
  @ApiOperation({ summary: "List supplier audit history" })
  auditHistory(
    @Param("supplierId", new ParseUUIDPipe()) supplierId: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.suppliers.auditHistory(request.organization!, supplierId);
  }

  @Patch(":supplierId")
  @RequireCapabilities("procurement:write")
  @ApiOperation({ summary: "Edit supplier details" })
  update(
    @Param("supplierId", new ParseUUIDPipe()) supplierId: string,
    @Body() input: UpdateSupplierDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.suppliers.update(
      request.organization!,
      request.auth!.sub,
      supplierId,
      input,
    );
  }

  @Patch(":supplierId/archive")
  @RequireCapabilities("procurement:write")
  @ApiOperation({ summary: "Archive a supplier" })
  archive(
    @Param("supplierId", new ParseUUIDPipe()) supplierId: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.suppliers.archive(
      request.organization!,
      request.auth!.sub,
      supplierId,
    );
  }
}
