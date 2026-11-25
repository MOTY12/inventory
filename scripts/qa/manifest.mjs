import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { QA_SCENARIOS } from "./scenarios/registry.mjs";

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

const RESOURCE_COLLECTIONS = [
  "branches",
  "warehouses",
  "units",
  "categories",
  "products",
  "suppliers",
  "customers",
  "purchaseOrders",
  "receipts",
  "transferReceipts",
  "transfers",
  "salesOrders",
  "picks",
  "fulfillments",
  "invoices",
  "payments",
  "exports",
  "scenarioRecords",
];

export async function ensureManifestDirectory(
  directory,
  { create = true } = {},
) {
  if (
    typeof directory !== "string" ||
    !directory ||
    directory.includes("\0") ||
    directory.split(/[\\/]/).includes("..") ||
    directory.startsWith("/") ||
    /^[A-Za-z]:/.test(directory)
  ) {
    throw new Error("QA manifest directory must be repository-relative");
  }
  const root = await realpath(process.cwd());
  const target = resolve(root, directory);
  const fromRoot = relative(root, target);
  if (
    !fromRoot ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    fromRoot.startsWith(sep)
  ) {
    throw new Error("QA manifest directory escaped the repository");
  }
  let current = root;
  for (const segment of fromRoot.split(sep).filter(Boolean)) {
    current = resolve(current, segment);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (error.code !== "ENOENT" || !create) throw error;
      await mkdir(current, { mode: 0o700 });
      info = await lstat(current);
    }
    if (info.isSymbolicLink() || !info.isDirectory())
      throw new Error("QA manifest directory cannot contain symlinks or files");
    const actual = await realpath(current);
    const actualRelative = relative(root, actual);
    if (
      actualRelative === ".." ||
      actualRelative.startsWith(`..${sep}`) ||
      actualRelative.startsWith(sep)
    ) {
      throw new Error("QA manifest directory resolved outside the repository");
    }
  }
  await chmod(target, 0o700);
  return target;
}

export function validateManifest(manifest) {
  assertManifestSafe(manifest);
  const fail = () => {
    throw new Error("Malformed or unsupported QA manifest");
  };
  if (
    !manifest ||
    typeof manifest !== "object" ||
    Array.isArray(manifest) ||
    ![1, 2].includes(manifest.schemaVersion) ||
    !/^qa-[a-zA-Z0-9-]{12,80}$/.test(manifest.runId || "") ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      manifest.organizationId || "",
    ) ||
    !["development", "test"].includes(manifest.environment) ||
    (manifest.schemaVersion === 1 &&
      manifest.scenarioName !== undefined &&
      manifest.scenarioName !== "baseline") ||
    (manifest.schemaVersion === 2 &&
      !Object.hasOwn(QA_SCENARIOS, manifest.scenarioName || "baseline")) ||
    typeof manifest.stage !== "string" ||
    !manifest.resources ||
    typeof manifest.resources !== "object" ||
    Array.isArray(manifest.resources) ||
    !manifest.idempotencyKeys ||
    typeof manifest.idempotencyKeys !== "object" ||
    Array.isArray(manifest.idempotencyKeys) ||
    !Array.isArray(manifest.completedOperations) ||
    !manifest.completedOperations.every((item) => typeof item === "string") ||
    !Array.isArray(manifest.failedOperations) ||
    !manifest.failedOperations.every(
      (item) =>
        item &&
        typeof item.operation === "string" &&
        typeof item.error === "string" &&
        typeof item.at === "string",
    ) ||
    !Number.isFinite(Date.parse(manifest.updatedAt))
  ) {
    fail();
  }
  for (const collection of RESOURCE_COLLECTIONS) {
    if (
      collection === "scenarioRecords" &&
      manifest.resources[collection] === undefined
    )
      continue;
    if (
      manifest.schemaVersion === 1 &&
      collection === "exports" &&
      manifest.resources.exports === undefined
    )
      continue;
    const items = manifest.resources[collection];
    if (
      !Array.isArray(items) ||
      !items.every((item) => item && typeof item.id === "string")
    ) {
      fail();
    }
  }
  for (const [operation, key] of Object.entries(manifest.idempotencyKeys)) {
    if (
      !/^[a-z0-9-]{1,80}$/i.test(operation) ||
      typeof key !== "string" ||
      key.length < 1 ||
      key.length > 160
    ) {
      fail();
    }
  }
  return manifest;
}

export function createManifest({
  runId = newRunId(),
  organizationId,
  environment = "development",
  scenarioName = "baseline",
}) {
  return {
    schemaVersion: 2,
    runId,
    environment,
    scenarioName,
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
      exports: [],
      scenarioRecords: [],
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
      grossPayments: "220000",
      reversedPayments: "60000",
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
  validateManifest(manifest);
  manifest.updatedAt = new Date().toISOString();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700);
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx",
  });
  await rename(temp, path);
}

export async function loadManifest(path) {
  const manifest = JSON.parse(await readFile(path, "utf8"));
  return validateManifest(manifest);
}

export function operationKey(manifest, operation) {
  manifest.idempotencyKeys[operation] ??= `${manifest.runId}-${operation}`;
  return manifest.idempotencyKeys[operation];
}

export async function acquireRunLock(runId, directory = ".qa-runs") {
  const path = manifestPath(runId, directory);
  const lockPath = `${path}.lock`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700);
  const token = randomUUID();
  const content = `${JSON.stringify({ pid: process.pid, token, createdAt: Date.now() })}\n`;
  let handle;
  try {
    handle = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    let stale = false;
    try {
      const lock = JSON.parse(await readFile(lockPath, "utf8"));
      if (!Number.isInteger(lock.pid) || typeof lock.token !== "string") {
        throw new Error(
          "Invalid QA run lock; remove it only after confirming no run is active",
        );
      }
      try {
        process.kill(lock.pid, 0);
      } catch (processError) {
        if (processError.code === "ESRCH") stale = true;
        else throw processError;
      }
    } catch (readError) {
      if (readError.code === "ENOENT") return acquireRunLock(runId, directory);
      throw readError;
    }
    if (!stale)
      throw new Error(`QA run ${runId} is already active in another process`);
    await unlink(lockPath);
    return acquireRunLock(runId, directory);
  }
  try {
    await handle.writeFile(content);
    await handle.close();
  } catch (error) {
    await handle.close().catch(() => {});
    await unlink(lockPath).catch(() => {});
    throw error;
  }
  return async () => {
    try {
      const lock = JSON.parse(await readFile(lockPath, "utf8"));
      if (lock.token === token) await unlink(lockPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  };
}
