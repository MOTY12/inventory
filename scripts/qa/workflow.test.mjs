import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertAuthorizedOrganization,
  assertOrganizationIdentity,
  assertSafeTarget,
  QA_ORGANIZATION_NAME,
} from "./safety.mjs";
import {
  acquireRunLock,
  assertManifestSafe,
  createManifest,
  ensureManifestDirectory,
  loadManifest,
  manifestPath,
  newRunId,
  operationKey,
  saveManifest,
  validateManifest,
} from "./manifest.mjs";
import { ApiClient } from "./api-client.mjs";
import {
  databaseIdentityFingerprint,
  verifyQaDatabaseTarget,
} from "./database-target.mjs";
import {
  assertQaChecks,
  oneOrNone,
  purchaseOrderMatches,
  qaScenarioFromEnvironment,
  runManifestDirectory,
  salesOrderMatches,
  scaled,
  transferMatches,
} from "./workflow.mjs";
import { verifyDocumentStates } from "./scenarios/document-states.mjs";
import { seedDocumentStates } from "./scenarios/document-states.mjs";
import { verifyInvoiceStates } from "./scenarios/invoice-states.mjs";
import { verifyMultiCurrency } from "./scenarios/multi-currency.mjs";
import { parseCsv } from "./scenarios/financial-exports.mjs";
import { verifyAuthorizationScenarioResult } from "./scenarios/authorization.mjs";

const base = () => ({
  NODE_ENV: "development",
  QA_ENVIRONMENT: "development",
  QA_ORGANIZATION_ID: "123e4567-e89b-42d3-a456-426614174000",
  QA_ORGANIZATION_NAME: QA_ORGANIZATION_NAME,
  QA_API_BASE_URL: "http://localhost:4000/api/v1",
  DATABASE_URL: "postgresql://qa:local@127.0.0.1/inventory_dev?schema=public",
  QA_EMAIL: "qa@example.test",
  QA_PASSWORD: "never-logged",
});

test("QA safety gate rejects production, missing or mismatched org, and remote targets", () => {
  assert.throws(
    () => assertSafeTarget({ ...base(), NODE_ENV: "production" }),
    /non-production/,
  );
  assert.throws(
    () => assertSafeTarget({ ...base(), NODE_ENV: "" }),
    /non-production/,
  );
  assert.throws(
    () => assertSafeTarget({ ...base(), QA_ORGANIZATION_ID: "" }),
    /QA_ORGANIZATION_ID/,
  );
  assert.throws(
    () => assertSafeTarget({ ...base(), QA_ORGANIZATION_NAME: "Other" }),
    /exactly/,
  );
  assert.throws(
    () =>
      assertSafeTarget({
        ...base(),
        QA_API_BASE_URL: "https://api.example.com/api/v1",
      }),
    /local HTTP/,
  );
  assert.throws(
    () =>
      assertSafeTarget({
        ...base(),
        QA_API_BASE_URL: "http://localhost:4001/api/v1",
      }),
    /local HTTP/,
  );
  assert.throws(
    () =>
      assertSafeTarget({
        ...base(),
        DATABASE_URL: "postgresql://x:y@db.example.com/inventory_prod",
      }),
    /refuses/,
  );
  assert.throws(
    () => assertSafeTarget({ ...base(), QA_PASSWORD: "" }),
    /QA_EMAIL/,
  );
});

test("scenario registry selects only implemented workflows", () => {
  assert.equal(qaScenarioFromEnvironment({}), "baseline");
  assert.equal(
    qaScenarioFromEnvironment({ QA_SCENARIO: "baseline" }),
    "baseline",
  );
  assert.equal(
    qaScenarioFromEnvironment({ QA_SCENARIO: "document-states" }),
    "document-states",
  );
  assert.equal(
    qaScenarioFromEnvironment({ QA_SCENARIO: "multi-currency" }),
    "multi-currency",
  );
  assert.equal(
    qaScenarioFromEnvironment({ QA_SCENARIO: "financial-exports" }),
    "financial-exports",
  );
  assert.equal(
    qaScenarioFromEnvironment({ QA_SCENARIO: "authorization" }),
    "authorization",
  );
  for (const unsupported of ["constructor", "toString", "__proto__"])
    assert.throws(
      () => qaScenarioFromEnvironment({ QA_SCENARIO: unsupported }),
      /Unsupported QA_SCENARIO=/,
    );
});

