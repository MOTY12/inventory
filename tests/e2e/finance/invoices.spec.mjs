import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { expect, test } from "@playwright/test";
import { acquireRunLock, saveManifest } from "../../../scripts/qa/manifest.mjs";
import { loadQaBrowserRun, signInQaOwner } from "../support/qa-browser.mjs";

const { Client } = pg;
const env = process.env;
const organizationId = env.QA_ORGANIZATION_ID;
const runId = env.QA_RUN_ID;
const money = (value) => {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  assert.ok(match, "Expected a decimal database value");
  const fraction = match[3] || "";
  assert.ok(
    !/[1-9]/.test(fraction.slice(4)),
    "Expected at most four decimal places",
  );
  const scaled =
    BigInt(match[2]) * 10000n +
    BigInt(fraction.slice(0, 4).padEnd(4, "0") || "0");
  return match[1] === "-" ? -scaled : scaled;
};

async function dbClient() {
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  return client;
}

async function findInvoice(client, orderId, notes) {
  const result = await client.query(
    `SELECT id, invoice_number AS "invoiceNumber", status, currency,
            total_amount AS "totalAmount", amount_paid AS "amountPaid",
            outstanding_amount AS "outstandingAmount"
       FROM invoices
      WHERE organization_id = $1 AND sales_order_id = $2 AND notes = $3
      ORDER BY created_at`,
    [organizationId, orderId, notes],
  );
  if (result.rowCount > 1)
    throw new Error(
      "More than one invoice matches this QA run; refusing to continue",
    );
  return result.rows[0] ?? null;
}

async function findPayment(client, reference) {
  const result = await client.query(
    `SELECT p.id, p.amount, p.currency, a.invoice_id AS "invoiceId",
            r.reason AS "reversalReason"
       FROM customer_payments p
       JOIN payment_allocations a
         ON a.organization_id = p.organization_id AND a.payment_id = p.id
       LEFT JOIN payment_reversals r
         ON r.organization_id = p.organization_id AND r.payment_id = p.id
      WHERE p.organization_id = $1 AND p.payment_reference = $2`,
    [organizationId, reference],
  );
  if (result.rowCount > 1)
    throw new Error(
      "A QA payment reference is ambiguous; refusing to continue",
    );
  return result.rows[0] ?? null;
}

