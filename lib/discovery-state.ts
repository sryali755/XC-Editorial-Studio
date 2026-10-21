import { discoveryFindingRef } from "./discovery";
import type {
  DiscoveryFinding,
  DiscoveryState,
  DiscoveryRetryRequest,
  DiscoveryRunVersion,
  DiscoveryThreadMessage,
} from "./types";

function findingInterpretation(finding: DiscoveryFinding) {
  return `Agent interpretation · unverified:\n${finding.title}\n${finding.whatWeFound}`;
}

function findingSourceExcerpt(finding: DiscoveryFinding) {
  return finding.evidence.length
    ? `Supplied source excerpt (not independent verification): ${finding.evidence.map((item) => `${item.source} (${item.locator || "source locator not supplied"}): “${item.excerpt}”`).join("; ")}`
    : "Research gap: no supporting source excerpt was supplied.";
}

export function discoveryDrafts(
  state: DiscoveryState,
): NonNullable<DiscoveryState["drafts"]> {
  return {
    agents: {},
    findings: {},
    routes: {},
    connections: "",
    ...state.drafts,
  };
}

function message(
  state: DiscoveryState,
  request: DiscoveryRetryRequest,
  author: "Kevin" | "Agent",
  text: string,
  inputPackVersion: string,
  version?: DiscoveryRunVersion,
): DiscoveryThreadMessage {
  return {
    id:
      author === "Kevin" && request.turnId
        ? request.turnId
        : crypto.randomUUID(),
    turnId: request.turnId,
    threadId: request.threadId,
    ...(request.regeneratesTurnId
      ? { regeneratesTurnId: request.regeneratesTurnId }
      : {}),
    campaignKey: request.campaignKey,
    scope: request.selectedFinding ? "finding" : "agent",
    status: "complete",
    author,
    text,
    createdAt: new Date().toISOString(),
    action: request.action,
    question: version?.question ?? state.question,
    investigationType: version?.investigationType ?? state.investigationType,
    inputPackVersion,
    lensId: request.lensId,
    researchRunId:
      request.generationContextId ??
      version?.id ??
      state.runs.find((run) => run.lensId === request.lensId)?.currentVersionId,
    ...(request.selectedFinding
      ? { findingRef: discoveryFindingRef(request.selectedFinding) }
      : {}),
    ...(author === "Agent"
      ? {
          usedNewRetrieval: version?.retrievalStatus === "simulated_fixture",
          retrievalStatus: version?.retrievalStatus ?? "supplied_only",
        }
      : {}),
  };
}

function threadKey(request: DiscoveryRetryRequest) {
  return request.selectedFinding
    ? discoveryFindingRef(request.selectedFinding)
    : undefined;
}

function updateKevinTurn(
  state: DiscoveryState,
  request: DiscoveryRetryRequest,
  status: NonNullable<DiscoveryThreadMessage["status"]>,
  error?: string,
): DiscoveryState {
  const update = (items: DiscoveryThreadMessage[]) => {
    const index = request.turnId
      ? items.findIndex(
          (item) =>
            item.author === "Kevin" &&
            (item.turnId === request.turnId || item.id === request.turnId),
        )
      : items.findLastIndex(
          (item) =>
            item.author === "Kevin" &&
            item.action === request.action &&
            item.text ===
              (request.guidance.trim() || request.action.replaceAll("_", " ")),
        );
    if (index < 0) return items;
    return items.map((item, at) =>
      at === index ? { ...item, status, error } : item,
    );
  };
  const key = threadKey(request);
  if (key)
    return {
      ...state,
      findingThreads: {
        ...state.findingThreads,
        [key]: update(state.findingThreads[key] ?? []),
      },
    };
  return {
    ...state,
    runs: state.runs.map((run) =>
      run.lensId === request.lensId
        ? { ...run, thread: update(run.thread) }
        : run,
    ),
  };
}

function hasKevinTurn(state: DiscoveryState, request: DiscoveryRetryRequest) {
  const key = threadKey(request);
  const items = key
    ? (state.findingThreads[key] ?? [])
    : (state.runs.find((run) => run.lensId === request.lensId)?.thread ?? []);
  return items.some(
    (item) =>
      item.author === "Kevin" &&
      (request.turnId
        ? item.turnId === request.turnId || item.id === request.turnId
        : item.action === request.action &&
          item.text ===
            (request.guidance.trim() || request.action.replaceAll("_", " ")) &&
          item.status === "failed"),
  );
}

function addMessage(
  state: DiscoveryState,
  request: DiscoveryRetryRequest,
  item: DiscoveryThreadMessage,
): DiscoveryState {
  if (request.selectedFinding) {
    const id = discoveryFindingRef(request.selectedFinding);
    return {
      ...state,
      findingThreads: {
        ...state.findingThreads,
        [id]: [...(state.findingThreads[id] ?? []), item],
      },
    };
  }
  return {
    ...state,
    runs: state.runs.map((run) =>
      run.lensId === request.lensId
        ? { ...run, thread: [...run.thread, item] }
        : run,
    ),
  };
}

