import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "document-upload.spec.ts",
  workers: 1,
  outputDir: "test-results-production",
  use: { baseURL: "http://127.0.0.1:3103", headless: true, channel: "chrome" },
  webServer: {
    command: "npm run start -- --port 3103",
    url: "http://127.0.0.1:3103",
    env: {
      ...process.env,
      AI_MODE: "mock",
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "",
      XC_OFFLINE_TEST: "1",
      NEXT_PUBLIC_INSIGHT_DISCOVERY: "true",
    },
    reuseExistingServer: false,
  },
  reporter: "list",
});
