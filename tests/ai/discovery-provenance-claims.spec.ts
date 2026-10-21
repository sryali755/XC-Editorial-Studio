import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { selectedFoundation } from "../../lib/ai/context";
import { validateDiscoveryEvidence } from "../../lib/ai/discovery-evidence";
import type { AgentDataMap, AgentRequest } from "../../lib/ai/schemas";
import { discoverySourceDocuments } from "../../lib/discovery-sources";
import { demoPack } from "../../lib/demo";
import { detectIMCCampaignScopes } from "../../lib/imc-campaign-scope";

const pdfBrief = [
  "## Source page 2",
  "Target audience",
  "Existing customers are moving to a new home.",
  "The transfer is available in the Xfinity app.",
  "## Source page 3",
  "Reason to Believe",
  "Most reliable WiFi with our best equipment included.",
].join("\n");

function request(
  sourceBrief = pdfBrief,
): Extract<AgentRequest, { agentType: "discovery" }> {
  return {
    agentType: "discovery",
    context: {
      foundation: {
        ...selectedFoundation(demoPack),
        sourceBrief,
        campaignContext: {
          ...selectedFoundation(demoPack).campaignContext,
          audience: "Existing customers are moving to a new home.",
        },
      },
      lens: "consumer",
      investigationType: "problem",
      question: "What is known about mover retention?",
      action: "initial",
      previousFindings: [],
    },
    guidance: "",
    versionNumber: 1,
  };
}

function output(locator: string): AgentDataMap["discovery"] {
  return {
    findings: [
      {
        title: "The brief names movers as an audience",
        whatWeFound:
          "The supplied brief identifies existing customers who are moving.",
        evidence: [
          {
            source: "IMC brief",
            locator,
            excerpt: "Existing customers are moving to a new home.",
            date: "Not supplied",
            audience: "Not supplied",
            context: "Supplied audience definition, not observed behavior",
            accessScope: "supplied",
          },
        ],
        whyItMayMatter:
          "This may narrow the investigation; it does not establish behavior.",
        whatComplicatesIt: "No customer outcome data is supplied.",
        questionToExplore: "What evidence shows why movers stay or leave?",
        evidenceState: "evidence_supported",
      },
    ],
    retrievalNote: "Only supplied evidence was analyzed.",
  };
}

test("PDF citations bind exact excerpts to the correct page, not the whole brief", () => {
  const input = request();
  const sources = discoverySourceDocuments(input.context.foundation);
  expect(sources).toContainEqual(
    expect.objectContaining({ locator: "imc:page:2" }),
  );
  expect(sources.some((source) => source.locator === "imc:brief")).toBe(false);
  expect(validateDiscoveryEvidence(input, output("imc:page:2"))).toBe("");
  expect(validateDiscoveryEvidence(input, output(""))).toContain("locator");
  expect(validateDiscoveryEvidence(input, output("imc:page:3"))).toContain(
    "locator",
  );
});

test("pasted text uses actual line spans, never invented PDF pages", () => {
  const input = request(
    "Audience\nExisting customers are moving to a new home.\n\nRTB\nMost reliable WiFi with our best equipment included.",
  );
  const sources = discoverySourceDocuments(input.context.foundation);
  const audience = sources.find((source) =>
    source.text.includes("Existing customers are moving to a new home."),
  );
  expect(audience?.locator).toMatch(/^imc:lines:\d+-\d+$/);
  expect(sources.some((source) => source.locator.startsWith("imc:page:"))).toBe(
    false,
  );
  expect(validateDiscoveryEvidence(input, output(audience!.locator))).toBe("");
  expect(validateDiscoveryEvidence(input, output("imc:page:2"))).toContain(
    "locator",
  );
});