async function recordPayment(page, client, invoiceId, run, label, amount) {
  const reference = `${run}-browser-${label}`;
  const existing = await findPayment(client, reference);
  if (existing) {
    if (
      existing.invoiceId !== invoiceId ||
      existing.currency !== "NGN" ||
      money(existing.amount) !== BigInt(amount) * 10000n
    )
      throw new Error(`Existing ${label} payment does not match this QA run`);
    return existing;
  }
  await page.getByRole("button", { name: "Record payment" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount").fill(amount);
  await dialog.getByLabel("Reference").fill(reference);
  await dialog.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("Payment recorded.")).toBeVisible();
  await expect
    .poll(async () => (await findPayment(client, reference))?.id)
    .toBeTruthy();
  return findPayment(client, reference);
}

async function loadRun() {
  const { runPath, manifest } = await loadQaBrowserRun("document-states", env);
  const acceptanceOrder = manifest.scenarioResult?.browserAcceptanceOrder;
  assert.ok(
    acceptanceOrder?.id,
    "Run manifest must contain the browser acceptance order",
  );
  assert.equal(acceptanceOrder.quantity, "10");
  assert.equal(acceptanceOrder.unitPrice, "8000");
  assert.equal(acceptanceOrder.invoiceTotal, "80000");
  return { runPath, manifest, order: acceptanceOrder };
}

async function persistInvoice(runPath, invoice) {
  const unlock = await acquireRunLock(runId);
  try {
    const manifest = await loadManifest(runPath);
    manifest.resources.invoices ??= [];
    const label = "browser-acceptance-invoice";
    const existing = manifest.resources.invoices.find(
      (item) => item.label === label,
    );
    if (existing && existing.id !== invoice.id)
      throw new Error(
        "Manifest invoice differs from the invoice linked to this order",
      );
    if (!existing)
      manifest.resources.invoices.push({
        id: invoice.id,
        label,
        salesOrderId: invoice.sales_order_id,
      });
    await saveManifest(manifest, runPath);
  } finally {
    await unlock();
  }
}

function pdfText(buffer) {
  const source = buffer.toString("latin1");
  const strings = [...source.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map(
    ([, raw]) =>
      raw
        .replace(/\\([\\()])/g, "$1")
        .replace(/\\([0-7]{1,3})/g, (_, octal) =>
          String.fromCharCode(Number.parseInt(octal, 8)),
        ),
  );
  return strings.join("\n");
}

test("invoice, payment reversal and PDF reconcile in the QA workspace", async ({
  page,
}, testInfo) => {
  const { runPath, order } = await loadRun();
  const client = await dbClient();
  const orderInfo = await client.query(
    `SELECT so.id, so.organization_id AS "organizationId", so.customer_id AS "customerId",
            sol.product_id AS "productId", w.id AS "warehouseId",
            c.name AS "customerName", p.name AS "productName"
       FROM sales_orders so
       JOIN sales_order_lines sol
         ON sol.organization_id = so.organization_id AND sol.sales_order_id = so.id
       JOIN customers c ON c.organization_id = so.organization_id AND c.id = so.customer_id
       JOIN products p ON p.organization_id = sol.organization_id AND p.id = sol.product_id
       JOIN warehouses w ON w.organization_id = so.organization_id AND w.id = so.warehouse_id
      WHERE so.organization_id = $1 AND so.id = $2`,
    [organizationId, order.id],
  );
  assert.equal(
    orderInfo.rowCount,
    1,
    "Manifest order must belong to the QA organization",
  );
  const { customerId, productId, warehouseId, customerName, productName } =
    orderInfo.rows[0];
  const beforeInventory = await client.query(
    `SELECT b.on_hand AS "onHand", b.reserved,
            (SELECT count(*)::int FROM stock_movements m
              WHERE m.organization_id = b.organization_id
                AND m.warehouse_id = b.warehouse_id AND m.product_id = b.product_id) AS "movementCount"
       FROM inventory_balances b
      WHERE b.organization_id = $1 AND b.warehouse_id = $2 AND b.product_id = $3`,
    [organizationId, warehouseId, productId],
  );
  const invoiceNotes = `QA ${runId} browser acceptance`;
  try {
    await signInQaOwner(page, organizationId, env);
    await page.goto(
      `/invoices/new?salesOrderId=${encodeURIComponent(order.id)}`,
    );

    let invoice = await findInvoice(client, order.id, invoiceNotes);
    if (!invoice) {
      await page.getByLabel("Notes").fill(invoiceNotes);
      await expect(
        page.getByText("80000", { exact: false }).first(),
      ).toBeVisible();
      await page.getByRole("button", { name: "Save draft invoice" }).click();
      await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]+$/i);
      const invoiceId = page.url().split("/").at(-1);
      await expect
        .poll(() => findInvoice(client, order.id, invoiceNotes))
        .toBeTruthy();
      invoice = await findInvoice(client, order.id, invoiceNotes);
      assert.equal(invoice.id, invoiceId);
    } else {
      await page.goto(`/invoices/${invoice.id}`);
    }
    await persistInvoice(runPath, { ...invoice, sales_order_id: order.id });
    await expect(page.getByText("NGN", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(
      "Draft invoice",
    );

    if (invoice.status === "DRAFT") {
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "Issue invoice" }).click();
      await expect(page.getByText("Invoice issued.")).toBeVisible();
    }
    await expect(
      page.getByRole("button", { name: "Issue invoice" }),
    ).toHaveCount(0);
    invoice = await findInvoice(client, order.id, invoiceNotes);
    assert.equal(invoice.status, "ISSUED");
    assert.equal(invoice.currency, "NGN");
    assert.equal(money(invoice.totalAmount), 80000n * 10000n);
    assert.ok(invoice.invoiceNumber, "Issued invoice must receive a number");

    const pdfDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF" }).click();
    const download = await pdfDownload;
    const pdfPath = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(pdfPath);
    const pdf = await readFile(pdfPath);
    assert.ok(pdf.byteLength > 0);
    assert.equal(pdf.subarray(0, 8).toString("ascii"), "%PDF-1.4");
    const text = pdfText(pdf);
    for (const expected of [
      invoice.invoiceNumber,
      customerName,
      productName,
      "10",
      "8000.0000",
      "NGN",
      "80000.0000",
    ])
      assert.ok(text.includes(expected), `PDF should contain ${expected}`);

    const p1 = await recordPayment(
      page,
      client,
      invoice.id,
      runId,
      "first",
      "30000",
    );
    assert.equal(money(p1.amount), 30000n * 10000n);
    await expect(
      page.getByText("50000.0000 NGN", { exact: false }),
    ).toBeVisible();
    const p2 = await recordPayment(
      page,
      client,
      invoice.id,
      runId,
      "second",
      "50000",
    );
    assert.equal(money(p2.amount), 50000n * 10000n);
    await expect(page.getByText("PAID", { exact: true }).first()).toBeVisible();

    let second = await findPayment(client, `${runId}-browser-second`);
    if (!second.reversalReason) {
      page.once("dialog", (dialog) =>
        dialog.accept("QA browser acceptance reversal"),
      );
      const paymentRow = page
        .getByRole("row")
        .filter({ hasText: `${runId}-browser-second` });
      await paymentRow.getByRole("button", { name: "Reverse" }).click();
      await expect(page.getByText("Payment reversal recorded.")).toBeVisible();
    }
    await expect(
      page.getByText("50000.0000 NGN", { exact: false }),
    ).toBeVisible();
    second = await findPayment(client, `${runId}-browser-second`);
    assert.equal(second.reversalReason, "QA browser acceptance reversal");
    const replacement = await recordPayment(
      page,
      client,
      invoice.id,
      runId,
      "replacement",
      "50000",
    );
    assert.equal(money(replacement.amount), 50000n * 10000n);
    await expect(page.getByText("PAID", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText("Reversed: QA browser acceptance reversal"),
    ).toBeVisible();

    const totals = await client.query(
      `SELECT i.total_amount AS "totalAmount",
              sum(p.amount) AS "grossPayments",
              sum(CASE WHEN r.id IS NOT NULL THEN p.amount ELSE 0 END) AS "reversedPayments",
              sum(CASE WHEN r.id IS NULL THEN a.amount ELSE 0 END) AS "amountPaid"
         FROM invoices i
         JOIN payment_allocations a ON a.organization_id = i.organization_id AND a.invoice_id = i.id
         JOIN customer_payments p ON p.organization_id = a.organization_id AND p.id = a.payment_id
         LEFT JOIN payment_reversals r ON r.organization_id = p.organization_id AND r.payment_id = p.id
        WHERE i.organization_id = $1 AND i.id = $2
        GROUP BY i.id`,
      [organizationId, invoice.id],
    );
    assert.equal(totals.rowCount, 1);
    assert.equal(money(totals.rows[0].totalAmount), 80000n * 10000n);
    assert.equal(money(totals.rows[0].grossPayments), 130000n * 10000n);
    assert.equal(money(totals.rows[0].reversedPayments), 50000n * 10000n);
    assert.equal(money(totals.rows[0].amountPaid), 80000n * 10000n);
    assert.equal(
      money(totals.rows[0].totalAmount) - money(totals.rows[0].amountPaid),
      0n,
    );

    await page.goto(`/customers/${customerId}`);
    await expect(
      page.getByRole("heading", { name: "Financial history" }),
    ).toBeVisible();
    await expect(
      page.getByText(invoice.invoiceNumber, { exact: false }),
    ).toBeVisible();
    const customerInvoice = page.getByRole("link", {
      name: invoice.invoiceNumber,
    });
    await expect(customerInvoice).toBeVisible();
    await expect(customerInvoice.locator("..")).toContainText(
      "PAID · 80000.0000 NGN",
    );

    const afterInventory = await client.query(
      `SELECT b.on_hand AS "onHand", b.reserved,
              (SELECT count(*)::int FROM stock_movements m
                WHERE m.organization_id = b.organization_id
                  AND m.warehouse_id = b.warehouse_id AND m.product_id = b.product_id) AS "movementCount"
         FROM inventory_balances b
        WHERE b.organization_id = $1 AND b.warehouse_id = $2 AND b.product_id = $3`,
      [organizationId, warehouseId, productId],
    );
    assert.deepEqual(afterInventory.rows, beforeInventory.rows);
  } finally {
    await client.end();
  }
});
