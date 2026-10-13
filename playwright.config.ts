import { defineConfig } from "@playwright/test";
const port = process.env.PLAYWRIGHT_PORT ?? "3000";
export default defineConfig({
  testDir: "./tests",
  testIgnore: "**/ai/**",
  fullyParallel: false,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    channel: "chrome",
  },
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    env: {
      ...process.env,
      AI_MODE: "mock",
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "",
    },
    reuseExistingServer: false,
  },
  reporter: "list",
});
