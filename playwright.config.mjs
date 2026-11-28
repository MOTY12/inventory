import { defineConfig } from "@playwright/test";

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
    baseURL: process.env.QA_WEB_BASE_URL || "http://localhost:3000",
    browserName: "chromium",
    channel: process.env.QA_CHROME_CHANNEL || "chrome",
    headless: true,
    acceptDownloads: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
});
