import {
  Body,
  Controller,
  Get,
  Headers,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AccessTokenGuard } from "../identity/access-token.guard";
import {
  RequireCapabilities,
  RoleCapabilityGuard,
} from "../organizations/access-policy";
import {
  OrganizationContextGuard,
  OrganizationRequest,
} from "../organizations/organization-context.guard";
import { ImportsService } from "./imports.service";

type UploadedCsv = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
};

@ApiTags("imports")
@ApiBearerAuth()
@Controller("organizations/current/imports")
@UseGuards(AccessTokenGuard, OrganizationContextGuard, RoleCapabilityGuard)
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get("template")
  @RequireCapabilities("catalog:read")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header(
    "Content-Disposition",
    'attachment; filename="stockroom-import-template.csv"',
  )
  template(@Query("kind") kind: string) {
    if (kind !== "PRODUCTS" && kind !== "OPENING_BALANCES")
      return "Unknown template kind. Use PRODUCTS or OPENING_BALANCES.";
    return this.imports.template(kind);
  }

  @Get()
  @RequireCapabilities("catalog:read")
  @ApiOperation({ summary: "List recent organization import batches" })
  list(@Req() request: OrganizationRequest) {
    return this.imports.list(request.organization!);
  }

  @Get(":batchId")
  @RequireCapabilities("catalog:read")
  get(
    @Param("batchId", ParseUUIDPipe) id: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.imports.get(request.organization!, id);
  }

  @Get(":batchId/audit")
  @RequireCapabilities("catalog:read")
  audit(
    @Param("batchId", ParseUUIDPipe) id: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.imports.auditHistory(request.organization!, id);
  }

  @Post("products/preview")
  @RequireCapabilities("catalog:write")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiOperation({
    summary: "Validate and preview a product CSV without creating products",
  })
  previewProducts(
    @UploadedFile() file: UploadedCsv | undefined,
    @Body("mapping") mapping: string | undefined,
    @Req() request: OrganizationRequest,
  ) {
    return this.imports.preview(
      request.organization!,
      request.auth!.sub,
      "PRODUCTS",
      file,
      mapping,
    );
  }

  @Post("opening-balances/preview")
  @RequireCapabilities("inventory:write")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiOperation({
    summary: "Validate and preview opening inventory from a CSV",
  })
  previewOpeningBalances(
    @UploadedFile() file: UploadedCsv | undefined,
    @Body("mapping") mapping: string | undefined,
    @Req() request: OrganizationRequest,
  ) {
    return this.imports.preview(
      request.organization!,
      request.auth!.sub,
      "OPENING_BALANCES",
      file,
      mapping,
    );
  }

  @Post("products/:batchId/commit")
  @RequireCapabilities("catalog:write")
  @ApiOperation({ summary: "Atomically create products from a valid preview" })
  commitProducts(
    @Param("batchId", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") key: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.imports.commit(
      request.organization!,
      request.auth!.sub,
      id,
      key,
      "PRODUCTS",
    );
  }

  @Post("opening-balances/:batchId/commit")
  @RequireCapabilities("inventory:write")
  @ApiOperation({
    summary: "Atomically post opening stock through the inventory ledger",
  })
  commitOpeningBalances(
    @Param("batchId", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") key: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.imports.commit(
      request.organization!,
      request.auth!.sub,
      id,
      key,
      "OPENING_BALANCES",
    );
  }
}
