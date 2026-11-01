import assert from "node:assert/strict";
import test from "node:test";
import {
  OrganizationContextGuard,
  requireOrganizationAdmin,
} from "../dist/organizations/organization-context.guard.js";

function context(auth) {
  const request = { auth };
  return {
    request,
    switchToHttp: () => ({ getRequest: () => request }),
  };
}

test("organization context requires an active membership in the selected tenant", async () => {
  const prisma = {
    membership: {
      findUnique: async ({ where }) =>
        where.organizationId_userId.organizationId === "org-a"
          ? { id: "membership-a", role: "MEMBER", status: "ACTIVE" }
          : null,
    },
  };
  const guard = new OrganizationContextGuard(prisma);
  const selected = context({ sub: "user-a", organizationId: "org-a" });
  assert.equal(await guard.canActivate(selected), true);
  assert.deepEqual(selected.request.organization, {
    organizationId: "org-a",
    membershipId: "membership-a",
    userId: "user-a",
    role: "MEMBER",
  });

  await assert.rejects(
    guard.canActivate(context({ sub: "user-a", organizationId: "org-b" })),
    (error) => error.getStatus() === 403,
  );
  await assert.rejects(
    guard.canActivate(context({ sub: "user-a" })),
    (error) => error.getStatus() === 403,
  );
});

test("organization admin operations reject members and accept admins or owners", () => {
  assert.throws(
    () => requireOrganizationAdmin({ organization: { role: "MEMBER" } }),
    (error) => error.getStatus() === 403,
  );
  assert.doesNotThrow(() =>
    requireOrganizationAdmin({ organization: { role: "ADMIN" } }),
  );
  assert.doesNotThrow(() =>
    requireOrganizationAdmin({ organization: { role: "OWNER" } }),
  );
});
