import type { DiscoveryAction } from "./types";

// This is a local request-selection policy, not a transcript summarizer. The
// complete transcript stays in browser storage; only the selected, traceable
// messages travel with one model request. The budget covers the serialized
// conversation object, separate from the already bounded Input Pack.
export const DEFAULT_DISCOVERY_CONVERSATION_BUDGET = 18_000;
const MAX_INCLUDED_MESSAGES = 100;
const MAX_OMITTED_IDS = 1_000;

export type DiscoveryConversationStatus =
  "pending" | "complete" | "failed" | "cancelled" | "interrupted";

export interface DiscoveryConversationMessage {
  id: string;
  author: "Kevin" | "Agent";
  text: string;
  createdAt: string;
  action?: DiscoveryAction;
  findingRef?: string;
  researchRunId?: string;
  inputPackVersion?: string;
  question?: string;
  investigationType?: "problem" | "hypothesis";
  status?: DiscoveryConversationStatus;
  threadId?: string;
}

export interface DiscoveryConversationScope {
  kind: "agent" | "finding";
  threadId: string;
  inputPackVersion: string;
  question: string;
  investigationType: "problem" | "hypothesis";
  findingRef?: string;
}

export interface DiscoveryConversationMemory {
  scope: DiscoveryConversationScope;
  currentMessageId: string;
  selectionPolicy: "all-user-and-recent-agent";
  messages: {
    id: string;
    role: "user" | "assistant";
    text: string;
    createdAt: string;
    action?: DiscoveryAction;
    findingRef?: string;
    researchRunId?: string;
    status?: DiscoveryConversationStatus;
  }[];
  omittedMessageIds: string[];
  budgetCharacters: number;
  usedCharacters: number;
}

export class DiscoveryConversationOverflowError extends Error {
  constructor(reason: string) {
    super(
      `The conversation is too long to include safely: ${reason} Narrow the request or start an explicitly scoped continuation; full history remains saved.`,
    );
    this.name = "DiscoveryConversationOverflowError";
  }
}

function assertScope(
  message: DiscoveryConversationMessage,
  scope: DiscoveryConversationScope,
) {
  if (message.threadId && message.threadId !== scope.threadId)
    throw new Error("Conversation messages belong to another thread.");
  if (
    message.inputPackVersion &&
    message.inputPackVersion !== scope.inputPackVersion
  )
    throw new Error(
      "Conversation messages belong to another Input Pack version.",
    );
  if (message.question && message.question !== scope.question)
    throw new Error(
      "Conversation messages belong to another investigation question.",
    );
  if (
    message.investigationType &&
    message.investigationType !== scope.investigationType
  )
    throw new Error(
      "Conversation messages belong to another investigation mode.",
    );
  if (scope.kind === "finding" && message.findingRef !== scope.findingRef)
    throw new Error("Conversation messages belong to another finding version.");
  if (scope.kind === "agent" && message.findingRef)
    throw new Error("A finding conversation cannot enter the agent thread.");
}

function actualSize(memory: DiscoveryConversationMemory) {
  let size = JSON.stringify(memory).length;
  // The decimal width of usedCharacters itself can change the serialized
  // length. A fixed point takes at most a few iterations.
  for (let attempt = 0; attempt < 4; attempt++) {
    if (memory.usedCharacters === size) break;
    memory.usedCharacters = size;
    size = JSON.stringify(memory).length;
  }
  return size;
}

