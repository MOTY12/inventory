const ROOT = "/organizations/current";
const rows = (value) =>
  Array.isArray(value) ? value : value?.data || value?.items || [];
const scaled = (value, places = 4) => {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match) throw new Error("Invalid decimal in multi-currency scenario");
  const fraction = match[3] || "";
  if (fraction.length > places && /[1-9]/.test(fraction.slice(places)))
    throw new Error("Multi-currency value has unexpected precision");
  const result =
    BigInt(match[2]) * 10n ** BigInt(places) +
    BigInt(fraction.slice(0, places).padEnd(places, "0") || "0");
  return match[1] === "-" ? -result : result;
};
const key = (manifest, operation) => {
  manifest.idempotencyKeys[operation] ??= `${manifest.runId}-${operation}`;
  return manifest.idempotencyKeys[operation];
};
async function command(api, manifest, save, path, body, operation) {
  manifest.stage = operation;
  const result = await api.post(path, body, key(manifest, operation));
  if (!manifest.completedOperations.includes(operation))
    manifest.completedOperations.push(operation);
  await save();
  return result;
}
const remember = async (manifest, collection, item, extra = {}, save) => {
  const found = manifest.resources[collection].find(
    (resource) =>
      resource.id === item.id ||
      (extra.label && resource.label === extra.label),
  );
  if (!found) manifest.resources[collection].push({ id: item.id, ...extra });
  await save();
};

async function allPages(api, path, filters = {}) {
  const result = [];
  for (let page = 1; page <= 100; page += 1) {
    const url = new URL(`http://local${path}`);
    for (const [name, value] of Object.entries({
      ...filters,
      page,
      page_size: 100,
    }))
      url.searchParams.set(name, String(value));
    const response = await api.get(`${url.pathname}${url.search}`);
    const data = rows(response);
    result.push(...data);
    if (
      data.length < 100 ||
      (Number.isFinite(Number(response?.total)) &&
        result.length >= Number(response.total))
    )
      return result;
  }
  throw new Error(
    `Multi-currency recovery exceeded pagination limit for ${path}`,
  );
}

async function fixtureProduct(api, manifest, save, context, currency, suffix) {
  const label = `multi-${currency.toLowerCase()}-product`;
  const record = manifest.resources.products.find(
    (item) => item.label === label,
  );
  if (record) {
    const product = await api.get(`${ROOT}/catalog/products/${record.id}`);
    if (product.costCurrency !== currency || product.saleCurrency !== currency)
      throw new Error(`Recorded ${currency} product has mismatched currency`);
    return product;
  }
  const sku = `QA-${suffix}-MC-${currency}`;
  const found = rows(
    await api.get(
      `${ROOT}/catalog/products?q=${encodeURIComponent(sku)}&page=1&page_size=100`,
    ),
  ).find((item) => item.sku === sku);
  if (found) {
    if (found.costCurrency !== currency || found.saleCurrency !== currency)
      throw new Error(`Recovered ${currency} product has mismatched currency`);
    await remember(manifest, "products", found, { label, sku }, save);
    return found;
  }
  const product = await api.post(`${ROOT}/catalog/products`, {
    name: `QA ${suffix} ${currency} Multi Currency Product`,
    sku,
    baseUnitId: context.unit.id,
    categoryId: context.category.id,
    defaultCost: currency === "NGN" ? "5000" : "10",
    costCurrency: currency,
    defaultSalePrice: currency === "NGN" ? "8000" : "18",
    saleCurrency: currency,
  });
  await remember(manifest, "products", product, { label, sku }, save);
  return product;
}

