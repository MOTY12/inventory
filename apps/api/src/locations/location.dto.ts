import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";
import { BranchStatus, WarehouseStatus } from "../generated/prisma/enums";
import { PaginationQueryDto } from "../common/pagination-query.dto";

export class LocationListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class BranchListQueryDto extends LocationListQueryDto {
  @ApiPropertyOptional({ enum: BranchStatus })
  @IsOptional()
  @IsIn(Object.values(BranchStatus))
  status?: BranchStatus;
}

export class WarehouseListQueryDto extends LocationListQueryDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID("4")
  branchId?: string;

  @ApiPropertyOptional({ enum: WarehouseStatus })
  @IsOptional()
  @IsIn(Object.values(WarehouseStatus))
  status?: WarehouseStatus;
}

export class CreateBranchDto {
  @ApiProperty({ minLength: 2, maxLength: 160 })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;
}

export class UpdateBranchDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 160 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ enum: BranchStatus })
  @IsOptional()
  @IsIn(Object.values(BranchStatus))
  status?: BranchStatus;
}

export class CreateWarehouseDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID("4")
  branchId!: string;

  @ApiProperty({ minLength: 2, maxLength: 160 })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiProperty({ maxLength: 40, pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$" })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code!: string;
}

export class UpdateWarehouseDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID("4")
  branchId?: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 160 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({
    maxLength: 40,
    pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code?: string;

  @ApiPropertyOptional({ enum: WarehouseStatus })
  @IsOptional()
  @IsIn(Object.values(WarehouseStatus))
  status?: WarehouseStatus;
}
