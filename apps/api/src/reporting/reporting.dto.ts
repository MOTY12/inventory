import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";
import { StockMovementType } from "../generated/prisma/enums";
import { PaginationQueryDto } from "../common/pagination-query.dto";

export class ReportFilterDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: "Limit report to a granted warehouse" })
  @IsOptional()
  @IsUUID()
  warehouse_id?: string;

  @IsOptional()
  @IsUUID()
  category_id?: string;

  @IsOptional()
  @IsUUID()
  product_id?: string;

  @ApiPropertyOptional({
    description: "Historical snapshot cutoff; omit for current projection",
  })
  @IsOptional()
  @IsDateString()
  as_of?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsEnum(StockMovementType)
  movement_type?: StockMovementType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
