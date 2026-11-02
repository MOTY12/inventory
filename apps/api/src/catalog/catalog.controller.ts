import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  ParseUUIDPipe,
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
  UpdateProductDto,
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

  @Get("products/:productId")
  @RequireCapabilities("catalog:read")
  @ApiOperation({ summary: "Get product details and unit conversions" })
  getProduct(
    @Param("productId", new ParseUUIDPipe()) productId: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.catalog.getProduct(request.organization!, productId);
  }

  @Patch("products/:productId")
  @RequireCapabilities("catalog:write")
  @ApiOperation({ summary: "Update a product in the active organization" })
  updateProduct(
    @Param("productId", new ParseUUIDPipe()) productId: string,
    @Body() input: UpdateProductDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.catalog.updateProduct(
      request.organization!,
      request.auth!.sub,
      productId,
      input,
    );
  }

  @Patch("products/:productId/archive")
  @RequireCapabilities("catalog:write")
  @ApiOperation({ summary: "Archive a product in the active organization" })
  archiveProduct(
    @Param("productId", new ParseUUIDPipe()) productId: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.catalog.archiveProduct(
      request.organization!,
      request.auth!.sub,
      productId,
    );
  }

  @Get("products/:productId/unit-conversions")
  @RequireCapabilities("catalog:read")
  @ApiOperation({ summary: "List unit conversions for a product" })
  listProductConversions(
    @Param("productId", new ParseUUIDPipe()) productId: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.catalog.listProductConversions(
      request.organization!,
      productId,
    );
  }

  @Post("products/:productId/unit-conversions")
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities("catalog:write")
  @ApiOperation({ summary: "Add a product-specific unit conversion" })
  addProductConversion(
    @Param("productId", new ParseUUIDPipe()) productId: string,
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
