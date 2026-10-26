"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import {
  connectDiscoveryFindings,
  discoveryLenses,
  emptyDiscoveryState,
  generateDiscoveryVersion,
  inputPackVersion,
  currentDiscoveryVersion,
  discoveryFindingRef,
} from "@/lib/discovery";
import {
  archiveOutdatedDiscoveryResponse,
  beginDiscoveryRequest,
  completeDiscoveryRequest,
  dismissOutdatedDiscoveryRequest,
  discoveryDrafts,
  failDiscoveryRequest,
  recoverDiscoveryState,
} from "@/lib/discovery-state";
import type {
  DiscoveryRetryRequest,
  DiscoveryState,
  StrategyInputPack,
} from "@/lib/types";
import InsightDiscoveryWorkspace from "./InsightDiscoveryWorkspace";
import DiscoveryRoundTableV2 from "./DiscoveryRoundTableV2";
import TeamDiscussion from "./TeamDiscussion";
import { useDiscoveryDialog } from "./useDiscoveryDialog";
import {
  crossLensIssue,
  currentPeerFindings,
} from "@/lib/discovery-lens-quality";
import { discoveryStorageKey } from "@/lib/discovery-persistence";
import { resolveConnectionSelection } from "@/lib/discovery-connections";
import {
  conversationRegenerationRequest,
  conversationContextBefore,
} from "@/lib/roundtable-history";