async function fixturePurchase(api, manifest, save, context, product, spec) {
  const label = `multi-${spec.currency.toLowerCase()}-purchase`;
  let record = manifest.resources.purchaseOrders.find(
    (item) => item.label === label,
  );
  let order = record
    ? await api.get(`${ROOT}/procurement/purchase-orders/${record.id}`)
    : undefined;
  const matches = (candidate) =>
    candidate.supplierId === context.supplier.id &&
    candidate.warehouseId === context.source.id &&
    candidate.currency === spec.currency &&
    candidate.lines?.length === 1 &&
    candidate.lines[0].productId === product.id &&
    scaled(candidate.lines[0].orderedQuantity, 6) ===
      BigInt(spec.purchaseQuantity) * 1000000n &&
    scaled(candidate.lines[0].unitCost) === scaled(spec.unitCost);
  if (order && !matches(order))
    throw new Error(
      `Recorded ${spec.currency} purchase does not match this fixture`,
    );
  if (!order) {
    const candidates = [];
    for (const summary of await allPages(
      api,
      `${ROOT}/procurement/purchase-orders`,
      { q: context.supplier.name },
    )) {
      const detail = await api.get(
        `${ROOT}/procurement/purchase-orders/${summary.id}`,
      );
      if (matches(detail)) candidates.push(detail);
    }
    if (candidates.length > 1)
      throw new Error(`Ambiguous ${spec.currency} purchase recovery`);
    order = candidates[0];
  }
  if (!order) {
    order = await api.post(`${ROOT}/procurement/purchase-orders`, {
      supplierId: context.supplier.id,
      warehouseId: context.source.id,
      currency: spec.currency,
      lines: [
        {
          productId: product.id,
          unitId: context.unit.id,
          quantity: String(spec.purchaseQuantity),
          unitCost: spec.unitCost,
        },
      ],
    });
    await remember(
      manifest,
      "purchaseOrders",
      order,
      { label, number: order.number },
      save,
    );
  } else if (!record)
    await remember(
      manifest,
      "purchaseOrders",
      order,
      { label, number: order.number },
      save,
    );
  if (order.status === "DRAFT") {
    await command(
      api,
      manifest,
      save,
      `${ROOT}/procurement/purchase-orders/${order.id}/submit`,
      undefined,
      `${label}-submit`,
    );
    order = await api.get(`${ROOT}/procurement/purchase-orders/${order.id}`);
  }
  const line = order.lines[0];
  if (
    scaled(line.receivedQuantity, 6) <
    BigInt(spec.purchaseQuantity) * 1000000n
  ) {
    await command(
      api,
      manifest,
      save,
      `${ROOT}/procurement/purchase-orders/${order.id}/receipts`,
      {
        lines: [
          {
            purchaseOrderLineId: line.id,
            quantity: String(spec.purchaseQuantity),
          },
        ],
        note: `QA ${manifest.runId} ${label}`,
      },
      `${label}-receive`,
    );
    order = await api.get(`${ROOT}/procurement/purchase-orders/${order.id}`);
  }
  if (
    order.status !== "RECEIVED" ||
    scaled(order.lines[0].receivedQuantity, 6) !==
      BigInt(spec.purchaseQuantity) * 1000000n
  )
    throw new Error(`${spec.currency} purchase did not fully receive`);
  return order;
}

async function fixtureSale(api, manifest, save, context, product, spec) {
  const label = `multi-${spec.currency.toLowerCase()}-sale`;
  let record = manifest.resources.salesOrders.find(
    (item) => item.label === label,
  );
  let order = record
    ? await api.get(`${ROOT}/sales/orders/${record.id}`)
    : undefined;
  if (
    order &&
    (order.customerId !== context.customer.id ||
      order.warehouseId !== context.source.id ||
      order.currency !== spec.currency ||
      order.lines?.length !== 1 ||
      order.lines[0].productId !== product.id ||
      scaled(order.lines[0].orderedQuantity, 6) !==
        BigInt(spec.salesQuantity) * 1000000n ||
      scaled(order.lines[0].unitPrice) !== scaled(spec.unitPrice))
  )
    throw new Error(
      `Recorded ${spec.currency} sale does not match this fixture`,
    );
  if (!order) {
    const operation = `${label}-create`;
    manifest.stage = operation;
    await save();
    order = await api.post(
      `${ROOT}/sales/orders`,
      {
        customerId: context.customer.id,
        warehouseId: context.source.id,
        currency: spec.currency,
        notes: `QA ${manifest.runId} ${label}`,
        lines: [
          {
            productId: product.id,
            quantity: String(spec.salesQuantity),
            unitPrice: spec.unitPrice,
          },
        ],
      },
      key(manifest, operation),
    );
    await remember(
      manifest,
      "salesOrders",
      order,
      { label, number: order.number },
      save,
    );
  }
  if (order.status === "DRAFT") {
    await command(
      api,
      manifest,
      save,
      `${ROOT}/sales/orders/${order.id}/confirm`,
      undefined,
      `${label}-confirm`,
    );
    order = await api.get(`${ROOT}/sales/orders/${order.id}`);
  }
  let line = order.lines[0];
  const quantity = BigInt(spec.salesQuantity) * 1000000n;
  let picked = scaled(line.pickedQuantity || "0", 6);
  if (picked < quantity) {
    await command(
      api,
      manifest,
      save,
      `${ROOT}/sales/orders/${order.id}/picks`,
      {
        lines: [
          { salesOrderLineId: line.id, quantity: String(spec.salesQuantity) },
        ],
      },
      `${label}-pick`,
    );
    order = await api.get(`${ROOT}/sales/orders/${order.id}`);
    line = order.lines[0];
    picked = scaled(line.pickedQuantity || "0", 6);
  }
  const fulfilled = scaled(line.fulfilledQuantity || "0", 6);
  if (picked < quantity)
    throw new Error(`${spec.currency} sale is not fully picked`);
  if (fulfilled < quantity) {
    await command(
      api,
      manifest,
      save,
      `${ROOT}/sales/orders/${order.id}/fulfillments`,
      {
        lines: [
          { salesOrderLineId: line.id, quantity: String(spec.salesQuantity) },
        ],
      },
      `${label}-fulfill`,
    );
    order = await api.get(`${ROOT}/sales/orders/${order.id}`);
  }
  if (order.status !== "FULFILLED")
    throw new Error(`${spec.currency} sale did not fully fulfill`);
  return order;
}

