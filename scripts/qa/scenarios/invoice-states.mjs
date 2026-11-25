const ROOT = "/organizations/current";
const money = (value) => {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match) throw new Error("Invalid monetary value in invoice fixture");
  const fraction = match[3] || "";
  if (fraction.length > 4 && /[1-9]/.test(fraction.slice(4)))
    throw new Error("Invoice fixture amount exceeds four decimal places");
  const amount =
    BigInt(match[2]) * 10000n +
    BigInt(fraction.slice(0, 4).padEnd(4, "0") || "0");
  return match[1] === "-" ? -amount : amount;
};
const idempotencyKey = (manifest, name) => {
  manifest.idempotencyKeys[name] ??= `${manifest.runId}-${name}`;
  return manifest.idempotencyKeys[name];
};

async function post(api, manifest, save, path, body, operation) {
  manifest.stage = operation;
  const key = idempotencyKey(manifest, operation);
  await save();
  const result = await api.post(path, body, key);
  if (!manifest.completedOperations.includes(operation))
    manifest.completedOperations.push(operation);
  manifest.failedOperations = manifest.failedOperations.filter(
    (item) => item.operation !== operation,
  );
  await save();
  return result;
}

function resource(collection, label) {
  return collection.find((item) => item.label === label);
}

async function ensureInvoiceOrder(api, manifest, save, context, label) {
  const { customer, source, products } = context;
  let record = resource(manifest.resources.salesOrders, `invoice-${label}`);
  let order = record
    ? await api.get(`${ROOT}/sales/orders/${record.id}`)
    : undefined;
  const note = `QA ${manifest.runId} invoice-${label}`;
  if (order) {
    if (
      order.customerId !== customer.id ||
      order.warehouseId !== source.id ||
      order.currency !== "NGN" ||
      order.notes !== note ||
      order.lines?.length !== 1 ||
      order.lines[0].productId !== products[5].id ||
      money(order.lines[0].unitPrice) !== 80000n * 10000n ||
      money(order.lines[0].orderedQuantity) !== 10000n
    )
      throw new Error(
        `Recorded invoice order ${label} does not match this run`,
      );
  } else {
    const operation = `invoice-state-${label}-order-create`;
    manifest.stage = operation;
    await save();
    order = await api.post(
      `${ROOT}/sales/orders`,
      {
        customerId: customer.id,
        warehouseId: source.id,
        currency: "NGN",
        notes: note,
        lines: [
          { productId: products[5].id, quantity: "1", unitPrice: "80000" },
        ],
      },
      idempotencyKey(manifest, operation),
    );
    record = { id: order.id, label: `invoice-${label}`, number: order.number };
    manifest.resources.salesOrders.push(record);
    await save();
  }
  if (order.status === "DRAFT") {
    await post(
      api,
      manifest,
      save,
      `${ROOT}/sales/orders/${order.id}/confirm`,
      undefined,
      `invoice-state-${label}-order-confirm`,
    );
    order = await api.get(`${ROOT}/sales/orders/${order.id}`);
  }
  if (!["CONFIRMED", "PARTIALLY_FULFILLED", "FULFILLED"].includes(order.status))
    throw new Error(`Invoice order ${label} is not eligible (${order.status})`);
  return order;
}

async function ensureInvoice(api, manifest, save, order, line, spec) {
  let record = resource(manifest.resources.invoices, spec.label);
  let invoice = record
    ? await api.get(`${ROOT}/sales/invoices/${record.id}`)
    : undefined;
  if (invoice) {
    if (
      invoice.salesOrderId !== order.id ||
      invoice.currency !== "NGN" ||
      money(invoice.totalAmount) !== 80000n * 10000n
    )
      throw new Error(`Recorded invoice ${spec.label} does not match this run`);
  } else {
    const operation = `invoice-state-${spec.label}-create`;
    const body = {
      salesOrderId: order.id,
      ...(spec.dueDate ? { dueDate: spec.dueDate } : {}),
      notes: `QA ${manifest.runId} ${spec.label}`,
      lines: [{ salesOrderLineId: line.id }],
    };
    invoice = await post(
      api,
      manifest,
      save,
      `${ROOT}/sales/invoices`,
      body,
      operation,
    );
    record = { id: invoice.id, label: spec.label, salesOrderId: order.id };
    manifest.resources.invoices.push(record);
    await save();
  }
  if (spec.status !== "DRAFT" && invoice.status === "DRAFT") {
    await post(
      api,
      manifest,
      save,
      `${ROOT}/sales/invoices/${invoice.id}/issue`,
      undefined,
      `invoice-state-${spec.label}-issue`,
    );
    invoice = await api.get(`${ROOT}/sales/invoices/${invoice.id}`);
  }
  return invoice;
}

