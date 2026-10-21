import { expect, test } from "@playwright/test";
import { generateOpenAI } from "../../lib/ai/openai-provider";
import { createOfflineModelClient } from "../../lib/ai/offline-model-client";
import { generateAgentResponse } from "../../lib/ai/provider";
import type OpenAI from "openai";
import { parseIMCBrief } from "../../lib/imc-parser";
import { extractUpstream } from "../../lib/upstream";
import { demoIMCBrief } from "../../lib/preparation";

test("offline test guard blocks any real SDK call, even if AI_MODE is accidentally live", async () => {
  const previous = {
    mode: process.env.AI_MODE,
    key: process.env.OPENAI_API_KEY,
    offline: process.env.XC_OFFLINE_TEST,
  };
  try {
    process.env.AI_MODE = "live";
    process.env.OPENAI_API_KEY = "sk-test-not-a-real-key";
    process.env.XC_OFFLINE_TEST = "1";
    await expect(
      generateOpenAI({
        agentType: "rtb",
        context: {
          parsedIMC: parseIMCBrief(demoIMCBrief),
          upstream: extractUpstream(demoIMCBrief),
        },
      }),
    ).rejects.toMatchObject({
      code: "offline_test_external_ai_blocked",
      retryable: false,
    });
  } finally {
    for (const [key, value] of Object.entries({
      AI_MODE: previous.mode,
      OPENAI_API_KEY: previous.key,
      XC_OFFLINE_TEST: previous.offline,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("offline simulation needs no key and rejects an unregistered client", async () => {
  const previous = {
    mode: process.env.AI_MODE,
    key: process.env.OPENAI_API_KEY,
    offline: process.env.XC_OFFLINE_TEST,
  };
  try {
    process.env.AI_MODE = "mock";
    process.env.OPENAI_API_KEY = "";
    process.env.XC_OFFLINE_TEST = "1";
    const fake = createOfflineModelClient(["{}"]);
    expect(Object.keys(fake.sdk)).toEqual(["responses"]);
    const unregistered = {
      responses: {
        create: async () => {
          throw new Error("This unregistered client must never be called.");
        },
      },
    } as unknown as OpenAI;
    await expect(
      generateAgentResponse(
        {
          agentType: "rtb",
          context: {
            parsedIMC: parseIMCBrief(demoIMCBrief),
            upstream: extractUpstream(demoIMCBrief),
          },
        },
        unregistered,
      ),
    ).rejects.toMatchObject({ code: "offline_test_client_rejected" });
    expect(fake.calls()).toBe(0);
    delete process.env.XC_OFFLINE_TEST;
    expect(() => createOfflineModelClient(["{}"])).toThrow("XC_OFFLINE_TEST=1");
  } finally {
    for (const [key, value] of Object.entries({
      AI_MODE: previous.mode,
      OPENAI_API_KEY: previous.key,
      XC_OFFLINE_TEST: previous.offline,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("offline client errors stop without SDK fallback or a live-mode exception", async () => {
  const previous = {
    mode: process.env.AI_MODE,
    key: process.env.OPENAI_API_KEY,
    offline: process.env.XC_OFFLINE_TEST,
  };
  try {
    process.env.AI_MODE = "mock";
    process.env.OPENAI_API_KEY = "";
    process.env.XC_OFFLINE_TEST = "1";
    const fake = createOfflineModelClient([
      new Error("local simulated failure"),
    ]);
    const request = {
      agentType: "rtb" as const,
      context: {
        parsedIMC: parseIMCBrief(demoIMCBrief),
        upstream: extractUpstream(demoIMCBrief),
      },
    };
    await expect(
      generateAgentResponse(request, fake.sdk),
    ).rejects.toMatchObject({
      code: "provider_error",
      retryable: false,
    });
    expect(fake.calls()).toBe(1);
    process.env.AI_MODE = "live";
    await expect(
      generateAgentResponse(request, fake.sdk),
    ).rejects.toMatchObject({
      code: "offline_test_client_rejected",
    });
    expect(fake.calls()).toBe(1);
  } finally {
    for (const [key, value] of Object.entries({
      AI_MODE: previous.mode,
      OPENAI_API_KEY: previous.key,
      XC_OFFLINE_TEST: previous.offline,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
