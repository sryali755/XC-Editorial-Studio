import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/live-writer",
  workers: 1,
  retries: 0,
  timeout: 1_800_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  outputDir: (process.env.XC_LIVE_OUTPUT || "/private/tmp/xc-live-journey") + "/results",
  use: {
    baseURL: process.env.XC_LIVE_BASE_URL || "http://127.0.0.1:3000",
    channel: "chrome",
    headless: true,
    viewport: { width: 1600, height: 1000 },
    actionTimeout: 20_000,
    screenshot: "only-on-failure",
  },
});
