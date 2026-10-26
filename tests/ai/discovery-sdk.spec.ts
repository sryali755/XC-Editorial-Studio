import { expect, test } from "@playwright/test";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { generateOpenAI } from "../../lib/ai/openai-provider";
import {
  discoveryGenerationSchema,
  outputSchemas,
  requestSchema,
  sparkGenerationSchema,
  sparkRevisionGenerationSchema,
  type AgentRequest,
} from "../../lib/ai/schemas";
import { mockConnections, mockDiscovery } from "../../lib/ai/mock-discovery";
import { discoveryFoundation } from "../../lib/discovery-context";
import {
  applyStudioSource,
  emptyStudio,
  studioPack,
} from "../../lib/discovery-studio";
import { inputPackVersion } from "../../lib/discovery";
import { mobileIMCBrief } from "../fixtures/mobile-imc-brief";

const pack = studioPack(applyStudioSource(emptyStudio(), mobileIMCBrief));
const foundation = discoveryFoundation(pack);
let previousModel: string | undefined;
test.beforeEach(() => {
  previousModel = process.env.OPENAI_MODEL;
  process.env.OPENAI_MODEL = "gpt-5.5";
});
test.afterEach(() => {
  if (previousModel === undefined) delete process.env.OPENAI_MODEL;
  else process.env.OPENAI_MODEL = previousModel;
});

function discoveryRequest(
  lens: "consumer" | "culture" | "category" | "brand" | "analogous",
  preparationRole?: "data_synthesis" | "evidence_sparks",
) {
  const request = requestSchema.parse({
    agentType: "discovery",
    context: {
      foundation,
      lens,
      ...(preparationRole ? { preparationRole } : {}),
      investigationType: "problem",
      question: "What might explain the campaign problem?",
      action: "initial",
      previousFindings: [],
    },
    versionNumber: 1,
  });
  if (request.agentType !== "discovery")
    throw new Error("Expected Discovery request");
  return request;
}

function assertStrictObjects(value: unknown) {
  if (!value || typeof value !== "object") return;
  if (!Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (record.properties && typeof record.properties === "object") {
      expect(record.additionalProperties).toBe(false);
      expect([...(record.required as string[])].sort()).toEqual(
        Object.keys(record.properties).sort(),
      );
    }
  }
  for (const child of Object.values(value)) assertStrictObjects(child);
}
function localTransport(
  data: unknown,
  inspect: (body: Record<string, unknown>) => void,
) {
  return new OpenAI({
    apiKey: "local-transport-test-sentinel",
    maxRetries: 0,
    fetch: async (url, init) => {
      expect(String(url)).toContain("/responses");
      inspect(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          id: "resp_discovery_fixture",
          object: "response",
          status: "completed",
          output: [
            {
              id: "msg_fixture",
              type: "message",
              role: "assistant",
              status: "completed",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify(data),
                  annotations: [],
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
}

test("every model-facing output schema serializes through the installed SDK; saved findings stay compatible", () => {
  const wireSchemas = {
    ...outputSchemas,
    discovery: discoveryGenerationSchema,
    sparks: sparkGenerationSchema,
    sparkRevision: sparkRevisionGenerationSchema,
  };
  for (const [name, schema] of Object.entries(wireSchemas)) {
    const format = zodTextFormat(schema, `xc_${name}`);
    expect(format.strict).toBe(true);
    assertStrictObjects(format.schema);
  }
  // This is the original pre-request failure. Keep the historical parser loose,
  // and require a locator string (possibly empty) only at the model boundary.
  expect(() =>
    zodTextFormat(outputSchemas.discovery, "legacy_parser_only"),
  ).toThrow(/validationIssues.*optional/);
  const historical = mockDiscovery(discoveryRequest("consumer"));
  expect(outputSchemas.discovery.safeParse(historical).success).toBe(true);
  expect(discoveryGenerationSchema.safeParse(historical).success).toBe(true);
  const previouslySavedWithoutLocator = {
    ...historical,
    findings: historical.findings.map((finding) => ({
      ...finding,
      evidence: finding.evidence.map((evidence) => {
        const historicalEvidence = { ...evidence };
        delete historicalEvidence.locator;
        return historicalEvidence;
      }),
    })),
  };
  expect(
    outputSchemas.discovery.safeParse(previouslySavedWithoutLocator).success,
  ).toBe(true);
  expect(
    discoveryGenerationSchema.safeParse(previouslySavedWithoutLocator).success,
  ).toBe(false);
});

test("all five lenses and both Discovery preparations reach SDK transport and parse a structured response", async () => {
  const requests = [
    "consumer",
    "culture",
    "category",
    "brand",
    "analogous",
  ].map((lens) =>
    discoveryRequest(
      lens as "consumer" | "culture" | "category" | "brand" | "analogous",
    ),
  );
  requests.push(
    discoveryRequest("consumer", "data_synthesis"),
    discoveryRequest("analogous", "evidence_sparks"),
  );
  let calls = 0;
  for (const request of requests) {
    const mock = mockDiscovery(request);
    const data = {
      ...mock,
      findings: mock.findings.map((finding) => ({
        ...finding,
        evidence: finding.evidence.map((evidence) => ({
          ...evidence,
          locator: "",
        })),
      })),
    };
    const sdk = localTransport(data, (body) => {
      calls++;
      expect(body.model).toBe("gpt-5.5");
      expect(body.reasoning).toEqual({ effort: "low" });
      expect(body.store).toBe(false);
      expect(body.input).toContain(JSON.stringify(mobileIMCBrief));
      const text = body.text as { format: { schema: unknown } };
      assertStrictObjects(text.format.schema);
      expect(JSON.stringify(body)).not.toContain(
        "local-transport-test-sentinel",
      );
    });
    expect(await generateOpenAI(request, sdk)).toEqual(data);
  }
  expect(calls).toBe(7);
});

test("cross-lens connections use the SDK structured transport with exact selected finding provenance", async () => {
  const findings = (["consumer", "brand"] as const).map((lens, index) => ({
    ...mockDiscovery(discoveryRequest(lens)).findings[0],
    id: `finding-${index}`,
    lensId: lens,
    runVersion: 1,
    inputPackVersion: inputPackVersion(pack),
    researchRunId: `run-${index}`,
  }));
  const request: AgentRequest = requestSchema.parse({
    agentType: "connections",
    context: { foundation, findings },
    guidance: "Preserve the disagreement.",
    versionNumber: 1,
  });
  if (request.agentType !== "connections")
    throw new Error("Expected connections");
  const data = mockConnections(request);
  let calls = 0;
  const sdk = localTransport(data, (body) => {
    calls++;
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body.input).toContain("run-0");
    expect(body.input).toContain("run-1");
  });
  expect(await generateOpenAI(request, sdk)).toEqual(data);
  expect(calls).toBe(1);
});
