import assert from "node:assert/strict";
import test from "node:test";
import { InventoryReadService } from "../dist/inventory/inventory-read.service.js";

const context = {
  organizationId: "organization-1",
  membershipId: "membership-1",
  userId: "user-1",
  role: "OWNER",
};

test("warehouse balance product filter keeps organization and warehouse scope", async () => {
  const calls = [];
  const prisma = {
    $transaction: async (queries) => Promise.all(queries),
    inventoryBalance: {
      findMany: async (query) => { calls.push(query); return []; },
      count: async (query) => { calls.push(query); return 0; },
    },
  };
  const service = new InventoryReadService(prisma);
  await service.listBalances(context, "warehouse-1", {
    page: 1,
    page_size: 1,
    productId: "product-1",
  });
  assert.equal(calls.length, 2);
  for (const { where } of calls) {
    assert.equal(where.organizationId, context.organizationId);
    assert.equal(where.warehouseId, "warehouse-1");
    assert.equal(where.productId, "product-1");
  }
});

test("warehouse balance listing remains unfiltered when product is omitted", async () => {
  const calls = [];
  const prisma = {
    $transaction: async (queries) => Promise.all(queries),
    inventoryBalance: {
      findMany: async (query) => { calls.push(query); return []; },
      count: async (query) => { calls.push(query); return 0; },
    },
  };
  await new InventoryReadService(prisma).listBalances(context, "warehouse-1", {
    page: 1,
    page_size: 25,
  });
  assert.equal(calls[0].where.productId, undefined);
});
