import { expect, test } from "@playwright/test";
import sample from "../../lib/samples/kevin-imc.json";
import {
  applyStudioSource,
  emptyStudio,
  studioPack,
  studioPackLabel,
} from "../../lib/discovery-studio";
import { discoveryFoundation } from "../../lib/discovery-context";
import { requestSchema } from "../../lib/ai/schemas";
import { buildAgentPrompt } from "../../lib/ai/prompts";
import { validateDiscoveryEvidence } from "../../lib/ai/discovery-evidence";

test("real supplied three-page IMC preserves objective, full tactic RTBs and unknown approval", () => {
  const session = applyStudioSource(emptyStudio(), sample.text);
  const pack = studioPack(session);
  expect(pack.parsedIMC?.sourceText).toBe(sample.text);
  expect(pack.campaignName).toBe("Ecosystem - Campaign Extensions");
  expect(pack.objective).toContain(
    "Evolve Xfinity to be about more than just WiFi",
  );
  expect(pack.objective).toContain(
    "Make us a brand that people want to be a part of",
  );
  expect(pack.audience).toBe("Total audience – prospect and customer (GM)");
  expect(pack.reasonToBelieve).toContain(
    "Xfinity products are better together.",
  );
  expect(pack.reasonToBelieve).toContain("Long Form Tactics");
  expect(pack.reasonToBelieve).toContain("Short Form Tactics");
  expect(pack.reasonToBelieve).toContain(
    "*Italicized lines are headlines provided by GSP",
  );
  expect(pack.rtbApprovalStatus).toBe("unknown");
  expect(sample.pages.map((page) => page.page)).toEqual([7, 8, 9]);
  expect(sample.sha256).toMatch(/^[a-f0-9]{64}$/);
});

test("problem and hypothesis use distinct instructions and the entire current source plus human focus", () => {
  const foundation = discoveryFoundation(
    studioPack(applyStudioSource(emptyStudio(), sample.text)),
  );
  const prompts = ["problem", "hypothesis"].map((investigationType) =>
    buildAgentPrompt(
      requestSchema.parse({
        agentType: "discovery",
        context: {
          foundation,
          lens: "consumer",
          investigationType,
          question: "Does ecosystem awareness explain limited consideration?",
          action: "initial",
          previousFindings: [],
        },
      }),
    ),
  );
  expect(prompts[0].instructions).toContain("EXPLORE A PROBLEM:");
  expect(prompts[0].instructions).toContain("multiple possible causes");
  expect(prompts[0].instructions).not.toContain("INVESTIGATE A HYPOTHESIS:");
  expect(prompts[1].instructions).toContain("INVESTIGATE A HYPOTHESIS:");
  expect(prompts[1].instructions).toContain("what would disconfirm it");
  for (const prompt of prompts) {
    expect(prompt.input).toContain(JSON.stringify(sample.text));
    expect(prompt.input).toContain(
      "Does ecosystem awareness explain limited consideration?",
    );
    expect(prompt.instructions).toContain("neither replaces the other");
  }
});

test("exact real-source excerpts validate but fabricated quotations fail", () => {
  const request = requestSchema.parse({
    agentType: "discovery",
    context: {
      foundation: discoveryFoundation(
        studioPack(applyStudioSource(emptyStudio(), sample.text)),
      ),
      lens: "consumer",
      investigationType: "problem",
      question: "What remains unknown about the audience?",
      action: "initial",
      previousFindings: [],
    },
  });
  if (request.agentType !== "discovery") throw new Error("Wrong request");
  const finding = {
    title: "The brief defines a broad audience",
    whatWeFound:
      "The supplied audience includes prospects and customers, not observed behavior.",
    evidence: [
      {
        source: "IMC brief — audience",
        locator: "imc:page:7",
        excerpt: "Total audience – prospect and customer (GM)",
        date: "Not supplied",
        audience: "Not supplied",
        context: "Original campaign brief",
        accessScope: "supplied" as const,
      },
    ],
    whyItMayMatter: "Audience differences could matter.",
    whatComplicatesIt: "No measured behavior supplied.",
    questionToExplore: "What differs between these audiences?",
    evidenceState: "evidence_supported" as const,
  };
  expect(
    validateDiscoveryEvidence(request, {
      findings: [finding],
      retrievalNote: "Supplied source only",
    }),
  ).toBe("");
  expect(
    validateDiscoveryEvidence(request, {
      findings: [
        {
          ...finding,
          evidence: [{ ...finding.evidence[0], locator: "imc:page:8" }],
        },
      ],
      retrievalNote: "Supplied source only",
    }),
  ).toContain("locator");
  expect(
    validateDiscoveryEvidence(request, {
      findings: [
        {
          ...finding,
          evidence: [
            {
              ...finding.evidence[0],
              excerpt:
                "A representative survey proved ecosystem preference increased 50%.",
            },
          ],
        },
      ],
      retrievalNote: "Supplied source only",
    }),
  ).toContain("cannot be verified");
});

test("input pack labels are readable and repeated unchanged source does not invent a revision", () => {
  const first = applyStudioSource(emptyStudio(), sample.text);
  expect(studioPackLabel(first)).toBe("Input pack v1");
  expect(studioPackLabel(applyStudioSource(first, sample.text))).toBe(
    "Input pack v1",
  );
  const changed = applyStudioSource(
    first,
    sample.text + "\nCampaign note: New supplied context.",
  );
  expect(studioPackLabel(changed)).toBe("Input pack v2");
  expect(changed.packHistory[0].pack.parsedIMC?.sourceText).toBe(sample.text);
});
