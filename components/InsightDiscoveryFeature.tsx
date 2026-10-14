"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import {
  connectDiscoveryFindings,
  discoveryLenses,
  emptyDiscoveryState,
  generateDiscoveryVersion,
  inputPackVersion,
  knownDiscoveryFindings,
  currentDiscoveryVersion,
} from "@/lib/discovery";
import {
  beginDiscoveryRequest,
  completeDiscoveryRequest,
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
import { useDiscoveryDialog } from "./useDiscoveryDialog";

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
}: {
  open: boolean;
  pack: StrategyInputPack;
  state?: DiscoveryState;
  briefLine: string;
  onStateChange: (state: DiscoveryState) => void;
  onApprove: (briefLine: string) => void;
  onClose: () => void;
  approvalError?: string;
}) {
  const packVersion = inputPackVersion(pack);
  const seeded = useMemo(() => seededState(pack), [pack]);
  const [draft, setDraft] = useState(() =>
    recoverDiscoveryState(state ?? seeded),
  );
  const draftRef = useRef(draft);
  const [busy, setBusy] = useState<string[]>([]);
  const [error, setError] = useState("");
  const attempted = useRef(false);
  const controllers = useRef(new Map<string, AbortController>());
  const dialogRef = useRef<HTMLElement>(null);

  function commit(next: DiscoveryState) {
    draftRef.current = next;
    setDraft(next);
    onStateChange(next);
  }
  function update(change: (current: DiscoveryState) => DiscoveryState) {
    commit(change(draftRef.current));
  }

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

  async function runLens(request: DiscoveryRetryRequest): Promise<boolean> {
    if (controllers.current.has(request.lensId)) return false;
    const controller = new AbortController();
    controllers.current.set(request.lensId, controller);
    setBusy((items) => [...new Set([...items, request.lensId])]);
    setError("");
    const snapshot = draftRef.current;
    const question = snapshot.question.trim() || seeded.question;
    update((current) =>
      beginDiscoveryRequest({ ...current, question }, request, packVersion),
    );
    try {
      const result = await generateDiscoveryVersion({
        ...request,
        pack,
        question,
        investigationType: snapshot.investigationType,
        previous:
          snapshot.runs.find((run) => run.lensId === request.lensId)
            ?.versions ?? [],
        signal: controller.signal,
      });
      if (controller.signal.aborted) return false;
      update((current) => completeDiscoveryRequest(current, request, result));
      return true;
    } catch (failure) {
      if (!controller.signal.aborted)
        update((current) =>
          failDiscoveryRequest(
            current,
            request,
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
    await Promise.all(
      discoveryLenses.map((lens) =>
        runLens({
          lensId: lens.id,
          action: "refresh",
          guidance: "Refresh this lens against the current Input Pack.",
        }),
      ),
    );
  }

  async function connect(guidance: string): Promise<boolean> {
    if (controllers.current.has("connections")) return false;
    const snapshot = draftRef.current;
    const byId = knownDiscoveryFindings(snapshot);
    const findings = snapshot.selectedFindingIds.flatMap((id) =>
      byId.get(id) ? [byId.get(id)!] : [],
    );
    if (findings.length < 2 || findings.length > 12) {
      setError("Select between 2 and 12 exact finding versions to connect.");
      return false;
    }
    const controller = new AbortController();
    controllers.current.set("connections", controller);
    setBusy((items) => [...new Set([...items, "connections"])]);
    setError("");
    try {
      const note = await connectDiscoveryFindings({
        pack,
        findings,
        guidance,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return false;
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
    if (!open) return;
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
  }, [open]);

  if (!open) return null;
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
            {busy.filter((id) => id !== "connections").length} of 5 lenses
            working
            {busy.includes("connections") && " · Connecting selected findings"}
          </div>
        )}
        <InsightDiscoveryWorkspace
          state={draft}
          pack={pack}
          briefLine={draft.humanBriefLine ?? briefLine}
          busy={busy}
          onChange={commit}
          onQuestionChange={(question, investigationType) =>
            update((current) => ({ ...current, question, investigationType }))
          }
          onRunLens={runLens}
          onRefreshAll={refreshAll}
          onConnect={connect}
          onRetryLens={(lensId) => {
            const retry = draftRef.current.runs.find(
              (run) => run.lensId === lensId,
            )?.retryRequest;
            return runLens(
              retry ?? {
                lensId,
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
      </section>
    </div>
  );
}