async function fixtureInvoice(api, manifest, save, order, spec) {
  const label = `multi-${spec.currency.toLowerCase()}-invoice`;
  let record = manifest.resources.invoices.find((item) => item.label === label);
  let invoice = record
    ? await api.get(`${ROOT}/sales/invoices/${record.id}`)
    : undefined;
  if (
    invoice &&
    (invoice.salesOrderId !== order.id ||
      invoice.currency !== spec.currency ||
      scaled(invoice.totalAmount) !== scaled(spec.invoiceAmount))
  )
    throw new Error(
      `Recorded ${spec.currency} invoice does not match this fixture`,
    );
  if (!invoice) {
    const operation = `${label}-create`;
    invoice = await command(
      api,
      manifest,
      save,
      `${ROOT}/sales/invoices`,
      {
        salesOrderId: order.id,
        lines: order.lines.map((line) => ({ salesOrderLineId: line.id })),
      },
      operation,
    );
    await remember(
      manifest,
      "invoices",
      invoice,
      { label, salesOrderId: order.id },
      save,
    );
  }
  if (invoice.status === "DRAFT") {
    await command(
      api,
      manifest,
      save,
      `${ROOT}/sales/invoices/${invoice.id}/issue`,
      undefined,
      `${label}-issue`,
    );
    invoice = await api.get(`${ROOT}/sales/invoices/${invoice.id}`);
  }
  const paymentLabel = `${label}-payment`;
  let paymentRecord = manifest.resources.payments.find(
    (item) => item.label === paymentLabel,
  );
  let payment = paymentRecord
    ? await api.get(`${ROOT}/sales/payments/${paymentRecord.id}`)
    : undefined;
  if (!payment) {
    payment = await command(
      api,
      manifest,
      save,
      `${ROOT}/sales/payments`,
      {
        invoiceId: invoice.id,
        amount: spec.paymentAmount,
        method: "BANK_TRANSFER",
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentReference: `${manifest.runId}-${paymentLabel}`,
      },
      `${paymentLabel}-record`,
    );
    await remember(
      manifest,
      "payments",
      payment,
      { label: paymentLabel, invoiceId: invoice.id, amount: payment.amount },
      save,
    );
  }
  const fresh = await api.get(`${ROOT}/sales/invoices/${invoice.id}`);
  if (
    fresh.status !== "ISSUED" ||
    fresh.currency !== spec.currency ||
    scaled(fresh.totalAmount) !== scaled(spec.invoiceAmount) ||
    scaled(fresh.amountPaid) !== scaled(spec.paymentAmount) ||
    scaled(fresh.outstandingAmount) !== scaled(spec.outstanding)
  )
    throw new Error(`${spec.currency} invoice/payment totals do not reconcile`);
  return fresh;
}

