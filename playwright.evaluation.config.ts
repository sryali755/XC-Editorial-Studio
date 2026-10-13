import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./evaluations",
  testMatch: "**/*.spec.ts",
  workers: 1,
  timeout: 900000,
  reporter: "list",
});
