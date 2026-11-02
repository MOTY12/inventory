import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Param,
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
  CatalogListQueryDto,
  CreateCategoryDto,
  CreateProductConversionDto,
  CreateProductDto,
  CreateUnitDto,
} from "./catalog.dto";
import { CatalogService } from "./catalog.service";

@ApiTags("catalog setup")
@ApiBearerAuth()
@Controller("organizations/current/catalog")
@UseGuards(AccessTokenGuard, OrganizationContextGuard, RoleCapabilityGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("products")
  @RequireCapabilities("catalog:read")
  @ApiOperation({ summary: "List products in the active organization" })
  listProducts(
    @Query() query: CatalogListQueryDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.catalog.listProducts(request.organization!, query);
  }

  @Post("products")
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities("catalog:write")
  @ApiOperation({ summary: "Create a product in the active organization" })
  createProduct(
    @Body() input: CreateProductDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.catalog.createProduct(
      request.organization!,
      request.auth!.sub,
      input,
    );
  }

  @Post("products/:productId/unit-conversions")
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities("catalog:write")
  @ApiOperation({ summary: "Add a product-specific unit conversion" })
  addProductConversion(
    @Param("productId") productId: string,
    @Body() input: CreateProductConversionDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.catalog.addProductConversion(
      request.organization!,
      request.auth!.sub,
      productId,
      input,
    );
  }

  @Get("categories")
  @RequireCapabilities("catalog:read")
  @ApiOperation({ summary: "List categories in the active organization" })
  listCategories(
    @Query() query: CatalogListQueryDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.catalog.listCategories(request.organization!, query);
  }

  @Post("categories")
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities("catalog:write")
  @ApiOperation({ summary: "Create a category in the active organization" })
  createCategory(
    @Body() input: CreateCategoryDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.catalog.createCategory(
      request.organization!,
      request.auth!.sub,
      input,
    );
  }

  @Get("units")
  @RequireCapabilities("catalog:read")
  @ApiOperation({ summary: "List units in the active organization" })
  listUnits(
    @Query() query: CatalogListQueryDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.catalog.listUnits(request.organization!, query);
  }

  @Post("units")
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities("catalog:write")
  @ApiOperation({ summary: "Create a unit in the active organization" })
  createUnit(
    @Body() input: CreateUnitDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.catalog.createUnit(
      request.organization!,
      request.auth!.sub,
      input,
    );
  }
}