export function beginDiscoveryRequest(
  state: DiscoveryState,
  request: DiscoveryRetryRequest,
  packVersion: string,
) {
  const next = {
    ...state,
    runs: state.runs.map((run) =>
      run.lensId === request.lensId
        ? {
            ...run,
            status: "researching" as const,
            error: undefined,
            retryRequest: request,
          }
        : run,
    ),
  };
  if (
    request.operation === "generation" ||
    (request.action === "initial" && !request.guidance)
  )
    return next;
  if (hasKevinTurn(next, request))
    return updateKevinTurn(next, request, "pending");
  return addMessage(next, request, {
    ...message(
      state,
      request,
      "Kevin",
      request.guidance.trim() || request.action.replaceAll("_", " "),
      packVersion,
    ),
    status: "pending",
  });
}

export function completeDiscoveryRequest(
  state: DiscoveryState,
  request: DiscoveryRetryRequest,
  version: DiscoveryRunVersion,
) {
  const pending = state.runs.find(
    (run) => run.lensId === request.lensId,
  )?.retryRequest;
  if (pending?.turnId && pending.turnId !== request.turnId)
    return archiveOutdatedDiscoveryResponse(state, request, version);
  const drafts = discoveryDrafts(state);
  const key = request.selectedFinding
    ? discoveryFindingRef(request.selectedFinding)
    : request.lensId;
  const bucket =
    request.operation === "generation"
      ? "generations"
      : request.selectedFinding
        ? "findings"
        : "agents";
  const text =
    request.operation === "generation"
      ? drafts.generations?.[request.lensId]
      : request.selectedFinding
        ? drafts.findings[key]
        : drafts.agents[request.lensId];
  const next = {
    ...state,
    contextVersion: version.inputPackVersion,
    drafts: {
      ...drafts,
      ...(text === request.guidance && !request.regeneratesTurnId
        ? { [bucket]: { ...drafts[bucket], [key]: "" } }
        : {}),
    },
    runs: state.runs.map((run) =>
      run.lensId === request.lensId
        ? {
            ...run,
            status: "complete" as const,
            error: undefined,
            retryRequest: undefined,
            currentVersionId:
              request.operation === "conversation"
                ? run.currentVersionId
                : version.id,
            versions:
              request.operation === "conversation" ||
              run.versions.some((item) => item.id === version.id)
                ? run.versions
                : [version, ...run.versions],
          }
        : run,
    ),
  };
  if (request.operation === "generation") return next;
  const updated = updateKevinTurn(next, request, "complete");
  const relevant = request.selectedFinding
    ? version.findings.filter(
        (finding) => finding.id === request.selectedFinding?.id,
      )
    : version.findings;
  const reply = [
    ...(version.revisionSummary
      ? [`Agent revision summary · unverified: ${version.revisionSummary}`]
      : []),
    ...relevant.map((finding) =>
      [
        findingInterpretation(finding),
        findingSourceExcerpt(finding),
        `Why it may matter (interpretation): ${finding.whyItMayMatter}`,
        `Limit: ${finding.whatComplicatesIt}`,
        `Question to test: ${finding.questionToExplore}`,
      ].join("\n"),
    ),
    version.retrievalNote ||
      "Only supplied sources were analyzed; no new evidence was retrieved.",
  ].join("\n\n");
  const thread = threadKey(request);
  const prior = thread
    ? (updated.findingThreads[thread] ?? [])
    : (updated.runs.find((run) => run.lensId === request.lensId)?.thread ?? []);
  if (
    request.turnId &&
    prior.some(
      (item) => item.author === "Agent" && item.turnId === request.turnId,
    )
  )
    return updated;
  return addMessage(updated, request, {
    ...message(
      state,
      request,
      "Agent",
      `${version.provider === "mock" ? "DEMO DATA · " : ""}${reply}`,
      version.inputPackVersion,
      version,
    ),
    ...(request.operation === "conversation"
      ? {
          researchRunId: request.generationContextId,
          responseVersionId: version.id,
        }
      : {}),
  });
}

