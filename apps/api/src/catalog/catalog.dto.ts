import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsIn,
  IsEnum,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { CatalogStatus, ProductType } from "../generated/prisma/enums";
import { PaginationQueryDto } from "../common/pagination-query.dto";

export class CatalogListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: CatalogStatus })
  @IsOptional()
  @IsIn(Object.values(CatalogStatus))
  status?: CatalogStatus;
}

export class CreateCategoryDto {
  @ApiProperty({ minLength: 2, maxLength: 120 })
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID("4")
  parentId?: string | null;
}

export class CreateUnitDto {
  @ApiProperty({ minLength: 1, maxLength: 24, example: "PCS" })
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @MinLength(1)
  @MaxLength(24)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
  code!: string;

  @ApiProperty({ minLength: 1, maxLength: 80, example: "Pieces" })
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 6, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  precision?: number;
}

export class CreateProductDto {
  @ApiProperty({ minLength: 1, maxLength: 180 })
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @MinLength(1)
  @MaxLength(180)
  name!: string;

  @ApiProperty({ minLength: 1, maxLength: 80 })
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @MinLength(1)
  @MaxLength(80)
  sku!: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID("4")
  baseUnitId!: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID("4")
  categoryId?: string;

  @ApiPropertyOptional({ enum: ProductType, default: ProductType.STOCKED })
  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  trackInventory?: boolean;

  @ApiPropertyOptional({ example: "12.5000" })
  @IsOptional()
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/)
  defaultCost?: string;

  @ApiPropertyOptional({ example: "NGN", minLength: 3, maxLength: 3 })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  costCurrency?: string;

  @ApiPropertyOptional({ example: "15.0000" })
  @IsOptional()
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/)
  defaultSalePrice?: string;

  @ApiPropertyOptional({ example: "NGN", minLength: 3, maxLength: 3 })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  saleCurrency?: string;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class CreateProductConversionDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID("4")
  unitId!: string;

  @ApiProperty({
    example: "12.000000",
    description: "Base units per selected unit",
  })
  @IsString()
  @Matches(/^(?=.*[1-9])(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/)
  baseQuantity!: string;
}
