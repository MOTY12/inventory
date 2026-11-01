import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { MembershipRole } from "../generated/prisma/enums";

export const ASSIGNABLE_ROLES = [
  MembershipRole.ADMIN,
  MembershipRole.MANAGER,
  MembershipRole.BUYER,
  MembershipRole.SALES,
  MembershipRole.WAREHOUSE_CLERK,
  MembershipRole.FINANCE,
  MembershipRole.READ_ONLY,
  MembershipRole.MEMBER,
] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

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

  @ApiProperty({ enum: ASSIGNABLE_ROLES })
  @IsIn(ASSIGNABLE_ROLES)
  role!: AssignableRole;
}

export class UpdateMembershipRoleDto {
  @ApiProperty({ enum: ASSIGNABLE_ROLES })
  @IsIn(ASSIGNABLE_ROLES)
  role!: AssignableRole;
}

export class SetWarehouseGrantsDto {
  @ApiProperty({ type: [String], maxItems: 500 })
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID("4", { each: true })
  warehouseIds!: string[];
}

export class AcceptInvitationDto {
  @ApiProperty({ minLength: 32, maxLength: 512 })
  @IsString()
  @MinLength(32)
  @MaxLength(512)
  token!: string;
}