async function ensurePayment(api, manifest, save, invoice, label, amount) {
  let record = resource(manifest.resources.payments, label);
  let payment = record
    ? await api.get(`${ROOT}/sales/payments/${record.id}`)
    : undefined;
  if (payment) {
    const allocation = payment.allocations?.[0];
    if (
      payment.currency !== invoice.currency ||
      money(payment.amount) !== money(amount) ||
      payment.allocations?.length !== 1 ||
      allocation.invoiceId !== invoice.id
    )
      throw new Error(`Recorded payment ${label} does not match this run`);
  } else {
    const operation = `invoice-state-${label}-record`;
    payment = await post(
      api,
      manifest,
      save,
      `${ROOT}/sales/payments`,
      {
        invoiceId: invoice.id,
        amount,
        method: "BANK_TRANSFER",
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentReference: `${manifest.runId}-${label}`,
      },
      operation,
    );
    record = {
      id: payment.id,
      label,
      invoiceId: invoice.id,
      amount: String(payment.amount),
    };
    manifest.resources.payments.push(record);
    await save();
  }
  return payment;
}

export async function seedInvoiceStates(api, manifest, save, context) {
  const today = new Date();
  const past = new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() - 7,
    ),
  )
    .toISOString()
    .slice(0, 10);
  const specs = [
    { label: "invoice-draft", status: "DRAFT" },
    { label: "invoice-unpaid", status: "ISSUED", dueDate: "2099-12-31" },
    {
      label: "invoice-partial",
      status: "ISSUED",
      dueDate: "2099-12-31",
      payments: ["30000"],
    },
    {
      label: "invoice-paid",
      status: "ISSUED",
      dueDate: "2099-12-31",
      payments: ["30000", "50000"],
    },
    {
      label: "invoice-reversed",
      status: "ISSUED",
      dueDate: "2099-12-31",
      payments: ["30000", "50000"],
      reverse: 0,
    },
    { label: "invoice-overdue", status: "ISSUED", dueDate: past },
    {
      label: "invoice-overdue-partial",
      status: "ISSUED",
      dueDate: past,
      payments: ["30000"],
    },
    { label: "invoice-no-due-date", status: "ISSUED" },
    {
      label: "invoice-void",
      status: "VOID",
      dueDate: "2099-12-31",
      void: true,
    },
  ];
  const result = [];
  for (const spec of specs) {
    const order = await ensureInvoiceOrder(
      api,
      manifest,
      save,
      context,
      spec.label,
    );
    const line = order.lines[0];
    let invoice = await ensureInvoice(api, manifest, save, order, line, spec);
    for (let index = 0; index < (spec.payments || []).length; index += 1) {
      const amount = spec.payments[index];
      const payment = await ensurePayment(
        api,
        manifest,
        save,
        invoice,
        `${spec.label}-payment-${index + 1}`,
        amount,
      );
      if (spec.reverse === index && !payment.reversal) {
        await post(
          api,
          manifest,
          save,
          `${ROOT}/sales/payments/${payment.id}/reverse`,
          { reason: `QA ${manifest.runId} reverse ${spec.label}` },
          `${spec.label}-payment-${index + 1}-reverse`,
        );
      }
      invoice = await api.get(`${ROOT}/sales/invoices/${invoice.id}`);
    }
    if (spec.void && invoice.status === "ISSUED") {
      await post(
        api,
        manifest,
        save,
        `${ROOT}/sales/invoices/${invoice.id}/void`,
        { reason: `QA ${manifest.runId} eligible unpaid void` },
        `${spec.label}-void`,
      );
      invoice = await api.get(`${ROOT}/sales/invoices/${invoice.id}`);
    }
    result.push({
      id: invoice.id,
      label: spec.label,
      status: invoice.status,
      paymentStatus: invoice.paymentStatus,
      amount: String(invoice.totalAmount),
      amountPaid: String(invoice.amountPaid),
      outstanding: String(invoice.outstandingAmount),
      isOverdue: invoice.isOverdue,
      dueDate:
        invoice.dueDate?.toISOString?.().slice(0, 10) ||
        invoice.dueDate ||
        null,
    });
  }
  manifest.scenarioResult.invoiceStates = result;
  await save();
  return result;
}

