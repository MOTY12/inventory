import assert from "node:assert/strict";
import test from "node:test";
import { localEnvironmentSchema } from "../dist/index.js";

test("local environment schema accepts the example configuration", () => {
  const parsed = localEnvironmentSchema.parse({
    POSTGRES_USER: "inventory",
    POSTGRES_PASSWORD: "local-dev-only-change-me",
    POSTGRES_DB: "inventory_dev",
    POSTGRES_PORT: "5432",
    REDIS_PASSWORD: "local-dev-only-change-me",
    REDIS_PORT: "6379",
    S3_REGION: "us-east-1",
    S3_BUCKET: "inventory-local",
    S3_PORT: "9090",
  });

  assert.equal(parsed.POSTGRES_PORT, 5432);
  assert.equal(parsed.REDIS_PORT, 6379);
  assert.equal(parsed.S3_PORT, 9090);
});

test("local environment schema rejects invalid ports and weak credentials", () => {
  const parsed = localEnvironmentSchema.safeParse({
    POSTGRES_PASSWORD: "short",
    REDIS_PASSWORD: "short",
    POSTGRES_PORT: "70000",
  });

  assert.equal(parsed.success, false);
});

test("local environment schema supplies safe local defaults", () => {
  const parsed = localEnvironmentSchema.parse({});

  assert.equal(parsed.POSTGRES_DB, "inventory_dev");
  assert.equal(parsed.REDIS_PORT, 6379);
});
