const ROOT = "/organizations/current";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rows = (value) =>
  Array.isArray(value) ? value : value?.data || value?.items || [];
const scaled = (value) => {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match) throw new Error("Invalid monetary value while reconciling CSV");
  const fraction = match[3] || "";
  if (fraction.length > 4 && /[1-9]/.test(fraction.slice(4)))
    throw new Error("CSV amount exceeds expected precision");
  const amount =
    BigInt(match[2]) * 10000n +
    BigInt(fraction.slice(0, 4).padEnd(4, "0") || "0");
  return match[1] === "-" ? -amount : amount;
};

export function parseCsv(text) {
  if (typeof text !== "string" || !text.length)
    throw new Error("CSV export is empty");
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const table = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"' && cell.length === 0) quoted = true;
    else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell);
      cell = "";
      if (row.some((value) => value !== "") || table.length === 0)
        table.push(row);
      row = [];
    } else cell += character;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  if (cell.length || row.length) {
    row.push(cell);
    table.push(row);
  }
  if (table.length < 2) throw new Error("CSV export contains no data rows");
  const width = table[0].length;
  if (width === 0 || table.slice(1).some((item) => item.length !== width))
    throw new Error("CSV export has malformed row widths");
  return { headers: table[0], rows: table.slice(1) };
}

function operationKey(manifest, name) {
  manifest.idempotencyKeys[name] ??= `${manifest.runId}-${name}`;
  return manifest.idempotencyKeys[name];
}

function exportFilters(type, currency, fixture, day) {
  const common = {
    from: day,
    to: day,
    warehouse_id: fixture.warehouseId,
    currency,
  };
  if (type === "SALES_PRODUCTS" || type === "PURCHASE_PRODUCTS")
    return { ...common, product_id: fixture.productId };
  if (type === "SALES_CUSTOMERS")
    return { ...common, customer_id: fixture.customerId };
  return { ...common, supplier_id: fixture.supplierId };
}

async function ensureExport(api, manifest, save, type, currency, fixture, day) {
  const label = `${type.toLowerCase()}-${currency.toLowerCase()}`;
  let record = manifest.resources.exports.find((item) => item.label === label);
  if (record) return record;
  const operation = `financial-export-${label}`;
  manifest.stage = operation;
  await save();
  const job = await api.post(
    `${ROOT}/reports/exports`,
    { report_type: type, filters: exportFilters(type, currency, fixture, day) },
    operationKey(manifest, operation),
  );
  record = { id: job.id, label, reportType: type, currency, day };
  manifest.resources.exports.push(record);
  await save();
  return record;
}

async function waitForExport(api, id) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    let record;
    for (let page = 1; page <= 100; page += 1) {
      const result = await api.get(
        `${ROOT}/reports/exports?page=${page}&page_size=100`,
      );
      const pageRows = rows(result);
      record = pageRows.find((item) => item.id === id);
      if (record || pageRows.length < 100) break;
    }
    if (!record)
      throw new Error("Export job disappeared from the active organization");
    if (record.status === "COMPLETED") return record;
    if (["FAILED", "EXPIRED"].includes(record.status))
      throw new Error(`Financial export ended in ${record.status}`);
    await sleep(1000);
  }
  throw new Error("Financial export did not finish within 90 seconds");
}

function numberAt(headers, row, header) {
  const index = headers.indexOf(header);
  if (index < 0) throw new Error(`CSV header ${header} is missing`);
  return scaled(row[index]);
}
function textAt(headers, row, header) {
  const index = headers.indexOf(header);
  if (index < 0) throw new Error(`CSV header ${header} is missing`);
  return row[index];
}

