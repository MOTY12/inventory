import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "../dist/generated/prisma/client.js";
import { StockAdjustmentsService } from "../dist/inventory/adjustments.service.js";

const context = {
  organizationId: "org-1",
  membershipId: "membership-1",
  userId: "user-1",
  role: "OWNER",
};

test("stock count captures a tenant-scoped system snapshot and audits the reason", async () => {
  const calls = [];
  const draft = { id: "adjustment-1", systemQuantity: new Prisma.Decimal("4"), countedQuantity: new Prisma.Decimal("6") };
  const prisma = {
    warehouse: { findFirst: async ({ where }) => { calls.push(where); return { id: "warehouse-1" }; } },
    product: { findFirst: async ({ where }) => { calls.push(where); return { id: "product-1", baseUnit: { precision: 0 } }; } },
    inventoryBalance: { findUnique: async () => ({ onHand: new Prisma.Decimal("4") }) },
    $transaction: async callback => callback({
      stockAdjustment: { create: async ({ data }) => { calls.push(data); return draft; } },
      auditEvent: { create: async ({ data }) => { calls.push(data); return {}; } },
    }),
  };
  const service = new StockAdjustmentsService(prisma, {});
  const result = await service.create(context, "user-1", "warehouse-1", {
    productId: "product-1", countedQuantity: "6", reason: "Cycle count variance",
  });
  assert.equal(result.id, draft.id);
  assert.equal(calls[0].organizationId, context.organizationId);
  assert.equal(calls[1].organizationId, context.organizationId);
  assert.equal(calls[2].systemQuantity.toString(), "4");
  assert.equal(calls[2].reason, "Cycle count variance");
  assert.equal(calls[3].action, "COUNT_RECORDED");
});

test("stock count rejects a quantity that exceeds the unit precision", async () => {
  const prisma = {
    warehouse: { findFirst: async () => ({ id: "warehouse-1" }) },
    product: { findFirst: async () => ({ id: "product-1", baseUnit: { precision: 0 } }) },
  };
  const service = new StockAdjustmentsService(prisma, {});
  await assert.rejects(
    service.create(context, "user-1", "warehouse-1", {
      productId: "product-1", countedQuantity: "1.5", reason: "Counted stock",
    }),
    error => error.getStatus() === 409,
  );
});

test("posting binds the adjustment to its captured count snapshot and stable key", async () => {
  let request;
  const adjustment = {
    id: "adjustment-1", productId: "product-1", status: "DRAFT",
    systemQuantity: new Prisma.Decimal("4"), countedQuantity: new Prisma.Decimal("6"),
  };
  const service = new StockAdjustmentsService({ stockAdjustment: { findFirst: async () => adjustment } }, {
    postWarehouseMovement: async (...args) => { request = args; return { id: "movement-1" }; },
  });
  await service.post(context, "user-1", "warehouse-1", adjustment.id);
  assert.equal(request[2], "stock-adjustment:adjustment-1");
  assert.equal(request[3].quantityDelta, "2.000000");
  assert.equal(request[3].expectedOnHand, "4.000000");
  assert.equal(request[3].adjustmentId, adjustment.id);
});
