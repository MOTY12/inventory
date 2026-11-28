import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  AccessTokenGuard,
  AuthenticatedRequest,
} from "../identity/access-token.guard";
import {
  OrganizationContextGuard,
  OrganizationRequest,
} from "./organization-context.guard";
import {
  AcceptInvitationDto,
  CreateOrganizationDto,
  InviteMemberDto,
  SetWarehouseGrantsDto,
  UpdateOrganizationDto,
  UpdateMembershipRoleDto,
} from "./organization.dto";
import { RequireCapabilities, RoleCapabilityGuard } from "./access-policy";
import { OrganizationService } from "./organization.service";

@ApiTags("organizations")
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller("organizations")
export class OrganizationController {
  constructor(private readonly organizations: OrganizationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create an organization and become its owner" })
  create(
    @Body() input: CreateOrganizationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.organizations.create(
      request.auth!.sub,
      request.auth!.sid,
      input,
    );
  }

  @Get()
  @ApiOperation({ summary: "List organizations the current user belongs to" })
  list(@Req() request: AuthenticatedRequest) {
    return this.organizations.listForUser(request.auth!.sub);
  }

  @Post(":organizationId/select")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Select an organization after verifying membership",
  })
  select(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.organizations.selectOrganization(
      request.auth!.sub,
      request.auth!.sid,
      organizationId,
    );
  }

  @Post("invitations/accept")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Accept an invitation for the authenticated email" })
  acceptInvitation(
    @Body() input: AcceptInvitationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.organizations.acceptInvitation(
      request.auth!.sub,
      request.auth!.sid,
      input.token,
    );
  }

  @Get("current")
  @UseGuards(OrganizationContextGuard, RoleCapabilityGuard)
  @RequireCapabilities("organization:read")
  @ApiOperation({
    summary: "Get the organization selected in the access token",
  })
  current(@Req() request: OrganizationRequest) {
    return this.organizations.getCurrent(request.organization!);
  }

  @Patch("current")
  @UseGuards(OrganizationContextGuard, RoleCapabilityGuard)
  @RequireCapabilities("organization:manage")
  @ApiOperation({ summary: "Update the active organization name" })
  updateCurrent(
    @Body() input: UpdateOrganizationDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.organizations.updateCurrent(request.organization!, input.name);
  }

  @Get("current/members")
  @UseGuards(OrganizationContextGuard, RoleCapabilityGuard)
  @RequireCapabilities("members:read")
  @ApiOperation({ summary: "List members in the active organization" })
  members(@Req() request: OrganizationRequest) {
    return this.organizations.listMembers(request.organization!);
  }

  @Patch("current/members/:membershipId/role")
  @UseGuards(OrganizationContextGuard, RoleCapabilityGuard)
  @RequireCapabilities("members:manage")
  updateMemberRole(
    @Param("membershipId", ParseUUIDPipe) membershipId: string,
    @Body() input: UpdateMembershipRoleDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.organizations.updateMemberRole(
      request.organization!,
      membershipId,
      input.role,
    );
  }

  @Get("current/members/:membershipId/warehouse-grants")
  @UseGuards(OrganizationContextGuard, RoleCapabilityGuard)
  @RequireCapabilities("members:manage")
  warehouseGrants(
    @Param("membershipId", ParseUUIDPipe) membershipId: string,
    @Req() request: OrganizationRequest,
  ) {
    return this.organizations.listWarehouseGrants(
      request.organization!,
      membershipId,
    );
  }

  @Put("current/members/:membershipId/warehouse-grants")
  @UseGuards(OrganizationContextGuard, RoleCapabilityGuard)
  @RequireCapabilities("members:manage")
  setWarehouseGrants(
    @Param("membershipId", ParseUUIDPipe) membershipId: string,
    @Body() input: SetWarehouseGrantsDto,
    @Req() request: OrganizationRequest,
  ) {
    return this.organizations.setWarehouseGrants(
      request.organization!,
      membershipId,
      input.warehouseIds,
    );
  }

  @Post("current/invitations")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(OrganizationContextGuard, RoleCapabilityGuard)
  @RequireCapabilities("members:manage")
  @ApiOperation({
    summary: "Invite a verified user to the active organization",
  })
  invite(@Body() input: InviteMemberDto, @Req() request: OrganizationRequest) {
    const context = request.organization!;
    return this.organizations.invite(request.auth!.sub, context, input);
  }

  @Get("current/invitations")
  @UseGuards(OrganizationContextGuard, RoleCapabilityGuard)
  @RequireCapabilities("members:manage")
  @ApiOperation({ summary: "List active invitations for the organization" })
  invitations(@Req() request: OrganizationRequest) {
    return this.organizations.listInvitations(request.organization!);
  }

  @Post("current/invitations/:invitationId/revoke")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(OrganizationContextGuard, RoleCapabilityGuard)
  @RequireCapabilities("members:manage")
  @ApiOperation({ summary: "Revoke an unused invitation" })
  async revokeInvitation(
    @Param("invitationId", ParseUUIDPipe) invitationId: string,
    @Req() request: OrganizationRequest,
  ): Promise<void> {
    await this.organizations.revokeInvitation(
      request.organization!,
      invitationId,
    );
  }

  @Post("current/members/:membershipId/deactivate")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(OrganizationContextGuard, RoleCapabilityGuard)
  @RequireCapabilities("members:manage")
  @ApiOperation({ summary: "Deactivate an active member" })
  async deactivateMember(
    @Param("membershipId", ParseUUIDPipe) membershipId: string,
    @Req() request: OrganizationRequest,
  ): Promise<void> {
    await this.organizations.deactivateMember(
      request.organization!,
      membershipId,
    );
  }
}
