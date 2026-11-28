import assert from "node:assert/strict";
import test from "node:test";
import { runQaPreflight } from "./preflight.mjs";

const base = () => ({
  NODE_ENV: "development",
  QA_ENVIRONMENT: "development",
  QA_API_BASE_URL: "http://localhost:4000/api/v1",
  QA_WEB_BASE_URL: "http://localhost:3001",
  QA_ORGANIZATION_ID: "123e4567-e89b-42d3-a456-426614174000",
  QA_ORGANIZATION_NAME: "Quality 001 QA Workspace",
  QA_EMAIL: "qa-owner@example.test",
  QA_PASSWORD: "test-only-not-a-real-secret",
  DATABASE_URL: "postgresql://local:test@localhost:5433/inventory_dev?schema=public",
  REDIS_PASSWORD: "test-only-not-a-real-secret",
});

const passingChecks = {
  "api-readiness": async () => {},
  "database-and-qa-workspace": async () => {},
  "redis-authenticated-ping": async () => {},
  "object-storage-bucket": async () => {},
  "frontend-login-page": async () => {},
  "migration-status": async () => {},
  "qa-owner-authentication": async () => {},
};

test("preflight reports missing login configuration without attempting auth", async () => {
  const env = base();
  delete env.QA_EMAIL;
  delete env.QA_PASSWORD;
  let authenticated = false;
  const report = await runQaPreflight(env, {
    ...passingChecks,
    "qa-owner-authentication": async () => {
      authenticated = true;
    },
  });
  assert.equal(report.status, "BLOCKED");
  assert.deepEqual(report.missingConfiguration, ["QA_EMAIL", "QA_PASSWORD"]);
  assert.equal(authenticated, false);
});

test("preflight rejects production or invalid development targets", async () => {
  const report = await runQaPreflight(
    { ...base(), NODE_ENV: "production" },
    passingChecks,
  );
  assert.equal(report.status, "FAILED");
  assert.match(report.checks[0].details, /QA_ENVIRONMENT/);
  assert.ok(report.checks.every((item) => item.status !== "ready"));
});

test("preflight rejects a mismatched QA organization before contacting services", async () => {
  let contacted = false;
  const report = await runQaPreflight(
    { ...base(), QA_ORGANIZATION_NAME: "Another workspace" },
    Object.fromEntries(
      Object.entries(passingChecks).map(([key]) => [key, async () => (contacted = true)]),
    ),
  );
  assert.equal(report.status, "FAILED");
  assert.equal(contacted, false);
});

test("preflight reports database identity failure without exposing connection values", async () => {
  const report = await runQaPreflight(base(), {
    ...passingChecks,
    "database-and-qa-workspace": async () => {
      throw new Error("Running API database identity does not match the approved local QA database");
    },
  });
  assert.equal(report.status, "FAILED");
  assert.match(
    report.checks.find((item) => item.name === "database-and-qa-workspace").details,
    /database identity does not match/,
  );
  assert.equal(JSON.stringify(report).includes("local:test"), false);
  assert.equal(JSON.stringify(report).includes("test-only-not-a-real-secret"), false);
});

test("preflight reports API, migration and authentication failures", async () => {
  const report = await runQaPreflight(base(), {
    ...passingChecks,
    "api-readiness": async () => {
      throw new Error("API /health/ready returned HTTP 503");
    },
    "migration-status": async () => {
      throw new Error("Prisma reports pending or unknown migrations");
    },
    "qa-owner-authentication": async () => {
      throw new Error("API POST /auth/login failed with HTTP 401: INVALID_CREDENTIALS");
    },
  });
  assert.equal(report.status, "FAILED");
  assert.deepEqual(
    report.checks
      .filter((item) => item.status === "failed")
      .map((item) => item.name),
    ["api-readiness", "migration-status", "qa-owner-authentication"],
  );
});

test("preflight returns READY only after every dependency and QA login pass", async () => {
  const report = await runQaPreflight(base(), passingChecks);
  assert.equal(report.status, "READY");
  assert.equal(report.checks.every((item) => item.status === "ready"), true);
  assert.equal(JSON.stringify(report).includes("test-only-not-a-real-secret"), false);
});
