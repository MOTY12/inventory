import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import test from "node:test";
import "dotenv/config";
import { Prisma } from "../dist/generated/prisma/client.js";
import { PrismaService } from "../dist/database/prisma.service.js";
import { CatalogService } from "../dist/catalog/catalog.service.js";
import { LocationsService } from "../dist/locations/locations.service.js";
import { InventoryPostingService } from "../dist/inventory/inventory-posting.service.js";
import { InventoryReadService } from "../dist/inventory/inventory-read.service.js";
import { StockAdjustmentsService } from "../dist/inventory/adjustments.service.js";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";

test(
  "isolated PostgreSQL catalog, ledger, balance, and adjustment integration",
  {
    skip:
      !enabled &&
      "Set RUN_POSTGRES_INTEGRATION=1 to use an isolated PostgreSQL schema",
  },
  async (t) => {
    assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
    const schema = `inventory_it_${randomUUID().replaceAll("-", "")}`;
    const baseUrl = process.env.DATABASE_URL;
    const testUrl = new URL(baseUrl);
    testUrl.searchParams.set("schema", schema);
    const admin = new Client({ connectionString: process.env.DATABASE_URL });
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    let prisma;
    try {
      execFileSync(
        "node_modules/.bin/prisma",
        ["migrate", "deploy", "--config", "prisma.config.ts"],
        {
          cwd: process.cwd(),
          env: { ...process.env, DATABASE_URL: testUrl.toString() },
          stdio: "pipe",
        },
      );
      process.env.DATABASE_URL = testUrl.toString();
      prisma = new PrismaService();
      await prisma.onModuleInit();

      const ownerA = await seedOwner(prisma, "tenant-a");
      const ownerB = await seedOwner(prisma, "tenant-b");
      const locations = new LocationsService(prisma);
      const catalog = new CatalogService(prisma);
      const inventory = new InventoryPostingService(prisma);
      const read = new InventoryReadService(prisma);
      const adjustments = new StockAdjustmentsService(prisma, inventory);
      const contextA = ownerA.context;
      const contextB = ownerB.context;
      const branch = await locations.createBranch(contextA, ownerA.userId, {
        name: "Test Branch",
      });
      const warehouse = await locations.createWarehouse(
        contextA,
        ownerA.userId,
        { branchId: branch.id, name: "Test Warehouse", code: "IT-01" },
      );
      const unit = await catalog.createUnit(contextA, ownerA.userId, {
        code: "PCS",
        name: "Pieces",
        precision: 0,
      });
      const pack = await catalog.createUnit(contextA, ownerA.userId, {
        code: "PACK",
        name: "Pack",
        precision: 0,
      });
      const product = await catalog.createProduct(contextA, ownerA.userId, {
        name: "Integration item",
        sku: `IT-${randomUUID()}`,
        barcode: `BC-${randomUUID()}`,
        baseUnitId: unit.id,
        defaultCost: "1.2500",
        costCurrency: "NGN",
        defaultSalePrice: "3.5000",
        saleCurrency: "NGN",
      });
      const foreignUnit = await catalog.createUnit(contextB, ownerB.userId, {
        code: "PCS",
        name: "Pieces",
        precision: 0,
      });
      const foreignProduct = await catalog.createProduct(
        contextB,
        ownerB.userId,
        {
          name: "Foreign item",
          sku: `FOREIGN-${randomUUID()}`,
          baseUnitId: foreignUnit.id,
        },
      );

      await t.test(
        "product CRUD, uniqueness, tenant isolation, conversions and list filters",
        async () => {
          assert.equal(
            (
              await catalog.getProduct(contextA, product.id)
            ).defaultCost.toString(),
            "1.25",
          );
          await assert.rejects(
            catalog.getProduct(contextA, foreignProduct.id),
            (e) => e.getStatus() === 404,
          );
          await assert.rejects(
            catalog.createProduct(contextA, ownerA.userId, {
              name: "Duplicate",
              sku: product.sku,
              baseUnitId: unit.id,
            }),
            (e) => e.getStatus() === 409,
          );
          await assert.rejects(
            catalog.createProduct(contextA, ownerA.userId, {
              name: "Duplicate barcode",
              sku: `SKU-${randomUUID()}`,
              barcode: product.barcode,
              baseUnitId: unit.id,
            }),
            (e) => e.getStatus() === 409,
          );
          await catalog.updateProduct(contextA, ownerA.userId, product.id, {
            name: "Edited item",
          });
          assert.equal(
            (
              await catalog.listProducts(contextA, {
                page: 1,
                page_size: 10,
                q: "Edited",
              })
            ).total,
            1,
          );
          assert.equal(
            (
              await catalog.listProducts(contextA, {
                page: 1,
                page_size: 1,
                q: product.sku,
              })
            ).total,
            1,
          );
          assert.equal(
            (
              await catalog.listProducts(contextA, {
                page: 1,
                page_size: 1,
                q: product.barcode,
              })
            ).total,
            1,
          );
          await catalog.addProductConversion(
            contextA,
            ownerA.userId,
            product.id,
            { unitId: pack.id, baseQuantity: "6" },
          );
          assert.equal(
            (await catalog.listProductConversions(contextA, product.id)).length,
            1,
          );
          await assert.rejects(
            catalog.addProductConversion(contextA, ownerA.userId, product.id, {
              unitId: pack.id,
              baseQuantity: "12",
            }),
            (e) => e.getStatus() === 409,
          );
          await assert.rejects(
            catalog.addProductConversion(contextA, ownerA.userId, product.id, {
              unitId: foreignUnit.id,
              baseQuantity: "6",
            }),
            (e) => e.getStatus() === 404,
          );
          assert.equal(
            (
              await catalog.getProduct(contextA, product.id)
            ).defaultSalePrice.toString(),
            "3.5",
          );
          const archived = await catalog.archiveProduct(
            contextA,
            ownerA.userId,
            product.id,
          );
          assert.equal(archived.status, "ARCHIVED");
        },
      );

      const stockProduct = await catalog.createProduct(
        contextA,
        ownerA.userId,
        {
          name: "Stock item",
          sku: `STOCK-${randomUUID()}`,
          baseUnitId: unit.id,
        },
      );
      await t.test(
        "ledger posting, idempotency, costing, immutability, reservation floor and reconciliation",
        async () => {
          const openingProduct = await catalog.createProduct(
            contextA,
            ownerA.userId,
            {
              name: "Opening item",
              sku: `OPEN-${randomUUID()}`,
              baseUnitId: unit.id,
            },
          );
          const opening = await inventory.postWarehouseMovement(
            contextA,
            ownerA.userId,
            `opening-${randomUUID()}`,
            {
              warehouseId: warehouse.id,
              productId: openingProduct.id,
              documentType: "OPENING",
              documentId: randomUUID(),
              movementType: "OPENING_BALANCE",
              quantityDelta: "4",
            },
          );
          assert.equal(opening.movementType, "OPENING_BALANCE");
          await assert.rejects(
            inventory.postWarehouseMovement(
              contextA,
              ownerA.userId,
              `foreign-${randomUUID()}`,
              {
                warehouseId: warehouse.id,
                productId: foreignProduct.id,
                documentType: "TEST",
                documentId: randomUUID(),
                movementType: "RECEIPT",
                quantityDelta: "1",
              },
            ),
            (e) => e.getStatus() === 404,
          );
          const receipt = (key, quantity, cost) =>
            inventory.postWarehouseMovement(contextA, ownerA.userId, key, {
              warehouseId: warehouse.id,
              productId: stockProduct.id,
              documentType: "TEST_RECEIPT",
              documentId: randomUUID(),
              movementType: "RECEIPT",
              quantityDelta: quantity,
              costPerBaseUnit: cost,
              costCurrency: "NGN",
            });
          const first = await receipt(`receipt-${randomUUID()}`, "10", "2");
          const secondKey = `receipt-${randomUUID()}`;
          const secondPayload = {
            warehouseId: warehouse.id,
            productId: stockProduct.id,
            documentType: "TEST_RECEIPT",
            documentId: randomUUID(),
            movementType: "RECEIPT",
            quantityDelta: "10",
            costPerBaseUnit: "4",
            costCurrency: "NGN",
          };
          const second = await inventory.postWarehouseMovement(
            contextA,
            ownerA.userId,
            secondKey,
            secondPayload,
          );
          assert.equal(
            (
              await inventory.postWarehouseMovement(
                contextA,
                ownerA.userId,
                secondKey,
                secondPayload,
              )
            ).id,
            second.id,
          );
          await assert.rejects(
            inventory.postWarehouseMovement(
              contextA,
              ownerA.userId,
              secondKey,
              { ...secondPayload, quantityDelta: "9" },
            ),
            (e) => e.getStatus() === 409,
          );
          const balance = await prisma.inventoryBalance.findUniqueOrThrow({
            where: {
              organizationId_warehouseId_productId: {
                organizationId: contextA.organizationId,
                warehouseId: warehouse.id,
                productId: stockProduct.id,
              },
            },
          });
          assert.equal(balance.onHand.toString(), "20");
          assert.equal(balance.averageCost.toString(), "3");
          await assert.rejects(
            prisma.stockMovement.update({
              where: { id: second.id },
              data: { documentType: "ALTERED" },
            }),
          );
          await assert.rejects(
            prisma.stockMovement.delete({ where: { id: second.id } }),
          );
          await prisma.inventoryBalance.update({
            where: {
              organizationId_warehouseId_productId: {
                organizationId: contextA.organizationId,
                warehouseId: warehouse.id,
                productId: stockProduct.id,
              },
            },
            data: { reserved: new Prisma.Decimal("19") },
          });
          const belowReserved = await adjustments.create(
            contextA,
            ownerA.userId,
            warehouse.id,
            {
              productId: stockProduct.id,
              countedQuantity: "18",
              reason: "Reserved floor test",
            },
          );
          await assert.rejects(
            adjustments.post(
              contextA,
              ownerA.userId,
              warehouse.id,
              belowReserved.id,
            ),
            (e) => e.getStatus() === 409,
          );
          await prisma.inventoryBalance.update({
            where: {
              organizationId_warehouseId_productId: {
                organizationId: contextA.organizationId,
                warehouseId: warehouse.id,
                productId: stockProduct.id,
              },
            },
            data: { reserved: new Prisma.Decimal("2") },
          });
          const fulfillment = await inventory.postWarehouseMovement(
            contextA,
            ownerA.userId,
            `fulfillment-${randomUUID()}`,
            {
              warehouseId: warehouse.id,
              productId: stockProduct.id,
              documentType: "TEST_SALE",
              documentId: randomUUID(),
              movementType: "SALE_FULFILLMENT",
              quantityDelta: "-2",
              reservedDelta: "-2",
            },
          );
          assert.equal(fulfillment.movementType, "SALE_FULFILLMENT");
          await prisma.inventoryBalance.update({
            where: {
              organizationId_warehouseId_productId: {
                organizationId: contextA.organizationId,
                warehouseId: warehouse.id,
                productId: stockProduct.id,
              },
            },
            data: { reserved: new Prisma.Decimal("0") },
          });
          assert.equal(
            (await read.reconcile(contextA, warehouse.id)).consistent,
            true,
          );
          assert.equal(first.movementType, "RECEIPT");
        },
      );

      await t.test(
        "adjustment posting is atomic, idempotent, stale-safe, and audited",
        async () => {
          const count1 = await adjustments.create(
            contextA,
            ownerA.userId,
            warehouse.id,
            {
              productId: stockProduct.id,
              countedQuantity: "17",
              reason: "Cycle count",
            },
          );
          const count2 = await adjustments.create(
            contextA,
            ownerA.userId,
            warehouse.id,
            {
              productId: stockProduct.id,
              countedQuantity: "16",
              reason: "Second count",
            },
          );
          const outcomes = await Promise.allSettled([
            adjustments.post(contextA, ownerA.userId, warehouse.id, count1.id),
            adjustments.post(contextA, ownerA.userId, warehouse.id, count2.id),
          ]);
          assert.equal(
            outcomes.filter((x) => x.status === "fulfilled").length,
            1,
          );
          assert.equal(
            outcomes.filter((x) => x.status === "rejected").length,
            1,
          );
          const savedCounts = await prisma.stockAdjustment.findMany({
            where: { organizationId: contextA.organizationId },
          });
          assert.equal(
            savedCounts.filter((x) => x.status === "POSTED").length,
            1,
          );
          const movementCount = await prisma.stockMovement.count({
            where: {
              organizationId: contextA.organizationId,
              productId: stockProduct.id,
            },
          });
          assert.equal(movementCount, 4);
          assert.ok(
            await prisma.auditEvent.findFirst({
              where: {
                organizationId: contextA.organizationId,
                entityType: "STOCK_ADJUSTMENT",
                action: "COUNT_RECORDED",
              },
            }),
          );
          assert.ok(
            await prisma.outboxEvent.findFirst({
              where: {
                organizationId: contextA.organizationId,
                eventType: "inventory.movement.posted",
              },
            }),
          );
          assert.equal(
            (await read.reconcile(contextA, warehouse.id)).consistent,
            true,
          );
          const history = await read.listMovements(contextA, warehouse.id, {
            page: 1,
            page_size: 20,
          });
          assert.ok(
            history.data.some(
              (movement) =>
                movement.movementType === "ADJUSTMENT" &&
                movement.productId === stockProduct.id,
            ),
          );
        },
      );

      await t.test(
        "failed outbox write rolls back movement, balance and idempotency",
        async () => {
          const key = `rollback-${randomUUID()}`;
          const before = await prisma.inventoryBalance.findUniqueOrThrow({
            where: {
              organizationId_warehouseId_productId: {
                organizationId: contextA.organizationId,
                warehouseId: warehouse.id,
                productId: stockProduct.id,
              },
            },
          });
          const movementCount = await prisma.stockMovement.count({
            where: {
              organizationId: contextA.organizationId,
              productId: stockProduct.id,
            },
          });
          const original = prisma.$transaction.bind(prisma);
          prisma.$transaction = (callback, ...args) =>
            original(
              (tx) =>
                callback(
                  new Proxy(tx, {
                    get(target, property, receiver) {
                      const value = Reflect.get(target, property, receiver);
                      if (property === "outboxEvent")
                        return new Proxy(value, {
                          get(delegate, method, modelReceiver) {
                            if (method === "create")
                              return async () => {
                                throw new Error("injected outbox failure");
                              };
                            const result = Reflect.get(
                              delegate,
                              method,
                              modelReceiver,
                            );
                            return typeof result === "function"
                              ? result.bind(delegate)
                              : result;
                          },
                        });
                      return typeof value === "function"
                        ? value.bind(target)
                        : value;
                    },
                  }),
                ),
              ...args,
            );
          try {
            await assert.rejects(
              inventory.postWarehouseMovement(contextA, ownerA.userId, key, {
                warehouseId: warehouse.id,
                productId: stockProduct.id,
                documentType: "ROLLBACK",
                documentId: randomUUID(),
                movementType: "RECEIPT",
                quantityDelta: "1",
                costPerBaseUnit: "3",
                costCurrency: "NGN",
              }),
              /injected outbox failure/,
            );
          } finally {
            prisma.$transaction = original;
          }
          const after = await prisma.inventoryBalance.findUniqueOrThrow({
            where: {
              organizationId_warehouseId_productId: {
                organizationId: contextA.organizationId,
                warehouseId: warehouse.id,
                productId: stockProduct.id,
              },
            },
          });
          assert.equal(after.onHand.toString(), before.onHand.toString());
          assert.equal(
            await prisma.stockMovement.count({
              where: {
                organizationId: contextA.organizationId,
                productId: stockProduct.id,
              },
            }),
            movementCount,
          );
          assert.equal(
            await prisma.idempotencyRecord.findUnique({
              where: {
                organizationId_key: {
                  organizationId: contextA.organizationId,
                  key,
                },
              },
            }),
            null,
          );
        },
      );
    } finally {
      if (prisma) await prisma.$disconnect();
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
      process.env.DATABASE_URL = baseUrl;
    }
  },
);

async function seedOwner(prisma, label) {
  const id = randomUUID();
  const email = `${label}-${id}@example.test`;
  const user = await prisma.user.create({
    data: {
      email,
      emailNormalized: email,
      passwordHash: "integration-only",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  const organization = await prisma.organization.create({
    data: {
      name: `Integration ${label}`,
      slug: `${label}-${id.replaceAll("-", "")}`,
    },
  });
  const membership = await prisma.membership.create({
    data: { organizationId: organization.id, userId: user.id, role: "OWNER" },
  });
  return {
    userId: user.id,
    context: {
      organizationId: organization.id,
      membershipId: membership.id,
      userId: user.id,
      role: "OWNER",
    },
  };
}
