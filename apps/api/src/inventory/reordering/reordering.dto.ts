import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from "class-validator";
import { ReorderRuleStatus } from "../../generated/prisma/enums";
import { PaginationQueryDto } from "../../common/pagination-query.dto";

const DECIMAL = /^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/;

export class CreateReorderRuleDto {
  @IsUUID() productId!: string;
  @IsUUID() warehouseId!: string;
  @IsString() @Matches(DECIMAL) minimumQuantity!: string;
  @IsString() @Matches(DECIMAL) targetQuantity!: string;
  @IsOptional() @IsEnum(ReorderRuleStatus) status?: ReorderRuleStatus;
}

export class UpdateReorderRuleDto {
  @IsOptional() @IsString() @Matches(DECIMAL) minimumQuantity?: string;
  @IsOptional() @IsString() @Matches(DECIMAL) targetQuantity?: string;
  @IsOptional() @IsEnum(ReorderRuleStatus) status?: ReorderRuleStatus;
}

export class ReorderRuleListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(ReorderRuleStatus) status?: ReorderRuleStatus;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

export class LowStockListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() @Matches(/^(OPEN|RESOLVED)$/) status?:
    "OPEN" | "RESOLVED";
}
