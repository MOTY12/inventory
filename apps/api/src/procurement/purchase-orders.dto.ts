import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { PurchaseOrderStatus } from "../generated/prisma/enums";
import { PaginationQueryDto } from "../common/pagination-query.dto";

export class PurchaseOrderLineInputDto {
  @IsUUID() productId!: string;
  @IsUUID() unitId!: string;
  @IsString() @Length(1, 20) @Matches(/^\d+(\.\d{1,6})?$/) quantity!: string;
  @IsString() @Length(1, 20) @Matches(/^\d+(\.\d{1,4})?$/) unitCost!: string;
}

export class CreatePurchaseOrderDto {
  @IsUUID() supplierId!: string;
  @IsUUID() warehouseId!: string;
  @IsString() @Matches(/^[A-Z]{3}$/) currency!: string;
  @IsOptional() @IsDateString() expectedDeliveryAt?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineInputDto)
  lines!: PurchaseOrderLineInputDto[];
}

export class UpdatePurchaseOrderDto extends CreatePurchaseOrderDto {}

export class PurchaseOrderListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(PurchaseOrderStatus) status?: PurchaseOrderStatus;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

export class ReceivePurchaseOrderLineDto {
  @IsUUID() purchaseOrderLineId!: string;
  @IsString() @Length(1, 20) @Matches(/^\d+(\.\d{1,6})?$/) quantity!: string;
}

export class CreateGoodsReceiptDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceivePurchaseOrderLineDto)
  lines!: ReceivePurchaseOrderLineDto[];
  @IsOptional() @IsDateString() receivedAt?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
