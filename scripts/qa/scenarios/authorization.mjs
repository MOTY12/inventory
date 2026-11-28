import { ApiClient } from "../api-client.mjs";

const ROOT = "/organizations/current";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function required(env, key) {
  const value = env[key];
  if (!value) throw new Error(`Authorization scenario requires ${key}`);
  return value;
}

function expectUuid(env, key) {
  const value = required(env, key);
  if (!UUID.test(value)) throw new Error(`${key} must be a UUID`);
  return value;
}

async function expectStatus(label, expected, request) {
  try {
    await request();
  } catch (error) {
    if (error.status === expected) return { label, status: error.status };
    throw new Error(
      `${label}: expected HTTP ${expected}, received HTTP ${error.status || "unknown"}`,
    );
  }
  throw new Error(`${label}: expected HTTP ${expected}, request succeeded`);
}

async function actorClient(baseUrl, email, password, organizationId, role) {
  const client = new ApiClient({ baseUrl });
  await client.login(email, password);
  const memberships = await client.get("/organizations");
  const membership = memberships.find(
    (item) => item.organization?.id === organizationId,
  );
  if (!membership || membership.role !== role)
    throw new Error(
      `Configured authorization identity must have ${role} membership in the QA organization`,
    );
  const selected = await client.post(`/organizations/${organizationId}/select`);
  client.accessToken = selected.accessToken;
  return client;
}

/** Read-only permission probes; the only POST is a denied export request. */
export async function runAuthorizationScenario(
  ownerApi,
  manifest,
  env = process.env,
) {
  const orgId = manifest.organizationId;
  const finance = await actorClient(
    ownerApi.baseUrl,
    required(env, "QA_AUTH_FINANCE_EMAIL"),
    required(env, "QA_AUTH_FINANCE_PASSWORD"),
    orgId,
    "FINANCE",
  );
  const sales = await actorClient(
    ownerApi.baseUrl,
    required(env, "QA_AUTH_SALES_EMAIL"),
    required(env, "QA_AUTH_SALES_PASSWORD"),
    orgId,
    "SALES",
  );
  const warehouse = await actorClient(
    ownerApi.baseUrl,
    required(env, "QA_AUTH_WAREHOUSE_EMAIL"),
    required(env, "QA_AUTH_WAREHOUSE_PASSWORD"),
    orgId,
    "WAREHOUSE_CLERK",
  );
  const foreign = await actorClient(
    ownerApi.baseUrl,
    required(env, "QA_AUTH_FOREIGN_EMAIL"),
    required(env, "QA_AUTH_FOREIGN_PASSWORD"),
    expectUuid(env, "QA_AUTH_FOREIGN_ORGANIZATION_ID"),
    required(env, "QA_AUTH_FOREIGN_ROLE"),
  );

  const expectedAllowedWarehouse = expectUuid(
    env,
    "QA_AUTH_ALLOWED_WAREHOUSE_ID",
  );
  const fixtureWarehouses = manifest.resources.warehouses;
  if (!fixtureWarehouses.some((item) => item.id === expectedAllowedWarehouse))
    throw new Error(
      "Configured warehouse grant must point to a warehouse in this run's QA fixtures",
    );
  const deniedWarehouse = fixtureWarehouses.find(
    (item) => item.id !== expectedAllowedWarehouse,
  );
  if (!deniedWarehouse)
    throw new Error(
      "Authorization scenario requires at least two fixture warehouses",
    );

  const checks = [];
  await finance.get(`${ROOT}/reports/sales/summary`);
  checks.push({ label: "finance report allowed", status: 200 });
  checks.push(
    await expectStatus("sales financial report denied", 403, () =>
      sales.get(`${ROOT}/reports/sales/summary`),
    ),
  );
  await warehouse.get(
    `/inventory/warehouses/${expectedAllowedWarehouse}/balances?page=1&page_size=25`,
  );
  checks.push({ label: "granted warehouse readable", status: 200 });
  checks.push(
    await expectStatus("ungranted warehouse denied", 404, () =>
      warehouse.get(
        `/inventory/warehouses/${deniedWarehouse.id}/balances?page=1&page_size=25`,
      ),
    ),
  );
  checks.push(
    await expectStatus("branch filter cannot grant warehouse access", 404, () =>
      warehouse.get(
        `${ROOT}/reports/inventory-summary?warehouse_id=${deniedWarehouse.id}&branch_id=${deniedWarehouse.branchId}`,
      ),
    ),
  );
  checks.push(
    await expectStatus("sales export permission denied", 403, () =>
      sales.post(
        `${ROOT}/reports/exports`,
        { report_type: "SALES_PRODUCTS", filters: {} },
        `auth-${manifest.runId}-sales-denied-export`,
      ),
    ),
  );

  const foreignProductId = expectUuid(env, "QA_AUTH_FOREIGN_PRODUCT_ID");
  await foreign.get(`${ROOT}/catalog/products/${foreignProductId}`);
  checks.push({
    label: "foreign identity reads own tenant product",
    status: 200,
  });
  checks.push(
    await expectStatus("cross-tenant product denied", 404, () =>
      finance.get(`${ROOT}/catalog/products/${foreignProductId}`),
    ),
  );
  checks.push(
    await expectStatus("foreign user cannot select QA organization", 404, () =>
      foreign.post(`/organizations/${orgId}/select`),
    ),
  );

  const result = { checks, verifiedAt: new Date().toISOString() };
  manifest.resources.scenarioRecords ??= [];
  const existing = manifest.resources.scenarioRecords.find(
    (item) => item.label === "authorization",
  );
  if (existing) existing.result = result;
  else
    manifest.resources.scenarioRecords.push({
      id: manifest.runId,
      label: "authorization",
      result,
    });
  return result;
}

export function verifyAuthorizationScenarioResult(result) {
  const expectedLabels = [
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
  if (!result || !Array.isArray(result.checks))
    throw new Error("Authorization evidence is missing");
  const labels = result.checks.map((check) => check.label);
  if (
    labels.length !== expectedLabels.length ||
    new Set(labels).size !== labels.length ||
    expectedLabels.some((label) => !labels.includes(label))
  )
    throw new Error("Authorization evidence is incomplete or duplicated");
  const expectedStatuses = [200, 403, 200, 404, 404, 403, 200, 404, 404];
  for (const [index, check] of result.checks.entries())
    if (check.status !== expectedStatuses[index])
      throw new Error(`Authorization check failed: ${check.label}`);
  return { checks: labels.length, status: "verified" };
}
