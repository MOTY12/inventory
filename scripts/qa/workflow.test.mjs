import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
  assertManifestSafe,
  createManifest,
  loadManifest,
  manifestPath,
  newRunId,
  operationKey,
  saveManifest,
} from "./manifest.mjs";
import { ApiClient } from "./api-client.mjs";
import { assertQaChecks } from "./workflow.mjs";

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
