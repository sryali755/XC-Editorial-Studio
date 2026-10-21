import { expect, test } from "@playwright/test";
import { selectedFoundation } from "../../lib/ai/context";
import { connectionsPrompt } from "../../lib/ai/discovery-prompts";
import { createOfflineModelClient } from "../../lib/ai/offline-model-client";
import { mockDiscovery } from "../../lib/ai/mock-discovery";
import { generateAgentResponse } from "../../lib/ai/provider";
import { requestSchema, type AgentRequest } from "../../lib/ai/schemas";
import { demoPack } from "../../lib/demo";
import {
  buildDiscoveryConversationMemory,
  DiscoveryConversationOverflowError,
  type DiscoveryConversationMessage,
  type DiscoveryConversationScope,
} from "../../lib/discovery-conversation-memory";
import { inputPackVersion } from "../../lib/discovery";

const scope: DiscoveryConversationScope = {
  kind: "agent",
  threadId: "consumer:investigation-1",
  inputPackVersion: inputPackVersion(demoPack),
  question: "Which barrier matters in this campaign?",
  investigationType: "problem",
};

function message(
  id: string,
  author: "Kevin" | "Agent",
  text: string,
): DiscoveryConversationMessage {
  return {
    id,
    author,
    text,
    createdAt: `2026-10-17T00:00:${String(Number(id.replace(/\D/g, "")) % 60).padStart(2, "0")}.000Z`,
    inputPackVersion: scope.inputPackVersion,
    question: scope.question,
    investigationType: scope.investigationType,
    threadId: scope.threadId,
    status: "complete",
  };
}

test("ordered user and agent turns reach the credential-free model payload, not merely the UI", async () => {
  const prior = [
    message("user-1", "Kevin", "Focus on existing customers, not prospects."),
    message(
      "agent-1",
      "Agent",
      "The supplied brief distinguishes existing customers from prospects; observed barriers are not supplied.",
    ),
    message(
      "user-2",
      "Kevin",
      "What evidence could challenge that interpretation?",
    ),
    message(
      "agent-2",
      "Agent",
      "No independent mover research is connected; compare the original brief's audience wording.",
    ),
  ];
  const current = message(
    "user-3",
    "Kevin",
    "Correction: focus on prospects instead of existing customers. Which source supports this?",
  );
  current.status = "pending";
  const conversation = buildDiscoveryConversationMemory({
    scope,
    previousMessages: prior,
    currentMessage: current,
  });
  expect(conversation.messages.map((item) => item.id)).toEqual([
    "user-1",
    "agent-1",
    "user-2",
    "agent-2",
    "user-3",
  ]);
  expect(conversation.messages.map((item) => item.role)).toEqual([
    "user",
    "assistant",
    "user",
    "assistant",
    "user",
  ]);

  const parsed = requestSchema.parse({
    agentType: "discovery",
    context: {
      foundation: selectedFoundation(demoPack),
      lens: "consumer",
      investigationType: "problem",
      question: scope.question,
      action: "find_contrary",
      previousFindings: [],
      conversation,
    },
    guidance: current.text,
    versionNumber: 2,
  });
  if (parsed.agentType !== "discovery")
    throw new Error("Expected Discovery request.");
  const offline = createOfflineModelClient([
    JSON.stringify(mockDiscovery(parsed)),
  ]);
  const result = await generateAgentResponse(parsed, offline.sdk);
  expect(result.provider).toBe("mock");
  expect(offline.calls()).toBe(1);
  const sent = offline.requests()[0];
  const modelInput = JSON.parse(String(sent.input)) as {
    conversation: typeof conversation;
    strategistGuidance: string;
    action: string;
  };
  expect(modelInput.conversation).toEqual(conversation);
  expect(modelInput.conversation.messages.at(-1)?.text).toBe(current.text);
  expect(modelInput.strategistGuidance).toBe(current.text);
  expect(modelInput.action).toBe("find_contrary");
  expect(sent.instructions).toContain(
    "a later explicit correction or withdrawal supersedes",
  );
  expect(sent.instructions).toContain(
    "conversation context, not source evidence",
  );
});

test("bounded memory keeps full user constraints and newest reply, recording every omitted reply ID", () => {
  const previous: DiscoveryConversationMessage[] = [];
  for (let index = 0; index < 24; index++) {
    previous.push(
      message(
        `user-${index}`,
        "Kevin",
        index === 0
          ? "Continue to distinguish retention from acquisition."
          : index === 22
            ? "Correction: use prospects for the next comparison."
            : `Question ${index}: narrow the evidence to this audience.`,
      ),
      message(
        `agent-${index}`,
        "Agent",
        `Interpretation ${index}: this is supplied-source context, not verified external research.`,
      ),
    );
  }
  const current = message(
    "user-24",
    "Kevin",
    "Compare this with the earlier constraint and correction.",
  );
  const memory = buildDiscoveryConversationMemory({
    scope,
    previousMessages: previous,
    currentMessage: current,
    maxCharacters: 7_000,
  });
  expect(memory.usedCharacters).toBeLessThanOrEqual(7_000);
  expect(JSON.stringify(memory).length).toBeLessThanOrEqual(7_000);
  expect(memory.messages.map((item) => item.id)).toContain("user-0");
  expect(memory.messages.map((item) => item.id)).toContain("user-22");
  expect(memory.messages.map((item) => item.id)).toContain("agent-23");
  expect(memory.messages.at(-1)?.id).toBe("user-24");
  expect(memory.omittedMessageIds.length).toBeGreaterThan(0);
  expect(memory.omittedMessageIds.every((id) => id.startsWith("agent-"))).toBe(
    true,
  );
  const fullOrder = [...previous, current].map((item) => item.id);
  const includedPositions = memory.messages.map((item) =>
    fullOrder.indexOf(item.id),
  );
  expect(includedPositions).toEqual(
    [...includedPositions].sort((a, b) => a - b),
  );
});

