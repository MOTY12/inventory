import assert from "node:assert/strict";
import test from "node:test";
import { MembershipRole } from "../dist/generated/prisma/enums.js";
import {
  CAPABILITIES,
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
