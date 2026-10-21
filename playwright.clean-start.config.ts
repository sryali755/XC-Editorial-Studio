import { defineConfig } from "@playwright/test";
import base from "./playwright.phase2.config";
export default defineConfig({
  ...base,
  testDir: "./tests/clean-start",
  testMatch: "*.spec.ts",
  use: {
    ...base.use,
    baseURL: process.env.XC_CLEAN_TEST_ORIGIN ?? "http://localhost:3179",
  },
});
