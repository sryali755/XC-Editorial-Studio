import { expect, test } from "@playwright/test";
import sample from "../../lib/samples/kevin-imc.json";
import {
  applyStudioSource,
  emptyStudio,
  studioPack,
} from "../../lib/discovery-studio";
import { discoveryFoundation } from "../../lib/discovery-context";
import { requestSchema, type AgentDataMap } from "../../lib/ai/schemas";
import { discoveryPrompt } from "../../lib/ai/discovery-prompts";
import { validateDiscoveryEvidence } from "../../lib/ai/discovery-evidence";

for (const lens of [
  "consumer",
  "culture",
  "category",
  "brand",
  "analogous",
] as const) {
  test(`${lens}: another answer is distinct from refresh and rejects recycled findings`, () => {
    const request = requestSchema.parse({
      agentType: "discovery",
      context: {
        foundation: discoveryFoundation(
          studioPack(applyStudioSource(emptyStudio(), sample.text)),
        ),
        lens,
        investigationType: "problem",
        question: "What barriers matter?",
        action: "another_answer",
        previousFindings: [],
      },
      guidance: "Consider a different qualification.",
    });
    if (request.agentType !== "discovery") throw new Error("Wrong agent");
    const prompt = discoveryPrompt(request);
    const input = JSON.parse(prompt.input);
    expect(input.actionInstruction).toContain("exactly ONE");
    expect(input.actionInstruction).toContain("not an evidence refresh");
    expect(input.actionInstruction).toContain("never invent evidence");
    expect(prompt.input).toContain(JSON.stringify(sample.text));
    expect(input.strategistGuidance).toBe(request.guidance);
    const data: AgentDataMap["discovery"] = {
      findings: [
        {
          title:
            lens === "analogous"
              ? "A comparable transfer-effort case is needed"
              : "A precise open question",
          whatWeFound:
            lens === "analogous"
              ? "The supplied brief does not document another case that reduced transfer effort."
              : "The supplied brief does not establish the role of transfer effort.",
          evidence: [],
          whyItMayMatter: "Effort may be relevant, not proven.",
          whatComplicatesIt: "No observed behavior supplied.",
          questionToExplore:
            "Which transfer steps need customer journey evidence?",
          evidenceState: "research_gap",
        },
      ],
      retrievalNote: "Only supplied material analyzed.",
    };
    expect(validateDiscoveryEvidence(request, data)).toBe("");
    const duplicateRequest = {
      ...request,
      context: {
        ...request.context,
        previousFindings: [
          {
            ...data.findings[0],
            id: "earlier",
            lensId: lens,
            inputPackVersion: "v1",
            runVersion: 1,
          },
        ],
      },
    };
    expect(validateDiscoveryEvidence(duplicateRequest, data)).toContain(
      "repeats",
    );
    expect(
      validateDiscoveryEvidence(duplicateRequest, {
        ...data,
        findings: [
          {
            ...data.findings[0],
            title:
              lens === "analogous"
                ? "A comparable eligibility-friction case needs a separate check"
                : "Offer eligibility needs a separate check",
            whatWeFound:
              lens === "analogous"
                ? "Which original case documents show how another context handled eligibility differences and the limits of transfer?"
                : "Which source documents confirm eligibility differences between prospect and customer executions?",
          },
        ],
      }),
    ).toBe("");
    expect(
      validateDiscoveryEvidence(duplicateRequest, {
        ...data,
        findings: [{ ...data.findings[0], title: "A changed title only" }],
      }),
    ).toContain("repeats");
    expect(
      validateDiscoveryEvidence(request, {
        ...data,
        findings: [...data.findings, ...data.findings],
      }),
    ).toContain("exactly one");
    const refresh = discoveryPrompt({
      ...request,
      context: { ...request.context, action: "refresh" },
    });
    expect(JSON.parse(refresh.input).actionInstruction).not.toBe(
      input.actionInstruction,
    );
  });
}