test("retry reuses a turn ID, while unsafe overflow and cross-scope history fail explicitly", () => {
  const pending = message(
    "user-7",
    "Kevin",
    "Keep the audience qualification.",
  );
  pending.status = "failed";
  const retry = { ...pending, status: "pending" as const };
  const memory = buildDiscoveryConversationMemory({
    scope,
    previousMessages: [pending],
    currentMessage: retry,
  });
  expect(memory.messages).toHaveLength(1);
  expect(memory.messages[0].status).toBe("pending");
  expect(() =>
    buildDiscoveryConversationMemory({
      scope,
      previousMessages: [],
      currentMessage: message("huge", "Kevin", "A".repeat(2_000)),
      maxCharacters: 1_024,
    }),
  ).toThrow(DiscoveryConversationOverflowError);
  expect(() =>
    buildDiscoveryConversationMemory({
      scope,
      previousMessages: [{ ...pending, inputPackVersion: "other-pack" }],
      currentMessage: retry,
    }),
  ).toThrow("another Input Pack");
  expect(() =>
    buildDiscoveryConversationMemory({
      scope: { ...scope, kind: "finding", findingRef: "finding-A@1" },
      previousMessages: [{ ...pending, findingRef: "finding-B@1" }],
      currentMessage: { ...retry, findingRef: "finding-A@1" },
    }),
  ).toThrow("another finding version");
});

test("legacy Discovery requests remain valid without conversation memory", () => {
  const legacy = requestSchema.parse({
    agentType: "discovery",
    context: {
      foundation: selectedFoundation(demoPack),
      lens: "brand",
      investigationType: "problem",
      question: scope.question,
      action: "initial",
      previousFindings: [],
    },
  }) as Extract<AgentRequest, { agentType: "discovery" }>;
  expect(legacy.context.conversation).toBeUndefined();
});

test("request boundary rejects a conversation from another focus or a noncurrent turn", () => {
  const current = message(
    "user-current",
    "Kevin",
    "Stay within this investigation.",
  );
  const conversation = buildDiscoveryConversationMemory({
    scope,
    previousMessages: [],
    currentMessage: current,
  });
  const base = {
    agentType: "discovery",
    context: {
      foundation: selectedFoundation(demoPack),
      lens: "consumer",
      investigationType: "problem",
      question: scope.question,
      action: "explore_deeper",
      previousFindings: [],
      conversation,
    },
    guidance: current.text,
  };
  expect(requestSchema.safeParse(base).success).toBe(true);
  expect(
    requestSchema.safeParse({
      ...base,
      context: {
        ...base.context,
        conversation: {
          ...conversation,
          scope: { ...conversation.scope, question: "A different question" },
        },
      },
    }).success,
  ).toBe(false);
  expect(
    requestSchema.safeParse({
      ...base,
      context: {
        ...base.context,
        conversation: { ...conversation, currentMessageId: "earlier-turn" },
      },
    }).success,
  ).toBe(false);
});

test("connection prompt labels aligned earlier finding sources without claiming retrieval", () => {
  const foundation = selectedFoundation(demoPack);
  const finding = (id: string, lensId: "consumer" | "brand") => ({
    id,
    lensId,
    inputPackVersion: scope.inputPackVersion,
    runVersion: 1,
    title: `${lensId} question`,
    whatWeFound: "The supplied brief does not establish the answer.",
    evidence: [],
    whyItMayMatter: "It may guide the next research question.",
    whatComplicatesIt: "No independent research is supplied.",
    questionToExplore: "Which approved source could answer this?",
    evidenceState: "research_gap" as const,
  });
  const request = requestSchema.parse({
    agentType: "connections",
    context: {
      foundation,
      findings: [
        finding("finding-a", "consumer"),
        finding("finding-b", "brand"),
      ],
      sourceFoundations: [foundation, foundation],
    },
  });
  if (request.agentType !== "connections")
    throw new Error("Expected connection request.");
  const prompt = connectionsPrompt(request);
  expect(prompt.instructions).toContain("not current evidence, new retrieval");
  expect(prompt.instructions).toContain("different Input Pack versions");
  expect(
    JSON.parse(prompt.input).earlierSelectedFindingSourceSnapshots,
  ).toHaveLength(2);
  expect(
    requestSchema.safeParse({
      agentType: "connections",
      context: {
        foundation,
        findings: request.context.findings,
        sourceFoundations: [foundation],
      },
    }).success,
  ).toBe(false);
  expect(
    requestSchema.safeParse({
      agentType: "connections",
      context: { foundation, findings: request.context.findings },
    }).success,
  ).toBe(true);
});
