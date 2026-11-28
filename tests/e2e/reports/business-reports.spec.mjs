import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { connectQa } from "../../../scripts/qa/workflow.mjs";
import { reconcileCsv } from "../../../scripts/qa/scenarios/financial-exports.mjs";
import { loadQaBrowserRun, signInQaOwner } from "../support/qa-browser.mjs";

const env = process.env;
const reportTypes = {
  SALES_PRODUCTS: {
    tab: "Product sales",
    path: "sales/products",
    idField: "product_id",
    amountField: "invoice_value",
  },
  SALES_CUSTOMERS: {
    tab: "Customers",
    path: "sales/customers",
    idField: "customer_id",
    amountField: "invoiced_value",
  },
  PURCHASE_PRODUCTS: {
    tab: "Product purchasing",
    path: "purchases/products",
    idField: "product_id",
    amountField: "received_value",
  },
  PURCHASE_SUPPLIERS: {
    tab: "Suppliers",
    path: "purchases/suppliers",
    idField: "supplier_id",
    amountField: "received_value",
  },
};

function rows(result) {
  return Array.isArray(result?.data) ? result.data : [];
}

function scaled(value) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  assert.ok(match, "Report value must be a decimal string");
  const fraction = match[3] || "";
  assert.ok(!/[1-9]/.test(fraction.slice(4)), "Report value exceeds precision");
  const result =
    BigInt(match[2]) * 10000n +
    BigInt(fraction.slice(0, 4).padEnd(4, "0") || "0");
  return match[1] === "-" ? -result : result;
}

function waitForReport(page, path, expected = {}) {
  return page.waitForResponse((response) => {
    if (response.request().method() !== "GET") return false;
    const url = new URL(response.url());
    return (
      url.pathname.endsWith(`/organizations/current/reports/${path}`) &&
      response.ok() &&
      Object.entries(expected).every(
        ([key, value]) => url.searchParams.get(key) === String(value),
      )
    );
  });
}

