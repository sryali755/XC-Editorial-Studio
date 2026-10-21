import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/phase1",
  workers: 1,
  reporter: "list",
});
