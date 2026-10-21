import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { selectedFoundation } from "../../lib/ai/context";
import { createOfflineModelClient } from "../../lib/ai/offline-model-client";
import { discoveryPrompt } from "../../lib/ai/discovery-prompts";
import { mockDiscovery } from "../../lib/ai/mock-discovery";
import { generateAgentResponse } from "../../lib/ai/provider";
import { requestSchema, type AgentRequest } from "../../lib/ai/schemas";
import { buildDiscoveryConversationMemory } from "../../lib/discovery-conversation-memory";
import {
  connectDiscoveryFindings,
  generateDiscoveryVersion,
  inputPackVersion,
} from "../../lib/discovery";
import {
  applyStudioSource,
  emptyStudio,
  studioPack,
} from "../../lib/discovery-studio";
import { detectIMCCampaignScopes } from "../../lib/imc-campaign-scope";
import { discoverySourceDocuments } from "../../lib/discovery-sources";
import type {
  DiscoveryFinding,
  DiscoveryLensId,
  DiscoveryThreadMessage,
} from "../../lib/types";

const fixture = path.join(
  __dirname,
  "../fixtures/client-input-pack/imagine_that_full_extracted_text.txt",
);
const lenses: DiscoveryLensId[] = [
  "consumer",
  "culture",
  "category",
  "brand",
  "analogous",
];
const question = "What evidence could explain this campaign problem?";

test("both real-PDF campaign scopes send ordered three-turn continuity to each isolated lens's in-memory client", async () => {
  const scopes = detectIMCCampaignScopes(readFileSync(fixture, "utf8"));
  expect(scopes).toHaveLength(2);
  for (const campaign of scopes) {
    const pack = studioPack(
      applyStudioSource(emptyStudio(), campaign.sourceText),
    );
    const foundation = selectedFoundation(pack);
    expect(foundation.sourceBrief).toBe(campaign.sourceText);
    for (const lens of lenses) {
      const threadId = `${campaign.title}:${lens}:focus-1`;
      const scope = {
        kind: "agent" as const,
        threadId,
        inputPackVersion: inputPackVersion(pack),
        question,
        investigationType: "problem" as const,
      };
      const time = "2026-10-17T12:00:00.000Z";
      const context = (
        id: string,
        author: "Kevin" | "Agent",
        text: string,
      ): DiscoveryThreadMessage => ({
        id,
        author,
        text,
        createdAt: time,
        threadId,
        inputPackVersion: scope.inputPackVersion,
        question,
        investigationType: "problem",
        lensId: lens,
        status: "complete",
      });
      const previous = [
        context(
          `${lens}-u1`,
          "Kevin",
          `For ${lens}, focus on the audience and do not assume a result.`,
        ),
        context(
          `${lens}-a1`,
          "Agent",
          `The ${lens} lens found a source limitation; this is not a verified outcome.`,
        ),
        context(
          `${lens}-u2`,
          "Kevin",
          "Which exact source supports your earlier interpretation?",
        ),
        context(
          `${lens}-a2`,
          "Agent",
          "Only the supplied IMC can be quoted; external research is disconnected.",
        ),
      ];
      const current = context(
        `${lens}-u3`,
        "Kevin",
        `Correction for ${lens}: treat the earlier audience assumption as unproven and examine another explanation.`,
      );
      current.status = "pending";
      const conversation = buildDiscoveryConversationMemory({
        scope,
        previousMessages: previous,
        currentMessage: current,
      });
      const request = requestSchema.parse({
        agentType: "discovery",
        context: {
          foundation,
          lens,
          investigationType: "problem",
          question,
          action: "explore_deeper",
          previousFindings: [],
          conversation,
        },
        guidance: current.text,
        versionNumber: 2,
      });
      if (request.agentType !== "discovery")
        throw new Error("Expected Discovery request.");
      const sources = discoverySourceDocuments(request.context.foundation);
      const output = mockDiscovery(request);
      const strictOutput = {
        ...output,
        findings: output.findings.map((finding) => ({
          ...finding,
          evidence: finding.evidence.map((citation) => ({
            ...citation,
            locator:
              sources.find((source) =>
                [source.identity, ...source.aliases].includes(citation.source),
              )?.locator ?? "",
          })),
        })),
      };
      const offline = createOfflineModelClient([JSON.stringify(strictOutput)]);
      const response = await generateAgentResponse(request, offline.sdk);
      expect(response.provider).toBe("mock");
      const modelInput = JSON.parse(String(offline.requests()[0].input)) as {
        conversation: typeof conversation;
        inputPack: typeof foundation;
      };
      expect(modelInput.inputPack.sourceBrief).toBe(campaign.sourceText);
      expect(modelInput.conversation.scope.threadId).toBe(threadId);
      expect(modelInput.conversation.messages.map((item) => item.id)).toEqual([
        `${lens}-u1`,
        `${lens}-a1`,
        `${lens}-u2`,
        `${lens}-a2`,
        `${lens}-u3`,
      ]);
      expect(JSON.stringify(modelInput.conversation)).not.toContain(
        "PRIVATE OTHER LENS",
      );
      expect(modelInput.conversation.messages.at(-1)?.text).toContain(
        "Correction",
      );
    }
  }
});