export function buildDiscoveryConversationMemory({
  scope,
  previousMessages,
  currentMessage,
  requiredMessageIds = [],
  maxCharacters = DEFAULT_DISCOVERY_CONVERSATION_BUDGET,
}: {
  scope: DiscoveryConversationScope;
  previousMessages: readonly DiscoveryConversationMessage[];
  currentMessage: DiscoveryConversationMessage;
  requiredMessageIds?: readonly string[];
  maxCharacters?: number;
}): DiscoveryConversationMemory {
  if (
    !Number.isSafeInteger(maxCharacters) ||
    maxCharacters < 512 ||
    maxCharacters > 100_000
  )
    throw new Error(
      "Conversation budget must be between 512 and 100000 characters.",
    );
  if (
    !scope.threadId.trim() ||
    !scope.inputPackVersion.trim() ||
    !scope.question.trim()
  )
    throw new Error(
      "Conversation scope requires a thread, Input Pack, and question.",
    );
  if (scope.kind === "finding" && !scope.findingRef?.trim())
    throw new Error(
      "A finding conversation requires an exact finding version.",
    );
  if (scope.kind === "agent" && scope.findingRef)
    throw new Error("An agent conversation cannot have a finding reference.");
  if (currentMessage.author !== "Kevin" || !currentMessage.text.trim())
    throw new Error(
      "The current conversation turn must be Kevin's nonempty message.",
    );

  // A retried turn can already be present as a pending/failed message. Keep
  // its original position and ID, replacing it once instead of duplicating it.
  const existingCurrent = previousMessages.find(
    (item) => item.id === currentMessage.id,
  );
  if (existingCurrent) {
    assertScope(existingCurrent, scope);
    if (
      existingCurrent.author !== "Kevin" ||
      existingCurrent.text !== currentMessage.text
    )
      throw new Error(
        "A retry must preserve the original user turn and message ID.",
      );
  }
  const history = existingCurrent
    ? previousMessages.map((item) =>
        item.id === currentMessage.id ? currentMessage : item,
      )
    : [...previousMessages, currentMessage];
  if (history.at(-1)?.id !== currentMessage.id)
    throw new Error(
      "A retried turn cannot be moved past later conversation messages; start a scoped continuation.",
    );
  const ids = new Set<string>();
  for (const item of history) {
    if (!item.id.trim() || !item.text.trim())
      throw new Error(
        "Conversation messages require stable IDs and nonempty text.",
      );
    if (ids.has(item.id))
      throw new Error("Conversation message IDs must be unique.");
    ids.add(item.id);
    assertScope(item, scope);
  }
  for (const id of requiredMessageIds)
    if (!ids.has(id))
      throw new DiscoveryConversationOverflowError(
        `required message ${id} is unavailable.`,
      );

  const lastAgent = [...history]
    .reverse()
    .find((item) => item.author === "Agent");
  const mandatory = new Set([
    ...history.filter((item) => item.author === "Kevin").map((item) => item.id),
    ...requiredMessageIds,
    ...(lastAgent ? [lastAgent.id] : []),
  ]);
  const selected = new Set(mandatory);
  const project = (): DiscoveryConversationMemory => {
    const messages = history
      .filter((item) => selected.has(item.id))
      .map((item) => ({
        id: item.id,
        role:
          item.author === "Kevin" ? ("user" as const) : ("assistant" as const),
        text: item.text,
        createdAt: item.createdAt,
        ...(item.action ? { action: item.action } : {}),
        ...(item.findingRef ? { findingRef: item.findingRef } : {}),
        ...(item.researchRunId ? { researchRunId: item.researchRunId } : {}),
        ...(item.status ? { status: item.status } : {}),
      }));
    const memory: DiscoveryConversationMemory = {
      scope,
      currentMessageId: currentMessage.id,
      selectionPolicy: "all-user-and-recent-agent",
      messages,
      omittedMessageIds: history
        .filter((item) => !selected.has(item.id))
        .map((item) => item.id),
      budgetCharacters: maxCharacters,
      usedCharacters: 0,
    };
    actualSize(memory);
    return memory;
  };
  let memory = project();
  if (
    memory.messages.length > MAX_INCLUDED_MESSAGES ||
    memory.omittedMessageIds.length > MAX_OMITTED_IDS ||
    memory.usedCharacters > maxCharacters
  )
    throw new DiscoveryConversationOverflowError(
      "required user constraints or recent replies exceed the local request budget.",
    );

  // Include as many earlier assistant interpretations as fit, newest first.
  // User-authored constraints are never silently evicted for an assistant reply.
  for (const item of [...history].reverse()) {
    if (selected.has(item.id)) continue;
    selected.add(item.id);
    const candidate = project();
    if (
      candidate.messages.length <= MAX_INCLUDED_MESSAGES &&
      candidate.usedCharacters <= maxCharacters
    )
      memory = candidate;
    else selected.delete(item.id);
  }
  return memory;
}
