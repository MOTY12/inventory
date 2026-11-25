import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertAuthorizedOrganization,
  assertOrganizationIdentity,
  assertSafeTarget,
  QA_ORGANIZATION_NAME,
} from "./safety.mjs";
import {
  acquireRunLock,
  assertManifestSafe,
  createManifest,
  loadManifest,
  manifestPath,
  newRunId,
  operationKey,
  saveManifest,
  validateManifest,
} from "./manifest.mjs";
import { ApiClient } from "./api-client.mjs";
import {
  databaseIdentityFingerprint,
  verifyQaDatabaseTarget,
} from "./database-target.mjs";
import {
  assertQaChecks,
  oneOrNone,
  purchaseOrderMatches,
  qaScenarioFromEnvironment,
  runManifestDirectory,
  salesOrderMatches,
  scaled,
  transferMatches,
} from "./workflow.mjs";

const base = () => ({
  NODE_ENV: "development",
  QA_ENVIRONMENT: "development",
  QA_ORGANIZATION_ID: "123e4567-e89b-42d3-a456-426614174000",
  QA_ORGANIZATION_NAME: QA_ORGANIZATION_NAME,
  QA_API_BASE_URL: "http://localhost:4000/api/v1",
  DATABASE_URL: "postgresql://qa:local@127.0.0.1/inventory_dev?schema=public",
  QA_EMAIL: "qa@example.test",
  QA_PASSWORD: "never-logged",
});

test("QA safety gate rejects production, missing or mismatched org, and remote targets", () => {
  assert.throws(
    () => assertSafeTarget({ ...base(), NODE_ENV: "production" }),
    /non-production/,
  );
  assert.throws(
    () => assertSafeTarget({ ...base(), NODE_ENV: "" }),
    /non-production/,
  );
  assert.throws(
    () => assertSafeTarget({ ...base(), QA_ORGANIZATION_ID: "" }),
    /QA_ORGANIZATION_ID/,
  );
  assert.throws(
    () => assertSafeTarget({ ...base(), QA_ORGANIZATION_NAME: "Other" }),
    /exactly/,
  );
  assert.throws(
    () =>
      assertSafeTarget({
        ...base(),
        QA_API_BASE_URL: "https://api.example.com/api/v1",
      }),
    /local HTTP/,
  );
  assert.throws(
    () =>
      assertSafeTarget({
        ...base(),
        QA_API_BASE_URL: "http://localhost:4001/api/v1",
      }),
    /local HTTP/,
  );
  assert.throws(
    () =>
      assertSafeTarget({
        ...base(),
        DATABASE_URL: "postgresql://x:y@db.example.com/inventory_prod",
      }),
    /refuses/,
  );
  assert.throws(
    () => assertSafeTarget({ ...base(), QA_PASSWORD: "" }),
    /QA_EMAIL/,
  );
});

test("scenario selection defaults to baseline and rejects unsupported scenarios", () => {
  assert.equal(qaScenarioFromEnvironment({}), "baseline");
  assert.equal(
    qaScenarioFromEnvironment({ QA_SCENARIO: "baseline" }),
    "baseline",
  );
  assert.throws(
    () => qaScenarioFromEnvironment({ QA_SCENARIO: "multi-currency" }),
    /currently supported scenario: baseline/,
  );
});

test("only the explicitly authorized organization owner is accepted", () => {
  const id = base().QA_ORGANIZATION_ID;
  assert.throws(
    () => assertAuthorizedOrganization([], id),
    /not an active member/,
  );
  assert.throws(
    () =>
      assertAuthorizedOrganization(
        [{ organization: { id }, role: "MEMBER" }],
        id,
      ),
    /OWNER/,
  );
  assert.equal(
    assertAuthorizedOrganization([{ organization: { id }, role: "OWNER" }], id)
      .id,
    id,
  );
  assert.throws(
    () =>
      assertOrganizationIdentity(
        { id, name: "Other" },
        id,
        QA_ORGANIZATION_NAME,
      ),
    /identity/,
  );
});