function threadIdentity(parts: readonly string[]) {
  const text = JSON.stringify(parts);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `thread-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function seededState(pack: StrategyInputPack): DiscoveryState {
  const state = emptyDiscoveryState();
  state.contextVersion = inputPackVersion(pack);
  state.question = pack.objective
    ? `What might explain the campaign problem behind this objective: ${pack.objective}`
    : "";
  state.problemStatement = pack.objective;
  return state;
}

export function InsightDiscoveryEntry({
  ready,
  onOpen,
  returning = false,
}: {
  ready: boolean;
  onOpen: () => void;
  returning?: boolean;
}) {
  return (
    <section className="panel insight-discovery-entry">
      <div>
        <span className="eyebrow">ANOTHER STRATEGY PATH</span>
        <h2>Investigate the problem before writing the brief.</h2>
        <p>
          Keep using Generate Strategic Perspectives for the creative Round
          Table, or open a separate evidence-led Discovery workspace.
        </p>
      </div>
      <button className="button" disabled={!ready} onClick={onOpen}>
        {returning ? "Return to Insight Discovery" : "Start Insight Discovery"}{" "}
        <ArrowRight size={15} />
      </button>
    </section>
  );
}

export default function InsightDiscoveryFeature({
  open,
  pack,
  state,
  briefLine,
  onStateChange,
  onApprove,
  onClose,
  approvalError,
  presentation = "dialog",
  autoStart = true,
  view,
  onViewChange,
  packLabel,
  getCurrentState,
  getCurrentPack,
  restoredVersionIds = [],
}: {
  open: boolean;
  pack: StrategyInputPack;
  state?: DiscoveryState;
  briefLine: string;
  onStateChange: (state: DiscoveryState) => void;
  onApprove: (briefLine: string) => void;
  onClose: () => void;
  approvalError?: string;
  presentation?: "dialog" | "page";
  autoStart?: boolean;
  view?: "discovery" | "canvas";
  onViewChange?: (view: "discovery" | "canvas") => void;
  packLabel?: string;
  getCurrentState?: () => DiscoveryState | undefined;
  getCurrentPack?: () => StrategyInputPack;
  restoredVersionIds?: string[];
}) {
  const [discussionView, setDiscussionView] = useState<"individual" | "team">(
    "individual",
  );
  const seeded = useMemo(() => seededState(pack), [pack]);
  const [draft, setDraft] = useState(() => {
    const recovered = recoverDiscoveryState(state ?? seeded);
    if (presentation !== "page" || recovered.investigationType !== "hypothesis")
      return recovered;
    // The primary dropdown now offers problem exploration only. Archive the
    // prior hypothesis focus without reinterpreting it or deleting any history.
    return {
      ...recovered,
      investigationType: "problem" as const,
      question: recovered.focusByMode?.problem ?? "",
      focusByMode: {
        ...recovered.focusByMode,
        hypothesis: recovered.focusByMode?.hypothesis ?? recovered.question,
      },
    };
  });
  const draftRef = useRef(draft);
  const lastPublished = useRef(state);
  const currentPack = useRef(pack);
  currentPack.current = pack;
  const [busy, setBusy] = useState<string[]>([]);
  const [error, setError] = useState("");
  const attempted = useRef(false);
  const controllers = useRef(new Map<string, AbortController>());
  const dialogRef = useRef<HTMLElement>(null);

  function commit(next: DiscoveryState) {
    draftRef.current = next;
    lastPublished.current = next;
    setDraft(next);
    onStateChange(next);
  }
  function update(change: (current: DiscoveryState) => DiscoveryState) {
    // A parent tab may have edited the human-owned canvas before this mounted
    // research component receives its next render. Start from that latest state.
    commit(change(getCurrentState?.() ?? draftRef.current));
  }

  // The primary page stays mounted behind the other tabs. Strategy edits made
  // there arrive as a new parent state; local research commits already have
  // the same identity and must not be replayed over those edits.
  useEffect(() => {
    if (!state || state === lastPublished.current) return;
    draftRef.current = state;
    lastPublished.current = state;
    setDraft(state);
  }, [state]);

  function cancelLens(lensId: string) {
    controllers.current.get(lensId)?.abort();
    const run = draftRef.current.runs.find((item) => item.lensId === lensId);
    if (run?.retryRequest)
      update((current) =>
        failDiscoveryRequest(
          current,
          run.retryRequest!,
          "The request was cancelled. Previous findings and drafts are preserved; retry this lens.",
          true,
        ),
      );
  }
  function close() {
    for (const key of controllers.current.keys()) cancelLens(key);
    onClose();
  }
  useDiscoveryDialog(dialogRef, close);

  useEffect(() => {
    const pending = controllers.current;
    return () => {
      for (const controller of pending.values()) controller.abort();
    };
  }, []);

  async function runLens(
    request: DiscoveryRetryRequest,
    batch?: {
      snapshot: DiscoveryState;
      pack: StrategyInputPack;
      packVersion: string;
      question: string;
    },
  ): Promise<boolean> {
    if (controllers.current.has(request.lensId)) return false;
    const snapshot = batch?.snapshot ?? draftRef.current;
    const question =
      batch?.question ??
      (presentation === "page"
        ? (snapshot.focusByMode?.[snapshot.investigationType]?.trim() ?? "")
        : snapshot.question.trim() || seeded.question);
    const requestPack =
      batch?.pack ?? structuredClone(getCurrentPack?.() ?? currentPack.current);
    const requestPackVersion =
      batch?.packVersion ?? inputPackVersion(requestPack);
    if (!question) {
      setError(
        "Write what you want the agents to investigate before running research.",
      );
      return false;
    }
    const campaignKey = discoveryStorageKey(requestPack);
    if (request.regeneratesTurnId) {
      const original = conversationRegenerationRequest(
        snapshot,
        requestPack,
        request.lensId,
        request.regeneratesTurnId,
      );
      if (
        !original ||
        request.operation !== "conversation" ||
        request.guidance !== original.guidance ||
        request.action !== original.action ||
        request.generationContextId !== original.generationContextId ||
        (request.selectedFinding
          ? discoveryFindingRef(request.selectedFinding)
          : undefined) !==
          (original.selectedFinding
            ? discoveryFindingRef(original.selectedFinding)
            : undefined)
      ) {
        setError(
          "This response cannot be regenerated in the current context. Its earlier conversation is preserved.",
        );
        return false;
      }
    }
    if (
      (request.inputPackVersion &&
        request.inputPackVersion !== requestPackVersion) ||
      (request.question && request.question !== question) ||
      (request.investigationType &&
        request.investigationType !== snapshot.investigationType) ||
      (request.campaignKey && request.campaignKey !== campaignKey)
    ) {
      setError(
        "This turn belongs to an earlier investigation or Input Pack. Its history is preserved; return to that context or start a new scoped question.",
      );
      return false;
    }
    const selectedRef = request.selectedFinding
      ? discoveryFindingRef(request.selectedFinding)
      : undefined;
    if (request.selectedFinding) {
      const sourceVersion = snapshot.runs
        .flatMap((run) => run.versions)
        .find((version) =>
          version.findings.some(
            (finding) => discoveryFindingRef(finding) === selectedRef,
          ),
        );
      if (
        !sourceVersion ||
        sourceVersion.inputPackVersion !== requestPackVersion ||
        sourceVersion.question !== question ||
        sourceVersion.investigationType !== snapshot.investigationType
      ) {
        setError(
          "This finding belongs to an earlier version or investigation. Its discussion is preserved; select a current finding or return to its original context.",
        );
        return false;
      }
    }
    if (
      request.generationContextId &&
      !snapshot.runs
        .find((run) => run.lensId === request.lensId)
        ?.versions.some(
          (version) =>
            version.id === request.generationContextId &&
            version.inputPackVersion === requestPackVersion &&
            version.question === question &&
            version.investigationType === snapshot.investigationType,
        )
    ) {
      setError(
        "This generation belongs to an earlier context. Its history is preserved; select a current generation to continue.",
      );
      return false;
    }
    const boundRequest: DiscoveryRetryRequest = {
      ...request,
      ...(request.operation === "conversation"
        ? {
            generationContextId:
              request.selectedFinding?.researchRunId ??
              request.generationContextId ??
              snapshot.runs.find((run) => run.lensId === request.lensId)
                ?.currentVersionId,
          }
        : {}),
      turnId: request.turnId ?? crypto.randomUUID(),
      threadId:
        request.threadId ??
        threadIdentity([
          campaignKey,
          requestPackVersion,
          question,
          snapshot.investigationType,
          request.lensId,
          selectedRef ?? "agent",
        ]),
      question,
      investigationType: snapshot.investigationType,
      inputPackVersion: requestPackVersion,
      campaignKey,
    };
    const scopeThread = selectedRef
      ? (snapshot.findingThreads[selectedRef] ?? [])
      : (snapshot.runs.find((run) => run.lensId === request.lensId)?.thread ??
        []);
    const threadMessages = conversationContextBefore(
      scopeThread,
      request.regeneratesTurnId,
    ).filter(
      (item) =>
        item.inputPackVersion === requestPackVersion &&
        item.question === question &&
        item.investigationType === snapshot.investigationType &&
        (selectedRef ? item.findingRef === selectedRef : !item.findingRef),
    );
    const controller = new AbortController();
    controllers.current.set(request.lensId, controller);
    setBusy((items) => [...new Set([...items, request.lensId])]);
    setError("");
    update((current) =>
      beginDiscoveryRequest(
        { ...current, question },
        boundRequest,
        requestPackVersion,
      ),
    );
    const contextChanged = () => {
      const now = draftRef.current;
      const currentQuestion =
        presentation === "page"
          ? (now.focusByMode?.[now.investigationType]?.trim() ?? "")
          : now.question.trim() || seeded.question;
      return (
        inputPackVersion(getCurrentPack?.() ?? currentPack.current) !==
          requestPackVersion ||
        currentQuestion !== question ||
        now.investigationType !== snapshot.investigationType ||
        (selectedRef &&
          !!now.activeFindingRefs?.[request.lensId] &&
          now.activeFindingRefs[request.lensId] !== selectedRef) ||
        now.runs.find((run) => run.lensId === request.lensId)?.retryRequest
          ?.turnId !== boundRequest.turnId
      );
    };
    try {
      const result = await generateDiscoveryVersion({
        ...boundRequest,
        threadMessages,
        turnId: boundRequest.turnId,
        threadId: boundRequest.threadId,
        pack: requestPack,
        question,
        investigationType: snapshot.investigationType,
        peerFindings: currentPeerFindings(
          snapshot,
          request.lensId,
          requestPackVersion,
          question,
        ),
        nextVersionNumber:
          Math.max(
            0,
            ...(snapshot.runs
              .find((run) => run.lensId === request.lensId)
              ?.versions.map((version) => version.number) ?? []),
          ) + 1,
        previous:
          snapshot.runs
            .find((run) => run.lensId === request.lensId)
            ?.versions.filter(
              (version) =>
                version.question === question &&
                version.inputPackVersion === requestPackVersion &&
                version.investigationType === snapshot.investigationType,
            ) ?? [],
        signal: controller.signal,
      });
      if (controller.signal.aborted) return false;
      if (contextChanged()) {
        if (
          discoveryStorageKey(getCurrentPack?.() ?? currentPack.current) !==
          campaignKey
        )
          return false;
        update((current) =>
          archiveOutdatedDiscoveryResponse(current, boundRequest, result),
        );
        return false;
      }
      // Re-check after the response: parallel agents may have completed since dispatch.
      const overlap =
        request.operation === "conversation"
          ? undefined
          : crossLensIssue(
              request.lensId,
              result.findings,
              currentPeerFindings(
                draftRef.current,
                request.lensId,
                requestPackVersion,
                question,
              ),
            );
      if (overlap) throw new Error(overlap);
      update((current) =>
        completeDiscoveryRequest(current, boundRequest, result),
      );
      return true;
    } catch (failure) {
      if (
        discoveryStorageKey(getCurrentPack?.() ?? currentPack.current) !==
        campaignKey
      )
        return false;
      if (!controller.signal.aborted)
        update((current) =>
          contextChanged()
            ? dismissOutdatedDiscoveryRequest(current, boundRequest)
            : failDiscoveryRequest(
                current,
                boundRequest,
                failure instanceof Error
                  ? failure.message
                  : "This lens failed. Previous findings and drafts are preserved.",
              ),
        );
      return false;
    } finally {
      controllers.current.delete(request.lensId);
      setBusy((items) => items.filter((item) => item !== request.lensId));
    }
  }

  async function refreshAll() {
    const snapshot = draftRef.current;
    const batchPack = structuredClone(
      getCurrentPack?.() ?? currentPack.current,
    );
    const batchVersion = inputPackVersion(batchPack);
    const question =
      presentation === "page"
        ? (snapshot.focusByMode?.[snapshot.investigationType]?.trim() ?? "")
        : snapshot.question.trim() || seeded.question;
    const batch = {
      snapshot,
      pack: batchPack,
      packVersion: batchVersion,
      question,
    };
    if (
      presentation === "page" &&
      (snapshot.enabledLensIds?.length ?? discoveryLenses.length) !==
        discoveryLenses.length
    )
      update((current) => ({
        ...current,
        enabledLensIds: discoveryLenses.map((lens) => lens.id),
      }));
    await Promise.all(
      discoveryLenses
        .filter(
          (lens) =>
            presentation === "page" ||
            !snapshot.enabledLensIds ||
            snapshot.enabledLensIds.includes(lens.id),
        )
        .map((lens) =>
          runLens(
            {
              lensId: lens.id,
              action: snapshot.runs
                .find((run) => run.lensId === lens.id)
                ?.versions.some(
                  (version) =>
                    version.question === question &&
                    version.inputPackVersion === batchVersion &&
                    version.investigationType === snapshot.investigationType,
                )
                ? "refresh"
                : "initial",
              guidance: "",
              ...(presentation === "page"
                ? { operation: "generation" as const }
                : {}),
            },
            batch,
          ),
        ),
    );
  }

  async function connect(guidance: string): Promise<boolean> {
    if (controllers.current.has("connections")) return false;
    const snapshot = draftRef.current;
    const comparisonPack = structuredClone(
      getCurrentPack?.() ?? currentPack.current,
    );
    const selection = resolveConnectionSelection(
      snapshot,
      comparisonPack,
      snapshot.drafts?.connectionConsentKey,
    );
    if (selection.issue) {
      setError(selection.issue);
      return false;
    }
    const campaignKey = discoveryStorageKey(comparisonPack);
    const packVersion = inputPackVersion(comparisonPack);
    const question = snapshot.question;
    const investigationType = snapshot.investigationType;
    const controller = new AbortController();
    controllers.current.set("connections", controller);
    setBusy((items) => [...new Set([...items, "connections"])]);
    setError("");
    try {
      const note = await connectDiscoveryFindings({
        pack: comparisonPack,
        findings: selection.findings,
        sourcePacks: selection.sourcePacks,
        guidance,
        signal: controller.signal,
        sourceContextConsent: selection.earlierContext,
      });
      if (controller.signal.aborted) return false;
      const latest = draftRef.current;
      const latestPack = getCurrentPack?.() ?? currentPack.current;
      const latestSelection = resolveConnectionSelection(
        latest,
        latestPack,
        latest.drafts?.connectionConsentKey,
      );
      if (
        discoveryStorageKey(latestPack) !== campaignKey ||
        inputPackVersion(latestPack) !== packVersion ||
        latest.question !== question ||
        latest.investigationType !== investigationType ||
        latestSelection.issue ||
        latestSelection.selectionKey !== selection.selectionKey
      ) {
        setError(
          "The comparison finished for an earlier selection or investigation. Nothing was added to the current strategy draft; select the intended findings and compare again.",
        );
        return false;
      }
      update((current) => {
        const drafts = discoveryDrafts(current);
        return {
          ...current,
          connectionNotes: [note, ...current.connectionNotes],
          drafts: {
            ...drafts,
            connections:
              drafts.connections === guidance ? "" : drafts.connections,
          },
        };
      });
      return true;
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "The selected findings could not be connected. Your draft is preserved.",
        );
      return false;
    } finally {
      controllers.current.delete("connections");
      setBusy((items) => items.filter((item) => item !== "connections"));
    }
  }

  const runRef = useRef(runLens);
  runRef.current = runLens;
  useEffect(() => {
    if (!open || !autoStart) return;
    // Defer until mount effects settle. React development Strict Mode replays
    // effects; it must not start and cancel a paid batch during that replay.
    const frame = window.requestAnimationFrame(() => {
      if (attempted.current) return;
      attempted.current = true;
      // Reopened failed/cancelled runs require an explicit scoped retry.
      if (
        draftRef.current.runs.some(
          (run) => run.versions.length || run.status !== "idle",
        )
      )
        return;
      for (const lens of discoveryLenses)
        void runRef.current({
          lensId: lens.id,
          action: "initial",
          guidance: "",
        });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, autoStart]);

  if (!open) return null;
  const Workspace =
    presentation === "page" ? DiscoveryRoundTableV2 : InsightDiscoveryWorkspace;
  const content = (
    <>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {approvalError && (
        <div className="error" role="alert">
          {approvalError}
        </div>
      )}
      {busy.length > 0 && (
        <div className="discovery-run-status" role="status">
          <Search size={14} />{" "}
          {busy.filter((id) => id !== "connections").length} of{" "}
          {draft.enabledLensIds?.length ?? 5}{" "}
          {presentation === "page" ? "agents" : "lenses"} working
          {busy.includes("connections") && " · Connecting selected findings"}
        </div>
      )}
      <Workspace
        restoredVersionIds={restoredVersionIds}
        packLabel={packLabel}
        state={view ? { ...draft, workspaceView: view } : draft}
        pack={pack}
        briefLine={draft.humanBriefLine ?? briefLine}
        busy={busy}
        onChange={(next) => {
          if (view && next.workspaceView && next.workspaceView !== view)
            onViewChange?.(next.workspaceView);
          commit(next);
        }}
        onQuestionChange={(question, investigationType) =>
          update((current) => ({
            ...current,
            question,
            investigationType,
            ...(presentation === "page"
              ? {
                  focusByMode: {
                    ...current.focusByMode,
                    [investigationType]: question,
                  },
                }
              : {}),
          }))
        }
        onRunLens={runLens}
        onRefreshAll={refreshAll}
        onConnect={connect}
        onRetryLens={(lensId) => {
          const retry = draftRef.current.runs.find(
            (run) => run.lensId === lensId,
          )?.retryRequest;
          return runLens(
            retry
              ? {
                  ...retry,
                  ...(presentation === "page" && !retry.operation
                    ? {
                        operation: [
                          "initial",
                          "refresh",
                          "another_answer",
                        ].includes(retry.action)
                          ? ("generation" as const)
                          : ("conversation" as const),
                      }
                    : {}),
                }
              : {
                  lensId,
                  ...(presentation === "page"
                    ? { operation: "generation" as const }
                    : {}),
                  action: "refresh",
                  guidance:
                    "Retry this lens against the current supplied evidence.",
                },
          );
        }}
        onCancelLens={cancelLens}
        onBriefLineChange={(humanBriefLine) =>
          update((current) => ({ ...current, humanBriefLine }))
        }
        onApprove={() =>
          onApprove(draftRef.current.humanBriefLine ?? briefLine)
        }
      />
      {draft.runs.some(
        (run) => currentDiscoveryVersion(run)?.provider === "mock",
      ) && (
        <div className="discovery-demo-notice" role="note">
          DEMO DATA · Simulated analysis of supplied inputs. This is not live
          research.
        </div>
      )}
    </>
  );
  const discussionContent = (
    <>
      <div
        className="team-view-selector"
        role="tablist"
        aria-label="Insight Discovery discussion view"
      >
        <button
          id="individual-roundtable-tab"
          type="button"
          role="tab"
          aria-selected={discussionView === "individual"}
          aria-controls="individual-roundtable-panel"
          className={discussionView === "individual" ? "is-active" : ""}
          onClick={() => setDiscussionView("individual")}
        >
          Individual Round Table
        </button>
        <button
          id="team-discussion-tab"
          type="button"
          role="tab"
          aria-selected={discussionView === "team"}
          aria-controls="team-discussion-panel"
          className={discussionView === "team" ? "is-active" : ""}
          onClick={() => setDiscussionView("team")}
        >
          Team Discussion <span>Experimental</span>
        </button>
      </div>
      <div
        id="individual-roundtable-panel"
        role="tabpanel"
        aria-labelledby="individual-roundtable-tab"
        hidden={discussionView !== "individual"}
      >
        {content}
      </div>
      <div
        id="team-discussion-panel"
        role="tabpanel"
        aria-labelledby="team-discussion-tab"
        hidden={discussionView !== "team"}
      >
        <TeamDiscussion />
      </div>
    </>
  );
  if (presentation === "page")
    return (
      <section
        className="discovery-page"
        aria-label="Insight Discovery workspace"
      >
        {discussionContent}
      </section>
    );
  return (
    <div className="discovery-modal-backdrop">
      <section
        ref={dialogRef}
        className="discovery-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="discovery-dialog-title"
      >
        <header className="discovery-modal-header">
          <div>
            <span className="eyebrow">SEPARATE RESEARCH MODE</span>
            <h2 id="discovery-dialog-title">Insight Discovery</h2>
          </div>
          <button
            className="button small"
            onClick={close}
            aria-label="Close Insight Discovery"
          >
            <X size={15} /> Close
          </button>
        </header>
        {discussionContent}
      </section>
    </div>
  );
}