async function reconcileCsv(api, record, fixture, day, text) {
  const parsed = parseCsv(text);
  if (parsed.rows.length !== 1)
    throw new Error(
      `${record.label} expected one scoped CSV row, received ${parsed.rows.length}`,
    );
  const filters = exportFilters(
    record.reportType,
    record.currency,
    fixture,
    day,
  );
  const query = new URLSearchParams({
    ...filters,
    page: "1",
    page_size: "100",
  });
  const reportPath = {
    SALES_PRODUCTS: `${ROOT}/reports/sales/products`,
    SALES_CUSTOMERS: `${ROOT}/reports/sales/customers`,
    PURCHASE_PRODUCTS: `${ROOT}/reports/purchases/products`,
    PURCHASE_SUPPLIERS: `${ROOT}/reports/purchases/suppliers`,
  }[record.reportType];
  if (!reportPath)
    throw new Error(`Unsupported financial export type ${record.reportType}`);
  const report = await api.get(`${reportPath}?${query}`);
  const reportRows = rows(report);
  if (reportRows.length !== 1)
    throw new Error(
      `${record.label} API filter expected one row, got ${reportRows.length}`,
    );
  const source = reportRows[0];
  const productType = record.reportType.endsWith("PRODUCTS");
  const expected = {
    SALES_PRODUCTS: {
      idHeader: "Product ID",
      id: fixture.productId,
      amountHeader: "Invoice value",
      amountField: "invoice_value",
      amount: fixture.invoiceValue,
    },
    SALES_CUSTOMERS: {
      idHeader: "Customer ID",
      id: fixture.customerId,
      amountHeader: "Issued invoice value",
      amountField: "invoiced_value",
      amount: fixture.invoiceValue,
    },
    PURCHASE_PRODUCTS: {
      idHeader: "Product ID",
      id: fixture.productId,
      amountHeader: "Received value",
      amountField: "received_value",
      amount: fixture.purchaseValue,
    },
    PURCHASE_SUPPLIERS: {
      idHeader: "Supplier ID",
      id: fixture.supplierId,
      amountHeader: "Received value",
      amountField: "received_value",
      amount: fixture.purchaseValue,
    },
  }[record.reportType];
  const row = parsed.rows[0];
  const sourceId = productType
    ? source.product_id
    : record.reportType === "SALES_CUSTOMERS"
      ? source.customer_id
      : source.supplier_id;
  const csvAmount = numberAt(parsed.headers, row, expected.amountHeader);
  const apiAmount = scaled(source[expected.amountField]);
  if (
    textAt(parsed.headers, row, expected.idHeader) !== expected.id ||
    textAt(parsed.headers, row, "Currency") !== fixture.currency ||
    sourceId !== expected.id ||
    source.currency !== fixture.currency ||
    csvAmount !== apiAmount ||
    apiAmount !== scaled(expected.amount)
  )
    throw new Error(`${record.label} CSV row failed exact API reconciliation`);
  return parsed;
}

export async function seedFinancialExports(api, manifest, save) {
  const fixtures = manifest.scenarioResult?.currencies;
  if (!Array.isArray(fixtures) || fixtures.length !== 2)
    throw new Error(
      "Financial exports require the completed multi-currency fixture",
    );
  const day = new Date().toISOString().slice(0, 10);
  const types = [
    "SALES_PRODUCTS",
    "SALES_CUSTOMERS",
    "PURCHASE_PRODUCTS",
    "PURCHASE_SUPPLIERS",
  ];
  const results = [];
  for (const fixture of fixtures) {
    for (const type of types) {
      const record = await ensureExport(
        api,
        manifest,
        save,
        type,
        fixture.currency,
        fixture,
        day,
      );
      await waitForExport(api, record.id);
      const parsed = await reconcileCsv(
        api,
        record,
        fixture,
        day,
        await api.get(`${ROOT}/reports/exports/${record.id}/download`),
      );
      const result = {
        exportId: record.id,
        label: record.label,
        status: "COMPLETED",
        rowCount: parsed.rows.length,
        headers: parsed.headers,
        reconciled: true,
      };
      manifest.scenarioResult.exports ??= [];
      const prior = manifest.scenarioResult.exports.findIndex(
        (item) => item.label === record.label,
      );
      if (prior >= 0) manifest.scenarioResult.exports[prior] = result;
      else manifest.scenarioResult.exports.push(result);
      results.push(result);
      await save();
    }
  }
  manifest.scenarioResult.scenario = "financial-exports";
  manifest.stage = "seeded";
  await save();
  return results;
}

export async function verifyFinancialExports(api, manifest) {
  const results = manifest.scenarioResult?.exports;
  if (!Array.isArray(results) || results.length !== 8)
    throw new Error(
      "Financial export verification requires eight completed currency-specific CSV files",
    );
  const labels = new Set(results.map((item) => item.label));
  if (
    labels.size !== 8 ||
    results.some(
      (item) =>
        item.status !== "COMPLETED" ||
        item.reconciled !== true ||
        item.rowCount !== 1,
    )
  )
    throw new Error(
      "Financial export verification found incomplete or duplicate exports",
    );
  for (const item of results) {
    const record = manifest.resources.exports.find(
      (resource) => resource.id === item.exportId,
    );
    if (!record || record.label !== item.label)
      throw new Error(
        "Financial export manifest resource identity is inconsistent",
      );
    await waitForExport(api, record.id);
    const fixture = manifest.scenarioResult.currencies.find(
      (resource) => resource.currency === record.currency,
    );
    const csv = await reconcileCsv(
      api,
      record,
      fixture,
      record.day,
      await api.get(`${ROOT}/reports/exports/${record.id}/download`),
    );
    if (csv.headers.join("|") !== item.headers.join("|"))
      throw new Error(`${item.label} CSV changed after initial reconciliation`);
  }
  return { exports: results.map((item) => item.label), count: results.length };
}
