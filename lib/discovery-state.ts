import { discoveryFindingRef } from "./discovery";
import type {
  DiscoveryState,
  DiscoveryRetryRequest,
  DiscoveryRunVersion,
  DiscoveryThreadMessage,
} from "./types";

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
    id: crypto.randomUUID(),
    author,
    text,
    createdAt: new Date().toISOString(),
    action: request.action,
    question: version?.question ?? state.question,
    investigationType: version?.investigationType ?? state.investigationType,
    inputPackVersion,
    lensId: request.lensId,
    researchRunId:
      version?.id ??
      state.runs.find((run) => run.lensId === request.lensId)?.currentVersionId,
    ...(request.selectedFinding
      ? { findingRef: discoveryFindingRef(request.selectedFinding) }
      : {}),
    ...(author === "Agent" ? { usedNewRetrieval: false } : {}),
  };
}

function addMessage(
  state: DiscoveryState,
  request: DiscoveryRetryRequest,
  item: DiscoveryThreadMessage,
): DiscoveryState {
  if (request.selectedFinding) {
    const id = request.selectedFinding.id;
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
  return request.action === "initial" && !request.guidance
    ? next
    : addMessage(
        next,
        request,
        message(
          state,
          request,
          "Kevin",
          request.guidance.trim() || request.action.replaceAll("_", " "),
          packVersion,
        ),
      );
}

export function completeDiscoveryRequest(
  state: DiscoveryState,
  request: DiscoveryRetryRequest,
  version: DiscoveryRunVersion,
) {
  const drafts = discoveryDrafts(state);
  const key = request.selectedFinding
    ? discoveryFindingRef(request.selectedFinding)
    : request.lensId;
  const bucket = request.selectedFinding ? "findings" : "agents";
  const text = request.selectedFinding
    ? drafts.findings[key]
    : drafts.agents[request.lensId];
  const next = {
    ...state,
    contextVersion: version.inputPackVersion,
    drafts: {
      ...drafts,
      ...(text === request.guidance
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
            currentVersionId: version.id,
            versions: [version, ...run.versions],
          }
        : run,
    ),
  };
  return addMessage(
    next,
    request,
    message(
      state,
      request,
      "Agent",
      `${version.findings.length} finding${version.findings.length === 1 ? "" : "s"} returned in V${version.number}. ${version.provider === "mock" ? "DEMO DATA: simulated analysis. " : ""}Only supplied sources were analyzed; no new evidence was retrieved.`,
      version.inputPackVersion,
      version,
    ),
  );
}

export function failDiscoveryRequest(
  state: DiscoveryState,
  request: DiscoveryRetryRequest,
  error: string,
  cancelled = false,
): DiscoveryState {
  return {
    ...state,
    runs: state.runs.map((run) =>
      run.lensId === request.lensId
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
  return {
    ...state,
    drafts: discoveryDrafts(state),
    runs: state.runs.map((run) =>
      run.status === "researching"
        ? {
            ...run,
            status: "cancelled",
            error:
              "The previous request was interrupted. Retry this lens; previous findings and drafts are preserved.",
          }
        : run,
    ),
  };
}
