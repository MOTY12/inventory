const ROOT = "/organizations/current";
const list = (value) =>
  Array.isArray(value) ? value : value?.data || value?.items || [];
const quantityScaled = (value) => {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match) throw new Error("Unexpected quantity in document-state fixture");
  const fraction = match[2] || "";
  if (fraction.length > 6 && /[1-9]/.test(fraction.slice(6)))
    throw new Error("Document-state fixture quantity has excess precision");
  return (
    BigInt(match[1]) * 1000000n +
    BigInt(fraction.slice(0, 6).padEnd(6, "0") || "0")
  );
};
const moneyScaled = (value) => {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match) throw new Error("Unexpected amount in document-state fixture");
  const fraction = match[2] || "";
  if (fraction.length > 4 && /[1-9]/.test(fraction.slice(4)))
    throw new Error("Document-state fixture amount has excess precision");
  return (
    BigInt(match[1]) * 10000n +
    BigInt(fraction.slice(0, 4).padEnd(4, "0") || "0")
  );
};
const formatQuantity = (scaled) => {
  const whole = scaled / 1000000n;
  const fraction = (scaled % 1000000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
};

function key(manifest, operation) {
  manifest.idempotencyKeys[operation] ??= `${manifest.runId}-${operation}`;
  return manifest.idempotencyKeys[operation];
}

async function command(api, manifest, save, path, body, operation) {
  manifest.stage = operation;
  const commandKey = key(manifest, operation);
  await save();
  const result = await api.post(path, body, commandKey);
  if (!manifest.completedOperations.includes(operation))
    manifest.completedOperations.push(operation);
  manifest.failedOperations = manifest.failedOperations.filter(
    (item) => item.operation !== operation,
  );
  await save();
  return result;
}

async function findPurchaseOrder(api, expected) {
  const response = await api.get(
    `${ROOT}/procurement/purchase-orders?page=1&page_size=100&q=${encodeURIComponent(expected.supplier.name)}`,
  );
  const candidates = [];
  for (const summary of list(response)) {
    const order = await api.get(
      `${ROOT}/procurement/purchase-orders/${summary.id}`,
    );
    if (
      order.supplierId === expected.supplier.id &&
      order.warehouseId === expected.warehouse.id &&
      order.currency === "NGN" &&
      order.lines?.length === 1 &&
      order.lines[0].productId === expected.product.id &&
      order.lines[0].unitId === expected.unit.id &&
      String(order.lines[0].orderedQuantity) === expected.quantity &&
      moneyScaled(order.lines[0].unitCost) === 5000n * 10000n
    )
      candidates.push(order);
  }
  if (candidates.length > 1)
    throw new Error("Ambiguous document-state purchase order recovery");
  return candidates[0];
}

async function purchase(
  api,
  manifest,
  save,
  { label, product, supplier, warehouse, unit, quantity, state },
) {
  const saved = manifest.resources.purchaseOrders.find(
    (item) => item.label === label,
  );
  let order = saved
    ? await api.get(`${ROOT}/procurement/purchase-orders/${saved.id}`)
    : await findPurchaseOrder(api, {
        supplier,
        warehouse,
        product,
        unit,
        quantity: `${quantity}.000000`,
      });
  if (!order) {
    manifest.stage = `document-states-${label}-create`;
    await save();
    order = await api.post(`${ROOT}/procurement/purchase-orders`, {
      supplierId: supplier.id,
      warehouseId: warehouse.id,
      currency: "NGN",
      lines: [
        { productId: product.id, unitId: unit.id, quantity, unitCost: "5000" },
      ],
    });
  }
  if (!manifest.resources.purchaseOrders.some((item) => item.id === order.id)) {
    manifest.resources.purchaseOrders.push({
      id: order.id,
      label,
      name: order.number,
    });
    await save();
  }
  if (state === "CANCELLED" && order.status === "DRAFT") {
    await command(
      api,
      manifest,
      save,
      `${ROOT}/procurement/purchase-orders/${order.id}/cancel`,
      undefined,
      `document-states-${label}-cancel`,
    );
  } else if (state !== "DRAFT" && order.status === "DRAFT") {
    await api.post(`${ROOT}/procurement/purchase-orders/${order.id}/submit`);
  }
  order = await api.get(`${ROOT}/procurement/purchase-orders/${order.id}`);
  const line = order.lines[0];
  const received = quantityScaled(line.receivedQuantity);
  const target =
    state === "PARTIALLY_RECEIVED"
      ? 1000000n
      : state === "RECEIVED"
        ? quantityScaled(quantity)
        : 0n;
  if (target > received) {
    await command(
      api,
      manifest,
      save,
      `${ROOT}/procurement/purchase-orders/${order.id}/receipts`,
      {
        lines: [
          {
            purchaseOrderLineId: line.id,
            quantity: formatQuantity(target - received),
          },
        ],
      },
      `document-states-${label}-receive-${formatQuantity(target)}`,
    );
  }
  order = await api.get(`${ROOT}/procurement/purchase-orders/${order.id}`);
  if (order.status !== state)
    throw new Error(
      `Purchase order ${label} expected ${state}, got ${order.status}`,
    );
  return order;
}

async function salesOrder(
  api,
  manifest,
  save,
  { label, product, customer, warehouse, quantity, status },
) {
  const existing = manifest.resources.salesOrders.find(
    (item) => item.label === label,
  );
  let order = existing
    ? await api.get(`${ROOT}/sales/orders/${existing.id}`)
    : undefined;
  if (!order) {
    const commandKey = key(manifest, `document-states-${label}-create`);
    manifest.stage = `document-states-${label}-create`;
    await save();
    order = await api.post(
      `${ROOT}/sales/orders`,
      {
        customerId: customer.id,
        warehouseId: warehouse.id,
        currency: "NGN",
        notes: `QA ${manifest.runId} ${label}`,
        lines: [{ productId: product.id, quantity, unitPrice: "8000" }],
      },
      commandKey,
    );
    manifest.resources.salesOrders.push({
      id: order.id,
      label,
      number: order.number,
    });
    await save();
  }
  const line = order.lines[0];
  if (status === "CANCELLED" && order.status === "DRAFT") {
    await command(
      api,
      manifest,
      save,
      `${ROOT}/sales/orders/${order.id}/cancel`,
      undefined,
      `document-states-${label}-cancel`,
    );
  } else if (
    ["CONFIRMED", "PARTIALLY_FULFILLED", "FULFILLED"].includes(status) &&
    order.status === "DRAFT"
  ) {
    await command(
      api,
      manifest,
      save,
      `${ROOT}/sales/orders/${order.id}/confirm`,
      undefined,
      `document-states-${label}-confirm`,
    );
  }
  if (
    status === "PARTIALLY_FULFILLED" &&
    quantityScaled(line.pickedQuantity) < 1000000n
  ) {
    await command(
      api,
      manifest,
      save,
      `${ROOT}/sales/orders/${order.id}/picks`,
      { lines: [{ salesOrderLineId: line.id, quantity: "1" }] },
      `document-states-${label}-pick`,
    );
    await command(
      api,
      manifest,
      save,
      `${ROOT}/sales/orders/${order.id}/fulfillments`,
      { lines: [{ salesOrderLineId: line.id, quantity: "1" }] },
      `document-states-${label}-fulfill`,
    );
  }
  if (
    status === "FULFILLED" &&
    quantityScaled(line.fulfilledQuantity) < quantityScaled(quantity)
  ) {
    const remaining =
      quantityScaled(quantity) - quantityScaled(line.pickedQuantity || "0");
    if (remaining > 0n)
      await command(
        api,
        manifest,
        save,
        `${ROOT}/sales/orders/${order.id}/picks`,
        {
          lines: [
            { salesOrderLineId: line.id, quantity: formatQuantity(remaining) },
          ],
        },
        `document-states-${label}-pick`,
      );
    await command(
      api,
      manifest,
      save,
      `${ROOT}/sales/orders/${order.id}/fulfillments`,
      {
        lines: [
          {
            salesOrderLineId: line.id,
            quantity: formatQuantity(
              quantityScaled(quantity) -
                quantityScaled(line.fulfilledQuantity || "0"),
            ),
          },
        ],
      },
      `document-states-${label}-fulfill`,
    );
  }
  order = await api.get(`${ROOT}/sales/orders/${order.id}`);
  if (order.status !== status)
    throw new Error(
      `Sales order ${label} expected ${status}, got ${order.status}`,
    );
  return order;
}

export async function seedDocumentStates(api, manifest, save, context) {
  const { products, unit, supplier, customer, source } = context;
  const purchases = [
    ["po-draft", 0, "2", "DRAFT"],
    ["po-open", 1, "2", "SUBMITTED"],
    ["po-partial", 2, "2", "PARTIALLY_RECEIVED"],
    ["po-received", 3, "10", "RECEIVED"],
    ["po-cancelled", 4, "2", "CANCELLED"],
    ["po-sales-stock", 5, "10", "RECEIVED"],
  ];
  const purchaseOrders = [];
  for (const [label, index, quantity, state] of purchases) {
    purchaseOrders.push(
      await purchase(api, manifest, save, {
        label,
        product: products[index],
        supplier,
        warehouse: source,
        unit,
        quantity,
        state,
      }),
    );
  }
  const orders = [];
  for (const item of [
    { label: "so-draft", product: products[5], quantity: "1", status: "DRAFT" },
    {
      label: "so-confirmed",
      product: products[5],
      quantity: "1",
      status: "CONFIRMED",
    },
    {
      label: "so-partial",
      product: products[3],
      quantity: "2",
      status: "PARTIALLY_FULFILLED",
    },
    {
      label: "so-fulfilled",
      product: products[3],
      quantity: "2",
      status: "FULFILLED",
    },
    {
      label: "so-cancelled",
      product: products[5],
      quantity: "1",
      status: "CANCELLED",
    },
  ]) {
    orders.push(
      await salesOrder(api, manifest, save, {
        ...item,
        customer,
        warehouse: source,
      }),
    );
  }
  manifest.scenarioResult = {
    scenario: "document-states",
    purchaseOrders: purchaseOrders.map(({ id, status, lines }) => ({
      id,
      status,
      orderedQuantity: String(lines[0].orderedQuantity),
      receivedQuantity: String(lines[0].receivedQuantity),
    })),
    salesOrders: orders.map(({ id, status, lines }) => ({
      id,
      status,
      orderedQuantity: String(lines[0].orderedQuantity),
      pickedQuantity: String(lines[0].pickedQuantity),
      fulfilledQuantity: String(lines[0].fulfilledQuantity),
    })),
  };
  manifest.stage = "seeded";
  await save();
  return manifest.scenarioResult;
}

export async function verifyDocumentStates(api, manifest) {
  const expectedPurchase = [
    "DRAFT",
    "SUBMITTED",
    "PARTIALLY_RECEIVED",
    "RECEIVED",
    "CANCELLED",
    "RECEIVED",
  ];
  const expectedPurchaseQuantities = [
    ["2", "0"],
    ["2", "0"],
    ["2", "1"],
    ["10", "10"],
    ["2", "0"],
    ["10", "10"],
  ];
  const expectedSales = [
    "DRAFT",
    "CONFIRMED",
    "PARTIALLY_FULFILLED",
    "FULFILLED",
    "CANCELLED",
  ];
  const expectedSalesQuantities = [
    ["1", "0", "0"],
    ["1", "0", "0"],
    ["2", "1", "1"],
    ["2", "2", "2"],
    ["1", "0", "0"],
  ];
  const checks = {};
  for (const [i, item] of manifest.scenarioResult.purchaseOrders.entries()) {
    const order = await api.get(
      `${ROOT}/procurement/purchase-orders/${item.id}`,
    );
    checks[`purchase_${i + 1}_${expectedPurchase[i].toLowerCase()}`] =
      order.status === expectedPurchase[i] &&
      item.status === expectedPurchase[i] &&
      quantityScaled(order.lines[0]?.orderedQuantity) ===
        quantityScaled(expectedPurchaseQuantities[i][0]) &&
      quantityScaled(order.lines[0]?.receivedQuantity) ===
        quantityScaled(expectedPurchaseQuantities[i][1]);
  }
  for (const [i, item] of manifest.scenarioResult.salesOrders.entries()) {
    const order = await api.get(`${ROOT}/sales/orders/${item.id}`);
    checks[`sales_${i + 1}_${expectedSales[i].toLowerCase()}`] =
      order.status === expectedSales[i] &&
      item.status === expectedSales[i] &&
      quantityScaled(order.lines[0]?.orderedQuantity) ===
        quantityScaled(expectedSalesQuantities[i][0]) &&
      quantityScaled(order.lines[0]?.pickedQuantity) ===
        quantityScaled(expectedSalesQuantities[i][1]) &&
      quantityScaled(order.lines[0]?.fulfilledQuantity) ===
        quantityScaled(expectedSalesQuantities[i][2]);
  }
  const failed = Object.entries(checks)
    .filter(([, valid]) => valid !== true)
    .map(([name]) => name);
  if (failed.length)
    throw new Error(`Document-state verification failed: ${failed.join(", ")}`);
  return { scenario: "document-states", checks };
}
