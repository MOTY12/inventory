import { defineConfig } from "@playwright/test";
import { assertSafeWebTarget } from "./scripts/qa/safety.mjs";

const baseURL = assertSafeWebTarget(
  process.env.QA_WEB_BASE_URL || "http://localhost:3000",
);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: "list",
  outputDir: ".qa-artifacts/playwright",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    browserName: "chromium",
    channel: process.env.QA_CHROME_CHANNEL || "chrome",
    headless: true,
    acceptDownloads: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
});
