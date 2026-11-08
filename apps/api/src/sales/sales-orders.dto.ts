import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { SalesOrderStatus } from "../generated/prisma/enums";
import { PaginationQueryDto } from "../common/pagination-query.dto";

export class SalesOrderLineInputDto {
  @IsUUID() productId!: string;
  @IsOptional() @IsUUID() unitId?: string;
  @IsString() @Matches(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/) quantity!: string;
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/)
  unitPrice!: string;
}

export class CreateSalesOrderDto {
  @IsUUID() customerId!: string;
  @IsUUID() warehouseId!: string;
  @IsString() @Matches(/^[A-Z]{3}$/) currency!: string;
  @IsOptional() @IsDateString() orderDate?: string;
  @IsOptional() @IsDateString() expectedFulfillmentAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesOrderLineInputDto)
  lines!: SalesOrderLineInputDto[];
}

export class UpdateSalesOrderDto extends CreateSalesOrderDto {}

export class SalesOrderListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(SalesOrderStatus) status?: SalesOrderStatus;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

export class SalesFulfillmentLineInputDto {
  @IsUUID() salesOrderLineId!: string;
  @IsString() @Matches(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/) quantity!: string;
}

export class CreateSalesFulfillmentDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesFulfillmentLineInputDto)
  lines!: SalesFulfillmentLineInputDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
