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
import { SuppliersService } from "../dist/procurement/suppliers.service.js";
import { PurchaseOrdersService } from "../dist/procurement/purchase-orders.service.js";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";

test(
  "isolated PostgreSQL catalog, supplier, ledger, balance, and adjustment integration",
  {
    skip:
      !enabled &&
      "Set RUN_POSTGRES_INTEGRATION=1 to use an isolated PostgreSQL schema",
  },
  async (t) => {
    assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
    const schema = `inventory_it_${randomUUID().replaceAll("-", "")}`;
    const baseUrl = process.env.DATABASE_URL;
    const baseSchema = process.env.DATABASE_SCHEMA;
    const testUrl = new URL(baseUrl);
    testUrl.searchParams.set("schema", schema);
    testUrl.searchParams.set("options", `-c search_path=${schema}`);
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
      process.env.DATABASE_SCHEMA = schema;
      prisma = new PrismaService();
      await prisma.onModuleInit();
      const activeSchema =
        await prisma.$queryRaw`SELECT current_schema() AS schema`;
      assert.equal(activeSchema[0].schema, schema);

      const ownerA = await seedOwner(prisma, "tenant-a");
      const ownerB = await seedOwner(prisma, "tenant-b");
      const locations = new LocationsService(prisma);
      const catalog = new CatalogService(prisma);
      const inventory = new InventoryPostingService(prisma);
      const read = new InventoryReadService(prisma);
      const adjustments = new StockAdjustmentsService(prisma, inventory);
      const suppliers = new SuppliersService(prisma);
      const purchaseOrders = new PurchaseOrdersService(prisma, inventory);
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

      await t.test(
        "supplier CRUD, search, tenant isolation, uniqueness and audit history",
        async () => {
          const supplier = await suppliers.create(contextA, ownerA.userId, {
            name: "  North Supply  ",
            contactName: "Ada Buyer",
            email: "ORDERS@NORTH.EXAMPLE",
            phone: "+234 801 234 5678",
            addressLine1: "12 Market Road",
            city: "Lagos",
            region: "Lagos",
            countryCode: "ng",
          });
          assert.equal(supplier.name, "North Supply");
          assert.equal(supplier.email, "orders@north.example");
          assert.equal(supplier.countryCode, "NG");
          await assert.rejects(
            suppliers.create(contextA, ownerA.userId, {
              name: "north   supply",
            }),
            (e) => e.getStatus() === 409,
          );
          await assert.rejects(
            suppliers.get(contextB, supplier.id),
            (e) => e.getStatus() === 404,
          );
          const search = await suppliers.list(contextA, {
            page: 1,
            page_size: 10,
            q: "Ada Buyer",
          });
          assert.equal(search.total, 1);
          const edited = await suppliers.update(
            contextA,
            ownerA.userId,
            supplier.id,
            {
              phone: "+234 809 111 2222",
              termsNotes: "Delivery contact to confirm each order",
            },
          );
          assert.equal(edited.phone, "+234 809 111 2222");
          assert.equal(
            await prisma.auditEvent.count({
              where: {
                organizationId: contextA.organizationId,
                entityType: "SUPPLIER",
                entityId: supplier.id,
              },
            }),
            2,
          );
          assert.equal(
            (await suppliers.archive(contextA, ownerA.userId, supplier.id))
              .status,
            "ARCHIVED",
          );
          const history = await suppliers.auditHistory(contextA, supplier.id);
          assert.deepEqual(history.map((event) => event.action).sort(), [
            "ARCHIVED",
            "CREATED",
            "UPDATED",
          ]);
          await assert.rejects(
            suppliers.update(contextA, ownerA.userId, supplier.id, {
              name: "Changed",
            }),
            (e) => e.getStatus() === 409,
          );
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
        "purchase order lifecycle, partial and full receiving, idempotency and stock posting",
        async () => {
          const receivingProduct = await catalog.createProduct(
            contextA,
            ownerA.userId,
            {
              name: "Receiving integration item",
              sku: `RECEIVE-${randomUUID()}`,
              baseUnitId: unit.id,
            },
          );
          const supplier = await suppliers.create(contextA, ownerA.userId, {
            name: `Receiving supplier ${randomUUID()}`,
          });
          let order = await purchaseOrders.create(contextA, ownerA.userId, {
            supplierId: supplier.id,
            warehouseId: warehouse.id,
            currency: "NGN",
            lines: [
              {
                productId: receivingProduct.id,
                unitId: unit.id,
                quantity: "10",
                unitCost: "2.5000",
              },
            ],
          });
          assert.equal(order.status, "DRAFT");
          assert.match(order.number, /^PO-\d{6}$/);
          assert.equal(order.subtotal.toString(), "25");
          await assert.rejects(
            purchaseOrders.get(contextB, ownerB.userId, order.id),
            (error) => error.getStatus() === 404,
          );
          await purchaseOrders.update(contextA, ownerA.userId, order.id, {
            supplierId: supplier.id,
            warehouseId: warehouse.id,
            currency: "NGN",
            lines: [
              {
                productId: receivingProduct.id,
                unitId: unit.id,
                quantity: "10",
                unitCost: "2.7500",
              },
            ],
          });
          order = await purchaseOrders.get(contextA, ownerA.userId, order.id);
          assert.equal(order.subtotal.toString(), "27.5");
          await purchaseOrders.submit(contextA, ownerA.userId, order.id);
          await assert.rejects(
            purchaseOrders.update(contextA, ownerA.userId, order.id, {
              supplierId: supplier.id,
              warehouseId: warehouse.id,
              currency: "NGN",
              lines: [
                {
                  productId: receivingProduct.id,
                  unitId: unit.id,
                  quantity: "11",
                  unitCost: "2.5000",
                },
              ],
            }),
            (error) => error.getStatus() === 409,
          );
          const receiptInput = {
            lines: [{ purchaseOrderLineId: order.lines[0].id, quantity: "4" }],
          };
          const firstReceipt = await purchaseOrders.receive(
            contextA,
            ownerA.userId,
            order.id,
            "receive-part-one",
            receiptInput,
          );
          const replay = await purchaseOrders.receive(
            contextA,
            ownerA.userId,
            order.id,
            "receive-part-one",
            receiptInput,
          );
          assert.equal(firstReceipt.id, replay.id);
          assert.equal(
            await prisma.stockMovement.count({
              where: {
                organizationId: contextA.organizationId,
                documentId: firstReceipt.id,
              },
            }),
            1,
          );
          await assert.rejects(
            purchaseOrders.receive(
              contextA,
              ownerA.userId,
              order.id,
              "receive-too-much",
              {
                lines: [
                  { purchaseOrderLineId: order.lines[0].id, quantity: "7" },
                ],
              },
            ),
            (error) => error.getStatus() === 409,
          );
          const midBalance = await prisma.inventoryBalance.findUniqueOrThrow({
            where: {
              organizationId_warehouseId_productId: {
                organizationId: contextA.organizationId,
                warehouseId: warehouse.id,
                productId: receivingProduct.id,
              },
            },
          });
          assert.equal(midBalance.onHand.toString(), "4");
          assert.equal(midBalance.averageCost.toString(), "2.75");
          const secondReceipt = await purchaseOrders.receive(
            contextA,
            ownerA.userId,
            order.id,
            "receive-part-two",
            {
              lines: [
                { purchaseOrderLineId: order.lines[0].id, quantity: "6" },
              ],
            },
          );
          assert.equal(secondReceipt.lines.length, 1);
          assert.equal(
            (await purchaseOrders.get(contextA, ownerA.userId, order.id))
              .status,
            "RECEIVED",
          );
          assert.equal(
            (await purchaseOrders.receipts(contextA, ownerA.userId, order.id))
              .length,
            2,
          );
          const orderAudit = await prisma.auditEvent.findMany({
            where: {
              organizationId: contextA.organizationId,
              entityType: "PURCHASE_ORDER",
              entityId: order.id,
            },
            select: { action: true },
          });
          assert.deepEqual(
            new Set(orderAudit.map((event) => event.action)),
            new Set([
              "CREATED",
              "UPDATED",
              "SUBMITTED",
              "PARTIALLY_RECEIVED",
              "RECEIVED",
            ]),
          );
          assert.equal(
            (
              await prisma.inventoryBalance.findUniqueOrThrow({
                where: {
                  organizationId_warehouseId_productId: {
                    organizationId: contextA.organizationId,
                    warehouseId: warehouse.id,
                    productId: receivingProduct.id,
                  },
                },
              })
            ).onHand.toString(),
            "10",
          );
          assert.equal(
            await prisma.outboxEvent.count({
              where: {
                organizationId: contextA.organizationId,
                eventType: "procurement.goods-receipt.posted",
              },
            }),
            2,
          );
          const concurrentProduct = await catalog.createProduct(
            contextA,
            ownerA.userId,
            {
              name: "Concurrent receiving item",
              sku: `CONCURRENT-RECEIVE-${randomUUID()}`,
              baseUnitId: unit.id,
            },
          );
          const concurrentOrder = await purchaseOrders.create(
            contextA,
            ownerA.userId,
            {
              supplierId: supplier.id,
              warehouseId: warehouse.id,
              currency: "NGN",
              lines: [
                {
                  productId: concurrentProduct.id,
                  unitId: unit.id,
                  quantity: "5",
                  unitCost: "4",
                },
              ],
            },
          );
          await purchaseOrders.submit(
            contextA,
            ownerA.userId,
            concurrentOrder.id,
          );
          const concurrentResults = await Promise.allSettled([
            purchaseOrders.receive(
              contextA,
              ownerA.userId,
              concurrentOrder.id,
              "concurrent-a",
              {
                lines: [
                  {
                    purchaseOrderLineId: concurrentOrder.lines[0].id,
                    quantity: "4",
                  },
                ],
              },
            ),
            purchaseOrders.receive(
              contextA,
              ownerA.userId,
              concurrentOrder.id,
              "concurrent-b",
              {
                lines: [
                  {
                    purchaseOrderLineId: concurrentOrder.lines[0].id,
                    quantity: "4",
                  },
                ],
              },
            ),
          ]);
          assert.equal(
            concurrentResults.filter((result) => result.status === "fulfilled")
              .length,
            1,
          );
          assert.equal(
            concurrentResults.filter((result) => result.status === "rejected")
              .length,
            1,
          );
          assert.notEqual(concurrentOrder.number, order.number);
          assert.equal(
            (
              await prisma.inventoryBalance.findUniqueOrThrow({
                where: {
                  organizationId_warehouseId_productId: {
                    organizationId: contextA.organizationId,
                    warehouseId: warehouse.id,
                    productId: concurrentProduct.id,
                  },
                },
              })
            ).onHand.toString(),
            "4",
          );
          const rollbackProduct = await catalog.createProduct(
            contextA,
            ownerA.userId,
            {
              name: "Receipt rollback item",
              sku: `RECEIPT-ROLLBACK-${randomUUID()}`,
              baseUnitId: unit.id,
            },
          );
          const rollbackOrder = await purchaseOrders.create(
            contextA,
            ownerA.userId,
            {
              supplierId: supplier.id,
              warehouseId: warehouse.id,
              currency: "NGN",
              lines: [
                {
                  productId: rollbackProduct.id,
                  unitId: unit.id,
                  quantity: "2",
                  unitCost: "1",
                },
              ],
            },
          );
          await purchaseOrders.submit(
            contextA,
            ownerA.userId,
            rollbackOrder.id,
          );
          const originalTransaction = prisma.$transaction.bind(prisma);
          prisma.$transaction = (callback, ...args) =>
            originalTransaction(
              (tx) =>
                callback(
                  new Proxy(tx, {
                    get(target, property, receiver) {
                      const value = Reflect.get(target, property, receiver);
                      if (property === "outboxEvent")
                        return new Proxy(value, {
                          get(delegate, method, modelReceiver) {
                            if (method === "create")
                              return async ({ data }) => {
                                if (
                                  data.eventType ===
                                  "procurement.goods-receipt.posted"
                                )
                                  throw new Error(
                                    "injected receipt outbox failure",
                                  );
                                return delegate.create({ data });
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
              purchaseOrders.receive(
                contextA,
                ownerA.userId,
                rollbackOrder.id,
                "receipt-rollback",
                {
                  lines: [
                    {
                      purchaseOrderLineId: rollbackOrder.lines[0].id,
                      quantity: "1",
                    },
                  ],
                },
              ),
            );
          } finally {
            prisma.$transaction = originalTransaction;
          }
          assert.equal(
            await prisma.goodsReceipt.count({
              where: {
                organizationId: contextA.organizationId,
                purchaseOrderId: rollbackOrder.id,
              },
            }),
            0,
          );
          assert.equal(
            await prisma.stockMovement.count({
              where: {
                organizationId: contextA.organizationId,
                productId: rollbackProduct.id,
              },
            }),
            0,
          );
          assert.equal(
            await prisma.inventoryBalance.count({
              where: {
                organizationId: contextA.organizationId,
                productId: rollbackProduct.id,
              },
            }),
            0,
          );
          const cancelDraft = await purchaseOrders.create(
            contextA,
            ownerA.userId,
            {
              supplierId: supplier.id,
              warehouseId: warehouse.id,
              currency: "NGN",
              lines: [
                {
                  productId: receivingProduct.id,
                  unitId: unit.id,
                  quantity: "1",
                  unitCost: "3",
                },
              ],
            },
          );
          assert.equal(
            (
              await purchaseOrders.cancel(
                contextA,
                ownerA.userId,
                cancelDraft.id,
              )
            ).status,
            "CANCELLED",
          );
          await assert.rejects(
            purchaseOrders.submit(contextA, ownerA.userId, cancelDraft.id),
            (error) => error.getStatus() === 409,
          );
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
      if (baseSchema === undefined) delete process.env.DATABASE_SCHEMA;
      else process.env.DATABASE_SCHEMA = baseSchema;
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
