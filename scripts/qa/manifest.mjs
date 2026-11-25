import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const SECRET_KEY =
  /(access.?token|refresh.?token|password|secret|credential|authorization|cookie)/i;

export function newRunId() {
  return `qa-${new Date()
    .toISOString()
    .replaceAll(/[-:.TZ]/g, "")
    .slice(0, 14)}-${randomUUID().slice(0, 8)}`;
}

export function assertManifestSafe(value, path = "manifest") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key))
      throw new Error(`Secret-like field is forbidden in ${path}.${key}`);
    assertManifestSafe(child, `${path}.${key}`);
  }
}

export function createManifest({
  runId = newRunId(),
  organizationId,
  environment = "development",
}) {
  return {
    schemaVersion: 1,
    runId,
    environment,
    organizationId,
    stage: "initialized",
    resources: {
      branches: [],
      warehouses: [],
      units: [],
      categories: [],
      products: [],
      suppliers: [],
      customers: [],
      purchaseOrders: [],
      receipts: [],
      transferReceipts: [],
      transfers: [],
      salesOrders: [],
      picks: [],
      fulfillments: [],
      invoices: [],
      payments: [],
    },
    expected: {
      currency: "NGN",
      purchaseQuantity: "100",
      purchaseUnitCost: "5000",
      transferQuantity: "30",
      salesQuantity: "20",
      saleUnitPrice: "8000",
      finalMainWarehouse: "70",
      finalSecondaryWarehouse: "10",
      finalOrganizationQuantity: "80",
      finalInventoryValue: "400000",
      invoiceValue: "160000",
      effectivePayments: "160000",
      receivables: "0",
    },
    idempotencyKeys: {},
    completedOperations: [],
    failedOperations: [],
    updatedAt: new Date().toISOString(),
  };
}

export function manifestPath(runId, directory = ".qa-runs") {
  if (!/^qa-[a-zA-Z0-9-]{12,80}$/.test(runId))
    throw new Error("Invalid QA run identifier");
  return resolve(directory, `${runId}.json`);
}

export async function saveManifest(manifest, path) {
  assertManifestSafe(manifest);
  manifest.updatedAt = new Date().toISOString();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
    flag: "w",
  });
  await rename(temp, path);
}

export async function loadManifest(path) {
  const manifest = JSON.parse(await readFile(path, "utf8"));
  assertManifestSafe(manifest);
  if (
    manifest.schemaVersion !== 1 ||
    !manifest.organizationId ||
    !manifest.runId
  )
    throw new Error("Unsupported or invalid QA manifest");
  return manifest;
}

export function operationKey(manifest, operation) {
  manifest.idempotencyKeys[operation] ??= `${manifest.runId}-${operation}`;
  return manifest.idempotencyKeys[operation];
}
