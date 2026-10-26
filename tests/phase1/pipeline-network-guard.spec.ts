import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
test("isolated pipeline guard blocks provider fetch, HTTP and raw sockets before transport", () => {
  const output = execFileSync(
    process.execPath,
    [
      "--require",
      path.resolve("tests/helpers/pipeline-offline-network.cjs"),
      "-e",
      `
    const assert = require('node:assert/strict');
    for (const host of ['api.openai.com', 'api.writer.com', 'api.anthropic.com', 'generativelanguage.googleapis.com']) {
      assert.throws(() => fetch('https://' + host), /PIPELINE_OFFLINE/);
      assert.throws(() => require('node:https').get('https://' + host), /PIPELINE_OFFLINE/);
      assert.throws(() => new (require('node:net').Socket)().connect({ host, port: 443 }), /PIPELINE_OFFLINE/);
    }
    console.log('blocked-before-transport');
  `,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        AI_MODE: "mock",
        OPENAI_API_KEY: "",
        XC_OFFLINE_TEST: "1",
        NODE_OPTIONS: "",
      },
    },
  );
  expect(output.trim()).toBe("blocked-before-transport");
});
test("guard refuses an accidentally live isolated server without exposing credentials", () => {
  expect(() =>
    execFileSync(
      process.execPath,
      [
        "--require",
        path.resolve("tests/helpers/pipeline-offline-network.cjs"),
        "-e",
        "process.exit(0)",
      ],
      {
        env: {
          ...process.env,
          AI_MODE: "live",
          OPENAI_API_KEY: "",
          XC_OFFLINE_TEST: "1",
          NODE_OPTIONS: "",
        },
        stdio: "pipe",
      },
    ),
  ).toThrow();
});