test("authorization scenario evidence requires every expected denial and grant", () => {
  const labels = [
    "finance report allowed",
    "sales financial report denied",
    "granted warehouse readable",
    "ungranted warehouse denied",
    "branch filter cannot grant warehouse access",
    "sales export permission denied",
    "foreign identity reads own tenant product",
    "cross-tenant product denied",
    "foreign user cannot select QA organization",
  ];
  const result = {
    checks: labels.map((label, index) => ({
      label,
      status: [200, 403, 200, 404, 404, 403, 200, 404, 404][index],
    })),
  };
  assert.deepEqual(verifyAuthorizationScenarioResult(result), {
    checks: 9,
    status: "verified",
  });
  assert.throws(
    () =>
      verifyAuthorizationScenarioResult({
        ...result,
        checks: result.checks.slice(0, -1),
      }),
    /incomplete or duplicated/,
  );
});

test("financial export CSV parser handles quoted commas, quotes, CRLF, and malformed files", () => {
  assert.deepEqual(
    parseCsv(
      '\uFEFFName,Note,Amount\r\n"Acme, Ltd","said ""hello""",100.25\r\n',
    ),
    {
      headers: ["Name", "Note", "Amount"],
      rows: [["Acme, Ltd", 'said "hello"', "100.25"]],
    },
  );
  assert.throws(() => parseCsv('A,B\n"unterminated,1'), /unterminated/);
  assert.throws(() => parseCsv("A,B\n1"), /row widths/);
});

test("only the explicitly authorized organization owner is accepted", () => {
  const id = base().QA_ORGANIZATION_ID;
  assert.throws(
    () => assertAuthorizedOrganization([], id),
    /not an active member/,
  );
  assert.throws(
    () =>
      assertAuthorizedOrganization(
        [{ organization: { id }, role: "MEMBER" }],
        id,
      ),
    /OWNER/,
  );
  assert.equal(
    assertAuthorizedOrganization([{ organization: { id }, role: "OWNER" }], id)
      .id,
    id,
  );
  assert.throws(
    () =>
      assertOrganizationIdentity(
        { id, name: "Other" },
        id,
        QA_ORGANIZATION_NAME,
      ),
    /identity/,
  );
});