export async function seedMultiCurrency(api, manifest, save, context) {
  const suffix = manifest.runId.slice(-8).toUpperCase();
  const specs = [
    {
      currency: "NGN",
      purchaseQuantity: 100,
      unitCost: "5000",
      purchaseValue: "500000",
      salesQuantity: 20,
      unitPrice: "8000",
      invoiceAmount: "160000",
      paymentAmount: "100000",
      outstanding: "60000",
      remainingQuantity: 80,
      inventoryValue: "400000",
    },
    {
      currency: "USD",
      purchaseQuantity: 50,
      unitCost: "10",
      purchaseValue: "500",
      salesQuantity: 10,
      unitPrice: "18",
      invoiceAmount: "180",
      paymentAmount: "80",
      outstanding: "100",
      remainingQuantity: 40,
      inventoryValue: "400",
    },
  ];
  const outcomes = [];
  for (const spec of specs) {
    const product = await fixtureProduct(
      api,
      manifest,
      save,
      context,
      spec.currency,
      suffix,
    );
    const purchase = await fixturePurchase(
      api,
      manifest,
      save,
      context,
      product,
      spec,
    );
    const order = await fixtureSale(
      api,
      manifest,
      save,
      context,
      product,
      spec,
    );
    const invoice = await fixtureInvoice(api, manifest, save, order, spec);
    const outcome = {
      currency: spec.currency,
      productId: product.id,
      purchaseOrderId: purchase.id,
      salesOrderId: order.id,
      invoiceId: invoice.id,
      customerId: context.customer.id,
      supplierId: context.supplier.id,
      purchaseValue: spec.purchaseValue,
      invoiceValue: spec.invoiceAmount,
      payments: spec.paymentAmount,
      outstanding: spec.outstanding,
      remainingQuantity: String(spec.remainingQuantity),
      inventoryValue: spec.inventoryValue,
    };
    manifest.resources.scenarioRecords ??= [];
    if (
      !manifest.resources.scenarioRecords.some(
        (record) => record.id === product.id,
      )
    )
      manifest.resources.scenarioRecords.push({
        id: product.id,
        label: `multi-${spec.currency.toLowerCase()}`,
      });
    outcomes.push(outcome);
    await save();
  }
  manifest.scenarioResult = {
    scenario: "multi-currency",
    currencies: outcomes,
  };
  manifest.stage = "seeded";
  await save();
  return manifest.scenarioResult;
}