test("business reports filter by run fixtures and browser CSVs reconcile", async ({
  page,
}, testInfo) => {
  const { manifest, organizationId } = await loadQaBrowserRun(
    "financial-exports",
    env,
  );
  const fixtures = manifest.scenarioResult?.currencies;
  const completedExports = manifest.scenarioResult?.exports;
  assert.equal(fixtures?.length, 2, "Run must include NGN and USD fixtures");
  assert.equal(completedExports?.length, 8, "Run must include eight exports");
  assert.deepEqual(
    fixtures.map((fixture) => fixture.currency),
    ["NGN", "USD"],
  );
  assert.ok(
    completedExports.every(
      (record) =>
        record.status === "COMPLETED" &&
        record.reconciled === true &&
        record.rowCount === 1,
    ),
    "Seed run must have API-reconciled exports before browser acceptance",
  );

  const { api, organization } = await connectQa(env);
  assert.equal(organization.id, organizationId);
  try {
    const cases = new Map();
    const activeWarehouses = rows(
      await api.get(
        "/organizations/current/warehouses?page=1&page_size=100&status=ACTIVE",
      ),
    );
    const activeBranches = rows(
      await api.get(
        "/organizations/current/branches?page=1&page_size=100&status=ACTIVE",
      ),
    );
    for (const fixture of fixtures) {
      const purchase = await api.get(
        `/organizations/current/procurement/purchase-orders/${fixture.purchaseOrderId}`,
      );
      const warehouse = activeWarehouses.find(
        (item) => item.id === purchase.warehouseId,
      );
      assert.ok(warehouse, `${fixture.currency} fixture warehouse is active`);
      const branch = activeBranches.find(
        (item) => item.id === warehouse.branchId,
      );
      assert.ok(branch, `${fixture.currency} fixture branch is active`);
      const product = await api.get(
        `/organizations/current/catalog/products/${fixture.productId}`,
      );
      const customer = await api.get(
        `/organizations/current/sales/customers/${fixture.customerId}`,
      );
      const supplier = await api.get(
        `/organizations/current/procurement/suppliers/${fixture.supplierId}`,
      );
      cases.set(fixture.currency, {
        ...fixture,
        warehouseId: warehouse.id,
        branchId: branch.id,
        productName: product.name,
        customerName: customer.name,
        supplierName: supplier.name,
      });
    }

    const manifestExports = manifest.resources.exports.filter((record) =>
      Object.hasOwn(reportTypes, record.reportType),
    );
    assert.equal(manifestExports.length, 8);
    assert.equal(new Set(manifestExports.map((record) => record.id)).size, 8);
    assert.ok(manifestExports.every((record) => record.day));
    const reportDay = manifestExports[0].day;
    assert.ok(manifestExports.every((record) => record.day === reportDay));

    await signInQaOwner(page, organizationId, env);
    await page.goto("/reports/business");
    await expect(
      page.getByRole("heading", { name: "Sales & purchasing reports" }),
    ).toBeVisible();

    for (const fixture of cases.values()) {
      await page.getByLabel("From").fill(reportDay);
      await page.getByLabel("Through").fill(reportDay);
      await page.getByLabel("Warehouse").selectOption(fixture.warehouseId);
      await page.getByLabel("Branch").selectOption(fixture.branchId);
      await page.getByLabel("Currency").fill(fixture.currency);

      for (const [reportType, report] of Object.entries(reportTypes)) {
        const targetId = reportType.endsWith("PRODUCTS")
          ? fixture.productId
          : reportType === "SALES_CUSTOMERS"
            ? fixture.customerId
            : fixture.supplierId;
        const targetName = reportType.endsWith("PRODUCTS")
          ? fixture.productName
          : reportType === "SALES_CUSTOMERS"
            ? fixture.customerName
            : fixture.supplierName;
        const responsePromise = waitForReport(page, report.path, {
          from: reportDay,
          to: reportDay,
          warehouse_id: fixture.warehouseId,
          branch_id: fixture.branchId,
          currency: fixture.currency,
        });
        await page
          .getByRole("button", { name: report.tab, exact: true })
          .click();
        await responsePromise;

        const searchResponse = waitForReport(page, report.path, {
          currency: fixture.currency,
          q: targetName,
        });
        await page.getByLabel("Search").fill(targetName);
        let response = await searchResponse;
        let result = await response.json();

        const status = reportType.startsWith("SALES_")
          ? "FULFILLED"
          : "RECEIVED";
        const statusLabel = reportType.startsWith("SALES_")
          ? "Order status"
          : "Purchase status";
        const statusResponse = waitForReport(page, report.path, {
          currency: fixture.currency,
          q: targetName,
          status,
        });
        await page.getByLabel(statusLabel).selectOption(status);
        response = await statusResponse;
        result = await response.json();

        const sortResponse = waitForReport(page, report.path, {
          currency: fixture.currency,
          q: targetName,
          status,
          ...(reportType.startsWith("SALES_")
            ? { sort_by: "name" }
            : { purchasing_sort_by: "name" }),
        });
        await page.getByLabel("Sort by").selectOption("name");
        response = await sortResponse;
        result = await response.json();
        const reportRows = rows(result);
        assert.equal(
          reportRows.length,
          1,
          `${reportType} filter narrows to QA fixture`,
        );
        const target = reportRows[0];
        assert.equal(target[report.idField], targetId);
        assert.equal(target.currency, fixture.currency);
        const expectedAmount =
          reportType === "SALES_PRODUCTS" || reportType === "SALES_CUSTOMERS"
            ? fixture.invoiceValue
            : fixture.purchaseValue;
        assert.equal(
          scaled(target[report.amountField]),
          scaled(expectedAmount),
        );
        assert.equal(result.page, 1);
        assert.equal(result.page_size, 25);
        assert.equal(result.total, 1);
        await expect(page.getByText("Page 1", { exact: true })).toBeVisible();
        const visibleIds = page
          .getByRole("table")
          .locator("tbody tr td:first-child");
        await expect
          .poll(() => visibleIds.allTextContents())
          .toEqual([String(target[Object.keys(target)[0]])]);

        const matchingExports = manifestExports.filter(
          (record) =>
            record.reportType === reportType &&
            record.currency === fixture.currency,
        );
        assert.equal(matchingExports.length, 1);
        for (const exportRecord of matchingExports) {
          assert.match(
            exportRecord.id,
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          );
          const historyItem = page.locator(
            `[data-report-export-id="${exportRecord.id}"]`,
          );
          await expect(historyItem).toContainText("completed");
          const downloadEvent = page.waitForEvent("download");
          await historyItem
            .getByRole("button", { name: "Download CSV" })
            .click();
          const download = await downloadEvent;
          const outputPath = testInfo.outputPath(download.suggestedFilename());
          await download.saveAs(outputPath);
          const csv = await readFile(outputPath, "utf8");
          const reconciled = await reconcileCsv(
            api,
            { ...exportRecord, day: reportDay },
            fixture,
            reportDay,
            csv,
          );
          assert.equal(reconciled.rows.length, 1);
          assert.equal(reconciled.headers.includes("Currency"), true);
        }
      }

      const salesResponsePromise = waitForReport(page, "sales/summary", {
        currency: fixture.currency,
      });
      await page.getByRole("button", { name: "Sales overview" }).click();
      const sales = await (await salesResponsePromise).json();
      for (const metric of [
        "order_value",
        "invoice_value",
        "collections",
        "receivables",
      ]) {
        assert.ok(
          sales[metric].every((row) => row.currency === fixture.currency),
          `${metric} must not combine currencies`,
        );
      }
      assert.ok(
        sales.invoice_value.some(
          (row) =>
            row.currency === fixture.currency &&
            scaled(row.invoice_value) >= scaled(fixture.invoiceValue),
        ),
        `${fixture.currency} sales summary must include the fixture invoice`,
      );
      await expect(
        page.getByRole("heading", { name: "Issued invoice value" }),
      ).toBeVisible();

      const purchaseResponsePromise = waitForReport(page, "purchases/summary", {
        currency: fixture.currency,
      });
      await page.getByRole("button", { name: "Purchasing overview" }).click();
      const purchases = await (await purchaseResponsePromise).json();
      for (const metric of ["order_value", "received_value", "outstanding"]) {
        assert.ok(
          purchases[metric].every((row) => row.currency === fixture.currency),
          `${metric} must not combine currencies`,
        );
      }
      assert.ok(
        purchases.received_value.some(
          (row) =>
            row.currency === fixture.currency &&
            scaled(row.received_value) >= scaled(fixture.purchaseValue),
        ),
        `${fixture.currency} purchasing summary must include the fixture receipt`,
      );

      const agingResponsePromise = waitForReport(page, "receivables/aging", {
        currency: fixture.currency,
      });
      await page.getByRole("button", { name: "Receivables aging" }).click();
      const aging = await (await agingResponsePromise).json();
      assert.ok(
        aging.data.every((row) => row.currency === fixture.currency),
        "Receivables aging must keep currencies separate",
      );
      await expect(
        page.getByRole("heading", { name: "Receivables aging by currency" }),
      ).toBeVisible();
    }
  } finally {
    await api.raw("POST", "/auth/logout", { retryAuth: false }).catch(() => {});
  }
});
