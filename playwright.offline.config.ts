import { defineConfig } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT ?? "3137";
const suite = process.env.XC_OFFLINE_BROWSER_MODE ?? "all";
if (!["all", "discovery", "legacy"].includes(suite))
  throw new Error("XC_OFFLINE_BROWSER_MODE must be all, discovery or legacy.");
if (suite !== "all")
  process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY =
    suite === "discovery" ? "true" : "false";

// Every browser spec belongs to the mode in which its page selectors are
// meaningful. The shared AI/unit suite remains in playwright.ai.config.ts.
const discoveryFiles = [
  "**/discovery-*.spec.ts",
  "**/document-upload.spec.ts",
  "**/input-pack-offline-real-pdf.spec.ts",
  "**/insight-discovery.spec.ts",
  "**/requirement2-*.spec.ts",
  "**/requirement3-primary-ui.spec.ts",
  "**/strategy-studio*.spec.ts",
  "**/strategy-suggestions.spec.ts",
];
const legacyFiles = [
  "**/agent-refinement.spec.ts",
  "**/ai-workflow.spec.ts",
  "**/brief-export.spec.ts",
  "**/imc-parser.spec.ts",
  "**/input-pack.spec.ts",
  "**/insight-discovery.spec.ts",
  "**/preparation-flow.spec.ts",
  "**/sparks-refinement.spec.ts",
  "**/upstream.spec.ts",
  "**/workflow.spec.ts",
  "**/workspace-improvements.spec.ts",
];

export default defineConfig({
  testDir: "./tests",
  testIgnore: "**/ai/**",
  ...(suite === "discovery"
    ? { testMatch: discoveryFiles }
    : suite === "legacy"
      ? { testMatch: legacyFiles }
      : {}),
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    channel: "chrome",
    launchOptions: {
      args: ["--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"],
    },
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port} --webpack`,
    url: `http://127.0.0.1:${port}`,
    env: {
      ...process.env,
      AI_MODE: "mock",
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "",
      XC_OFFLINE_TEST: "1",
      NEXT_PUBLIC_INSIGHT_DISCOVERY:
        process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY === "false"
          ? "false"
          : "true",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    reuseExistingServer: false,
  },
  reporter: "list",
});