test("the connection provider boundary rejects two different PDF campaigns even with earlier-context consent", async () => {
  const [movers, pro] = detectIMCCampaignScopes(readFileSync(fixture, "utf8"));
  const firstPack = studioPack(
    applyStudioSource(emptyStudio(), movers.sourceText),
  );
  const secondPack = studioPack(
    applyStudioSource(emptyStudio(), pro.sourceText),
  );
  const gap = (
    id: string,
    lensId: DiscoveryLensId,
    packVersion: string,
  ): DiscoveryFinding => ({
    id,
    title: "A source-bound research question",
    whatWeFound: "The supplied brief does not resolve this question.",
    evidence: [],
    whyItMayMatter: "This is only an interpretation.",
    whatComplicatesIt: "Independent research is unavailable.",
    questionToExplore: "What source would answer it?",
    evidenceState: "research_gap",
    lensId,
    inputPackVersion: packVersion,
    runVersion: 1,
  });
  await expect(
    connectDiscoveryFindings({
      pack: firstPack,
      findings: [
        gap("movers-gap", "consumer", inputPackVersion(firstPack)),
        gap("pro-gap", "culture", inputPackVersion(secondPack)),
      ],
      sourcePacks: [firstPack, secondPack],
      sourceContextConsent: true,
      guidance: "Compare the selected questions.",
    }),
  ).rejects.toThrow("different campaigns");
});

test("all five research actions carry distinct semantics and the exact selected finding scope", () => {
  const campaign = detectIMCCampaignScopes(readFileSync(fixture, "utf8"))[0];
  const pack = studioPack(
    applyStudioSource(emptyStudio(), campaign.sourceText),
  );
  const selectedFinding: DiscoveryFinding = {
    id: "selected-mover-gap",
    title: "The mover barrier is not yet evidenced",
    whatWeFound:
      "The supplied brief names movers but does not establish their decision barrier.",
    evidence: [],
    whyItMayMatter: "A clearer question could guide later research.",
    whatComplicatesIt: "No independent mover research is connected.",
    questionToExplore:
      "What evidence would distinguish retention from acquisition barriers?",
    evidenceState: "research_gap",
    lensId: "consumer",
    inputPackVersion: inputPackVersion(pack),
    runVersion: 1,
  };
  const actions = [
    ["explore_deeper", "more deeply using only supplied evidence"],
    ["find_contrary", "challenge, qualification, or competing explanation"],
    ["separate_audience", "audience differences supported by the pack"],
    ["check_recency", "supplied dates or context establish recency"],
    ["compare_input", "consistency, contradiction, and missing context"],
  ] as const;
  for (const [action, instruction] of actions) {
    const parsed = requestSchema.parse({
      agentType: "discovery",
      context: {
        foundation: selectedFoundation(pack),
        lens: "consumer",
        investigationType: "problem",
        question,
        action,
        previousFindings: [],
        selectedFinding,
      },
      guidance: `Kevin asks to ${action.replaceAll("_", " ")}.`,
      versionNumber: 2,
    });
    if (parsed.agentType !== "discovery")
      throw new Error("Expected Discovery request.");
    const prompt = discoveryPrompt(parsed);
    const input = JSON.parse(prompt.input) as {
      action: string;
      actionInstruction: string;
      selectedFinding: DiscoveryFinding;
      inputPack: { sourceBrief: string };
    };
    expect(input.action).toBe(action);
    expect(input.actionInstruction).toContain(instruction);
    expect(input.selectedFinding).toEqual(selectedFinding);
    expect(input.inputPack.sourceBrief).toBe(campaign.sourceText);
    expect(prompt.instructions).toContain(
      "No external or enterprise source is connected",
    );
  }
});

