import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { loadManifest, manifestPath } from "../../../scripts/qa/manifest.mjs";
import {
  assertSafeTarget,
  assertSafeWebTarget,
} from "../../../scripts/qa/safety.mjs";

export async function loadQaBrowserRun(scenarioName, env = process.env) {
  const safe = assertSafeTarget(env);
  assertSafeWebTarget(env.QA_WEB_BASE_URL || "http://localhost:3000");
  if (!env.QA_EMAIL || !env.QA_PASSWORD)
    throw new Error("Set QA_EMAIL and QA_PASSWORD in the ignored local .env");
  if (!env.QA_RUN_ID)
    throw new Error(`Set QA_RUN_ID to an approved ${scenarioName} run`);

  const runPath = manifestPath(env.QA_RUN_ID);
  const manifest = await loadManifest(runPath);
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.scenarioName, scenarioName);
  assert.equal(manifest.runId, env.QA_RUN_ID);
  assert.equal(manifest.organizationId, safe.organizationId);
  return {
    manifest,
    organizationId: safe.organizationId,
    runId: env.QA_RUN_ID,
    runPath,
  };
}

export async function signInQaOwner(page, organizationId, env = process.env) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(env.QA_EMAIL);
  await page.getByLabel("Password").fill(env.QA_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByLabel("Switch business")).toHaveValue(organizationId);
}
