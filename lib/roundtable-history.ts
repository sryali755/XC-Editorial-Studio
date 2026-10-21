import { inputPackVersion, discoveryFindingRef } from "./discovery";
import { discoveryStorageKey } from "./discovery-persistence";
import type {
  DiscoveryLensRun,
  DiscoveryRunVersion,
  DiscoveryState,
  DiscoveryThreadMessage,
  DiscoveryLensId,
  StrategyInputPack,
  DiscoveryRetryRequest,
} from "./types";

export function campaignGenerations(
  run: DiscoveryLensRun | undefined,
  pack: StrategyInputPack,
) {
  const source = pack.parsedIMC?.sourceText;
  return (run?.versions ?? [])
    .filter((version) => {
      const original = version.inputPackSnapshot?.parsedIMC?.sourceText;
      return source && original
        ? source === original
        : version.inputPackVersion === inputPackVersion(pack);
    })
    .slice()
    .sort(
      (a, b) => b.number - a.number || b.createdAt.localeCompare(a.createdAt),
    );
}

export function matchesInvestigation(
  version: DiscoveryRunVersion | undefined,
  pack: StrategyInputPack,
  question: string,
  mode: DiscoveryState["investigationType"],
) {
  return (
    !!version &&
    version.inputPackVersion === inputPackVersion(pack) &&
    version.question.trim() === question.trim() &&
    version.investigationType === mode
  );
}

export function conversationHistory(
  state: DiscoveryState,
  lensId: DiscoveryLensId,
  pack: StrategyInputPack,
) {
  const run = state.runs.find((item) => item.lensId === lensId);
  const generations = campaignGenerations(run, pack);
  const packVersions = new Set([
    inputPackVersion(pack),
    ...generations.map((v) => v.inputPackVersion),
  ]);
  const findingRefs = new Set(
    generations.flatMap((v) => v.findings.map(discoveryFindingRef)),
  );
  const campaign = discoveryStorageKey(pack);
  const turns: {
    id: string;
    question?: DiscoveryThreadMessage;
    answer?: DiscoveryThreadMessage;
  }[] = [];
  const buckets: [string, DiscoveryThreadMessage[]][] = [
    ["agent", run?.thread ?? []],
    ...Object.entries(state.findingThreads).filter(([ref]) =>
      findingRefs.has(ref),
    ),
  ];
  for (const [scope, messages] of buckets) {
    let legacy: string | undefined;
    for (const message of messages) {
      if (
        (message.lensId && message.lensId !== lensId) ||
        (message.campaignKey && message.campaignKey !== campaign) ||
        (message.inputPackVersion &&
          !packVersions.has(message.inputPackVersion)) ||
        ["initial", "refresh", "another_answer"].includes(message.action ?? "")
      )
        continue;
      if (!message.turnId && message.author === "Kevin") legacy = message.id;
      const id = `${scope}:${message.turnId ?? legacy ?? message.id}`;
      let turn = turns.find((item) => item.id === id);
      if (!turn) {
        turn = { id };
        turns.push(turn);
      }
      if (message.author === "Kevin") turn.question = message;
      else {
        turn.answer = message;
        if (!message.turnId) legacy = undefined;
      }
    }
  }
  return turns
    .sort((a, b) =>
      (a.question?.createdAt ?? a.answer?.createdAt ?? "").localeCompare(
        b.question?.createdAt ?? b.answer?.createdAt ?? "",
      ),
    )
    .map((turn, index) => ({ ...turn, number: index + 1 }))
    .reverse();
}

// Reuse the exact question, finding/generation and investigation. A new turn
// is appended; the previous answer and its source attribution are never replaced.
export function conversationRegenerationRequest(
  state: DiscoveryState,
  pack: StrategyInputPack,
  lensId: DiscoveryLensId,
  turnId: string,
): DiscoveryRetryRequest | undefined {
  const turns = conversationHistory(state, lensId, pack);
  let turn = turns.find(
    (item) => (item.question?.turnId ?? item.question?.id) === turnId,
  );
  if (turn?.question?.regeneratesTurnId)
    turn = turns.find(
      (item) =>
        (item.question?.turnId ?? item.question?.id) ===
        turn!.question!.regeneratesTurnId,
    );
  const question = turn?.question;
  const run = state.runs.find((item) => item.lensId === lensId);
  const generation = run?.versions.find(
    (item) => item.id === question?.researchRunId,
  );
  const focus =
    state.focusByMode?.[state.investigationType]?.trim() ??
    state.question.trim();
  if (
    !question ||
    !turn?.answer ||
    turn.answer.status === "failed" ||
    (question.status && question.status !== "complete") ||
    question.campaignKey !== discoveryStorageKey(pack) ||
    question.inputPackVersion !== inputPackVersion(pack) ||
    question.question !== focus ||
    question.investigationType !== state.investigationType ||
    !question.text.trim() ||
    !matchesInvestigation(generation, pack, focus, state.investigationType)
  )
    return;
  const selectedFinding = question.findingRef
    ? generation!.findings.find(
        (item) => discoveryFindingRef(item) === question.findingRef,
      )
    : undefined;
  if (question.findingRef && !selectedFinding) return;
  return {
    lensId,
    operation: "conversation",
    action: question.action ?? "explore_deeper",
    guidance: question.text,
    generationContextId: generation!.id,
    regeneratesTurnId: question.turnId ?? question.id,
    ...(question.threadId ? { threadId: question.threadId } : {}),
    question: question.question,
    investigationType: question.investigationType,
    inputPackVersion: question.inputPackVersion,
    campaignKey: question.campaignKey,
    ...(selectedFinding ? { selectedFinding } : {}),
  };
}

export function conversationContextBefore(
  messages: DiscoveryThreadMessage[],
  regeneratesTurnId?: string,
) {
  if (!regeneratesTurnId) return messages;
  const at = messages.findIndex(
    (item) =>
      item.author === "Kevin" && (item.turnId ?? item.id) === regeneratesTurnId,
  );
  return at < 0 ? [] : messages.slice(0, at);
}