test("the real generation request builder carries a scoped earlier reply and action to the server boundary", async () => {
  const campaign = detectIMCCampaignScopes(readFileSync(fixture, "utf8"))[0];
  const pack = studioPack(
    applyStudioSource(emptyStudio(), campaign.sourceText),
  );
  const threadId = "movers-consumer-thread";
  const time = "2026-10-17T12:00:00.000Z";
  const prior: DiscoveryThreadMessage[] = [
    {
      id: "prior-user",
      author: "Kevin",
      text: "Limit this to existing movers.",
      createdAt: time,
      threadId,
      inputPackVersion: inputPackVersion(pack),
      question,
      investigationType: "problem",
      lensId: "consumer",
      status: "complete",
    },
    {
      id: "prior-agent",
      author: "Agent",
      text: "The brief includes existing customers and prospects; barriers are unproven.",
      createdAt: time,
      threadId,
      inputPackVersion: inputPackVersion(pack),
      question,
      investigationType: "problem",
      lensId: "consumer",
      status: "complete",
    },
  ];
  const captured: AgentRequest[] = [];
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      const request = requestSchema.parse(JSON.parse(String(init?.body)));
      captured.push(request);
      if (request.agentType !== "discovery")
        throw new Error("Unexpected agent.");
      return Response.json({
        provider: "mock",
        generatedAt: time,
        data: mockDiscovery(request),
      });
    };
    const version = await generateDiscoveryVersion({
      lensId: "consumer",
      pack,
      question,
      investigationType: "problem",
      action: "find_contrary",
      guidance: "Challenge the earlier barrier interpretation.",
      previous: [],
      threadMessages: prior,
      turnId: "current-turn",
      threadId,
      signal: new AbortController().signal,
    });
    expect(version.provider).toBe("mock");
    expect(version.retrievalStatus).toBe("unavailable");
    expect(version.retrievalNote).toContain(
      "No external or enterprise source is connected",
    );
    const request = captured[0];
    if (request.agentType !== "discovery")
      throw new Error("Unexpected request.");
    expect(request.context.action).toBe("find_contrary");
    expect(
      request.context.conversation?.messages.map((item) => item.id),
    ).toEqual(["prior-user", "prior-agent", "current-turn"]);
    expect(request.context.conversation?.scope.threadId).toBe(threadId);
    expect(request.context.foundation.sourceBrief).toBe(campaign.sourceText);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("offline follow-ups respond to the current probe and the selected prior finding", () => {
  const campaign = detectIMCCampaignScopes(readFileSync(fixture, "utf8"))[0];
  const pack = studioPack(
    applyStudioSource(emptyStudio(), campaign.sourceText),
  );
  const foundation = selectedFoundation(pack);
  const question =
    "What barriers could make existing customers leave Xfinity during a move?";
  const initialRequest = {
    agentType: "discovery" as const,
    context: {
      foundation,
      lens: "consumer" as const,
      investigationType: "problem" as const,
      question,
      action: "initial" as const,
      previousFindings: [],
    },
  };
  const initial = mockDiscovery(initialRequest).findings[0];
  const selectedFinding: DiscoveryFinding = {
    ...initial,
    id: "movers-consumer-finding-v1",
    researchRunId: "movers-consumer-run-v1",
    lensId: "consumer",
    inputPackVersion: inputPackVersion(pack),
    runVersion: 1,
  };
  const probes = [
    "Why?",
    "What evidence supports this?",
    "What would make this wrong?",
    "Go deeper on this.",
  ];
  const answers = probes.map(
    (guidance) =>
      mockDiscovery({
        agentType: "discovery",
        context: {
          ...initialRequest.context,
          action: "explore_deeper",
          selectedFinding,
          previousFindings: [selectedFinding],
        },
        guidance,
      }).findings[0],
  );
  expect(
    new Set(
      answers.map((answer) =>
        [answer.title, answer.whatWeFound, answer.questionToExplore].join("\n"),
      ),
    ).size,
  ).toBe(probes.length);
  for (const answer of answers) {
    expect(answer.evidenceState).toBe("research_gap");
    expect(answer.evidence).toEqual([]);
  }

  const sparkTitle = "Transfer as one less move-day worry";
  const sparked = mockDiscovery({
    agentType: "discovery",
    context: {
      ...initialRequest.context,
      foundation: {
        ...foundation,
        selectedSparks: [
          {
            id: "movers-spark-v1",
            title: sparkTitle,
            text: "Explore how transfer ease might reduce a moving-day worry.",
            excerpt:
              "Customer: One less thing to worry about. Transfer your services in a snap with the Xfinity app and stay connected to what you love.",
            excerpt_verified: true,
            versionId: "movers-sparks-v1",
            version: 1,
          },
        ],
      },
      action: "explore_deeper",
      selectedFinding,
      previousFindings: [selectedFinding],
    },
    guidance: "Why?",
  }).findings[0];
  expect(sparked.whatWeFound).toContain(sparkTitle);
  expect(sparked.whatWeFound).toContain("not observed evidence");
  expect(sparked.evidenceState).toBe("research_gap");
  expect(sparked.evidence).toEqual([]);
});
