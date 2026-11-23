import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsOptional, ValidateNested } from "class-validator";
import { ReportExportType } from "../generated/prisma/enums";
import { ReportFilterDto } from "./reporting.dto";

export class CreateReportExportDto {
  @ApiProperty({ enum: ReportExportType })
  @IsEnum(ReportExportType)
  report_type!: ReportExportType;

  @ApiPropertyOptional({ type: ReportFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReportFilterDto)
  filters?: ReportFilterDto;
}