test("PowerPoint evidence uses extracted slide numbers, not PDF page numbers", () => {
  const input = request(
    "## Source slide 4\nExisting customers are moving to a new home.\n## Source slide 5\nA separate product statement.",
  );
  const sources = discoverySourceDocuments(input.context.foundation);
  expect(sources.some((source) => source.locator === "imc:slide:4")).toBe(true);
  expect(validateDiscoveryEvidence(input, output("imc:slide:4"))).toBe("");
  expect(validateDiscoveryEvidence(input, output("imc:page:4"))).toContain(
    "locator",
  );
});

test("the two scoped campaigns in the actual client-PDF text cite their own physical pages", () => {
  const fixture = readFileSync(
    path.join(
      __dirname,
      "../fixtures/client-input-pack/imagine_that_full_extracted_text.txt",
    ),
    "utf8",
  );
  const [movers, pro] = detectIMCCampaignScopes(fixture);
  expect(movers).toBeDefined();
  expect(pro).toBeDefined();
  const moverRequest = request(movers.sourceText);
  const proRequest = request(pro.sourceText);
  const moverEvidence = output("imc:page:7");
  moverEvidence.findings[0].evidence[0].excerpt =
    "Existing customers & prospects who are moving. Both GM and multicultural audiences.";
  expect(validateDiscoveryEvidence(moverRequest, moverEvidence)).toBe("");
  expect(
    validateDiscoveryEvidence(moverRequest, output("imc:page:11")),
  ).toContain("cannot be verified");
  expect(validateDiscoveryEvidence(proRequest, moverEvidence)).toContain(
    "cannot be verified",
  );

  const proEvidence = output("imc:page:11");
  proEvidence.findings[0].evidence[0].excerpt =
    "Choose a device to boost and elevate your most important activity";
  expect(validateDiscoveryEvidence(proRequest, proEvidence)).toBe("");
  expect(validateDiscoveryEvidence(moverRequest, proEvidence)).toContain(
    "cannot be verified",
  );
});

test("a valid citation cannot launder invented customer quotes or statistics", () => {
  const input = request();
  const locator = discoverySourceDocuments(input.context.foundation).find(
    (source) =>
      source.text.includes("Existing customers are moving to a new home."),
  )!.locator;
  const quoted = output(locator);
  quoted.findings[0].whatWeFound +=
    ' Customers told us "I would never transfer my service."';
  expect(validateDiscoveryEvidence(input, quoted)).toContain("unsupported");

  const statistical = output(locator);
  statistical.findings[0].whatWeFound +=
    " 73% of movers abandon their provider.";
  expect(validateDiscoveryEvidence(input, statistical)).toContain(
    "unsupported",
  );

  const unrelatedNumber = output(locator);
  unrelatedNumber.findings[0].title = "73% of movers leave";
  unrelatedNumber.findings[0].evidence[0].excerpt =
    "The transfer is available in the Xfinity app.";
  expect(validateDiscoveryEvidence(input, unrelatedNumber)).toContain(
    "unsupported",
  );

  const disguisedAsInterpretation = output(locator);
  disguisedAsInterpretation.findings[0].whyItMayMatter =
    "It may matter because 73% of movers abandon their provider.";
  expect(validateDiscoveryEvidence(input, disguisedAsInterpretation)).toContain(
    "unsupported",
  );
});

test("a research gap cannot launder an unsupported quote or statistic, while qualified unknowns remain valid", () => {
  const input = request();
  const gap = output("imc:page:2");
  gap.findings[0].evidenceState = "research_gap";
  gap.findings[0].evidence = [];
  gap.findings[0].title = "Mover switching behavior is not documented";
  gap.findings[0].whatWeFound =
    "The supplied brief does not report a switching rate for movers.";
  expect(validateDiscoveryEvidence(input, gap)).toBe("");

  gap.findings[0].whatWeFound = "73% of movers switched providers.";
  expect(validateDiscoveryEvidence(input, gap)).toContain("unsupported");

  gap.findings[0].whatWeFound =
    'A customer said "I would never transfer my service."';
  expect(validateDiscoveryEvidence(input, gap)).toContain("unsupported");
});