export async function verifyInvoiceStates(api, manifest) {
  const expected = [
    ["invoice-draft", "DRAFT", "DRAFT", "0", "80000", false],
    ["invoice-unpaid", "ISSUED", "UNPAID", "0", "80000", false],
    ["invoice-partial", "ISSUED", "PARTIALLY_PAID", "30000", "50000", false],
    ["invoice-paid", "ISSUED", "PAID", "80000", "0", false],
    ["invoice-reversed", "ISSUED", "PARTIALLY_PAID", "50000", "30000", false],
    ["invoice-overdue", "ISSUED", "UNPAID", "0", "80000", true],
    [
      "invoice-overdue-partial",
      "ISSUED",
      "PARTIALLY_PAID",
      "30000",
      "50000",
      true,
    ],
    ["invoice-no-due-date", "ISSUED", "UNPAID", "0", "80000", false],
    ["invoice-void", "VOID", "VOID", "0", "0", false],
  ];
  const records = manifest.scenarioResult?.invoiceStates;
  if (!Array.isArray(records) || records.length !== expected.length)
    throw new Error(
      "Invoice-state verification requires all nine fixture invoices",
    );
  const ids = records.map((item) => item?.id);
  if (
    ids.some((id) => typeof id !== "string" || !id) ||
    new Set(ids).size !== ids.length
  )
    throw new Error(
      "Invoice-state verification found missing or duplicate invoice IDs",
    );
  const checks = {};
  for (const [
    index,
    [label, status, paymentStatus, paid, outstanding, overdue],
  ] of expected.entries()) {
    const item = records[index];
    if (item.label !== label)
      throw new Error(
        "Invoice-state fixture labels are incomplete or out of order",
      );
    const invoice = await api.get(`${ROOT}/sales/invoices/${item.id}`);
    const grossPayments = invoice.allocations.reduce(
      (total, allocation) => total + money(allocation.amount),
      0n,
    );
    const reversedPayments = invoice.allocations.reduce(
      (total, allocation) =>
        total + (allocation.payment.reversal ? money(allocation.amount) : 0n),
      0n,
    );
    const effectivePayments = grossPayments - reversedPayments;
    checks[label] =
      invoice.organizationId === manifest.organizationId &&
      invoice.currency === "NGN" &&
      money(invoice.totalAmount) === 80000n * 10000n &&
      invoice.status === status &&
      invoice.paymentStatus === paymentStatus &&
      money(invoice.amountPaid) === money(paid) &&
      money(invoice.outstandingAmount) === money(outstanding) &&
      effectivePayments === money(paid) &&
      (label !== "invoice-reversed" ||
        (grossPayments === 80000n * 10000n &&
          reversedPayments === 30000n * 10000n)) &&
      invoice.isOverdue === overdue &&
      item.status === status &&
      money(item.amount) === money(invoice.totalAmount) &&
      money(item.amountPaid) === money(invoice.amountPaid) &&
      money(item.outstanding) === money(invoice.outstandingAmount);
  }
  const failed = Object.entries(checks)
    .filter(([, valid]) => !valid)
    .map(([label]) => label);
  if (failed.length)
    throw new Error(`Invoice-state verification failed: ${failed.join(", ")}`);
  return { invoices: checks };
}
