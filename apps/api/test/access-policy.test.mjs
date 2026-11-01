import assert from "node:assert/strict";
import test from "node:test";
import { MembershipRole } from "../dist/generated/prisma/enums.js";
import {
  BranchManagementScopeGuard,
  CAPABILITIES,
  WarehouseManagementScopeGuard,
  roleHasCapability,
} from "../dist/organizations/access-policy.js";

const expected = {
  [MembershipRole.OWNER]: CAPABILITIES,
  [MembershipRole.ADMIN]: CAPABILITIES,
  [MembershipRole.MANAGER]: [
    "organization:read",
    "members:read",
    "warehouses:read",
    "warehouses:manage",
    "catalog:read",
    "catalog:write",
    "inventory:read",
    "inventory:write",
    "procurement:read",
    "procurement:write",
    "sales:read",
    "sales:write",
    "reports:read",
  ],
  [MembershipRole.BUYER]: [
    "organization:read",
    "warehouses:read",
    "catalog:read",
    "catalog:write",
    "inventory:read",
    "procurement:read",
    "procurement:write",
    "reports:read",
  ],
  [MembershipRole.SALES]: [
    "organization:read",
    "warehouses:read",
    "catalog:read",
    "inventory:read",
    "sales:read",
    "sales:write",
    "reports:read",
  ],
  [MembershipRole.WAREHOUSE_CLERK]: [
    "organization:read",
    "warehouses:read",
    "catalog:read",
    "inventory:read",
    "inventory:write",
    "procurement:read",
    "sales:read",
    "reports:read",
  ],
  [MembershipRole.FINANCE]: [
    "organization:read",
    "warehouses:read",
    "catalog:read",
    "inventory:read",
    "procurement:read",
    "sales:read",
    "finance:read",
    "finance:write",
    "reports:read",
  ],
  [MembershipRole.READ_ONLY]: [
    "organization:read",
    "members:read",
    "warehouses:read",
    "catalog:read",
    "inventory:read",
    "procurement:read",
    "sales:read",
    "finance:read",
    "reports:read",
  ],
  [MembershipRole.MEMBER]: [
    "organization:read",
    "members:read",
    "warehouses:read",
    "catalog:read",
    "inventory:read",
    "procurement:read",
    "sales:read",
    "finance:read",
    "reports:read",
  ],
};

test("role × capability matrix is explicit and deny-by-default", () => {
  for (const [role, allowed] of Object.entries(expected)) {
    for (const capability of CAPABILITIES) {
      assert.equal(
        roleHasCapability(role, capability),
        allowed.includes(capability),
        `${role} -> ${capability}`,
      );
    }
  }
  assert.equal(roleHasCapability("unrecognized", "inventory:write"), false);
});

test("warehouse management scope permits only tenant grants and archived reactivation", async () => {
  const grants = new Set(["warehouse-member"]);
  const prisma = {
    warehouse: {
      findFirst: async ({ where }) =>
        where.organizationId === "org-a" &&
        ["warehouse-member", "warehouse-owner", "warehouse-archived"].includes(
          where.id,
        )
          ? { id: where.id }
          : null,
    },
    membershipWarehouseGrant: {
      findUnique: async ({ where }) =>
        grants.has(where.organizationId_userId_warehouseId.warehouseId)
          ? { warehouseId: where.organizationId_userId_warehouseId.warehouseId }
          : null,
    },
  };
  const request = {
    auth: { sub: "user-a" },
    organization: {
      organizationId: "org-a",
      membershipId: "membership-a",
      userId: "user-a",
      role: MembershipRole.MANAGER,
    },
    params: { warehouseId: "warehouse-member" },
    query: {},
  };
  const execution = {
    switchToHttp: () => ({ getRequest: () => request }),
  };
  const guard = new WarehouseManagementScopeGuard(prisma);
  assert.equal(await guard.canActivate(execution), true);
  request.params.warehouseId = "warehouse-owner";
  await assert.rejects(
    guard.canActivate(execution),
    (error) => error.getStatus() === 404,
  );
  request.params.warehouseId = "warehouse-archived";
  grants.add("warehouse-archived");
  assert.equal(await guard.canActivate(execution), true);
  request.organization.organizationId = "org-b";
  await assert.rejects(
    guard.canActivate(execution),
    (error) => error.getStatus() === 404,
  );
});

test("branch management scope requires a branch within the active tenant and a grant", async () => {
  const prisma = {
    branch: {
      findFirst: async ({ where }) =>
        where.organizationId === "org-a" &&
        ["branch-a", "branch-b"].includes(where.id)
          ? { id: "branch-a" }
          : null,
    },
    membershipWarehouseGrant: {
      findFirst: async ({ where }) =>
        where.organizationId === "org-a" &&
        where.userId === "user-a" &&
        where.warehouse.branchId === "branch-a"
          ? { warehouseId: "warehouse-a" }
          : null,
    },
  };
  const request = {
    auth: { sub: "user-a" },
    organization: {
      organizationId: "org-a",
      membershipId: "membership-a",
      userId: "user-a",
      role: MembershipRole.MANAGER,
    },
    params: { branchId: "branch-a" },
    query: {},
  };
  const execution = {
    switchToHttp: () => ({ getRequest: () => request }),
  };
  assert.equal(
    await new BranchManagementScopeGuard(prisma).canActivate(execution),
    true,
  );
  request.params.branchId = "branch-b";
  await assert.rejects(
    new BranchManagementScopeGuard(prisma).canActivate(execution),
    (error) => error.getStatus() === 404,
  );
});
