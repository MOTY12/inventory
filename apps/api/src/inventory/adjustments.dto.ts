import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateStockAdjustmentDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID("4")
  productId!: string;

  @ApiProperty({ example: "12.000000" })
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/)
  countedQuantity!: string;

  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