// Keep a response from an earlier focus or Input Pack inspectable without
// making it the current answer for a different investigation.
export function archiveOutdatedDiscoveryResponse(
  state: DiscoveryState,
  request: DiscoveryRetryRequest,
  version: DiscoveryRunVersion,
): DiscoveryState {
  const archived = {
    ...state,
    runs: state.runs.map((run) =>
      run.lensId === request.lensId
        ? {
            ...run,
            status:
              run.retryRequest?.turnId &&
              run.retryRequest.turnId !== request.turnId
                ? run.status
                : run.currentVersionId
                  ? ("complete" as const)
                  : ("idle" as const),
            error:
              run.retryRequest?.turnId &&
              run.retryRequest.turnId !== request.turnId
                ? run.error
                : undefined,
            retryRequest:
              run.retryRequest?.turnId &&
              run.retryRequest.turnId !== request.turnId
                ? run.retryRequest
                : undefined,
            versions:
              request.operation === "conversation" ||
              run.versions.some((item) => item.id === version.id)
                ? run.versions
                : [version, ...run.versions],
          }
        : run,
    ),
  };
  // The result remains in the exact historical thread but is not promoted to
  // the active investigation or another finding's visible current answer.
  return completeHistoricalReply(archived, request, version);
}

function completeHistoricalReply(
  state: DiscoveryState,
  request: DiscoveryRetryRequest,
  version: DiscoveryRunVersion,
): DiscoveryState {
  if (
    request.operation === "generation" ||
    (request.action === "initial" && !request.guidance)
  )
    return state;
  const updated = updateKevinTurn(state, request, "complete");
  const relevant = request.selectedFinding
    ? version.findings.filter(
        (finding) => finding.id === request.selectedFinding?.id,
      )
    : version.findings;
  const summary = [
    `Earlier-context response · V${version.number - 1}${version.provider === "mock" ? " · DEMO DATA" : ""}`,
    ...relevant.map((finding) =>
      [
        findingInterpretation(finding),
        findingSourceExcerpt(finding),
        `Why it may matter (interpretation): ${finding.whyItMayMatter}`,
        `Limit: ${finding.whatComplicatesIt}`,
        `Question to test: ${finding.questionToExplore}`,
      ].join("\n"),
    ),
    version.retrievalNote ||
      "Only supplied sources were checked; no new evidence was retrieved.",
  ].join("\n\n");
  return addMessage(updated, request, {
    ...message(
      updated,
      request,
      "Agent",
      summary,
      version.inputPackVersion,
      version,
    ),
    status: "complete",
    ...(request.operation === "conversation"
      ? {
          researchRunId: request.generationContextId,
          responseVersionId: version.id,
        }
      : {}),
  });
}

export function dismissOutdatedDiscoveryRequest(
  state: DiscoveryState,
  request: DiscoveryRetryRequest,
): DiscoveryState {
  const updated = updateKevinTurn(
    state,
    request,
    "interrupted",
    "The context changed before this request finished.",
  );
  return {
    ...updated,
    runs: updated.runs.map((run) =>
      run.lensId === request.lensId &&
      (!run.retryRequest?.turnId || run.retryRequest.turnId === request.turnId)
        ? {
            ...run,
            status: run.currentVersionId
              ? ("complete" as const)
              : ("idle" as const),
            error: undefined,
            retryRequest: undefined,
          }
        : run,
    ),
  };
}

export function failDiscoveryRequest(
  state: DiscoveryState,
  request: DiscoveryRetryRequest,
  error: string,
  cancelled = false,
): DiscoveryState {
  const updated = updateKevinTurn(
    state,
    request,
    cancelled ? "cancelled" : "failed",
    error,
  );
  return {
    ...updated,
    runs: updated.runs.map((run) =>
      run.lensId === request.lensId &&
      (!run.retryRequest?.turnId || run.retryRequest.turnId === request.turnId)
        ? {
            ...run,
            status: cancelled ? "cancelled" : "failed",
            error,
            retryRequest: request,
          }
        : run,
    ),
  };
}

export function recoverDiscoveryState(state: DiscoveryState): DiscoveryState {
  const findingThreads: DiscoveryState["findingThreads"] = {};
  for (const [key, items] of Object.entries(state.findingThreads ?? {})) {
    for (const item of items) {
      // Old sessions used a bare finding ID. Re-index only messages carrying
      // an exact version reference; unresolved history stays under its old key.
      const exact = key.includes("@") ? key : (item.findingRef ?? key);
      findingThreads[exact] ??= [];
      findingThreads[exact].push(
        item.status === "pending"
          ? {
              ...item,
              status: "interrupted",
              error:
                "The request was interrupted by a refresh; retry explicitly.",
            }
          : item,
      );
    }
  }
  return {
    ...state,
    drafts: discoveryDrafts(state),
    findingThreads,
    runs: state.runs.map((run) => ({
      ...run,
      thread: run.thread.map((item) =>
        item.status === "pending"
          ? {
              ...item,
              status: "interrupted",
              error:
                "The request was interrupted by a refresh; retry explicitly.",
            }
          : item,
      ),
      ...(run.status === "researching"
        ? {
            status: "cancelled" as const,
            error:
              "The previous request was interrupted. Retry this lens; previous findings and drafts are preserved.",
          }
        : {}),
    })),
  };
}
