import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { StockTransferStatus } from "../generated/prisma/enums";
import { PaginationQueryDto } from "../common/pagination-query.dto";

export class TransferLineDto {
  @IsUUID() productId!: string;
  @IsString() @Length(1, 20) @Matches(/^\d+(\.\d{1,6})?$/) quantity!: string;
}
export class CreateTransferDto {
  @IsUUID() sourceWarehouseId!: string;
  @IsUUID() destinationWarehouseId!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  lines!: TransferLineDto[];
}
export class TransferQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(StockTransferStatus) status?: StockTransferStatus;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsUUID() warehouseId?: string;
}
export class ReceiveTransferLineDto {
  @IsUUID() transferLineId!: string;
  @IsString() @Length(1, 20) @Matches(/^\d+(\.\d{1,6})?$/) quantity!: string;
}
export class ReceiveTransferDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveTransferLineDto)
  lines!: ReceiveTransferLineDto[];
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
