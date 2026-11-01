import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import "dotenv/config";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../dist/database/prisma.service.js";
import { AccessTokenService } from "../dist/identity/access-token.service.js";
import { AuthService } from "../dist/identity/auth.service.js";
import { DevelopmentEmailDelivery } from "../dist/identity/email-delivery.js";
import { hashRefreshToken } from "../dist/identity/refresh-token.js";
import { PasswordHasher } from "../dist/identity/password-hasher.js";
import { OrganizationContextGuard } from "../dist/organizations/organization-context.guard.js";
import { requireOrganizationAdmin } from "../dist/organizations/organization-context.guard.js";
import { OrganizationService } from "../dist/organizations/organization.service.js";
import {
  BranchManagementScopeGuard,
  WarehouseManagementScopeGuard,
  WarehouseScopeGuard,
} from "../dist/organizations/access-policy.js";
import { LocationsService } from "../dist/locations/locations.service.js";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";

test(
  "PostgreSQL auth rotation and organization isolation integration",
  {
    skip:
      !enabled &&
      "Set RUN_POSTGRES_INTEGRATION=1 to use the configured PostgreSQL database",
  },
  async (t) => {
    assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
    assert.ok(process.env.JWT_ACCESS_SECRET, "JWT_ACCESS_SECRET is required");

    const prisma = new PrismaService();
    const email = new DevelopmentEmailDelivery();
    const tokens = new AccessTokenService(
      new JwtService(),
      process.env.JWT_ACCESS_SECRET,
    );
    const auth = new AuthService(prisma, new PasswordHasher(), tokens, email);
    const organizations = new OrganizationService(prisma, tokens, email);
    const userIds = [];
    const organizationIds = [];

    await prisma.onModuleInit();
    t.after(async () => {
      if (organizationIds.length) {
        await prisma.organizationInvitation.deleteMany({
          where: { organizationId: { in: organizationIds } },
        });
        await prisma.organization.deleteMany({
          where: { id: { in: organizationIds } },
        });
      }
      if (userIds.length) {
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
      await prisma.$disconnect();
    });

    async function createVerifiedUser(label) {
      const account = {
        email: `integration-${label}-${randomUUID()}@example.test`,
        password: "Integration-Only-Password-2026!",
      };
      await auth.register(account.email, account.password);
      const record = await prisma.user.findUnique({
        where: { emailNormalized: account.email },
        select: { id: true },
      });
      assert.ok(record);
      userIds.push(record.id);
      const verification = email
        .readMessages(account.email)
        .find((message) => message.type === "verify-email");
      assert.ok(verification);
      await auth.verifyEmail(verification.token);
      return { ...account, userId: record.id };
    }

    async function createSession(account) {
      const session = await auth.login(account.email, account.password);
      const persisted = await prisma.refreshSession.findUniqueOrThrow({
        where: { tokenHash: hashRefreshToken(session.refreshToken) },
        select: { id: true },
      });
      return { ...session, sessionId: persisted.id };
    }

    await t.test(
      "only one concurrent refresh rotates; reuse revokes family",
      async () => {
        const account = await createVerifiedUser("refresh-race");
        const first = await createSession(account);
        const session = await prisma.refreshSession.findUniqueOrThrow({
          where: { tokenHash: hashRefreshToken(first.refreshToken) },
        });

        const outcomes = await Promise.allSettled([
          auth.rotateRefreshToken(first.refreshToken),
          auth.rotateRefreshToken(first.refreshToken),
        ]);
        assert.equal(
          outcomes.filter((result) => result.status === "fulfilled").length,
          1,
        );
        assert.equal(
          outcomes.filter((result) => result.status === "rejected").length,
          1,
        );

        const family = await prisma.refreshSession.findMany({
          where: { familyId: session.familyId },
        });
        assert.equal(family.length, 2);
        assert.ok(family.every((entry) => entry.revokedAt !== null));
      },
    );

    await t.test("failed successor insert rolls back revocation", async () => {
      const account = await createVerifiedUser("refresh-rollback");
      const first = await createSession(account);
      const priorTransaction = prisma.$transaction.bind(prisma);
      prisma.$transaction = (callback, ...args) =>
        priorTransaction(
          (transaction) =>
            callback(
              new Proxy(transaction, {
                get(target, property, receiver) {
                  if (property !== "refreshSession") {
                    const value = Reflect.get(target, property, receiver);
                    return typeof value === "function"
                      ? value.bind(target)
                      : value;
                  }
                  const delegate = Reflect.get(target, property, target);
                  return new Proxy(delegate, {
                    get(model, method, modelReceiver) {
                      if (method === "create") {
                        return async () => {
                          throw new Error("injected successor insert failure");
                        };
                      }
                      const value = Reflect.get(model, method, modelReceiver);
                      return typeof value === "function"
                        ? value.bind(model)
                        : value;
                    },
                  });
                },
              }),
            ),
          ...args,
        );

      try {
        await assert.rejects(
          auth.rotateRefreshToken(first.refreshToken),
          /injected successor insert failure/,
        );
      } finally {
        prisma.$transaction = priorTransaction;
      }

      const stored = await prisma.refreshSession.findUniqueOrThrow({
        where: { tokenHash: hashRefreshToken(first.refreshToken) },
      });
      assert.equal(stored.revokedAt, null);
      const rotated = await auth.rotateRefreshToken(first.refreshToken);
      assert.ok(rotated.refreshToken);
    });

    await t.test("logout revokes persisted refresh session", async () => {
      const account = await createVerifiedUser("logout");
      const session = await createSession(account);
      await auth.logout(session.refreshToken);
      await assert.rejects(
        auth.rotateRefreshToken(session.refreshToken),
        (error) => error.getStatus() === 401,
      );
    });

    await t.test("expired refresh sessions cannot rotate", async () => {
      const account = await createVerifiedUser("refresh-expired");
      const session = await createSession(account);
      await prisma.refreshSession.update({
        where: { id: session.sessionId },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });
      await assert.rejects(
        auth.rotateRefreshToken(session.refreshToken),
        (error) => error.getStatus() === 401,
      );
    });

    await t.test(
      "membership gate denies another organization's ID",
      async () => {
        const ownerA = await createVerifiedUser("tenant-a");
        const ownerB = await createVerifiedUser("tenant-b");
        const sessionA = await createSession(ownerA);
        const sessionB = await createSession(ownerB);
        const organizationA = await organizations.create(
          ownerA.userId,
          sessionA.sessionId,
          {
            name: "Integration Tenant A",
            slug: `integration-a-${randomUUID()}`,
          },
        );
        const organizationB = await organizations.create(
          ownerB.userId,
          sessionB.sessionId,
          {
            name: "Integration Tenant B",
            slug: `integration-b-${randomUUID()}`,
          },
        );
        organizationIds.push(
          organizationA.organization.id,
          organizationB.organization.id,
        );

        const guard = new OrganizationContextGuard(prisma);
        const request = {
          auth: {
            sub: ownerA.userId,
            organizationId: organizationB.organization.id,
          },
        };
        const execution = {
          switchToHttp: () => ({ getRequest: () => request }),
        };
        await assert.rejects(
          guard.canActivate(execution),
          (error) => error.getStatus() === 403,
        );
        await assert.rejects(
          organizations.selectOrganization(
            ownerA.userId,
            sessionA.sessionId,
            organizationB.organization.id,
          ),
          (error) => error.getStatus() === 404,
        );
        const selection = await organizations.selectOrganization(
          ownerA.userId,
          sessionA.sessionId,
          organizationA.organization.id,
        );
        const selectedClaims = await tokens.verify(selection.accessToken);
        assert.equal(
          selectedClaims.organizationId,
          organizationA.organization.id,
        );
        const membersA = await organizations.listMembers({
          organizationId: organizationA.organization.id,
        });
        assert.deepEqual(
          membersA.map((member) => member.user.id),
          [ownerA.userId],
        );
      },
    );

    await t.test(
      "invitation is email-bound and accepted only once concurrently",
      async () => {
        const owner = await createVerifiedUser("invite-owner");
        const member = await createVerifiedUser("invite-member");
        const ownerSession = await createSession(owner);
        const memberSessionA = await createSession(member);
        const memberSessionB = await createSession(member);
        const created = await organizations.create(
          owner.userId,
          ownerSession.sessionId,
          {
            name: "Integration Invitation Org",
            slug: `integration-invite-${randomUUID()}`,
          },
        );
        organizationIds.push(created.organization.id);
        const context = {
          organizationId: created.organization.id,
          membershipId: randomUUID(),
          role: "OWNER",
        };
        await organizations.invite(owner.userId, context, {
          email: member.email,
          role: "MEMBER",
        });
        const inviteMessage = email
          .readMessages(member.email)
          .find((message) => message.type === "organization-invitation");
        assert.ok(inviteMessage);

        const accepts = await Promise.allSettled([
          organizations.acceptInvitation(
            member.userId,
            memberSessionA.sessionId,
            inviteMessage.token,
          ),
          organizations.acceptInvitation(
            member.userId,
            memberSessionB.sessionId,
            inviteMessage.token,
          ),
        ]);
        assert.equal(
          accepts.filter((result) => result.status === "fulfilled").length,
          1,
        );
        assert.equal(
          accepts.filter((result) => result.status === "rejected").length,
          1,
        );
        assert.equal(
          await prisma.membership.count({
            where: {
              organizationId: created.organization.id,
              userId: member.userId,
              status: "ACTIVE",
            },
          }),
          1,
        );
        const accepted = accepts.find(
          (result) => result.status === "fulfilled",
        ).value;
        const memberRequest = {
          auth: {
            sub: member.userId,
            organizationId: created.organization.id,
          },
        };
        const membershipGuard = new OrganizationContextGuard(prisma);
        await membershipGuard.canActivate({
          switchToHttp: () => ({ getRequest: () => memberRequest }),
        });
        assert.throws(
          () => requireOrganizationAdmin(memberRequest),
          (error) => error.getStatus() === 403,
        );
        const ownerContext = {
          organizationId: created.organization.id,
          membershipId: randomUUID(),
          role: "OWNER",
        };
        await organizations.deactivateMember(
          ownerContext,
          accepted.membershipId,
        );
        const revokedContext = {
          ...memberRequest,
        };
        await assert.rejects(
          new OrganizationContextGuard(prisma).canActivate({
            switchToHttp: () => ({ getRequest: () => revokedContext }),
          }),
          (error) => error.getStatus() === 403,
        );

        const mismatch = await createVerifiedUser("invite-mismatch");
        const mismatchSession = await createSession(mismatch);
        const otherInvite = await organizations.invite(owner.userId, context, {
          email: mismatch.email,
          role: "MEMBER",
        });
        const mismatchToken = email
          .readMessages(mismatch.email)
          .find((message) => message.type === "organization-invitation").token;
        assert.ok(otherInvite.id);
        await assert.rejects(
          organizations.acceptInvitation(
            member.userId,
            mismatchSession.sessionId,
            mismatchToken,
          ),
          (error) => error.getStatus() === 403,
        );
        const stillPending = await prisma.organizationInvitation.findUnique({
          where: { tokenHash: hashRefreshToken(mismatchToken) },
        });
        assert.equal(stillPending.acceptedAt, null);
        await prisma.organizationInvitation.update({
          where: { id: stillPending.id },
          data: { expiresAt: new Date(Date.now() - 1_000) },
        });
        await assert.rejects(
          organizations.acceptInvitation(
            mismatch.userId,
            mismatchSession.sessionId,
            mismatchToken,
          ),
          (error) => error.getStatus() === 404,
        );
      },
    );

    await t.test(
      "warehouse grants enforce organization and location scope",
      async () => {
        const owner = await createVerifiedUser("warehouse-owner");
        const member = await createVerifiedUser("warehouse-member");
        const ownerSession = await createSession(owner);
        const memberSession = await createSession(member);
        const created = await organizations.create(
          owner.userId,
          ownerSession.sessionId,
          {
            name: "Integration Warehouse Org",
            slug: `integration-warehouse-${randomUUID()}`,
          },
        );
        organizationIds.push(created.organization.id);
        const ownerContext = {
          organizationId: created.organization.id,
          membershipId: randomUUID(),
          role: "OWNER",
        };
        await organizations.invite(owner.userId, ownerContext, {
          email: member.email,
          role: "WAREHOUSE_CLERK",
        });
        const inviteToken = email
          .readMessages(member.email)
          .find((message) => message.type === "organization-invitation").token;
        const accepted = await organizations.acceptInvitation(
          member.userId,
          memberSession.sessionId,
          inviteToken,
        );
        const warehouse = await prisma.warehouse.create({
          data: {
            organizationId: created.organization.id,
            name: "Integration Warehouse",
            code: `WH-${randomUUID().slice(0, 8)}`,
          },
        });
        const otherWarehouseOrg = await organizations.create(
          owner.userId,
          ownerSession.sessionId,
          {
            name: "Integration Other Warehouse Org",
            slug: `integration-other-warehouse-${randomUUID()}`,
          },
        );
        organizationIds.push(otherWarehouseOrg.organization.id);
        const foreignWarehouse = await prisma.warehouse.create({
          data: {
            organizationId: otherWarehouseOrg.organization.id,
            name: "Foreign Warehouse",
            code: `FW-${randomUUID().slice(0, 8)}`,
          },
        });
        await assert.rejects(
          organizations.setWarehouseGrants(
            ownerContext,
            accepted.membershipId,
            [foreignWarehouse.id],
          ),
          (error) => error.getStatus() === 404,
        );
        await organizations.setWarehouseGrants(
          ownerContext,
          accepted.membershipId,
          [warehouse.id],
        );
        const visibleWarehouses = await organizations.listActiveWarehouses({
          ...ownerContext,
          membershipId: accepted.membershipId,
          userId: member.userId,
          role: "WAREHOUSE_CLERK",
        });
        assert.deepEqual(
          visibleWarehouses.map(({ id }) => id),
          [warehouse.id],
        );

        const guard = new WarehouseScopeGuard(prisma);
        const request = {
          auth: { sub: member.userId },
          organization: {
            organizationId: created.organization.id,
            membershipId: accepted.membershipId,
            role: "WAREHOUSE_CLERK",
          },
          params: { warehouseId: warehouse.id },
          query: {},
        };
        const execution = {
          switchToHttp: () => ({ getRequest: () => request }),
        };
        assert.equal(await guard.canActivate(execution), true);
        assert.equal(request.warehouseId, warehouse.id);
        request.params.warehouseId = foreignWarehouse.id;
        await assert.rejects(
          guard.canActivate(execution),
          (error) => error.getStatus() === 404,
        );
        request.params.warehouseId = warehouse.id;
        await prisma.warehouse.update({
          where: { id: warehouse.id },
          data: { status: "ARCHIVED" },
        });
        await assert.rejects(
          guard.canActivate(execution),
          (error) => error.getStatus() === 404,
        );
      },
    );

    await t.test(
      "branch and warehouse lifecycle is tenant-safe and audited",
      async () => {
        const owner = await createVerifiedUser("locations-owner");
        const otherOwner = await createVerifiedUser("locations-other-owner");
        const ownerSession = await createSession(owner);
        const otherSession = await createSession(otherOwner);
        const org = await organizations.create(
          owner.userId,
          ownerSession.sessionId,
          {
            name: "Integration Locations Org",
            slug: `integration-locations-${randomUUID()}`,
          },
        );
        const otherOrg = await organizations.create(
          otherOwner.userId,
          otherSession.sessionId,
          {
            name: "Integration Foreign Locations Org",
            slug: `integration-foreign-locations-${randomUUID()}`,
          },
        );
        organizationIds.push(org.organization.id, otherOrg.organization.id);
        const context = {
          organizationId: org.organization.id,
          membershipId: randomUUID(),
          userId: owner.userId,
          role: "OWNER",
        };
        const service = new LocationsService(prisma);
        const branch = await service.createBranch(context, owner.userId, {
          name: "Central Branch",
          address: "Lagos",
        });
        await assert.rejects(
          service.createBranch(context, owner.userId, {
            name: "Central Branch",
          }),
          (error) => error.getStatus() === 409,
        );
        const foreignBranch = await service.createBranch(
          { ...context, organizationId: otherOrg.organization.id },
          otherOwner.userId,
          { name: "Foreign Branch" },
        );
        await assert.rejects(
          service.createWarehouse(context, owner.userId, {
            branchId: foreignBranch.id,
            name: "Invalid Cross Tenant Warehouse",
            code: `CROSS-${randomUUID().slice(0, 8)}`,
          }),
          (error) => error.getStatus() === 404,
        );
        await assert.rejects(
          prisma.warehouse.create({
            data: {
              organizationId: org.organization.id,
              branchId: foreignBranch.id,
              name: "Constraint Probe",
              code: `FK-${randomUUID().slice(0, 8)}`,
            },
          }),
          (error) => error.code === "P2003",
        );
        const warehouse = await service.createWarehouse(context, owner.userId, {
          branchId: branch.id,
          name: "Central Store",
          code: `CS-${randomUUID().slice(0, 8)}`,
        });
        assert.equal(warehouse.code, warehouse.code.toUpperCase());
        const searched = await service.listWarehouses(context, {
          page: 1,
          page_size: 10,
          q: warehouse.code.slice(0, 4).toLowerCase(),
        });
        assert.equal(searched.total, 1);
        assert.equal(searched.data[0].branchId, branch.id);
        await assert.rejects(
          service.updateBranch(context, owner.userId, branch.id, {
            status: "ARCHIVED",
          }),
          (error) => error.getStatus() === 409,
        );
        await service.updateWarehouse(context, owner.userId, warehouse.id, {
          status: "ARCHIVED",
        });
        await service.updateBranch(context, owner.userId, branch.id, {
          status: "ARCHIVED",
        });
        await assert.rejects(
          service.updateWarehouse(context, owner.userId, warehouse.id, {
            status: "ACTIVE",
          }),
          (error) => error.getStatus() === 404,
        );
        await service.updateBranch(context, owner.userId, branch.id, {
          status: "ACTIVE",
        });
        await service.updateWarehouse(context, owner.userId, warehouse.id, {
          status: "ACTIVE",
        });
        const auditCount = await prisma.auditEvent.count({
          where: {
            organizationId: org.organization.id,
            actorUserId: owner.userId,
          },
        });
        assert.equal(auditCount, 6);
        const visibleBranches = await service.listBranches(context, {
          page: 1,
          page_size: 10,
          status: "ACTIVE",
        });
        assert.equal(visibleBranches.total, 1);

        const manager = await createVerifiedUser("locations-manager");
        const managerSession = await createSession(manager);
        await organizations.invite(owner.userId, context, {
          email: manager.email,
          role: "MANAGER",
        });
        const managerInvite = email
          .readMessages(manager.email)
          .find((message) => message.type === "organization-invitation");
        assert.ok(managerInvite);
        await organizations.acceptInvitation(
          manager.userId,
          managerSession.sessionId,
          managerInvite.token,
        );
        const managerContext = {
          organizationId: org.organization.id,
          membershipId: randomUUID(),
          userId: manager.userId,
          role: "MANAGER",
        };
        const managerWarehouse = await service.createWarehouse(
          managerContext,
          manager.userId,
          {
            branchId: branch.id,
            name: "Manager Store",
            code: `MS-${randomUUID().slice(0, 8)}`,
          },
        );
        assert.equal(
          await prisma.membershipWarehouseGrant.count({
            where: {
              organizationId: org.organization.id,
              userId: manager.userId,
              warehouseId: managerWarehouse.id,
            },
          }),
          1,
        );
        const managerRequest = {
          auth: { sub: manager.userId },
          organization: managerContext,
          params: { warehouseId: managerWarehouse.id, branchId: branch.id },
          query: {},
        };
        const managerExecution = {
          switchToHttp: () => ({ getRequest: () => managerRequest }),
        };
        assert.equal(
          await new WarehouseScopeGuard(prisma).canActivate(managerExecution),
          true,
        );
        managerRequest.params.warehouseId = warehouse.id;
        await assert.rejects(
          new WarehouseManagementScopeGuard(prisma).canActivate(
            managerExecution,
          ),
          (error) => error.getStatus() === 404,
        );
        managerRequest.params.warehouseId = managerWarehouse.id;
        assert.equal(
          await new WarehouseManagementScopeGuard(prisma).canActivate(
            managerExecution,
          ),
          true,
        );
        assert.equal(
          await new BranchManagementScopeGuard(prisma).canActivate(
            managerExecution,
          ),
          true,
        );
        await service.updateWarehouse(
          managerContext,
          manager.userId,
          managerWarehouse.id,
          {
            status: "ARCHIVED",
          },
        );
        await assert.rejects(
          new WarehouseScopeGuard(prisma).canActivate(managerExecution),
          (error) => error.getStatus() === 404,
        );
        assert.equal(
          await new WarehouseManagementScopeGuard(prisma).canActivate(
            managerExecution,
          ),
          true,
        );
      },
    );
  },
);
