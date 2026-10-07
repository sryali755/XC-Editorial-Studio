import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testIgnore: "**/ai/**",
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3000", headless: true, channel: "chrome" },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
  },
  reporter: "list",
});
