import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";
import {
  CustomerPaymentMethod,
  InvoiceDocumentStatus,
} from "../generated/prisma/enums";
import { PaginationQueryDto } from "../common/pagination-query.dto";

const amountPattern = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/;
const ratePattern = /^(?:0|[1-9]\d{0,2})(?:\.\d{1,6})?$/;

export class InvoiceLineInputDto {
  @IsUUID() salesOrderLineId!: string;
  @IsOptional() @IsString() @Matches(amountPattern) discountAmount?: string;
  @IsOptional() @IsUUID() taxRateId?: string;
}

export class CreateInvoiceDto {
  @IsUUID() salesOrderId!: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineInputDto)
  lines!: InvoiceLineInputDto[];
}

export class UpdateInvoiceDto extends CreateInvoiceDto {}

export class InvoiceListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(InvoiceDocumentStatus) status?: InvoiceDocumentStatus;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

export class PaymentListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsEnum(CustomerPaymentMethod) method?: CustomerPaymentMethod;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class CreateTaxRateDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() @Matches(/^[A-Z0-9_-]{2,40}$/) code!: string;
  @IsString() @Matches(ratePattern) rate!: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
}

export class UpdateTaxRateDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @Matches(/^[A-Z0-9_-]{2,40}$/) code?: string;
  @IsOptional() @IsString() @Matches(ratePattern) rate?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class RecordPaymentDto {
  @IsUUID() invoiceId!: string;
  @IsString() @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/) amount!: string;
  @IsEnum(CustomerPaymentMethod) method!: CustomerPaymentMethod;
  @IsOptional() @IsString() @MaxLength(100) paymentReference?: string;
  @IsDateString() paymentDate!: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class VoidInvoiceDto {
  @IsString() @MaxLength(500) reason!: string;
}

export class ReversePaymentDto {
  @IsString() @MaxLength(500) reason!: string;
}
