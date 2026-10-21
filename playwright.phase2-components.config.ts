import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/phase2",
  testMatch: "orchestration.spec.ts",
  workers: 1,
  reporter: "list",
});
