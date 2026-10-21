import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/phase2",
  testMatch: "roundtable.spec.ts",
  workers: 1,
  timeout: 60000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3179",
    channel: "chrome",
    headless: true,
    serviceWorkers: "block",
    launchOptions: {
      args: [
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-sync",
        "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
      ],
    },
  },
});
