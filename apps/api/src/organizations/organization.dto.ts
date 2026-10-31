import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateOrganizationDto {
  @ApiProperty({ minLength: 2, maxLength: 160 })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ maxLength: 80, pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;
}

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 160 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;
}

export class InviteMemberDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ enum: ["ADMIN", "MEMBER"] })
  @IsIn(["ADMIN", "MEMBER"])
  role!: "ADMIN" | "MEMBER";
}

export class AcceptInvitationDto {
  @ApiProperty({ minLength: 32, maxLength: 512 })
  @IsString()
  @MinLength(32)
  @MaxLength(512)
  token!: string;
}
