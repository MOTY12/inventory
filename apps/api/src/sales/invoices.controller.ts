import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { AccessTokenGuard } from "../identity/access-token.guard";
import {
  RequireCapabilities,
  RoleCapabilityGuard,
} from "../organizations/access-policy";
import {
  OrganizationContextGuard,
  OrganizationRequest,
} from "../organizations/organization-context.guard";
import {
  CreateInvoiceDto,
  CreateTaxRateDto,
  InvoiceListQueryDto,
  PaymentListQueryDto,
  RecordPaymentDto,
  ReversePaymentDto,
  UpdateInvoiceDto,
  UpdateTaxRateDto,
  VoidInvoiceDto,
} from "./invoices.dto";
import { InvoicesService } from "./invoices.service";

@ApiTags("invoices")
@ApiBearerAuth()
@Controller("organizations/current/sales/invoices")
@UseGuards(AccessTokenGuard, OrganizationContextGuard, RoleCapabilityGuard)
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get("eligible-orders")
  @RequireCapabilities("finance:read")
  eligibleOrders(@Req() request: OrganizationRequest) {
    return this.invoices.eligibleOrders(request.organization!);
  }

  @Get("summary")
  @RequireCapabilities("finance:read")
  summary(@Req() request: OrganizationRequest) {
    return this.invoices.summary(request.organization!);
  }

  @Get()
  @RequireCapabilities("finance:read")
  list(
    @Query() query: InvoiceListQueryDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.invoices.list(request.organization!, query);
  }

  @Post()
  @RequireCapabilities("finance:write")
  create(
    @Body() body: CreateInvoiceDto,
    @Headers("idempotency-key") key: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.invoices.create(
      request.organization!,
      request.auth!.sub,
      body,
      key,
    );
  }

  @Get(":invoiceId")
  @RequireCapabilities("finance:read")
  get(
    @Param("invoiceId", ParseUUIDPipe) id: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.invoices.get(request.organization!, id);
  }

  @Get(":invoiceId/audit")
  @RequireCapabilities("finance:read")
  audit(
    @Param("invoiceId", ParseUUIDPipe) id: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.invoices.invoiceAudit(request.organization!, id);
  }

  @Get(":invoiceId/pdf")
  @RequireCapabilities("finance:read")
  async pdf(
    @Param("invoiceId", ParseUUIDPipe) id: string,
    @Req() request: OrganizationRequest,
    @Res() response: Response,
  ) {
    const pdf = await this.invoices.pdf(request.organization!, id);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${pdf.filename}"`,
    );
    response.setHeader("Cache-Control", "private, no-store");
    response.end(pdf.content);
  }

  @Get(":invoiceId/payments")
  @RequireCapabilities("finance:read")
  payments(
    @Param("invoiceId", ParseUUIDPipe) id: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.invoices.invoicePayments(request.organization!, id);
  }

  @Patch(":invoiceId")
  @RequireCapabilities("finance:write")
  update(
    @Param("invoiceId", ParseUUIDPipe) id: string,
    @Body() body: UpdateInvoiceDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.invoices.updateDraft(
      request.organization!,
      request.auth!.sub,
      id,
      body,
    );
  }

  @Post(":invoiceId/issue")
  @RequireCapabilities("finance:write")
  issue(
    @Param("invoiceId", ParseUUIDPipe) id: string,
    @Headers("idempotency-key") key: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.invoices.issue(
      request.organization!,
      request.auth!.sub,
      id,
      key,
    );
  }

  @Post(":invoiceId/void")
  @RequireCapabilities("finance:write")
  void(
    @Param("invoiceId", ParseUUIDPipe) id: string,
    @Body() body: VoidInvoiceDto,
    @Headers("idempotency-key") key: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.invoices.void(
      request.organization!,
      request.auth!.sub,
      id,
      body.reason,
      key,
    );
  }
}

@ApiTags("customer-payments")
@ApiBearerAuth()
@Controller("organizations/current/sales/payments")
@UseGuards(AccessTokenGuard, OrganizationContextGuard, RoleCapabilityGuard)
export class CustomerPaymentsController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @RequireCapabilities("finance:read")
  list(
    @Query() query: PaymentListQueryDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.invoices.listPayments(request.organization!, query);
  }

  @Post()
  @RequireCapabilities("finance:write")
  record(
    @Body() body: RecordPaymentDto,
    @Headers("idempotency-key") key: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.invoices.recordPayment(
      request.organization!,
      request.auth!.sub,
      body,
      key,
    );
  }

  @Get(":paymentId")
  @RequireCapabilities("finance:read")
  get(
    @Param("paymentId", ParseUUIDPipe) id: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.invoices.getPayment(request.organization!, id);
  }

  @Post(":paymentId/reverse")
  @RequireCapabilities("finance:write")
  reverse(
    @Param("paymentId", ParseUUIDPipe) id: string,
    @Body() body: ReversePaymentDto,
    @Headers("idempotency-key") key: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.invoices.reversePayment(
      request.organization!,
      request.auth!.sub,
      id,
      body.reason,
      key,
    );
  }
}

@ApiTags("tax-rates")
@ApiBearerAuth()
@Controller("organizations/current/sales/tax-rates")
@UseGuards(AccessTokenGuard, OrganizationContextGuard, RoleCapabilityGuard)
export class TaxRatesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @RequireCapabilities("finance:read")
  list(@Req() request: OrganizationRequest) {
    return this.invoices.listTaxRates(request.organization!);
  }

  @Post()
  @RequireCapabilities("finance:write")
  create(@Body() body: CreateTaxRateDto, @Req() request: OrganizationRequest) {
    return this.invoices.createTaxRate(
      request.organization!,
      request.auth!.sub,
      body,
    );
  }

  @Patch(":taxRateId")
  @RequireCapabilities("finance:write")
  update(
    @Param("taxRateId", ParseUUIDPipe) id: string,
    @Body() body: UpdateTaxRateDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.invoices.updateTaxRate(
      request.organization!,
      request.auth!.sub,
      id,
      body,
    );
  }
}

@ApiTags("customer-financial-history")
@ApiBearerAuth()
@Controller("organizations/current/sales/customers/:customerId")
@UseGuards(AccessTokenGuard, OrganizationContextGuard, RoleCapabilityGuard)
export class CustomerFinancialController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get("invoices")
  @RequireCapabilities("finance:read")
  invoicesForCustomer(
    @Param("customerId", ParseUUIDPipe) id: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.invoices.listCustomerInvoices(request.organization!, id);
  }

  @Get("payments")
  @RequireCapabilities("finance:read")
  paymentsForCustomer(
    @Param("customerId", ParseUUIDPipe) id: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.invoices.listCustomerPayments(request.organization!, id);
  }

  @Get("financial-summary")
  @RequireCapabilities("finance:read")
  summary(
    @Param("customerId", ParseUUIDPipe) id: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.invoices.customerSummary(request.organization!, id);
  }
}
