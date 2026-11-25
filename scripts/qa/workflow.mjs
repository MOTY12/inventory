import { ApiClient } from "./api-client.mjs";
import {
  assertAuthorizedOrganization,
  assertOrganizationIdentity,
  assertSafeTarget,
  QA_ORGANIZATION_NAME,
} from "./safety.mjs";
import {
  createManifest,
  loadManifest,
  manifestPath,
  newRunId,
  operationKey,
  saveManifest,
} from "./manifest.mjs";

const ROOT = "/organizations/current";
const list = (value) =>
  Array.isArray(value) ? value : value?.data || value?.items || [];
const qp = (values) =>
  new URLSearchParams(
    Object.entries(values)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  ).toString();
const scaled = (value, places = 4) => {
  const text = String(value ?? "0");
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match)
    throw new Error(
      `Invalid decimal returned by API for QA verification: ${text}`,
    );
  const fraction = (match[2] || "").padEnd(places, "0");
  if (fraction.length > places && /[1-9]/.test(fraction.slice(places)))
    throw new Error("Unexpected precision returned by API");
  return (
    BigInt(match[1]) * 10n ** BigInt(places) +
    BigInt(fraction.slice(0, places) || "0")
  );
};
const formatScaled = (value, places = 4) => {
  const factor = 10n ** BigInt(places);
  const whole = value / factor;
  const fraction = (value % factor)
    .toString()
    .padStart(places, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
};

export async function connectQa(env = process.env) {
  const safe = assertSafeTarget(env);
  const api = new ApiClient({
    baseUrl: safe.apiBaseUrl,
    timeoutMs: Number(env.QA_HTTP_TIMEOUT_MS || 15000),
  });
  await api.login(env.QA_EMAIL, env.QA_PASSWORD);
  const memberships = await api.get("/organizations");
  assertAuthorizedOrganization(memberships, safe.organizationId);
  const selected = await api.post(
    `/organizations/${safe.organizationId}/select`,
  );
  api.accessToken = selected.accessToken;
  const organization = await api.get("/organizations/current");
  assertOrganizationIdentity(
    organization,
    safe.organizationId,
    QA_ORGANIZATION_NAME,
  );
  return { api, organization };
}

async function named(api, path, name, nameField = "name") {
  const result = await api.get(
    `${path}?${qp({ q: name, page: 1, page_size: 100 })}`,
  );
  return list(result).find((item) => item[nameField] === name);
}

async function ensure(api, path, collection, name, body, manifest, save) {
  const found = await named(api, path, name);
  if (found) {
    if (!manifest.resources[collection].some((item) => item.id === found.id)) {
      manifest.resources[collection].push({ id: found.id, name });
      await save();
    }
    return found;
  }
  const created = await api.post(path, body);
  manifest.resources[collection].push({ id: created.id, name });
  await save();
  return created;
}

async function operation(api, manifest, path, method, body, keyName, save) {
  manifest.stage = keyName;
  const key = operationKey(manifest, keyName);
  await save();
  const result =
    method === "POST"
      ? await api.post(path, body, key)
      : await api.patch(path, body);
  if (!manifest.completedOperations.includes(keyName))
    manifest.completedOperations.push(keyName);
  manifest.failedOperations = manifest.failedOperations.filter(
    (item) => item.operation !== keyName,
  );
  await save();
  return result;
}

async function transition(api, manifest, path, body, stepName, save) {
  manifest.stage = stepName;
  await save();
  const result = await api.post(path, body);
  if (!manifest.completedOperations.includes(stepName)) {
    manifest.completedOperations.push(stepName);
  }
  manifest.failedOperations = manifest.failedOperations.filter(
    (item) => item.operation !== stepName,
  );
  await save();
  return result;
}

async function remember(manifest, collection, record, extra = {}) {
  if (
    record?.id &&
    !manifest.resources[collection].some((item) => item.id === record.id)
  ) {
    manifest.resources[collection].push({ id: record.id, ...extra });
  }
}

async function ensureBranch(api, manifest, save, name) {
  return ensure(
    api,
    `${ROOT}/branches`,
    "branches",
    name,
    { name },
    manifest,
    save,
  );
}
async function ensureWarehouse(api, manifest, save, branchId, name, code) {
  const found = list(
    await api.get(
      `${ROOT}/warehouses?${qp({ branchId, q: name, page: 1, page_size: 100 })}`,
    ),
  ).find((item) => item.name === name);
  if (found) {
    if (!manifest.resources.warehouses.some((item) => item.id === found.id)) {
      manifest.resources.warehouses.push({ id: found.id, name, branchId });
      await save();
    }
    return found;
  }
  const created = await api.post(`${ROOT}/warehouses`, {
    branchId,
    name,
    code,
  });
  manifest.resources.warehouses.push({ id: created.id, name, branchId });
  await save();
  return created;
}

export async function seedQaRun(env = process.env, { resume = false } = {}) {
  const { api, organization } = await connectQa(env);
  const runId = resume ? env.QA_RUN_ID : newRunId();
  if (resume && !runId)
    throw new Error("Set QA_RUN_ID to the existing run to resume");
  const path = manifestPath(runId, env.QA_MANIFEST_DIR || ".qa-runs");
  const manifest = resume
    ? await loadManifest(path)
    : createManifest({
        runId,
        organizationId: organization.id,
        environment: env.QA_ENVIRONMENT,
      });
  if (
    manifest.organizationId !== organization.id ||
    manifest.environment !== env.QA_ENVIRONMENT
  )
    throw new Error(
      "QA manifest target or environment does not match the authorized session",
    );
  const save = () => saveManifest(manifest, path);
  await save();
  let currentOperation = "initialization";
  try {
    const suffix = runId.slice(-8).toUpperCase();
    const branches = [];
    for (let i = 1; i <= 2; i++)
      branches.push(
        await ensureBranch(api, manifest, save, `QA ${suffix} Branch ${i}`),
      );
    const warehouses = [];
    for (let i = 1; i <= 3; i++)
      warehouses.push(
        await ensureWarehouse(
          api,
          manifest,
          save,
          branches[i === 1 ? 0 : 1].id,
          `QA ${suffix} Warehouse ${i}`,
          `Q${suffix.slice(0, 6)}-${i}`,
        ),
      );
    const units = [];
    for (const [code, name, precision] of [
      [`EA${suffix.slice(0, 5)}`, "Each", 0],
      [`BOX${suffix.slice(0, 4)}`, "Box", 0],
    ]) {
      let unit = list(
        await api.get(
          `${ROOT}/catalog/units?${qp({ q: code, page: 1, page_size: 100 })}`,
        ),
      ).find((x) => x.code === code);
      if (!unit) {
        unit = await api.post(`${ROOT}/catalog/units`, {
          code,
          name,
          precision,
        });
        manifest.resources.units.push({ id: unit.id, name: code });
        await save();
      } else if (!manifest.resources.units.some((x) => x.id === unit.id)) {
        manifest.resources.units.push({ id: unit.id, name: code });
        await save();
      }
      units.push(unit);
    }
    const categories = [];
    for (let i = 1; i <= 3; i++)
      categories.push(
        await ensure(
          api,
          `${ROOT}/catalog/categories`,
          "categories",
          `QA ${suffix} Category ${i}`,
          { name: `QA ${suffix} Category ${i}` },
          manifest,
          save,
        ),
      );
    const products = [];
    for (let i = 1; i <= 6; i++) {
      const sku = `QA-${suffix}-P${i}`;
      let product = list(
        await api.get(
          `${ROOT}/catalog/products?${qp({ q: sku, page: 1, page_size: 100 })}`,
        ),
      ).find((x) => x.sku === sku);
      if (!product) {
        product = await api.post(`${ROOT}/catalog/products`, {
          name: `QA ${suffix} Product ${i}`,
          sku,
          barcode: `Q${suffix}${String(i).padStart(6, "0")}`,
          baseUnitId: units[0].id,
          categoryId: categories[(i - 1) % 3].id,
          defaultCost: "5000",
          costCurrency: "NGN",
          defaultSalePrice: "8000",
          saleCurrency: "NGN",
        });
        manifest.resources.products.push({
          id: product.id,
          name: product.name,
          sku,
        });
        await save();
      } else if (
        !manifest.resources.products.some((x) => x.id === product.id)
      ) {
        manifest.resources.products.push({
          id: product.id,
          name: product.name,
          sku,
        });
        await save();
      }
      products.push(product);
    }
    const suppliers = [];
    for (let i = 1; i <= 2; i++)
      suppliers.push(
        await ensure(
          api,
          `${ROOT}/procurement/suppliers`,
          "suppliers",
          `QA ${suffix} Supplier ${i}`,
          { name: `QA ${suffix} Supplier ${i}` },
          manifest,
          save,
        ),
      );
    const customers = [];
    for (let i = 1; i <= 3; i++)
      customers.push(
        await ensure(
          api,
          `${ROOT}/sales/customers`,
          "customers",
          `QA ${suffix} Customer ${i}`,
          { name: `QA ${suffix} Customer ${i}` },
          manifest,
          save,
        ),
      );
    const product = products[0],
      unit = units[0],
      source = warehouses[0],
      destination = warehouses[1],
      supplier = suppliers[0],
      customer = customers[0];

    currentOperation = "procurement.create_po";
    let po = list(
      await api.get(
        `${ROOT}/procurement/purchase-orders?${qp({ q: supplier.name, page: 1, page_size: 100 })}`,
      ),
    ).find((x) => x.supplierId === supplier.id);
    if (!po) {
      po = await api.post(`${ROOT}/procurement/purchase-orders`, {
        supplierId: supplier.id,
        warehouseId: source.id,
        currency: "NGN",
        lines: [
          {
            productId: product.id,
            unitId: unit.id,
            quantity: "100",
            unitCost: "5000",
          },
        ],
      });
      manifest.resources.purchaseOrders.push({ id: po.id, name: po.number });
      await save();
    } else if (!manifest.resources.purchaseOrders.some((x) => x.id === po.id)) {
      manifest.resources.purchaseOrders.push({ id: po.id, name: po.number });
      await save();
    }
    if (po.status === "DRAFT")
      await transition(
        api,
        manifest,
        `${ROOT}/procurement/purchase-orders/${po.id}/submit`,
        undefined,
        "po-submit",
        save,
      );
    po = await api.get(`${ROOT}/procurement/purchase-orders/${po.id}`);
    const poLine = po.lines.find((x) => x.productId === product.id);
    manifest.scenario = {
      productId: product.id,
      unitId: unit.id,
      sourceWarehouseId: source.id,
      destinationWarehouseId: destination.id,
      purchaseOrderId: po.id,
      purchaseOrderLineId: poLine.id,
      supplierId: supplier.id,
      customerId: customer.id,
    };
    await save();
    if (Number(poLine.receivedQuantity || 0) < 60) {
      const receipt = {
        lines: [{ purchaseOrderLineId: poLine.id, quantity: "60" }],
      };
      const first = await operation(
        api,
        manifest,
        `${ROOT}/procurement/purchase-orders/${po.id}/receipts`,
        "POST",
        receipt,
        "po-receive-60",
        save,
      );
      await operation(
        api,
        manifest,
        `${ROOT}/procurement/purchase-orders/${po.id}/receipts`,
        "POST",
        receipt,
        "po-receive-60",
        save,
      );
      if (!manifest.resources.receipts.some((x) => x.id === first.id)) {
        manifest.resources.receipts.push({
          id: first.id,
          purchaseOrderId: po.id,
        });
        await save();
      }
    }
    po = await api.get(`${ROOT}/procurement/purchase-orders/${po.id}`);
    const poLineCurrent = po.lines.find((x) => x.id === poLine.id);
    if (Number(poLineCurrent.receivedQuantity) < 100) {
      const second = await operation(
        api,
        manifest,
        `${ROOT}/procurement/purchase-orders/${po.id}/receipts`,
        "POST",
        { lines: [{ purchaseOrderLineId: poLine.id, quantity: "40" }] },
        "po-receive-40",
        save,
      );
      if (!manifest.resources.receipts.some((x) => x.id === second.id)) {
        manifest.resources.receipts.push({
          id: second.id,
          purchaseOrderId: po.id,
        });
        await save();
      }
    }
    const poReceipts = list(
      await api.get(`${ROOT}/procurement/purchase-orders/${po.id}/receipts`),
    );
    for (const receipt of poReceipts) {
      await remember(manifest, "receipts", receipt, { purchaseOrderId: po.id });
    }
    await save();
    currentOperation = "inventory.create_transfer";
    const transferCandidates = list(
      await api.get(
        `${ROOT}/inventory/transfers?${qp({ page: 1, page_size: 100 })}`,
      ),
    ).filter(
      (x) =>
        x.sourceWarehouseId === source.id &&
        x.destinationWarehouseId === destination.id,
    );
    let transfer;
    for (const candidate of transferCandidates) {
      const detail = await api.get(
        `${ROOT}/inventory/transfers/${candidate.id}`,
      );
      if (detail.note === `QA ${runId}`) {
        transfer = detail;
        break;
      }
    }
    if (!transfer) {
      transfer = await api.post(`${ROOT}/inventory/transfers`, {
        sourceWarehouseId: source.id,
        destinationWarehouseId: destination.id,
        note: `QA ${runId}`,
        lines: [{ productId: product.id, quantity: "30" }],
      });
      manifest.resources.transfers.push({ id: transfer.id });
      await save();
    } else if (
      !manifest.resources.transfers.some((x) => x.id === transfer.id)
    ) {
      manifest.resources.transfers.push({ id: transfer.id });
      await save();
    }
    if (transfer.status === "DRAFT")
      await transition(
        api,
        manifest,
        `${ROOT}/inventory/transfers/${transfer.id}/submit`,
        undefined,
        "transfer-submit",
        save,
      );
    transfer = await api.get(`${ROOT}/inventory/transfers/${transfer.id}`);
    if (["SUBMITTED", "APPROVED"].includes(transfer.status)) {
      await operation(
        api,
        manifest,
        `${ROOT}/inventory/transfers/${transfer.id}/dispatch`,
        "POST",
        undefined,
        "transfer-dispatch",
        save,
      );
      await operation(
        api,
        manifest,
        `${ROOT}/inventory/transfers/${transfer.id}/dispatch`,
        "POST",
        undefined,
        "transfer-dispatch",
        save,
      );
    }
    transfer = await api.get(`${ROOT}/inventory/transfers/${transfer.id}`);
    const transferLine = transfer.lines[0];
    const received = transferLine.receivedQuantity || "0";
    if (Number(received) < 30) {
      const receipt = {
        lines: [
          {
            transferLineId: transferLine.id,
            quantity: String(30 - Number(received)),
          },
        ],
      };
      await operation(
        api,
        manifest,
        `${ROOT}/inventory/transfers/${transfer.id}/receipts`,
        "POST",
        receipt,
        "transfer-receive-30",
        save,
      );
      await operation(
        api,
        manifest,
        `${ROOT}/inventory/transfers/${transfer.id}/receipts`,
        "POST",
        receipt,
        "transfer-receive-30",
        save,
      );
    }
    transfer = await api.get(`${ROOT}/inventory/transfers/${transfer.id}`);
    for (const receipt of transfer.receipts || []) {
      await remember(manifest, "transferReceipts", receipt, {
        transferId: transfer.id,
      });
    }
    await save();

    let sales = list(
      await api.get(
        `${ROOT}/sales/orders?${qp({ q: `QA ${suffix}`, page: 1, page_size: 100 })}`,
      ),
    ).find(
      (x) => x.customerId === customer.id && x.warehouseId === destination.id,
    );
    if (!sales) {
      operationKey(manifest, "sales-order-create");
      await save();
      sales = await api.post(
        `${ROOT}/sales/orders`,
        {
          customerId: customer.id,
          warehouseId: destination.id,
          currency: "NGN",
          notes: `QA ${runId}`,
          lines: [{ productId: product.id, quantity: "20", unitPrice: "8000" }],
        },
        manifest.idempotencyKeys["sales-order-create"],
      );
      manifest.completedOperations.push("sales-order-create");
      manifest.resources.salesOrders.push({
        id: sales.id,
        number: sales.number,
      });
      await save();
    } else if (!manifest.resources.salesOrders.some((x) => x.id === sales.id)) {
      manifest.resources.salesOrders.push({
        id: sales.id,
        number: sales.number,
      });
      await save();
    }
    if (sales.status === "DRAFT")
      await operation(
        api,
        manifest,
        `${ROOT}/sales/orders/${sales.id}/confirm`,
        "POST",
        undefined,
        "sales-order-confirm",
        save,
      );
    sales = await api.get(`${ROOT}/sales/orders/${sales.id}`);
    const salesLine = sales.lines[0];
    manifest.scenario.salesOrderId = sales.id;
    manifest.scenario.salesOrderLineId = salesLine.id;
    await save();
    for (const [label, quantity] of [
      ["sales-pick-10-a", "10"],
      ["sales-pick-10-b", "10"],
    ]) {
      const pick = await operation(
        api,
        manifest,
        `${ROOT}/sales/orders/${sales.id}/picks`,
        "POST",
        { lines: [{ salesOrderLineId: salesLine.id, quantity }] },
        label,
        save,
      );
      await remember(manifest, "picks", pick, { salesOrderId: sales.id });
      await save();
    }
    for (const [label, quantity] of [
      ["sales-fulfill-10-a", "10"],
      ["sales-fulfill-10-b", "10"],
    ]) {
      const command = { lines: [{ salesOrderLineId: salesLine.id, quantity }] };
      const fulfillment = await operation(
        api,
        manifest,
        `${ROOT}/sales/orders/${sales.id}/fulfillments`,
        "POST",
        command,
        label,
        save,
      );
      await remember(manifest, "fulfillments", fulfillment, {
        salesOrderId: sales.id,
      });
      await save();
      const replay = await operation(
        api,
        manifest,
        `${ROOT}/sales/orders/${sales.id}/fulfillments`,
        "POST",
        command,
        label,
        save,
      );
      await remember(manifest, "fulfillments", replay, {
        salesOrderId: sales.id,
      });
      await save();
    }

    let invoice = list(
      await api.get(
        `${ROOT}/sales/invoices?${qp({ q: sales.number, page: 1, page_size: 100 })}`,
      ),
    ).find((x) => x.salesOrderId === sales.id);
    if (!invoice) {
      invoice = await operation(
        api,
        manifest,
        `${ROOT}/sales/invoices`,
        "POST",
        { salesOrderId: sales.id, lines: [{ salesOrderLineId: salesLine.id }] },
        "invoice-create",
        save,
      );
      manifest.resources.invoices.push({ id: invoice.id });
      await save();
    } else if (!manifest.resources.invoices.some((x) => x.id === invoice.id)) {
      manifest.resources.invoices.push({ id: invoice.id });
      await save();
    }
    if (invoice.status === "DRAFT")
      invoice = await operation(
        api,
        manifest,
        `${ROOT}/sales/invoices/${invoice.id}/issue`,
        "POST",
        undefined,
        "invoice-issue",
        save,
      );
    const due = String(invoice.totalAmount || "160000");
    const half = formatScaled(scaled(due) / 2n);
    manifest.scenarioDate ??= new Date().toISOString().slice(0, 10);
    await save();
    const paymentBody = {
      invoiceId: invoice.id,
      amount: half,
      method: "BANK_TRANSFER",
      paymentDate: manifest.scenarioDate,
    };
    const first = await operation(
      api,
      manifest,
      `${ROOT}/sales/payments`,
      "POST",
      paymentBody,
      "payment-half-1",
      save,
    );
    if (!manifest.resources.payments.some((p) => p.id === first.id)) {
      manifest.resources.payments.push({
        id: first.id,
        invoiceId: invoice.id,
        amount: first.amount,
      });
      await save();
    }
    const second = await operation(
      api,
      manifest,
      `${ROOT}/sales/payments`,
      "POST",
      paymentBody,
      "payment-half-2",
      save,
    );
    if (!manifest.resources.payments.some((p) => p.id === second.id)) {
      manifest.resources.payments.push({
        id: second.id,
        invoiceId: invoice.id,
        amount: second.amount,
      });
      await save();
    }
    operationKey(manifest, "payment-reverse-half-2");
    await save();
    await api.post(
      `${ROOT}/sales/payments/${second.id}/reverse`,
      { reason: `QA replacement payment ${runId}` },
      manifest.idempotencyKeys["payment-reverse-half-2"],
    );
    if (!manifest.completedOperations.includes("payment-reverse-half-2"))
      manifest.completedOperations.push("payment-reverse-half-2");
    await save();
    const replacement = await operation(
      api,
      manifest,
      `${ROOT}/sales/payments`,
      "POST",
      paymentBody,
      "payment-replacement",
      save,
    );
    if (!manifest.resources.payments.some((p) => p.id === replacement.id)) {
      manifest.resources.payments.push({
        id: replacement.id,
        invoiceId: invoice.id,
        amount: replacement.amount,
      });
      await save();
    }
    manifest.scenario.invoiceId = invoice.id;
    manifest.stage = "seeded";
    await save();
    return { manifest, path };
  } catch (error) {
    manifest.failedOperations.push({
      operation: manifest.stage || currentOperation,
      error: error.code || error.name || "QA_ERROR",
      at: new Date().toISOString(),
    });
    await save();
    throw error;
  }
}

export async function verifyQaRun(env = process.env) {
  const { api, organization } = await connectQa(env);
  const runId = env.QA_RUN_ID;
  if (!runId) throw new Error("Set QA_RUN_ID to the run manifest to verify");
  const path = manifestPath(runId, env.QA_MANIFEST_DIR || ".qa-runs");
  const manifest = await loadManifest(path);
  if (
    manifest.organizationId !== organization.id ||
    manifest.environment !== env.QA_ENVIRONMENT
  )
    throw new Error(
      "QA manifest does not match the authorized organization/environment",
    );
  const ids = manifest.scenario;
  if (!ids) throw new Error("Manifest has no completed operational scenario");
  const po = await api.get(
    `${ROOT}/procurement/purchase-orders/${ids.purchaseOrderId}`,
  );
  const transfer = await api.get(
    `${ROOT}/inventory/transfers/${manifest.resources.transfers[0].id}`,
  );
  const order = await api.get(`${ROOT}/sales/orders/${ids.salesOrderId}`);
  const invoice = await api.get(`${ROOT}/sales/invoices/${ids.invoiceId}`);
  const customerSummary = await api.get(
    `${ROOT}/sales/customers/${ids.customerId}/financial-summary`,
  );
  const customerNgn = list(customerSummary).find(
    (row) => row.currency === "NGN",
  );
  const balances = [];
  const reconciliation = [];
  for (const warehouseId of [
    ids.sourceWarehouseId,
    ids.destinationWarehouseId,
  ]) {
    balances.push(
      ...list(
        await api.get(
          `/inventory/warehouses/${warehouseId}/balances?page=1&page_size=100`,
        ),
      ),
    );
    reconciliation.push(
      await api.get(`/inventory/warehouses/${warehouseId}/reconciliation`),
    );
  }
  const productBalances = balances.filter((x) => x.productId === ids.productId);
  const source = productBalances.find(
    (x) => x.warehouseId === ids.sourceWarehouseId,
  );
  const dest = productBalances.find(
    (x) => x.warehouseId === ids.destinationWarehouseId,
  );
  const allocations = list(
    await api.get(`${ROOT}/sales/invoices/${ids.invoiceId}/payments`),
  );
  const effective = allocations
    .filter((a) => !a.payment?.reversal)
    .reduce((n, a) => n + scaled(a.amount), 0n);
  const sourceQty = scaled(source?.onHand, 6);
  const destQty = scaled(dest?.onHand, 6);
  const inventoryValue =
    sourceQty * scaled(source?.averageCost) +
    destQty * scaled(dest?.averageCost);
  const salesReport = await api.get(
    `${ROOT}/reports/sales/products?${qp({ product_id: ids.productId, currency: "NGN", page: 1, page_size: 100 })}`,
  );
  const purchaseReport = await api.get(
    `${ROOT}/reports/purchases/products?${qp({ product_id: ids.productId, currency: "NGN", page: 1, page_size: 100 })}`,
  );
  const reportRows = [...list(salesReport), ...list(purchaseReport)];
  const checks = {
    purchaseReceived:
      scaled(
        po.lines?.find((x) => x.id === ids.purchaseOrderLineId)
          ?.receivedQuantity,
        6,
      ) ===
      100n * 1000000n,
    purchaseOrderValue: scaled(po.subtotal) === 500000n * 10000n,
    transferReceived: transfer.status === "RECEIVED",
    salesFulfilled:
      scaled(
        order.lines?.find((x) => x.id === ids.salesOrderLineId)
          ?.fulfilledQuantity,
        6,
      ) ===
      20n * 1000000n,
    salesOrderValue: scaled(order.total) === 160000n * 10000n,
    sourceQuantity: sourceQty === 70n * 1000000n,
    destinationQuantity: destQty === 10n * 1000000n,
    organizationQuantity: sourceQty + destQty === 80n * 1000000n,
    inventoryValuation: inventoryValue === 400000n * 10000000000n,
    invoiceValue: scaled(invoice.totalAmount) === 160000n * 10000n,
    effectivePayments: effective === 160000n * 10000n,
    zeroOutstanding: scaled(invoice.outstandingAmount) === 0n,
    paidStatus: invoice.paymentStatus === "PAID",
    customerHistoryReconciles:
      scaled(customerNgn?.outstanding) === 0n &&
      scaled(customerNgn?.paid) === 160000n * 10000n,
    ledgerReconciliation: reconciliation.every((r) => r.consistent === true),
    reportsPopulated: reportRows.length >= 2,
  };
  const report = {
    runId,
    organizationId: organization.id,
    stage: manifest.stage,
    checks,
    actual: {
      purchaseStatus: po.status,
      transferStatus: transfer.status,
      salesStatus: order.status,
      invoiceStatus: invoice.status,
      sourceQuantity: source?.onHand,
      destinationQuantity: dest?.onHand,
      inventoryValuation: formatScaled(inventoryValue, 10),
      invoiceValue: invoice.totalAmount,
      purchaseOrderValue: po.subtotal,
      salesOrderValue: order.total,
      effectivePayments: formatScaled(effective),
      outstanding: invoice.outstandingAmount,
      ledger: reconciliation,
    },
  };
  if (Object.values(checks).some((v) => v !== true)) {
    process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
    assertQaChecks(checks);
  }
  return report;
}

export function assertQaChecks(checks) {
  const failed = Object.entries(checks)
    .filter(([, passed]) => passed !== true)
    .map(([name]) => name);
  if (failed.length)
    throw new Error(`QA verification failed: ${failed.join(", ")}`);
  return true;
}
