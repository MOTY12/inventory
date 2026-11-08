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
import { StockTransfersService } from "../dist/inventory/transfers.service.js";
import { CustomersService } from "../dist/sales/customers.service.js";
import { SalesOrdersService } from "../dist/sales/sales-orders.service.js";
import { ImportsService } from "../dist/imports/imports.service.js";

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
      const transfers = new StockTransfersService(prisma, inventory);
      const customers = new CustomersService(prisma);
      const salesOrders = new SalesOrdersService(prisma, inventory);
      const imports = new ImportsService(prisma, catalog, inventory);
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
        "CSV product preview and commit are tenant-scoped and idempotent; opening balances post once",
        async () => {
          const sku = `CSV-${randomUUID()}`;
          const csv = Buffer.from(
            `SKU,Product Name,Base Unit,Cost,Cost Currency\n${sku},CSV Import Product,PCS,42.5000,NGN\n`,
          );
          const preview = await imports.preview(
            contextA,
            ownerA.userId,
            "PRODUCTS",
            {
              originalname: "products.csv",
              mimetype: "text/csv",
              buffer: csv,
              size: csv.length,
            },
          );
          assert.equal(preview.summary.validRows, 1);
          assert.equal(
            await prisma.product.count({
              where: {
                organizationId: contextA.organizationId,
                skuNormalized: sku.toLocaleUpperCase("en-US"),
              },
            }),
            0,
          );
          await assert.rejects(
            imports.get(contextB, preview.id),
            (error) => error.getStatus() === 404,
          );
          const committed = await imports.commit(
            contextA,
            ownerA.userId,
            preview.id,
            `csv-product-${preview.id}`,
            "PRODUCTS",
          );
          assert.equal(committed.status, "COMMITTED");
          assert.equal(
            (await imports.auditHistory(contextA, preview.id))[0]?.action,
            "COMMITTED",
          );
          assert.equal(
            await prisma.product.count({
              where: {
                organizationId: contextA.organizationId,
                skuNormalized: sku.toLocaleUpperCase("en-US"),
              },
            }),
            1,
          );
          await imports.commit(
            contextA,
            ownerA.userId,
            preview.id,
            `csv-product-${preview.id}`,
            "PRODUCTS",
          );
          assert.equal(
            await prisma.product.count({
              where: {
                organizationId: contextA.organizationId,
                skuNormalized: sku.toLocaleUpperCase("en-US"),
              },
            }),
            1,
          );

          const imported = await prisma.product.findFirstOrThrow({
            where: {
              organizationId: contextA.organizationId,
              skuNormalized: sku.toLocaleUpperCase("en-US"),
            },
          });
          const openingCsv = Buffer.from(
            `SKU,Warehouse Code,Opening Quantity,Opening Unit Cost,Cost Currency,Source Reference\n${sku},IT-01,12,42.5000,NGN,initial count\n`,
          );
          const openingPreview = await imports.preview(
            contextA,
            ownerA.userId,
            "OPENING_BALANCES",
            {
              originalname: "opening.csv",
              mimetype: "text/csv",
              buffer: openingCsv,
              size: openingCsv.length,
            },
          );
          assert.equal(openingPreview.summary.validRows, 1);
          assert.equal(
            await prisma.stockMovement.count({
              where: {
                organizationId: contextA.organizationId,
                productId: imported.id,
              },
            }),
            0,
          );
          const openingCommitted = await imports.commit(
            contextA,
            ownerA.userId,
            openingPreview.id,
            `csv-opening-${openingPreview.id}`,
            "OPENING_BALANCES",
          );
          assert.equal(openingCommitted.status, "COMMITTED");
          const movement = await prisma.stockMovement.findFirstOrThrow({
            where: {
              organizationId: contextA.organizationId,
              productId: imported.id,
            },
          });
          assert.equal(movement.movementType, "OPENING_BALANCE");
          assert.equal(movement.quantityDelta.toString(), "12");
          await imports.commit(
            contextA,
            ownerA.userId,
            openingPreview.id,
            `csv-opening-${openingPreview.id}`,
            "OPENING_BALANCES",
          );
          assert.equal(
            await prisma.stockMovement.count({
              where: {
                organizationId: contextA.organizationId,
                productId: imported.id,
              },
            }),
            1,
          );

          const shouldNotImportSku = `CSV-NOT-PARTIAL-${randomUUID()}`;
          const duplicateCsv = Buffer.from(
            `SKU,Product Name,Base Unit\n${sku},Duplicate CSV Product,PCS\n${shouldNotImportSku},Valid row must stay atomic,PCS\n`,
          );
          const invalid = await imports.preview(
            contextA,
            ownerA.userId,
            "PRODUCTS",
            {
              originalname: "duplicate.csv",
              mimetype: "text/csv",
              buffer: duplicateCsv,
              size: duplicateCsv.length,
            },
          );
          assert.equal(invalid.summary.validRows, 1);
          assert.equal(invalid.summary.invalidRows, 1);
          await assert.rejects(
            imports.commit(
              contextA,
              ownerA.userId,
              invalid.id,
              `csv-invalid-${invalid.id}`,
              "PRODUCTS",
            ),
            (error) => error.getStatus() === 409,
          );
          assert.equal(
            await prisma.product.count({
              where: {
                organizationId: contextA.organizationId,
                skuNormalized: sku.toLocaleUpperCase("en-US"),
              },
            }),
            1,
          );
          assert.equal(
            await prisma.product.count({
              where: {
                organizationId: contextA.organizationId,
                skuNormalized: shouldNotImportSku.toLocaleUpperCase("en-US"),
              },
            }),
            0,
          );

          await admin.query(
            `CREATE FUNCTION "${schema}".fail_import_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type IN ('imports.batch.committed', 'inventory.movement.posted') THEN RAISE EXCEPTION 'injected import outbox failure'; END IF; RETURN NEW; END; $$`,
          );
          await admin.query(
            `CREATE TRIGGER fail_import_outbox BEFORE INSERT ON "${schema}".outbox_events FOR EACH ROW EXECUTE FUNCTION "${schema}".fail_import_outbox()`,
          );
          try {
            const rollbackSku = `CSV-ROLLBACK-${randomUUID()}`;
            const rollbackCsv = Buffer.from(
              `SKU,Product Name,Base Unit\n${rollbackSku},Rollback Product,PCS\n`,
            );
            const rollbackPreview = await imports.preview(
              contextA,
              ownerA.userId,
              "PRODUCTS",
              {
                originalname: "rollback.csv",
                mimetype: "text/csv",
                buffer: rollbackCsv,
                size: rollbackCsv.length,
              },
            );
            const rollbackKey = `csv-rollback-${rollbackPreview.id}`;
            await assert.rejects(
              imports.commit(
                contextA,
                ownerA.userId,
                rollbackPreview.id,
                rollbackKey,
                "PRODUCTS",
              ),
              /injected import outbox failure/,
            );
            assert.equal(
              await prisma.product.count({
                where: {
                  organizationId: contextA.organizationId,
                  skuNormalized: rollbackSku.toLocaleUpperCase("en-US"),
                },
              }),
              0,
            );
            assert.equal(
              (
                await prisma.importBatch.findUniqueOrThrow({
                  where: { id: rollbackPreview.id },
                })
              ).status,
              "PREVIEWED",
            );
            assert.equal(
              await prisma.idempotencyRecord.count({
                where: {
                  organizationId: contextA.organizationId,
                  key: rollbackKey,
                },
              }),
              0,
            );

            const openingProduct = await catalog.createProduct(
              contextA,
              ownerA.userId,
              {
                name: "Rollback opening item",
                sku: `OPEN-ROLLBACK-${randomUUID()}`,
                baseUnitId: unit.id,
              },
            );
            const openingRollbackCsv = Buffer.from(
              `SKU,Warehouse Code,Opening Quantity,Opening Unit Cost,Cost Currency\n${openingProduct.sku},IT-01,7,10.00,NGN\n`,
            );
            const openingRollbackPreview = await imports.preview(
              contextA,
              ownerA.userId,
              "OPENING_BALANCES",
              {
                originalname: "opening-rollback.csv",
                mimetype: "text/csv",
                buffer: openingRollbackCsv,
                size: openingRollbackCsv.length,
              },
            );
            assert.equal(openingRollbackPreview.summary.validRows, 1);
            await assert.rejects(
              imports.commit(
                contextA,
                ownerA.userId,
                openingRollbackPreview.id,
                `opening-rollback-${openingRollbackPreview.id}`,
                "OPENING_BALANCES",
              ),
              /injected import outbox failure/,
            );
            assert.equal(
              await prisma.stockMovement.count({
                where: {
                  organizationId: contextA.organizationId,
                  productId: openingProduct.id,
                },
              }),
              0,
            );
            assert.equal(
              await prisma.inventoryBalance.count({
                where: {
                  organizationId: contextA.organizationId,
                  productId: openingProduct.id,
                },
              }),
              0,
            );
            assert.equal(
              (
                await prisma.importBatch.findUniqueOrThrow({
                  where: { id: openingRollbackPreview.id },
                })
              ).status,
              "PREVIEWED",
            );
          } finally {
            await admin.query(
              `DROP TRIGGER fail_import_outbox ON "${schema}".outbox_events`,
            );
            await admin.query(`DROP FUNCTION "${schema}".fail_import_outbox()`);
          }
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

      await t.test(
        "customer CRUD, normalized email uniqueness, search, archive and tenant scope",
        async () => {
          const customer = await customers.create(contextA, ownerA.userId, {
            name: "Ada Customer",
            type: "BUSINESS",
            contactName: "Ada Buyer",
            email: "ADA@example.test",
            phone: "+234 809 111 2222",
            billingCity: "Lagos",
            billingCountryCode: "ng",
            shippingAddressLine1: "12 Market Road",
            notes: "Call before delivery",
          });
          assert.equal(customer.email, "ada@example.test");
          assert.equal(customer.shippingAddressLine1, "12 Market Road");
          await assert.rejects(
            customers.get(contextB, customer.id),
            (error) => error.getStatus() === 404,
          );
          await assert.rejects(
            customers.create(contextA, ownerA.userId, {
              name: "Duplicate customer",
              email: "ada@example.test",
            }),
            (error) => error.getStatus() === 409,
          );
          assert.equal(
            (
              await customers.list(contextA, {
                page: 1,
                page_size: 10,
                q: "Ada Buyer",
                status: "ACTIVE",
              })
            ).total,
            1,
          );
          const updated = await customers.update(
            contextA,
            ownerA.userId,
            customer.id,
            { phone: "+234 809 222 3333", billingCity: "Abuja" },
          );
          assert.equal(updated.billingCity, "Abuja");
          assert.equal(
            (await customers.archive(contextA, ownerA.userId, customer.id))
              .status,
            "ARCHIVED",
          );
          await assert.rejects(
            customers.update(contextA, ownerA.userId, customer.id, {
              name: "Edited after archive",
            }),
            (error) => error.getStatus() === 409,
          );
          assert.deepEqual(
            (await customers.auditHistory(contextA, customer.id))
              .map((event) => event.action)
              .sort(),
            ["ARCHIVED", "CREATED", "UPDATED"],
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
        "sales order drafts, atomic reservations, cancellation release, idempotency, races and tenant scope",
        async () => {
          const salesProduct = await catalog.createProduct(
            contextA,
            ownerA.userId,
            {
              name: "Sales reservation item",
              sku: `SALE-${randomUUID()}`,
              baseUnitId: unit.id,
            },
          );
          const customer = await customers.create(contextA, ownerA.userId, {
            name: `Sales customer ${randomUUID()}`,
          });
          await inventory.postWarehouseMovement(
            contextA,
            ownerA.userId,
            `sales-opening-${randomUUID()}`,
            {
              warehouseId: warehouse.id,
              productId: salesProduct.id,
              documentType: "OPENING_BALANCE",
              documentId: randomUUID(),
              movementType: "OPENING_BALANCE",
              quantityDelta: "7",
              costPerBaseUnit: "1.2500",
              costCurrency: "NGN",
            },
          );
          const makeOrder = (quantity) =>
            salesOrders.create(
              contextA,
              ownerA.userId,
              {
                customerId: customer.id,
                warehouseId: warehouse.id,
                currency: "NGN",
                lines: [
                  { productId: salesProduct.id, quantity, unitPrice: "2.5000" },
                ],
              },
              `sales-create-${randomUUID()}`,
            );

          const first = await makeOrder("5");
          assert.equal(first.status, "DRAFT");
          assert.match(first.number, /^SO-\d{6}$/);
          assert.equal(first.total.toString(), "12.5");
          await assert.rejects(
            salesOrders.get(contextB, first.id),
            (error) => error.getStatus() === 404,
          );
          await salesOrders.confirm(
            contextA,
            ownerA.userId,
            first.id,
            "sales-confirm-first",
          );
          const reserved = await prisma.inventoryBalance.findUniqueOrThrow({
            where: {
              organizationId_warehouseId_productId: {
                organizationId: contextA.organizationId,
                warehouseId: warehouse.id,
                productId: salesProduct.id,
              },
            },
          });
          assert.equal(reserved.onHand.toString(), "7");
          assert.equal(reserved.reserved.toString(), "5");
          assert.equal(
            reserved.onHand.minus(reserved.reserved).toString(),
            "2",
          );
          const replayedConfirm = await salesOrders.confirm(
            contextA,
            ownerA.userId,
            first.id,
            "sales-confirm-first",
          );
          assert.equal(replayedConfirm.status, "CONFIRMED");
          await assert.rejects(
            salesOrders.confirm(
              contextA,
              ownerA.userId,
              first.id,
              "sales-confirm-first-different",
            ),
            (error) => error.getStatus() === 409,
          );
          const conflicting = await makeOrder("3");
          await assert.rejects(
            salesOrders.confirm(
              contextA,
              ownerA.userId,
              conflicting.id,
              "sales-confirm-conflicting",
            ),
            (error) => error.getStatus() === 409,
          );
          assert.equal(
            (await salesOrders.get(contextA, conflicting.id)).status,
            "DRAFT",
          );
          await salesOrders.cancel(
            contextA,
            ownerA.userId,
            first.id,
            "sales-cancel-first",
          );
          await salesOrders.cancel(
            contextA,
            ownerA.userId,
            first.id,
            "sales-cancel-first",
          );
          const released = await prisma.inventoryBalance.findUniqueOrThrow({
            where: {
              organizationId_warehouseId_productId: {
                organizationId: contextA.organizationId,
                warehouseId: warehouse.id,
                productId: salesProduct.id,
              },
            },
          });
          assert.equal(released.reserved.toString(), "0");
          assert.equal(
            (
              await salesOrders.reconcileReservations(
                contextA,
                warehouse.id,
                salesProduct.id,
              )
            ).reconciled,
            true,
          );
          const competing = await Promise.all([makeOrder("4"), makeOrder("4")]);
          const results = await Promise.allSettled(
            competing.map((order) =>
              salesOrders.confirm(
                contextA,
                ownerA.userId,
                order.id,
                `sales-race-${order.id}`,
              ),
            ),
          );
          assert.equal(
            results.filter((result) => result.status === "fulfilled").length,
            1,
          );
          const finalBalance = await prisma.inventoryBalance.findUniqueOrThrow({
            where: {
              organizationId_warehouseId_productId: {
                organizationId: contextA.organizationId,
                warehouseId: warehouse.id,
                productId: salesProduct.id,
              },
            },
          });
          assert.equal(finalBalance.onHand.toString(), "7");
          assert.equal(finalBalance.reserved.toString(), "4");
          assert.equal(
            (
              await salesOrders.reconcileReservations(
                contextA,
                warehouse.id,
                salesProduct.id,
              )
            ).reconciled,
            true,
          );
          const winnerIndex = results.findIndex(
            (result) => result.status === "fulfilled",
          );
          const winner = competing[winnerIndex];
          const salesLineId = winner.lines[0].id;
          const cancellationRaceOrder = await makeOrder("1");
          await salesOrders.confirm(
            contextA,
            ownerA.userId,
            cancellationRaceOrder.id,
            `sales-confirm-${cancellationRaceOrder.id}`,
          );
          const pickCancelRace = await Promise.allSettled([
            salesOrders.pick(
              contextA,
              ownerA.userId,
              cancellationRaceOrder.id,
              "sales-pick-cancel-race",
              {
                lines: [
                  {
                    salesOrderLineId: cancellationRaceOrder.lines[0].id,
                    quantity: "1",
                  },
                ],
              },
            ),
            salesOrders.cancel(
              contextA,
              ownerA.userId,
              cancellationRaceOrder.id,
              "sales-cancel-pick-race",
            ),
          ]);
          assert.equal(
            pickCancelRace.filter((result) => result.status === "fulfilled")
              .length,
            1,
          );
          const pickedCancellationRace =
            pickCancelRace[0].status === "fulfilled";
          if (pickedCancellationRace) {
            await salesOrders.fulfill(
              contextA,
              ownerA.userId,
              cancellationRaceOrder.id,
              "sales-fulfill-cancel-race",
              {
                lines: [
                  {
                    salesOrderLineId: cancellationRaceOrder.lines[0].id,
                    quantity: "1",
                  },
                ],
              },
            );
          }
          const pickerUserId = randomUUID();
          const pickerEmail = `sales-picker-${pickerUserId}@example.test`;
          await prisma.user.create({
            data: {
              id: pickerUserId,
              email: pickerEmail,
              emailNormalized: pickerEmail,
              passwordHash: "integration-only",
              status: "ACTIVE",
              emailVerifiedAt: new Date(),
            },
          });
          const pickerMembership = await prisma.membership.create({
            data: {
              organizationId: contextA.organizationId,
              userId: pickerUserId,
              role: "WAREHOUSE_CLERK",
            },
          });
          const ungrantedPicker = {
            organizationId: contextA.organizationId,
            membershipId: pickerMembership.id,
            userId: pickerUserId,
            role: "WAREHOUSE_CLERK",
          };
          await assert.rejects(
            salesOrders.pick(
              ungrantedPicker,
              pickerUserId,
              winner.id,
              "sales-pick-ungranted",
              {
                lines: [{ salesOrderLineId: salesLineId, quantity: "1" }],
              },
            ),
            (error) => error.getStatus() === 404,
          );
          await assert.rejects(
            salesOrders.pick(
              contextA,
              ownerA.userId,
              winner.id,
              "pick-too-many",
              {
                lines: [{ salesOrderLineId: salesLineId, quantity: "5" }],
              },
            ),
            (error) => error.getStatus() === 409,
          );
          const pickCommands = [
            { key: "sales-pick-race-a", quantity: "3" },
            { key: "sales-pick-race-b", quantity: "2" },
          ];
          const pickRaces = await Promise.allSettled(
            pickCommands.map(({ key, quantity }) =>
              salesOrders.pick(contextA, ownerA.userId, winner.id, key, {
                lines: [{ salesOrderLineId: salesLineId, quantity }],
              }),
            ),
          );
          assert.equal(
            pickRaces.filter((result) => result.status === "fulfilled").length,
            1,
          );
          const pickedIndex = pickRaces.findIndex(
            (result) => result.status === "fulfilled",
          );
          const acceptedPick = await salesOrders.pick(
            contextA,
            ownerA.userId,
            winner.id,
            pickCommands[pickedIndex].key,
            {
              lines: [
                {
                  salesOrderLineId: salesLineId,
                  quantity: pickCommands[pickedIndex].quantity,
                },
              ],
            },
          );
          const replayedPick = await salesOrders.pick(
            contextA,
            ownerA.userId,
            winner.id,
            pickCommands[pickedIndex].key,
            {
              lines: [
                {
                  salesOrderLineId: salesLineId,
                  quantity: pickCommands[pickedIndex].quantity,
                },
              ],
            },
          );
          assert.equal(acceptedPick.id, replayedPick.id);
          await assert.rejects(
            salesOrders.picks(contextB, winner.id),
            (error) => error.getStatus() === 404,
          );
          const initiallyPicked = Number(pickCommands[pickedIndex].quantity);
          const remainingToPick = String(4 - initiallyPicked);
          const pickRollbackOrder = await makeOrder("2");
          await salesOrders.confirm(
            contextA,
            ownerA.userId,
            pickRollbackOrder.id,
            `sales-confirm-${pickRollbackOrder.id}`,
          );
          const rollbackPickKey = `pick-outbox-${randomUUID()}`;
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
                              return async () => {
                                throw new Error("injected pick outbox failure");
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
              salesOrders.pick(
                contextA,
                ownerA.userId,
                pickRollbackOrder.id,
                rollbackPickKey,
                {
                  lines: [
                    {
                      salesOrderLineId: pickRollbackOrder.lines[0].id,
                      quantity: "1",
                    },
                  ],
                },
              ),
              /injected pick outbox failure/,
            );
          } finally {
            prisma.$transaction = originalTransaction;
          }
          assert.equal(
            (
              await salesOrders.get(contextA, pickRollbackOrder.id)
            ).lines[0].pickedQuantity.toString(),
            "0",
          );
          assert.equal(
            await prisma.salesPick.count({
              where: {
                organizationId: contextA.organizationId,
                salesOrderId: pickRollbackOrder.id,
              },
            }),
            0,
          );
          assert.equal(
            await prisma.idempotencyRecord.findUnique({
              where: {
                organizationId_key: {
                  organizationId: contextA.organizationId,
                  key: rollbackPickKey,
                },
              },
            }),
            null,
          );
          await salesOrders.cancel(
            contextA,
            ownerA.userId,
            pickRollbackOrder.id,
            `sales-cancel-${pickRollbackOrder.id}`,
          );
          await assert.rejects(
            salesOrders.cancel(
              contextA,
              ownerA.userId,
              winner.id,
              "sales-cancel-picked",
            ),
            (error) => error.getStatus() === 409,
          );
          await salesOrders.pick(
            contextA,
            ownerA.userId,
            winner.id,
            "sales-pick-top-up",
            {
              lines: [
                { salesOrderLineId: salesLineId, quantity: remainingToPick },
              ],
            },
          );
          const pickedOrder = await salesOrders.get(contextA, winner.id);
          assert.equal(pickedOrder.lines[0].pickedQuantity.toString(), "4");
          const partialInput = {
            lines: [{ salesOrderLineId: salesLineId, quantity: "2" }],
          };
          const beforeFulfillmentFailure =
            await prisma.inventoryBalance.findUniqueOrThrow({
              where: {
                organizationId_warehouseId_productId: {
                  organizationId: contextA.organizationId,
                  warehouseId: warehouse.id,
                  productId: salesProduct.id,
                },
              },
            });
          const movementsBeforeFulfillmentFailure =
            await prisma.stockMovement.count({
              where: {
                organizationId: contextA.organizationId,
                productId: salesProduct.id,
              },
            });
          const fulfillmentRollbackKey = `fulfill-outbox-${randomUUID()}`;
          const originalFulfillmentTransaction =
            prisma.$transaction.bind(prisma);
          prisma.$transaction = (callback, ...args) =>
            originalFulfillmentTransaction(
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
                                throw new Error(
                                  "injected fulfillment outbox failure",
                                );
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
              salesOrders.fulfill(
                contextA,
                ownerA.userId,
                winner.id,
                fulfillmentRollbackKey,
                { lines: [{ salesOrderLineId: salesLineId, quantity: "1" }] },
              ),
              /injected fulfillment outbox failure/,
            );
          } finally {
            prisma.$transaction = originalFulfillmentTransaction;
          }
          const afterFulfillmentFailure =
            await prisma.inventoryBalance.findUniqueOrThrow({
              where: {
                organizationId_warehouseId_productId: {
                  organizationId: contextA.organizationId,
                  warehouseId: warehouse.id,
                  productId: salesProduct.id,
                },
              },
            });
          assert.equal(
            afterFulfillmentFailure.onHand.toString(),
            beforeFulfillmentFailure.onHand.toString(),
          );
          assert.equal(
            afterFulfillmentFailure.reserved.toString(),
            beforeFulfillmentFailure.reserved.toString(),
          );
          assert.equal(
            await prisma.stockMovement.count({
              where: {
                organizationId: contextA.organizationId,
                productId: salesProduct.id,
              },
            }),
            movementsBeforeFulfillmentFailure,
          );
          assert.equal(
            await prisma.salesFulfillment.count({
              where: {
                organizationId: contextA.organizationId,
                salesOrderId: winner.id,
              },
            }),
            0,
          );
          assert.equal(
            await prisma.idempotencyRecord.findUnique({
              where: {
                organizationId_key: {
                  organizationId: contextA.organizationId,
                  key: fulfillmentRollbackKey,
                },
              },
            }),
            null,
          );
          await assert.rejects(
            salesOrders.fulfill(
              contextA,
              ownerA.userId,
              pickRollbackOrder.id,
              "fulfill-not-picked",
              {
                lines: [
                  {
                    salesOrderLineId: pickRollbackOrder.lines[0].id,
                    quantity: "1",
                  },
                ],
              },
            ),
            (error) => error.getStatus() === 409,
          );
          const partialFulfillment = await salesOrders.fulfill(
            contextA,
            ownerA.userId,
            winner.id,
            "sales-fulfill-partial",
            partialInput,
          );
          const replayedFulfillment = await salesOrders.fulfill(
            contextA,
            ownerA.userId,
            winner.id,
            "sales-fulfill-partial",
            partialInput,
          );
          assert.equal(partialFulfillment.id, replayedFulfillment.id);
          assert.equal(
            (await salesOrders.get(contextA, winner.id)).status,
            "PARTIALLY_FULFILLED",
          );
          await assert.rejects(
            salesOrders.fulfill(
              contextA,
              ownerA.userId,
              winner.id,
              "sales-fulfill-over",
              {
                lines: [{ salesOrderLineId: salesLineId, quantity: "3" }],
              },
            ),
            (error) => error.getStatus() === 409,
          );
          const fulfillmentRaces = await Promise.allSettled(
            ["sales-fulfill-race-a", "sales-fulfill-race-b"].map((key) =>
              salesOrders.fulfill(contextA, ownerA.userId, winner.id, key, {
                lines: [{ salesOrderLineId: salesLineId, quantity: "2" }],
              }),
            ),
          );
          assert.equal(
            fulfillmentRaces.filter((result) => result.status === "fulfilled")
              .length,
            1,
          );
          const fulfilledOrder = await salesOrders.get(contextA, winner.id);
          assert.equal(fulfilledOrder.status, "FULFILLED");
          assert.equal(
            fulfilledOrder.lines[0].fulfilledQuantity.toString(),
            "4",
          );
          assert.equal(fulfilledOrder.lines[0].pickedQuantity.toString(), "4");
          assert.equal(fulfilledOrder.lines[0].reservation.status, "CONSUMED");
          const fulfilledBalance =
            await prisma.inventoryBalance.findUniqueOrThrow({
              where: {
                organizationId_warehouseId_productId: {
                  organizationId: contextA.organizationId,
                  warehouseId: warehouse.id,
                  productId: salesProduct.id,
                },
              },
            });
          assert.equal(
            fulfilledBalance.onHand.toString(),
            pickedCancellationRace ? "2" : "3",
          );
          assert.equal(fulfilledBalance.reserved.toString(), "0");
          assert.equal(
            (
              await salesOrders.reconcileReservations(
                contextA,
                warehouse.id,
                salesProduct.id,
              )
            ).reconciled,
            true,
          );
          assert.equal(
            (await salesOrders.fulfillments(contextA, winner.id)).length,
            2,
          );
          await assert.rejects(
            salesOrders.create(
              contextA,
              ownerA.userId,
              {
                customerId: (
                  await customers.create(contextB, ownerB.userId, {
                    name: `Foreign ${randomUUID()}`,
                  })
                ).id,
                warehouseId: warehouse.id,
                currency: "NGN",
                lines: [
                  { productId: salesProduct.id, quantity: "1", unitPrice: "1" },
                ],
              },
              `sales-foreign-${randomUUID()}`,
            ),
            (error) => error.getStatus() === 404,
          );
          await assert.rejects(
            salesOrders.create(
              { ...contextA, role: "SALES", userId: ownerB.userId },
              ownerB.userId,
              {
                customerId: customer.id,
                warehouseId: warehouse.id,
                currency: "NGN",
                lines: [
                  { productId: salesProduct.id, quantity: "1", unitPrice: "1" },
                ],
              },
              `sales-scope-${randomUUID()}`,
            ),
            (error) => error.getStatus() === 404,
          );
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
      await t.test(
        "warehouse transfer dispatch, partial/full receipt, replay, and tenant scope",
        async () => {
          const destination = await locations.createWarehouse(
            contextA,
            ownerA.userId,
            {
              branchId: branch.id,
              name: "Transfer destination",
              code: `TD-${randomUUID().slice(0, 8)}`,
            },
          );
          const clerkUserId = randomUUID();
          const clerkEmail = `transfer-clerk-${clerkUserId}@example.test`;
          await prisma.user.create({
            data: {
              id: clerkUserId,
              email: clerkEmail,
              emailNormalized: clerkEmail,
              passwordHash: "integration-only",
              status: "ACTIVE",
              emailVerifiedAt: new Date(),
            },
          });
          const clerkMembership = await prisma.membership.create({
            data: {
              organizationId: contextA.organizationId,
              userId: clerkUserId,
              role: "WAREHOUSE_CLERK",
            },
          });
          const clerkContext = {
            organizationId: contextA.organizationId,
            membershipId: clerkMembership.id,
            userId: clerkUserId,
            role: "WAREHOUSE_CLERK",
          };
          await prisma.membershipWarehouseGrant.create({
            data: {
              organizationId: contextA.organizationId,
              userId: clerkUserId,
              warehouseId: warehouse.id,
            },
          });
          const clerkDraft = {
            sourceWarehouseId: warehouse.id,
            destinationWarehouseId: destination.id,
            lines: [{ productId: stockProduct.id, quantity: "1" }],
          };
          await assert.rejects(
            transfers.create(clerkContext, clerkUserId, clerkDraft),
            (error) => error.getStatus() === 404,
          );
          await prisma.membershipWarehouseGrant.create({
            data: {
              organizationId: contextA.organizationId,
              userId: clerkUserId,
              warehouseId: destination.id,
            },
          });
          const permittedDraft = await transfers.create(
            clerkContext,
            clerkUserId,
            clerkDraft,
          );
          assert.equal(permittedDraft.status, "DRAFT");
          await transfers.cancel(clerkContext, clerkUserId, permittedDraft.id);
          const transferProduct = await catalog.createProduct(
            contextA,
            ownerA.userId,
            {
              name: "Transfer item",
              sku: `TRANSFER-${randomUUID()}`,
              baseUnitId: unit.id,
              defaultCost: "2.5000",
              costCurrency: "NGN",
            },
          );
          await inventory.postWarehouseMovement(
            contextA,
            ownerA.userId,
            `transfer-opening-${randomUUID()}`,
            {
              warehouseId: warehouse.id,
              productId: transferProduct.id,
              documentType: "OPENING",
              documentId: randomUUID(),
              movementType: "OPENING_BALANCE",
              quantityDelta: "10",
              costPerBaseUnit: "2.5",
              costCurrency: "NGN",
            },
          );
          let transfer = await transfers.create(contextA, ownerA.userId, {
            sourceWarehouseId: warehouse.id,
            destinationWarehouseId: destination.id,
            lines: [{ productId: transferProduct.id, quantity: "10" }],
          });
          assert.equal(transfer.status, "DRAFT");
          await assert.rejects(
            transfers.get(contextB, transfer.id),
            (error) => error.getStatus() === 404,
          );
          await transfers.submit(contextA, ownerA.userId, transfer.id);
          const dispatchKey = `transfer-dispatch-${randomUUID()}`;
          await transfers.dispatch(
            contextA,
            ownerA.userId,
            transfer.id,
            dispatchKey,
          );
          await transfers.dispatch(
            contextA,
            ownerA.userId,
            transfer.id,
            dispatchKey,
          );
          transfer = await transfers.get(contextA, transfer.id);
          assert.equal(transfer.status, "IN_TRANSIT");
          const sourceAfterDispatch =
            await prisma.inventoryBalance.findUniqueOrThrow({
              where: {
                organizationId_warehouseId_productId: {
                  organizationId: contextA.organizationId,
                  warehouseId: warehouse.id,
                  productId: transferProduct.id,
                },
              },
            });
          assert.equal(sourceAfterDispatch.onHand.toString(), "0");
          assert.equal(sourceAfterDispatch.inTransit.toString(), "10");
          await assert.rejects(
            transfers.receive(
              contextA,
              ownerA.userId,
              transfer.id,
              `transfer-too-much-${randomUUID()}`,
              {
                lines: [
                  { transferLineId: transfer.lines[0].id, quantity: "11" },
                ],
              },
            ),
            (error) => error.getStatus() === 409,
          );
          const firstKey = `transfer-receipt-${randomUUID()}`;
          const firstInput = {
            lines: [{ transferLineId: transfer.lines[0].id, quantity: "4" }],
          };
          await transfers.receive(
            contextA,
            ownerA.userId,
            transfer.id,
            firstKey,
            firstInput,
          );
          await transfers.receive(
            contextA,
            ownerA.userId,
            transfer.id,
            firstKey,
            firstInput,
          );
          transfer = await transfers.get(contextA, transfer.id);
          assert.equal(transfer.status, "PARTIALLY_RECEIVED");
          await transfers.receive(
            contextA,
            ownerA.userId,
            transfer.id,
            `transfer-receipt-${randomUUID()}`,
            {
              lines: [{ transferLineId: transfer.lines[0].id, quantity: "6" }],
            },
          );
          transfer = await transfers.get(contextA, transfer.id);
          assert.equal(transfer.status, "RECEIVED");
          const source = await prisma.inventoryBalance.findUniqueOrThrow({
            where: {
              organizationId_warehouseId_productId: {
                organizationId: contextA.organizationId,
                warehouseId: warehouse.id,
                productId: transferProduct.id,
              },
            },
          });
          const target = await prisma.inventoryBalance.findUniqueOrThrow({
            where: {
              organizationId_warehouseId_productId: {
                organizationId: contextA.organizationId,
                warehouseId: destination.id,
                productId: transferProduct.id,
              },
            },
          });
          assert.equal(source.inTransit.toString(), "0");
          assert.equal(target.onHand.toString(), "10");
          assert.equal(target.averageCost.toString(), "2.5");
          assert.equal(
            await prisma.stockMovement.count({
              where: {
                organizationId: contextA.organizationId,
                documentType: "STOCK_TRANSFER",
                documentId: transfer.id,
              },
            }),
            3,
          );
          await inventory.postWarehouseMovement(
            contextA,
            ownerA.userId,
            `transfer-concurrent-stock-${randomUUID()}`,
            {
              warehouseId: warehouse.id,
              productId: transferProduct.id,
              documentType: "RECEIPT",
              documentId: randomUUID(),
              movementType: "RECEIPT",
              quantityDelta: "2",
              costPerBaseUnit: "2.5",
              costCurrency: "NGN",
            },
          );
          const concurrent = await transfers.create(contextA, ownerA.userId, {
            sourceWarehouseId: warehouse.id,
            destinationWarehouseId: destination.id,
            lines: [{ productId: transferProduct.id, quantity: "2" }],
          });
          await transfers.submit(contextA, ownerA.userId, concurrent.id);
          await transfers.dispatch(
            contextA,
            ownerA.userId,
            concurrent.id,
            `dispatch-${randomUUID()}`,
          );
          const concurrentDetail = await transfers.get(contextA, concurrent.id);
          await admin.query(
            `CREATE FUNCTION "${schema}".fail_transfer_receipt_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type = 'inventory.transfer.received' THEN RAISE EXCEPTION 'injected transfer receipt outbox failure'; END IF; RETURN NEW; END; $$`,
          );
          await admin.query(
            `CREATE TRIGGER fail_transfer_receipt_outbox BEFORE INSERT ON "${schema}".outbox_events FOR EACH ROW EXECUTE FUNCTION "${schema}".fail_transfer_receipt_outbox()`,
          );
          const failedKey = `receipt-rollback-${randomUUID()}`;
          await assert.rejects(
            transfers.receive(
              contextA,
              ownerA.userId,
              concurrent.id,
              failedKey,
              {
                lines: [
                  {
                    transferLineId: concurrentDetail.lines[0].id,
                    quantity: "2",
                  },
                ],
              },
            ),
            /injected transfer receipt outbox failure/,
          );
          await admin.query(
            `DROP TRIGGER fail_transfer_receipt_outbox ON "${schema}".outbox_events`,
          );
          await admin.query(
            `DROP FUNCTION "${schema}".fail_transfer_receipt_outbox()`,
          );
          const rollbackBalance =
            await prisma.inventoryBalance.findUniqueOrThrow({
              where: {
                organizationId_warehouseId_productId: {
                  organizationId: contextA.organizationId,
                  warehouseId: destination.id,
                  productId: transferProduct.id,
                },
              },
            });
          assert.equal(rollbackBalance.onHand.toString(), "10");
          assert.equal(
            await prisma.stockTransferReceipt.count({
              where: {
                organizationId: contextA.organizationId,
                transferId: concurrent.id,
              },
            }),
            0,
          );
          assert.equal(
            await prisma.idempotencyRecord.findUnique({
              where: {
                organizationId_key: {
                  organizationId: contextA.organizationId,
                  key: failedKey,
                },
              },
            }),
            null,
          );
          const competingReceipts = await Promise.allSettled([
            transfers.receive(
              contextA,
              ownerA.userId,
              concurrent.id,
              `receipt-a-${randomUUID()}`,
              {
                lines: [
                  {
                    transferLineId: concurrentDetail.lines[0].id,
                    quantity: "2",
                  },
                ],
              },
            ),
            transfers.receive(
              contextA,
              ownerA.userId,
              concurrent.id,
              `receipt-b-${randomUUID()}`,
              {
                lines: [
                  {
                    transferLineId: concurrentDetail.lines[0].id,
                    quantity: "2",
                  },
                ],
              },
            ),
          ]);
          assert.equal(
            competingReceipts.filter((result) => result.status === "fulfilled")
              .length,
            1,
          );
          const concurrentTarget =
            await prisma.inventoryBalance.findUniqueOrThrow({
              where: {
                organizationId_warehouseId_productId: {
                  organizationId: contextA.organizationId,
                  warehouseId: destination.id,
                  productId: transferProduct.id,
                },
              },
            });
          assert.equal(concurrentTarget.onHand.toString(), "12");
          assert.equal(
            (await transfers.get(contextA, concurrent.id)).status,
            "RECEIVED",
          );
          await inventory.postWarehouseMovement(
            contextA,
            ownerA.userId,
            `transfer-dispatch-race-stock-${randomUUID()}`,
            {
              warehouseId: warehouse.id,
              productId: transferProduct.id,
              documentType: "RECEIPT",
              documentId: randomUUID(),
              movementType: "RECEIPT",
              quantityDelta: "3",
              costPerBaseUnit: "2.5",
              costCurrency: "NGN",
            },
          );
          const dispatchDrafts = await Promise.all(
            [1, 2].map(() =>
              transfers.create(contextA, ownerA.userId, {
                sourceWarehouseId: warehouse.id,
                destinationWarehouseId: destination.id,
                lines: [{ productId: transferProduct.id, quantity: "2" }],
              }),
            ),
          );
          await Promise.all(
            dispatchDrafts.map((draft) =>
              transfers.submit(contextA, ownerA.userId, draft.id),
            ),
          );
          const dispatchResults = await Promise.allSettled(
            dispatchDrafts.map((draft) =>
              transfers.dispatch(
                contextA,
                ownerA.userId,
                draft.id,
                `dispatch-race-${randomUUID()}`,
              ),
            ),
          );
          assert.equal(
            dispatchResults.filter((result) => result.status === "fulfilled")
              .length,
            1,
          );
          const finalSource = await prisma.inventoryBalance.findUniqueOrThrow({
            where: {
              organizationId_warehouseId_productId: {
                organizationId: contextA.organizationId,
                warehouseId: warehouse.id,
                productId: transferProduct.id,
              },
            },
          });
          assert.equal(finalSource.onHand.toString(), "1");
          assert.equal(finalSource.inTransit.toString(), "2");
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
