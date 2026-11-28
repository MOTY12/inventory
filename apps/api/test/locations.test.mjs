import assert from "node:assert/strict";
import test from "node:test";
import { LocationsService } from "../dist/locations/locations.service.js";

const manager = {
  organizationId: "org-a",
  membershipId: "membership-a",
  userId: "user-a",
  role: "MANAGER",
};

test("warehouse list applies tenant, grant, filter, and pagination scope", async () => {
  let query;
  const prisma = {
    $transaction: (operations) => Promise.all(operations),
    warehouse: {
      findMany: async (input) => {
        query = input;
        return [{ id: "warehouse-a" }];
      },
      count: async () => 1,
    },
  };
  const result = await new LocationsService(prisma).listWarehouses(manager, {
    page: 2,
    page_size: 5,
    q: "Central",
    status: "ACTIVE",
    branchId: "branch-a",
  });
  assert.equal(query.where.organizationId, "org-a");
  assert.equal(query.where.branchId, "branch-a");
  assert.equal(query.where.grants.some.userId, "user-a");
  assert.equal(query.where.grants.some.organizationId, "org-a");
  assert.deepEqual(
    query.where.OR.map((filter) => Object.keys(filter)[0]),
    ["name", "code"],
  );
  assert.equal(query.skip, 5);
  assert.equal(query.take, 5);
  assert.deepEqual(result, {
    data: [{ id: "warehouse-a" }],
    total: 1,
    page: 2,
    page_size: 5,
  });
});

test("branch creation derives tenant and writes an audit event atomically", async () => {
  const calls = [];
  const prisma = {
    $transaction: async (callback) =>
      callback({
        branch: {
          create: async (input) => {
            calls.push(["branch", input]);
            return { id: "branch-a", name: "Central", address: "Lagos" };
          },
        },
        auditEvent: {
          create: async (input) => calls.push(["audit", input]),
        },
      }),
  };
  const result = await new LocationsService(prisma).createBranch(
    manager,
    "user-a",
    { name: "  Central  ", address: " Lagos " },
  );
  assert.equal(result.id, "branch-a");
  assert.equal(calls[0][1].data.organizationId, "org-a");
  assert.equal(calls[0][1].data.name, "Central");
  assert.equal(calls[1][1].data.organizationId, "org-a");
  assert.equal(calls[1][1].data.actorUserId, "user-a");
  assert.equal(calls[1][1].data.action, "CREATED");
});

test("creating a warehouse requires an active tenant branch and grants its manager", async () => {
  const calls = [];
  const tx = {
    $queryRaw: async () => [{ id: "branch-a" }],
    branch: {
      findFirst: async ({ where }) =>
        where.id === "branch-a" && where.organizationId === "org-a"
          ? { id: "branch-a" }
          : null,
    },
    warehouse: {
      create: async ({ data }) => ({
        id: "warehouse-a",
        ...data,
        status: "ACTIVE",
      }),
    },
    membershipWarehouseGrant: {
      create: async (input) => calls.push(["grant", input]),
    },
    auditEvent: {
      create: async (input) => calls.push(["audit", input]),
    },
  };
  const prisma = { $transaction: async (callback) => callback(tx) };
  const warehouse = await new LocationsService(prisma).createWarehouse(
    manager,
    "user-a",
    { branchId: "branch-a", name: "Central Store", code: "cs-1" },
  );
  assert.equal(warehouse.code, "CS-1");
  assert.deepEqual(calls[0], [
    "grant",
    {
      data: {
        organizationId: "org-a",
        userId: "user-a",
        warehouseId: "warehouse-a",
      },
    },
  ]);
  assert.equal(calls[1][1].data.entityId, "warehouse-a");
  assert.equal(calls[1][1].data.action, "CREATED");
});