export async function verifyMultiCurrency(api, manifest) {
  const expected = [
    {
      currency: "NGN",
      purchaseValue: "500000",
      invoiceValue: "160000",
      collections: "100000",
      outstanding: "60000",
      quantity: "80",
      valuation: "400000",
      ordered: "100",
      received: "100",
      sold: "20",
    },
    {
      currency: "USD",
      purchaseValue: "500",
      invoiceValue: "180",
      collections: "80",
      outstanding: "100",
      quantity: "40",
      valuation: "400",
      ordered: "50",
      received: "50",
      sold: "10",
    },
  ];
  const fixtures = manifest.scenarioResult?.currencies;
  if (
    !Array.isArray(fixtures) ||
    fixtures.length !== 2 ||
    fixtures.map((x) => x.currency).join(",") !== "NGN,USD"
  )
    throw new Error(
      "Multi-currency verification requires NGN and USD fixture results",
    );
  const fixtureIds = fixtures.flatMap((fixture) => [
    fixture.productId,
    fixture.purchaseOrderId,
    fixture.salesOrderId,
    fixture.invoiceId,
  ]);
  if (
    fixtureIds.some((id) => typeof id !== "string" || !id) ||
    new Set(fixtureIds).size !== fixtureIds.length
  )
    throw new Error(
      "Multi-currency fixtures contain missing or duplicated resource IDs",
    );
  const query = (values) => new URLSearchParams(values).toString();
  const checks = {};
  for (const spec of expected) {
    const fixture = fixtures.find((item) => item.currency === spec.currency);
    const purchase = await api.get(
      `${ROOT}/procurement/purchase-orders/${fixture.purchaseOrderId}`,
    );
    const order = await api.get(`${ROOT}/sales/orders/${fixture.salesOrderId}`);
    const invoice = await api.get(
      `${ROOT}/sales/invoices/${fixture.invoiceId}`,
    );
    const filter = {
      from: new Date().toISOString().slice(0, 10),
      to: new Date().toISOString().slice(0, 10),
      warehouse_id: purchase.warehouseId,
      currency: spec.currency,
    };
    const salesSummary = await api.get(
      `${ROOT}/reports/sales/summary?${query(filter)}`,
    );
    const purchaseSummary = await api.get(
      `${ROOT}/reports/purchases/summary?${query(filter)}`,
    );
    const salesProducts = await api.get(
      `${ROOT}/reports/sales/products?${query({ ...filter, product_id: fixture.productId })}`,
    );
    const purchaseProducts = await api.get(
      `${ROOT}/reports/purchases/products?${query({ ...filter, product_id: fixture.productId })}`,
    );
    const customerPerformance = await api.get(
      `${ROOT}/reports/sales/customers?${query({ ...filter, customer_id: fixture.customerId })}`,
    );
    const supplierPerformance = await api.get(
      `${ROOT}/reports/purchases/suppliers?${query({ ...filter, supplier_id: fixture.supplierId })}`,
    );
    const aging = await api.get(
      `${ROOT}/reports/receivables/aging?${query({ warehouse_id: purchase.warehouseId, currency: spec.currency, customer_id: fixture.customerId })}`,
    );
    const valuation = await api.get(
      `${ROOT}/reports/valuation?${query({ warehouse_id: purchase.warehouseId, product_id: fixture.productId })}`,
    );
    const sumFor = (array, currency, field) =>
      rows(array)
        .filter((item) => item.currency === currency)
        .reduce((sum, item) => sum + scaled(item[field]), 0n);
    const inventory = rows(valuation.data).find(
      (item) =>
        item.product_id === fixture.productId &&
        item.cost_currency === spec.currency,
    );
    checks[spec.currency] =
      purchase.currency === spec.currency &&
      order.currency === spec.currency &&
      invoice.currency === spec.currency &&
      scaled(purchase.subtotal) === scaled(spec.purchaseValue) &&
      scaled(purchase.lines[0].receivedQuantity, 6) ===
        BigInt(spec.received) * 1000000n &&
      scaled(order.total) === scaled(spec.invoiceValue) &&
      scaled(order.lines[0].fulfilledQuantity, 6) ===
        BigInt(spec.sold) * 1000000n &&
      scaled(invoice.totalAmount) === scaled(spec.invoiceValue) &&
      scaled(invoice.amountPaid) === scaled(spec.collections) &&
      scaled(invoice.outstandingAmount) === scaled(spec.outstanding) &&
      sumFor(salesSummary.order_value, spec.currency, "order_value") >=
        scaled(spec.invoiceValue) &&
      sumFor(salesSummary.invoice_value, spec.currency, "invoice_value") >=
        scaled(spec.invoiceValue) &&
      sumFor(salesSummary.collections, spec.currency, "collected") >=
        scaled(spec.collections) &&
      sumFor(salesSummary.receivables, spec.currency, "outstanding") >=
        scaled(spec.outstanding) &&
      sumFor(purchaseSummary.order_value, spec.currency, "order_value") >=
        scaled(spec.purchaseValue) &&
      sumFor(purchaseSummary.received_value, spec.currency, "received_value") >=
        scaled(spec.purchaseValue) &&
      rows(salesProducts.data).some(
        (item) =>
          item.product_id === fixture.productId &&
          item.currency === spec.currency &&
          scaled(item.invoice_value) === scaled(spec.invoiceValue),
      ) &&
      rows(purchaseProducts.data).some(
        (item) =>
          item.product_id === fixture.productId &&
          item.currency === spec.currency &&
          scaled(item.received_value) === scaled(spec.purchaseValue),
      ) &&
      rows(customerPerformance.data).some(
        (item) =>
          item.currency === spec.currency &&
          scaled(item.invoiced_value) >= scaled(spec.invoiceValue) &&
          scaled(item.outstanding) >= scaled(spec.outstanding),
      ) &&
      rows(supplierPerformance.data).some(
        (item) =>
          item.currency === spec.currency &&
          scaled(item.ordered_value) >= scaled(spec.purchaseValue) &&
          scaled(item.received_value) >= scaled(spec.purchaseValue),
      ) &&
      rows(aging.data).some(
        (item) =>
          item.currency === spec.currency &&
          scaled(item.not_yet_due) +
            scaled(item.days_1_30) +
            scaled(item.days_31_60) +
            scaled(item.days_61_90) +
            scaled(item.over_90) +
            scaled(item.no_due_date_outstanding) >=
            scaled(spec.outstanding),
      ) &&
      !!inventory &&
      scaled(inventory.quantity_on_hand, 6) ===
        BigInt(spec.quantity) * 1000000n &&
      scaled(inventory.inventory_value) === scaled(spec.valuation) &&
      scaled(fixture.purchaseValue) === scaled(spec.purchaseValue) &&
      scaled(fixture.invoiceValue) === scaled(spec.invoiceValue) &&
      scaled(fixture.payments) === scaled(spec.collections) &&
      scaled(fixture.outstanding) === scaled(spec.outstanding) &&
      scaled(fixture.remainingQuantity, 6) ===
        BigInt(spec.quantity) * 1000000n &&
      scaled(fixture.inventoryValue) === scaled(spec.valuation);
  }
  if (!Object.values(checks).every(Boolean))
    throw new Error(
      `Multi-currency reconciliation failed: ${Object.entries(checks)
        .filter(([, ok]) => !ok)
        .map(([currency]) => currency)
        .join(", ")}`,
    );
  return { currencies: checks, automaticConversion: false };
}
