import { defineConfig } from "@playwright/test";
import path from "node:path";
const appDirectory = process.env.XC_PIPELINE_APP_DIR;
if (!appDirectory)
  throw Error(
    "Use an isolated temporary XC_PIPELINE_APP_DIR; never reuse the live development server.",
  );
const port = Number(process.env.XC_PIPELINE_PORT ?? 3217);
if (port === 3000)
  throw Error("Pipeline verification must not use localhost:3000.");
export default defineConfig({
  testDir: "./tests",
  testMatch: "document-pipeline-reliability.spec.ts",
  workers: 1,
  reporter: "list",
  timeout: 60000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    channel: "chrome",
    serviceWorkers: "block",
  },
  webServer: {
    command: `'${path.resolve("node_modules/.bin/next").replace(/'/g, "'\\''")}' dev --webpack --hostname 127.0.0.1 --port ${port}`,
    cwd: appDirectory,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    env: {
      ...process.env,
      AI_MODE: "mock",
      OPENAI_API_KEY: "",
      XC_OFFLINE_TEST: "1",
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_INSIGHT_DISCOVERY: "true",
      NODE_OPTIONS: `--require ${JSON.stringify(path.resolve("tests/helpers/pipeline-offline-network.cjs"))}`,
    },
  },
});
