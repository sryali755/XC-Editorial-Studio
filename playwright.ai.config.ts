import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/ai",
  workers: 1,
  reporter: "list",
});