test("database target verification matches the API's live connection and owner", async () => {
  const env = base();
  const identity = {
    database: "inventory_dev",
    schema: "public",
    serverAddress: "127.0.0.1",
    serverPort: 5432,
  };
  class FakeClient {
    async connect() {}
    async end() {}
    async query(sql) {
      if (sql.includes("current_database")) return { rows: [identity] };
      return {
        rowCount: 1,
        rows: [{ role: "OWNER", status: "ACTIVE", userStatus: "ACTIVE" }],
      };
    }
  }
  const fetchImpl = async (url, options) => {
    assert.equal(url, `${env.QA_API_BASE_URL}/health/ready`);
    assert.equal(options.redirect, "error");
    return new Response(
      JSON.stringify({
        databaseIdentity: databaseIdentityFingerprint(identity),
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  assert.equal(
    await verifyQaDatabaseTarget(env, env.QA_API_BASE_URL, {
      fetchImpl,
      Client: FakeClient,
    }),
    true,
  );
  class MemberClient extends FakeClient {
    async query(sql) {
      if (sql.includes("organizations o"))
        return {
          rowCount: 1,
          rows: [{ role: "MEMBER", status: "ACTIVE", userStatus: "ACTIVE" }],
        };
      return super.query(sql);
    }
  }
  await assert.rejects(
    verifyQaDatabaseTarget(env, env.QA_API_BASE_URL, {
      fetchImpl,
      Client: MemberClient,
    }),
    /active OWNER/,
  );
  await assert.rejects(
    verifyQaDatabaseTarget(env, env.QA_API_BASE_URL, {
      fetchImpl: async () =>
        new Response(JSON.stringify({ databaseIdentity: "wrong" }), {
          status: 200,
        }),
      Client: FakeClient,
    }),
    /does not match/,
  );
});

test("manifest IDs are unique, atomically resumable, and contain no auth secrets", async () => {
  const first = newRunId();
  const second = newRunId();
  assert.notEqual(first, second);
  const directory = await mkdtemp(join(tmpdir(), "qa-manifest-"));
  try {
    const manifest = createManifest({
      runId: first,
      organizationId: base().QA_ORGANIZATION_ID,
    });
    const key = operationKey(manifest, "receive-60");
    assert.equal(operationKey(manifest, "receive-60"), key);
    manifest.completedOperations.push("master-data");
    const path = manifestPath(first, directory);
    await saveManifest(manifest, path);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    const resumed = await loadManifest(path);
    assert.equal(resumed.runId, first);
    assert.equal(resumed.idempotencyKeys["receive-60"], key);
    assert.doesNotMatch(
      await readFile(path, "utf8"),
      /never-logged|password|accessToken/i,
    );
    assert.throws(
      () => assertManifestSafe({ metadata: { refreshToken: "secret" } }),
      /Secret-like/,
    );
    assert.throws(() => manifestPath("../escape"), /Invalid QA run/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("manifest schema rejects malformed collections and unsafe manifest directories", () => {
  const manifest = createManifest({
    organizationId: base().QA_ORGANIZATION_ID,
  });
  assert.equal(validateManifest(manifest), manifest);
  assert.throws(
    () => validateManifest({ ...manifest, resources: {} }),
    /Malformed or unsupported/,
  );
  assert.throws(
    () => runManifestDirectory({ QA_MANIFEST_DIR: "../outside" }),
    /repository-relative/,
  );
  assert.throws(
    () => runManifestDirectory({ QA_MANIFEST_DIR: "/tmp/qa" }),
    /repository-relative/,
  );
});

test("one run cannot execute concurrently and can safely resume after release", async () => {
  const directory = await mkdtemp(join(tmpdir(), "qa-lock-"));
  const id = newRunId();
  try {
    const release = await acquireRunLock(id, directory);
    await assert.rejects(acquireRunLock(id, directory), /already active/);
    await release();
    const releaseAfterResume = await acquireRunLock(id, directory);
    await releaseAfterResume();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("verifier fails closed on missing scenario data", async () => {
  const manifest = createManifest({
    organizationId: base().QA_ORGANIZATION_ID,
  });
  assert.equal(manifest.stage, "initialized");
  assert.equal(manifest.scenario, undefined);
});

test("API client never retries a non-idempotent mutation and reuses command keys on retry", async () => {
  let calls = 0;
  const headers = [];
  const fetchImpl = async (_url, options) => {
    calls++;
    headers.push(options.headers["Idempotency-Key"]);
    assert.equal(options.redirect, "error");
    if (calls < 3) throw new DOMException("timeout", "TimeoutError");
    return new Response("{}", {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  };
  const api = new ApiClient({
    baseUrl: "http://localhost:4000/api/v1",
    fetchImpl,
  });
  await assert.rejects(api.post("/unsafe", {}), /timeout/);
  assert.equal(calls, 1);
  await api.post("/safe", {}, "run-operation-1");
  assert.equal(calls, 3);
  assert.equal(headers[1], "run-operation-1");
  assert.equal(headers[2], "run-operation-1");
});

test("independent QA reconciliation fails when any expected invariant is false", () => {
  assert.equal(assertQaChecks({ ledger: true, stock: true }), true);
  assert.throws(() => assertQaChecks({ ledger: true, stock: false }), /stock/);
});

test("recovery requires exact scenario attributes and rejects ambiguity", () => {
  const supplier = { id: "supplier-1" };
  const customer = { id: "customer-1" };
  const warehouse = { id: "warehouse-1" };
  const source = { id: "source-1" };
  const product = { id: "product-1" };
  const unit = { id: "unit-1" };
  const po = {
    supplierId: supplier.id,
    warehouseId: source.id,
    currency: "NGN",
    lines: [
      {
        productId: product.id,
        unitId: unit.id,
        orderedQuantity: "100.000000",
        unitCost: "5000.0000",
      },
    ],
  };
  const order = {
    customerId: customer.id,
    warehouseId: warehouse.id,
    currency: "NGN",
    notes: "QA qa-20261125-abcdef12",
    lines: [
      {
        productId: product.id,
        unitId: unit.id,
        orderedQuantity: "20.000000",
        unitPrice: "8000.0000",
      },
    ],
  };
  const transfer = {
    sourceWarehouseId: source.id,
    destinationWarehouseId: warehouse.id,
    note: "QA qa-20261125-abcdef12",
    lines: [{ productId: product.id, requestedQuantity: "30.000000" }],
  };
  assert.equal(
    purchaseOrderMatches(po, { supplier, warehouse: source, product, unit }),
    true,
  );
  assert.equal(
    salesOrderMatches(order, {
      customer,
      warehouse,
      product,
      unit,
      runId: "qa-20261125-abcdef12",
    }),
    true,
  );
  assert.equal(
    transferMatches(transfer, {
      source,
      destination: warehouse,
      product,
      runId: "qa-20261125-abcdef12",
    }),
    true,
  );
  assert.equal(
    purchaseOrderMatches(
      { ...po, lines: [{ ...po.lines[0], unitCost: "5000.0001" }] },
      { supplier, warehouse: source, product, unit },
    ),
    false,
  );
  assert.equal(scaled("0.000001", 6), 1n);
  assert.equal(scaled("-0.000001", 6), -1n);
  assert.equal(oneOrNone([po], "order"), po);
  assert.throws(() => oneOrNone([po, po], "order"), /Ambiguous/);
});
