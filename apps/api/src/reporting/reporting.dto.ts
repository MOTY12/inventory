import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
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
  branch_id?: string;

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

  @IsOptional()
  @IsUUID()
  customer_id?: string;

  @IsOptional()
  @IsUUID()
  supplier_id?: string;

  @IsOptional()
  @IsIn([
    "DRAFT",
    "CONFIRMED",
    "PARTIALLY_FULFILLED",
    "FULFILLED",
    "CANCELLED",
    "SUBMITTED",
    "PARTIALLY_RECEIVED",
    "RECEIVED",
    "ISSUED",
    "VOID",
  ])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsOptional()
  @IsIn(["day", "week", "month"])
  period?: "day" | "week" | "month";

  @IsOptional()
  @IsIn([
    "invoiced_value",
    "ordered_quantity",
    "fulfilled_quantity",
    "order_count",
    "name",
  ])
  sort_by?:
    | "invoiced_value"
    | "ordered_quantity"
    | "fulfilled_quantity"
    | "order_count"
    | "name";

  @IsOptional()
  @IsIn(["ordered_value", "received_value", "order_count", "name"])
  purchasing_sort_by?:
    "ordered_value" | "received_value" | "order_count" | "name";
}