test("database target verification matches the API's live connection and owner", async () => {
  const env = base();
  const identity = {
    database: "inventory_dev",
    schema: "public",
    serverAddress: "127.0.0.1",
    serverPort: 5432,
  };
  class FakeClient {
    async connect() {}
    async end() {}
    async query(sql) {
      if (sql.includes("current_database")) return { rows: [identity] };
      return {
        rowCount: 1,
        rows: [{ role: "OWNER", status: "ACTIVE", userStatus: "ACTIVE" }],
      };
    }
  }
  const fetchImpl = async (url, options) => {
    assert.equal(url, `${env.QA_API_BASE_URL}/health/ready`);
    assert.equal(options.redirect, "error");
    return new Response(
      JSON.stringify({
        databaseIdentity: databaseIdentityFingerprint(identity),
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  assert.equal(
    await verifyQaDatabaseTarget(env, env.QA_API_BASE_URL, {
      fetchImpl,
      Client: FakeClient,
    }),
    true,
  );
  class MemberClient extends FakeClient {
    async query(sql) {
      if (sql.includes("organizations o"))
        return {
          rowCount: 1,
          rows: [{ role: "MEMBER", status: "ACTIVE", userStatus: "ACTIVE" }],
        };
      return super.query(sql);
    }
  }
  await assert.rejects(
    verifyQaDatabaseTarget(env, env.QA_API_BASE_URL, {
      fetchImpl,
      Client: MemberClient,
    }),
    /active OWNER/,
  );
  await assert.rejects(
    verifyQaDatabaseTarget(env, env.QA_API_BASE_URL, {
      fetchImpl: async () =>
        new Response(JSON.stringify({ databaseIdentity: "wrong" }), {
          status: 200,
        }),
      Client: FakeClient,
    }),
    /does not match/,
  );
});

test("manifest IDs are unique, atomically resumable, and contain no auth secrets", async () => {
  const first = newRunId();
  const second = newRunId();
  assert.notEqual(first, second);
  const directory = await mkdtemp(join(tmpdir(), "qa-manifest-"));
  try {
    const manifest = createManifest({
      runId: first,
      organizationId: base().QA_ORGANIZATION_ID,
    });
    const key = operationKey(manifest, "receive-60");
    assert.equal(operationKey(manifest, "receive-60"), key);
    manifest.completedOperations.push("master-data");
    const path = manifestPath(first, directory);
    await saveManifest(manifest, path);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    const resumed = await loadManifest(path);
    assert.equal(resumed.runId, first);
    assert.equal(resumed.idempotencyKeys["receive-60"], key);
    assert.doesNotMatch(
      await readFile(path, "utf8"),
      /never-logged|password|accessToken/i,
    );
    assert.throws(
      () => assertManifestSafe({ metadata: { refreshToken: "secret" } }),
      /Secret-like/,
    );
    assert.throws(() => manifestPath("../escape"), /Invalid QA run/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("manifest schema rejects malformed collections and unsafe manifest directories", () => {
  const manifest = createManifest({
    organizationId: base().QA_ORGANIZATION_ID,
  });
  assert.equal(validateManifest(manifest), manifest);
  assert.throws(
    () => validateManifest({ ...manifest, resources: {} }),
    /Malformed or unsupported/,
  );
  assert.throws(
    () => runManifestDirectory({ QA_MANIFEST_DIR: "../outside" }),
    /repository-relative/,
  );
  assert.throws(
    () => runManifestDirectory({ QA_MANIFEST_DIR: "/tmp/qa" }),
    /repository-relative/,
  );
  const legacy = { ...manifest, schemaVersion: 1 };
  delete legacy.resources.exports;
  assert.equal(validateManifest(legacy), legacy);
  assert.throws(
    () => validateManifest({ ...manifest, scenarioName: "multi-currency" }),
    /Malformed or unsupported/,
  );
});

test("manifest directory rejects symlinks that resolve outside the repository", async () => {
  const root = await mkdtemp(join(process.cwd(), ".qa-containment-test-"));
  try {
    await symlink(tmpdir(), join(root, "outside"), "dir");
    const directory = `${root.slice(process.cwd().length + 1)}/outside/run`;
    await assert.rejects(
      ensureManifestDirectory(directory),
      /symlinks|outside the repository/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("document-state verifier checks live statuses against the manifest", async () => {
  const expectedPurchase = [
    "DRAFT",
    "SUBMITTED",
    "PARTIALLY_RECEIVED",
    "RECEIVED",
    "CANCELLED",
    "RECEIVED",
  ];
  const expectedSales = [
    "DRAFT",
    "CONFIRMED",
    "PARTIALLY_FULFILLED",
    "FULFILLED",
    "CANCELLED",
  ];
  const purchaseQuantities = [
    ["2", "0"],
    ["2", "0"],
    ["2", "1"],
    ["10", "10"],
    ["2", "0"],
    ["10", "10"],
  ];
  const salesQuantities = [
    ["1", "0", "0"],
    ["1", "0", "0"],
    ["2", "1", "1"],
    ["2", "2", "2"],
    ["1", "0", "0"],
  ];
  const resources = [
    ...expectedPurchase.map((status, index) => ({
      id: `po-${index}`,
      organizationId: base().QA_ORGANIZATION_ID,
      supplierId: "supplier",
      warehouseId: "warehouse",
      status,
      lines: [
        {
          productId: `product-${index}`,
          unitId: "unit",
          orderedQuantity: `${purchaseQuantities[index][0]}.000000`,
          receivedQuantity: `${purchaseQuantities[index][1]}.000000`,
        },
      ],
    })),
    ...expectedSales.map((status, index) => ({
      id: `so-${index}`,
      organizationId: base().QA_ORGANIZATION_ID,
      customerId: "customer",
      warehouseId: "warehouse",
      status,
      lines: [
        {
          productId: `product-${index + 6}`,
          orderedQuantity: `${salesQuantities[index][0]}.000000`,
          pickedQuantity: `${salesQuantities[index][1]}.000000`,
          fulfilledQuantity: `${salesQuantities[index][2]}.000000`,
        },
      ],
    })),
  ];
  const api = {
    get: async (path) => resources.find((item) => path.endsWith(item.id)),
  };
  const manifest = {
    organizationId: base().QA_ORGANIZATION_ID,
    scenarioResult: {
      scenario: "document-states",
      purchaseOrders: resources
        .slice(0, 6)
        .map(({ id, status, lines }, index) => ({
          id,
          label: [
            "po-draft",
            "po-open",
            "po-partial",
            "po-received",
            "po-cancelled",
            "po-sales-stock",
          ][index],
          status,
          supplierId: "supplier",
          warehouseId: "warehouse",
          productId: `product-${index}`,
          unitId: "unit",
          orderedQuantity: lines[0].orderedQuantity,
          receivedQuantity: lines[0].receivedQuantity,
        })),
      salesOrders: resources.slice(6).map(({ id, status, lines }, index) => ({
        id,
        label: [
          "so-draft",
          "so-confirmed",
          "so-partial",
          "so-fulfilled",
          "so-cancelled",
        ][index],
        status,
        customerId: "customer",
        warehouseId: "warehouse",
        productId: `product-${index + 6}`,
        orderedQuantity: lines[0].orderedQuantity,
        pickedQuantity: lines[0].pickedQuantity,
        fulfilledQuantity: lines[0].fulfilledQuantity,
      })),
    },
  };
  const result = await verifyDocumentStates(api, manifest);
  assert.equal(Object.values(result.checks).length, 11);
  assert.ok(Object.values(result.checks).every(Boolean));
  await assert.rejects(
    verifyDocumentStates(api, {
      scenarioResult: {
        ...manifest.scenarioResult,
        salesOrders: [{ id: "so-0", status: "FULFILLED" }],
      },
    }),
    /complete fixture result/,
  );
});

test("invoice-state verifier reconciles exact payments and reversals by currency", async () => {
  const labels = [
    "invoice-draft",
    "invoice-unpaid",
    "invoice-partial",
    "invoice-paid",
    "invoice-reversed",
    "invoice-overdue",
    "invoice-overdue-partial",
    "invoice-no-due-date",
    "invoice-void",
  ];
  const facts = [
    ["DRAFT", "DRAFT", "0", "80000", false, []],
    ["ISSUED", "UNPAID", "0", "80000", false, []],
    ["ISSUED", "PARTIALLY_PAID", "30000", "50000", false, ["30000"]],
    ["ISSUED", "PAID", "80000", "0", false, ["30000", "50000"]],
    ["ISSUED", "PARTIALLY_PAID", "50000", "30000", false, ["30000", "50000"]],
    ["ISSUED", "UNPAID", "0", "80000", true, []],
    ["ISSUED", "PARTIALLY_PAID", "30000", "50000", true, ["30000"]],
    ["ISSUED", "UNPAID", "0", "80000", false, []],
    ["VOID", "VOID", "0", "0", false, []],
  ];
  const invoices = facts.map(
    (
      [
        status,
        paymentStatus,
        amountPaid,
        outstandingAmount,
        isOverdue,
        allocations,
      ],
      index,
    ) => ({
      id: `invoice-${index}`,
      organizationId: base().QA_ORGANIZATION_ID,
      currency: "NGN",
      status,
      paymentStatus,
      totalAmount: "80000.0000",
      amountPaid: `${amountPaid}.0000`,
      outstandingAmount: `${outstandingAmount}.0000`,
      isOverdue,
      allocations: allocations.map((amount, paymentIndex) => ({
        amount: `${amount}.0000`,
        payment: {
          reversal:
            index === 4 && paymentIndex === 0 ? { id: "reverse-1" } : null,
        },
      })),
    }),
  );
  const manifest = {
    organizationId: base().QA_ORGANIZATION_ID,
    scenarioResult: {
      invoiceStates: invoices.map((invoice, index) => ({
        id: invoice.id,
        label: labels[index],
        status: invoice.status,
        amount: invoice.totalAmount,
        amountPaid: invoice.amountPaid,
        outstanding: invoice.outstandingAmount,
      })),
    },
  };
  const report = await verifyInvoiceStates(
    {
      get: async (path) =>
        invoices.find((invoice) => path.endsWith(invoice.id)),
    },
    manifest,
  );
  assert.equal(Object.keys(report.invoices).length, 9);
  assert.ok(Object.values(report.invoices).every(Boolean));
  await assert.rejects(
    verifyInvoiceStates({ get: async () => null }, { scenarioResult: {} }),
    /all nine fixture invoices/,
  );
});

test("multi-currency verifier reconciles currency-separated API projections without conversion", async () => {
  const expected = [
    {
      currency: "NGN",
      purchase: "500000",
      invoice: "160000",
      paid: "100000",
      due: "60000",
      quantity: "80",
      stock: "400000",
      ordered: "100",
      fulfilled: "20",
    },
    {
      currency: "USD",
      purchase: "500",
      invoice: "180",
      paid: "80",
      due: "100",
      quantity: "40",
      stock: "400",
      ordered: "50",
      fulfilled: "10",
    },
  ];
  const fixtures = expected.map((item, index) => ({
    currency: item.currency,
    productId: `product-${index}`,
    purchaseOrderId: `po-${index}`,
    salesOrderId: `so-${index}`,
    invoiceId: `invoice-${index}`,
    customerId: "customer",
    supplierId: "supplier",
    purchaseValue: item.purchase,
    invoiceValue: item.invoice,
    payments: item.paid,
    outstanding: item.due,
    remainingQuantity: item.quantity,
    inventoryValue: item.stock,
  }));
  const api = {
    async get(path) {
      const index =
        path.includes("USD") ||
        path.includes("product-1") ||
        path.includes("po-1") ||
        path.includes("so-1") ||
        path.includes("invoice-1")
          ? 1
          : 0;
      const fact = expected[index];
      const fixture = fixtures[index];
      if (path.includes("/purchase-orders/"))
        return {
          id: fixture.purchaseOrderId,
          warehouseId: "warehouse",
          currency: fact.currency,
          subtotal: fact.purchase,
          lines: [{ receivedQuantity: fact.ordered }],
        };
      if (path.includes("/sales/orders/"))
        return {
          id: fixture.salesOrderId,
          currency: fact.currency,
          total: fact.invoice,
          lines: [{ fulfilledQuantity: fact.fulfilled }],
        };
      if (path.includes("/sales/invoices/"))
        return {
          id: fixture.invoiceId,
          currency: fact.currency,
          totalAmount: fact.invoice,
          amountPaid: fact.paid,
          outstandingAmount: fact.due,
        };
      if (path.includes("/reports/sales/summary"))
        return {
          order_value: [{ currency: fact.currency, order_value: fact.invoice }],
          invoice_value: [
            { currency: fact.currency, invoice_value: fact.invoice },
          ],
          collections: [{ currency: fact.currency, collected: fact.paid }],
          receivables: [{ currency: fact.currency, outstanding: fact.due }],
        };
      if (path.includes("/reports/purchases/summary"))
        return {
          order_value: [
            { currency: fact.currency, order_value: fact.purchase },
          ],
          received_value: [
            { currency: fact.currency, received_value: fact.purchase },
          ],
        };
      if (path.includes("/reports/sales/products"))
        return {
          data: [
            {
              product_id: fixture.productId,
              currency: fact.currency,
              invoice_value: fact.invoice,
            },
          ],
        };
      if (path.includes("/reports/purchases/products"))
        return {
          data: [
            {
              product_id: fixture.productId,
              currency: fact.currency,
              received_value: fact.purchase,
            },
          ],
        };
      if (path.includes("/reports/sales/customers"))
        return {
          data: [
            {
              currency: fact.currency,
              invoiced_value: fact.invoice,
              outstanding: fact.due,
            },
          ],
        };
      if (path.includes("/reports/purchases/suppliers"))
        return {
          data: [
            {
              currency: fact.currency,
              ordered_value: fact.purchase,
              received_value: fact.purchase,
            },
          ],
        };
      if (path.includes("/reports/receivables/aging"))
        return {
          data: [
            {
              currency: fact.currency,
              not_yet_due: fact.due,
              days_1_30: "0",
              days_31_60: "0",
              days_61_90: "0",
              over_90: "0",
              no_due_date_outstanding: "0",
            },
          ],
        };
      if (path.includes("/reports/valuation"))
        return {
          data: [
            {
              product_id: fixture.productId,
              cost_currency: fact.currency,
              quantity_on_hand: fact.quantity,
              inventory_value: fact.stock,
            },
          ],
        };
      throw new Error(`Unexpected test report route ${path}`);
    },
  };
  const report = await verifyMultiCurrency(api, {
    scenarioResult: { scenario: "multi-currency", currencies: fixtures },
  });
  assert.deepEqual(report.currencies, { NGN: true, USD: true });
  assert.equal(report.automaticConversion, false);
});

test("document-state scenario creates and resumes multiple real-shaped documents without duplicates", async () => {
  const purchaseOrders = new Map();
  const salesOrders = new Map();
  const replayed = new Map();
  let serial = 0;
  let interruptAfterFirstPick = true;
  const api = {
    async get(path) {
      const id = path.split("/").at(-1).split("?")[0];
      if (path.includes("/purchase-orders/"))
        return structuredClone(purchaseOrders.get(id));
      if (path.includes("/sales/orders/"))
        return structuredClone(salesOrders.get(id));
      if (path.includes("/purchase-orders?"))
        return { data: [...purchaseOrders.values()] };
      return { data: [...salesOrders.values()] };
    },
    async post(path, body, idempotencyKey) {
      if (idempotencyKey && replayed.has(idempotencyKey))
        return replayed.get(idempotencyKey);
      let result;
      if (path.endsWith("/purchase-orders")) {
        const id = `po-${++serial}`;
        result = {
          id,
          number: id,
          organizationId: manifest.organizationId,
          status: "DRAFT",
          supplierId: body.supplierId,
          warehouseId: body.warehouseId,
          currency: body.currency,
          lines: body.lines.map((line, index) => ({
            id: `${id}-line-${index}`,
            productId: line.productId,
            unitId: line.unitId,
            orderedQuantity: `${line.quantity}.000000`,
            receivedQuantity: "0.000000",
            unitCost: `${line.unitCost}.0000`,
          })),
        };
        purchaseOrders.set(id, result);
      } else if (
        path.includes("/purchase-orders/") &&
        path.endsWith("/submit")
      ) {
        const order = purchaseOrders.get(path.split("/").at(-2));
        order.status = "SUBMITTED";
        result = order;
      } else if (
        path.includes("/purchase-orders/") &&
        path.endsWith("/cancel")
      ) {
        const order = purchaseOrders.get(path.split("/").at(-2));
        order.status = "CANCELLED";
        result = order;
      } else if (
        path.includes("/purchase-orders/") &&
        path.endsWith("/receipts")
      ) {
        const order = purchaseOrders.get(path.split("/").at(-2));
        const line = order.lines[0];
        line.receivedQuantity = `${Number(line.receivedQuantity) + Number(body.lines[0].quantity)}.000000`;
        order.status =
          Number(line.receivedQuantity) === Number(line.orderedQuantity)
            ? "RECEIVED"
            : "PARTIALLY_RECEIVED";
        result = { id: `receipt-${serial}-${line.receivedQuantity}` };
      } else if (path.endsWith("/sales/orders")) {
        const id = `so-${++serial}`;
        result = {
          id,
          number: id,
          organizationId: manifest.organizationId,
          status: "DRAFT",
          ...body,
          lines: body.lines.map((line, index) => ({
            id: `${id}-line-${index}`,
            productId: line.productId,
            orderedQuantity: `${line.quantity}.000000`,
            pickedQuantity: "0.000000",
            fulfilledQuantity: "0.000000",
            unitPrice: line.unitPrice,
          })),
        };
        salesOrders.set(id, result);
      } else if (path.includes("/sales/orders/") && path.endsWith("/confirm")) {
        const order = salesOrders.get(path.split("/").at(-2));
        order.status = "CONFIRMED";
        result = order;
      } else if (path.includes("/sales/orders/") && path.endsWith("/cancel")) {
        const order = salesOrders.get(path.split("/").at(-2));
        order.status = "CANCELLED";
        result = order;
      } else if (path.includes("/sales/orders/") && path.endsWith("/picks")) {
        const order = salesOrders.get(path.split("/").at(-2));
        order.lines[0].pickedQuantity = `${Number(order.lines[0].pickedQuantity) + Number(body.lines[0].quantity)}.000000`;
        result = { id: `pick-${serial}-${order.lines[0].pickedQuantity}` };
        if (interruptAfterFirstPick) {
          interruptAfterFirstPick = false;
          replayed.set(idempotencyKey, structuredClone(result));
          throw new Error("simulated stop after successful pick");
        }
      } else if (
        path.includes("/sales/orders/") &&
        path.endsWith("/fulfillments")
      ) {
        const order = salesOrders.get(path.split("/").at(-2));
        order.lines[0].fulfilledQuantity = `${Number(order.lines[0].fulfilledQuantity) + Number(body.lines[0].quantity)}.000000`;
        order.status =
          Number(order.lines[0].fulfilledQuantity) ===
          Number(order.lines[0].orderedQuantity)
            ? "FULFILLED"
            : "PARTIALLY_FULFILLED";
        result = {
          id: `fulfillment-${serial}-${order.lines[0].fulfilledQuantity}`,
        };
      } else throw new Error(`Unexpected fake API route ${path}`);
      if (idempotencyKey) replayed.set(idempotencyKey, structuredClone(result));
      return structuredClone(result);
    },
  };
  const manifest = createManifest({
    organizationId: base().QA_ORGANIZATION_ID,
  });
  const save = async () => {};
  const context = {
    products: Array.from({ length: 6 }, (_, i) => ({ id: `product-${i + 1}` })),
    unit: { id: "unit-1" },
    supplier: { id: "supplier-1", name: "QA supplier" },
    customer: { id: "customer-1" },
    source: { id: "warehouse-1" },
  };
  await assert.rejects(
    seedDocumentStates(api, manifest, save, context),
    /simulated stop after successful pick/,
  );
  const partiallyPicked = [...salesOrders.values()].find((order) =>
    order.notes.endsWith("so-partial"),
  );
  assert.equal(partiallyPicked.lines[0].pickedQuantity, "1.000000");
  assert.equal(partiallyPicked.lines[0].fulfilledQuantity, "0.000000");
  await seedDocumentStates(api, manifest, save, context);
  assert.equal(Object.keys(manifest.scenarioResult).includes("scenario"), true);
  assert.equal(purchaseOrders.size, 6);
  assert.equal(salesOrders.size, 5);
  const counts = [purchaseOrders.size, salesOrders.size];
  await seedDocumentStates(api, manifest, save, context);
  assert.deepEqual([purchaseOrders.size, salesOrders.size], counts);
  assert.equal(
    (await verifyDocumentStates(api, manifest)).checks.sales_4_fulfilled,
    true,
  );
  const resumedPartial = [...salesOrders.values()].find((order) =>
    order.notes.endsWith("so-partial"),
  );
  assert.equal(resumedPartial.lines[0].pickedQuantity, "1.000000");
  assert.equal(resumedPartial.lines[0].fulfilledQuantity, "1.000000");
});

test("one run cannot execute concurrently and can safely resume after release", async () => {
  const directory = await mkdtemp(join(tmpdir(), "qa-lock-"));
  const id = newRunId();
  try {
    const release = await acquireRunLock(id, directory);
    await assert.rejects(acquireRunLock(id, directory), /already active/);
    await release();
    const releaseAfterResume = await acquireRunLock(id, directory);
    await releaseAfterResume();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("verifier fails closed on missing scenario data", async () => {
  const manifest = createManifest({
    organizationId: base().QA_ORGANIZATION_ID,
  });
  assert.equal(manifest.stage, "initialized");
  assert.equal(manifest.scenario, undefined);
});

test("API client never retries a non-idempotent mutation and reuses command keys on retry", async () => {
  let calls = 0;
  const headers = [];
  const fetchImpl = async (_url, options) => {
    calls++;
    headers.push(options.headers["Idempotency-Key"]);
    assert.equal(options.redirect, "error");
    if (calls < 3) throw new DOMException("timeout", "TimeoutError");
    return new Response("{}", {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  };
  const api = new ApiClient({
    baseUrl: "http://localhost:4000/api/v1",
    fetchImpl,
  });
  await assert.rejects(api.post("/unsafe", {}), /timeout/);
  assert.equal(calls, 1);
  await api.post("/safe", {}, "run-operation-1");
  assert.equal(calls, 3);
  assert.equal(headers[1], "run-operation-1");
  assert.equal(headers[2], "run-operation-1");
});

test("independent QA reconciliation fails when any expected invariant is false", () => {
  assert.equal(assertQaChecks({ ledger: true, stock: true }), true);
  assert.throws(() => assertQaChecks({ ledger: true, stock: false }), /stock/);
});

test("recovery requires exact scenario attributes and rejects ambiguity", () => {
  const supplier = { id: "supplier-1" };
  const customer = { id: "customer-1" };
  const warehouse = { id: "warehouse-1" };
  const source = { id: "source-1" };
  const product = { id: "product-1" };
  const unit = { id: "unit-1" };
  const po = {
    supplierId: supplier.id,
    warehouseId: source.id,
    currency: "NGN",
    lines: [
      {
        productId: product.id,
        unitId: unit.id,
        orderedQuantity: "100.000000",
        unitCost: "5000.0000",
      },
    ],
  };
  const order = {
    customerId: customer.id,
    warehouseId: warehouse.id,
    currency: "NGN",
    notes: "QA qa-20261125-abcdef12",
    lines: [
      {
        productId: product.id,
        unitId: unit.id,
        orderedQuantity: "20.000000",
        unitPrice: "8000.0000",
      },
    ],
  };
  const transfer = {
    sourceWarehouseId: source.id,
    destinationWarehouseId: warehouse.id,
    note: "QA qa-20261125-abcdef12",
    lines: [{ productId: product.id, requestedQuantity: "30.000000" }],
  };
  assert.equal(
    purchaseOrderMatches(po, { supplier, warehouse: source, product, unit }),
    true,
  );
  assert.equal(
    salesOrderMatches(order, {
      customer,
      warehouse,
      product,
      unit,
      runId: "qa-20261125-abcdef12",
    }),
    true,
  );
  assert.equal(
    transferMatches(transfer, {
      source,
      destination: warehouse,
      product,
      runId: "qa-20261125-abcdef12",
    }),
    true,
  );
  assert.equal(
    purchaseOrderMatches(
      { ...po, lines: [{ ...po.lines[0], unitCost: "5000.0001" }] },
      { supplier, warehouse: source, product, unit },
    ),
    false,
  );
  assert.equal(scaled("0.000001", 6), 1n);
  assert.equal(scaled("-0.000001", 6), -1n);
  assert.equal(oneOrNone([po], "order"), po);
  assert.throws(() => oneOrNone([po, po], "order"), /Ambiguous/);
});
