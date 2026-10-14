"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import {
  connectDiscoveryFindings,
  currentDiscoveryVersion,
  discoveryLenses,
  emptyDiscoveryState,
  generateDiscoveryVersion,
  inputPackVersion,
  knownDiscoveryFindings,
} from "@/lib/discovery";
import type {
  DiscoveryAction,
  DiscoveryFinding,
  DiscoveryLensId,
  DiscoveryState,
  StrategyInputPack,
} from "@/lib/types";
import InsightDiscoveryWorkspace from "./InsightDiscoveryWorkspace";

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
}: {
  ready: boolean;
  onOpen: () => void;
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
        Start Insight Discovery <ArrowRight size={15} />
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
  onBriefLineChange,
  onApprove,
  onClose,
}: {
  open: boolean;
  pack: StrategyInputPack;
  state?: DiscoveryState;
  briefLine: string;
  onStateChange: (state: DiscoveryState) => void;
  onBriefLineChange: (value: string) => void;
  onApprove: (briefLine: string) => void;
  onClose: () => void;
}) {
  const packVersion = inputPackVersion(pack);
  const seeded = seededState(pack);
  const [draft, setDraft] = useState<DiscoveryState>(state ?? seeded);
  const draftRef = useRef(draft);
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  const [busy, setBusy] = useState<string[]>([]);
  const [error, setError] = useState("");
  const attemptedPack = useRef("");
  const locked = useRef(new Set<string>());

  useEffect(() => {
    if (state) {
      if (state !== draftRef.current) {
        draftRef.current = state;
        setDraft(state);
      }
      return;
    }
    if (open) {
      draftRef.current = seeded;
      setDraft(seeded);
      onStateChangeRef.current(seeded);
    }
  }, [state, open, seeded]);

  function commit(next: DiscoveryState) {
    draftRef.current = next;
    setDraft(next);
    onStateChange(next);
  }

  function update(change: (current: DiscoveryState) => DiscoveryState) {
    commit(change(draftRef.current));
  }

  async function runLens({
    lensId,
    action,
    guidance,
    selectedFinding,
    routedFromLens,
  }: {
    lensId: DiscoveryLensId;
    action: DiscoveryAction;
    guidance: string;
    selectedFinding?: DiscoveryFinding;
    routedFromLens?: DiscoveryLensId;
  }) {
    const lock = `discovery-${lensId}`;
    if (locked.current.has(lock)) return;
    locked.current.add(lock);
    setBusy((items) => [...new Set([...items, lensId])]);
    setError("");
    const current = draftRef.current;
    const userMessage = guidance.trim() || action.replaceAll("_", " ");
    update((previous) => ({
      ...previous,
      question: previous.question.trim() || seeded.question,
      runs: previous.runs.map((run) =>
        run.lensId === lensId
          ? {
              ...run,
              status: "researching",
              error: undefined,
              thread: [
                ...run.thread,
                {
                  id: crypto.randomUUID(),
                  author: "Kevin",
                  text: userMessage,
                  createdAt: new Date().toISOString(),
                  action,
                },
              ],
            }
          : run,
      ),
      ...(selectedFinding
        ? {
            findingThreads: {
              ...previous.findingThreads,
              [selectedFinding.id]: [
                ...(previous.findingThreads[selectedFinding.id] ?? []),
                {
                  id: crypto.randomUUID(),
                  author: "Kevin" as const,
                  text: userMessage,
                  createdAt: new Date().toISOString(),
                  action,
                },
              ],
            },
          }
        : {}),
    }));
    try {
      const result = await generateDiscoveryVersion({
        lensId,
        pack,
        question: current.question.trim() || seeded.question,
        investigationType: current.investigationType,
        action,
        guidance,
        previous:
          current.runs.find((run) => run.lensId === lensId)?.versions ?? [],
        selectedFinding,
        routedFromLens,
      });
      update((previous) => ({
        ...previous,
        contextVersion: packVersion,
        selectedLensId: lensId,
        runs: previous.runs.map((run) =>
          run.lensId === lensId
            ? {
                ...run,
                status: "complete",
                error: undefined,
                currentVersionId: result.id,
                versions: [result, ...run.versions],
                thread: [
                  ...run.thread,
                  {
                    id: crypto.randomUUID(),
                    author: "Agent",
                    text: `${result.findings.length} finding${result.findings.length === 1 ? "" : "s"} returned. ${result.provider === "mock" ? "DEMO DATA: simulated analysis; " : ""}Supplied evidence only; no external source was searched.`,
                    createdAt: result.createdAt,
                    action,
                    usedNewRetrieval: false,
                  },
                ],
              }
            : run,
        ),
        ...(selectedFinding
          ? {
              findingThreads: {
                ...previous.findingThreads,
                [selectedFinding.id]: [
                  ...(previous.findingThreads[selectedFinding.id] ?? []),
                  {
                    id: crypto.randomUUID(),
                    author: "Agent" as const,
                    text: `The finding was updated in V${result.number}. Only supplied evidence was re-analyzed; no new source was retrieved.`,
                    createdAt: result.createdAt,
                    action,
                    usedNewRetrieval: false,
                  },
                ],
              },
            }
          : {}),
      }));
    } catch (failure) {
      update((previous) => ({
        ...previous,
        runs: previous.runs.map((run) =>
          run.lensId === lensId
            ? {
                ...run,
                status: "failed",
                error:
                  failure instanceof Error
                    ? failure.message
                    : "This lens failed. Previous findings are preserved.",
              }
            : run,
        ),
      }));
    } finally {
      locked.current.delete(lock);
      setBusy((items) => items.filter((item) => item !== lensId));
    }
  }

  async function runAll() {
    const previous = draftRef.current;
    const hasHistory = previous.runs.some((run) => run.versions.length > 0);
    update((current) => ({
      ...current,
      question: current.question.trim() || seeded.question,
      contextVersion: packVersion,
      runs: current.runs.map((run) => ({
        ...run,
        status: "researching",
        error: undefined,
      })),
    }));
    for (const lens of discoveryLenses) locked.current.add(`discovery-${lens.id}`);
    setBusy(discoveryLenses.map((lens) => lens.id));
    await Promise.all(
      discoveryLenses.map(async (lens) => {
        try {
          const result = await generateDiscoveryVersion({
            lensId: lens.id,
            pack,
            question: previous.question.trim() || seeded.question,
            investigationType: previous.investigationType,
            action: hasHistory ? "refresh" : "initial",
            guidance: "",
            previous:
              previous.runs.find((run) => run.lensId === lens.id)?.versions ??
              [],
          });
          update((currentState) => ({
            ...currentState,
            contextVersion: packVersion,
            runs: currentState.runs.map((run) =>
              run.lensId === lens.id
                ? {
                    ...run,
                    status: "complete",
                    error: undefined,
                    versions: [result, ...run.versions],
                    currentVersionId: result.id,
                    thread: [
                      ...run.thread,
                      {
                        id: crypto.randomUUID(),
                        author: "Agent",
                        text: `${result.findings.length} finding${result.findings.length === 1 ? "" : "s"} returned. ${result.provider === "mock" ? "DEMO DATA: simulated analysis; " : ""}Supplied evidence only; no external source was searched.`,
                        createdAt: result.createdAt,
                        action: hasHistory ? "refresh" : "initial",
                        usedNewRetrieval: false,
                      },
                    ],
                  }
                : run,
            ),
          }));
        } catch (failure) {
          update((currentState) => ({
            ...currentState,
            runs: currentState.runs.map((run) =>
              run.lensId === lens.id
                ? {
                    ...run,
                    status: "failed",
                    error:
                      failure instanceof Error
                        ? failure.message
                        : "This lens failed. Retry it independently.",
                  }
                : run,
            ),
          }));
        } finally {
          locked.current.delete(`discovery-${lens.id}`);
          setBusy((items) => items.filter((item) => item !== lens.id));
        }
      }),
    );
  }

  const runAllRef = useRef(runAll);
  runAllRef.current = runAll;

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

  async function connect(guidance: string) {
    if (locked.current.has("connections")) return;
    const snapshot = draftRef.current;
    const byId = knownDiscoveryFindings(snapshot);
    const findings = snapshot.selectedFindingIds
      .map((id) => byId.get(id))
      .filter((finding): finding is DiscoveryFinding => Boolean(finding));
    if (findings.length < 2) return;
    locked.current.add("connections");
    setBusy((items) => [...new Set([...items, "connections"])]);
    try {
      const note = await connectDiscoveryFindings({ pack, findings, guidance });
      update((current) => ({
        ...current,
        connectionNotes: [note, ...current.connectionNotes],
      }));
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The selected findings could not be connected.",
      );
    } finally {
      locked.current.delete("connections");
      setBusy((items) => items.filter((item) => item !== "connections"));
    }
  }

  useEffect(() => {
    if (!open || attemptedPack.current === packVersion) return;
    const hasVersion = draftRef.current.runs.some(
      (run) => run.versions.length > 0,
    );
    if (hasVersion) {
      attemptedPack.current = packVersion;
      return;
    }
    attemptedPack.current = packVersion;
    void runAllRef.current();
  }, [open, packVersion]);

  if (!open) return null;
  const version = currentDiscoveryVersion(
    draft.runs.find((run) => run.lensId === draft.selectedLensId),
  );

  return (
    <div className="discovery-modal-backdrop">
      <section
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
            onClick={onClose}
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
        {busy.length > 0 && (
          <div className="discovery-run-status" role="status">
            <Search size={14} />{" "}
            {busy.filter((id) => id !== "connections").length} of 5 lenses
            working
          </div>
        )}
        <InsightDiscoveryWorkspace
          state={draft}
          pack={pack}
          briefLine={briefLine}
          busy={busy}
          onChange={commit}
          onQuestionChange={(question, investigationType) =>
            update((current) => ({ ...current, question, investigationType }))
          }
          onRunLens={runLens}
          onRefreshAll={refreshAll}
          onConnect={connect}
          onBriefLineChange={onBriefLineChange}
          onApprove={() => onApprove(briefLine)}
        />
        {version?.provider === "mock" && (
          <div className="discovery-demo-notice" role="note">
            DEMO DATA · Simulated analysis of supplied inputs. This is not live
            research.
          </div>
        )}
      </section>
    </div>
  );
}
