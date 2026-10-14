"use client";
import type { AIStatus } from "@/lib/ai/schemas";
import Link from "next/link";
import { campaignDisplayName } from "@/lib/campaign-display";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  Layers3,
  Sparkles,
} from "lucide-react";
import { emptyExecution, prefillExecution } from "@/lib/execution";
import { generateXCBrief } from "@/lib/services";
import type {
  DiscoveryAction,
  DiscoveryFinding,
  DiscoveryLensId,
  StrategySession,
} from "@/lib/types";
import {
  ExecutionDirectionForm,
  GeneratedBriefPreview,
  StrategyInputSummary,
} from "./StrategyPanels";
import PreparationWorkspace from "./PreparationWorkspace";
import SavedProjects from "./SavedProjects";
import InsightDiscoveryWorkspace from "./InsightDiscoveryWorkspace";
import {
  compileInputPack,
  emptyPreparation,
  preparationReady,
} from "@/lib/preparation";
import {
  connectDiscoveryFindings,
  discoveryLenses,
  emptyDiscoveryState,
  generateDiscoveryVersion,
  inputPackVersion,
  knownDiscoveryFindings,
} from "@/lib/discovery";
const initial: StrategySession = {
  step: 0,
  pack: compileInputPack(emptyPreparation),
  preparation: emptyPreparation,
  sharedPack: null,
  outputs: [],
  selected: [],
  synthesis: [],
  synthesisResults: [],
  synthesisSources: [],
  finalSourceLines: [],
  finalLine: "",
  finalSource: "",
  approved: null,
  execution: emptyExecution,
  brief: null,
  discovery: emptyDiscoveryState(),
};
const storageKey = "xc-strategy-session-v1";
function actionLabelsForThread(action: DiscoveryAction) {
  return action
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}
export default function StrategyWorkspace({
  aiStatus,
}: {
  aiStatus: AIStatus;
}) {
  const [session, setSession] = useState<StrategySession>(initial);
  const [preparing, setPreparing] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState("");
  const [agentBusy, setAgentBusy] = useState<string[]>([]);
  const locks = useRef(new Set<string>());
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed.pack &&
          Array.isArray(parsed.outputs) &&
          parsed.execution &&
          Array.isArray(parsed.selected) &&
          Array.isArray(parsed.synthesis)
        ) {
          const restoredDiscovery = {
            ...initial.discovery,
            ...(parsed.discovery ?? {}),
            question:
              parsed.discovery?.question?.trim() ||
              (parsed.sharedPack?.objective
                ? `What might explain the campaign problem behind this objective: ${parsed.sharedPack.objective}`
                : ""),
            contextVersion:
              parsed.discovery?.contextVersion ||
              (parsed.sharedPack ? inputPackVersion(parsed.sharedPack) : ""),
            runs: Array.isArray(parsed.discovery?.runs)
              ? parsed.discovery.runs
              : initial.discovery.runs,
          };
          // Hydrate the browser-only demonstration session after the server render.
          setSession({
            ...initial,
            ...parsed,
            discovery: restoredDiscovery,
            step: parsed.step > 1 && !parsed.approved ? 1 : parsed.step,
          });
        }
      }
    } catch {
      /* A blocked or invalid storage entry starts a clean demonstration. */
    }
    setReady(true);
  }, []);
  // Storage success is external state used by the save indicator.
  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(session));
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }, [session, ready]);
  const update = (patch: Partial<StrategySession>) =>
    setSession((s) => ({ ...s, ...patch }));
  function navigate(step: number) {
    update({ step });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function currentDownstreamPack() {
    if (preparationReady(session.preparation, aiStatus.mode)) {
      return structuredClone(compileInputPack(session.preparation));
    }
    const hasPreparationSource = Boolean(
      session.preparation.sourceSnapshot?.trim() ||
      session.preparation.upstreamDraft?.trim(),
    );
    return !hasPreparationSource && session.sharedPack
      ? structuredClone(session.sharedPack)
      : null;
  }
  async function run(key: string, action: () => Promise<void>) {
    if (locks.current.has(key)) return;
    locks.current.add(key);
    setBusy(key);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Your work is preserved; please retry.",
      );
    } finally {
      setBusy("");
      locks.current.delete(key);
    }
  }
  async function generate() {
    if (preparing || !preparationReady(session.preparation, aiStatus.mode))
      return;
    await run("discovery", async () => {
      const sharedPack = structuredClone(compileInputPack(session.preparation));
      const version = inputPackVersion(sharedPack);
      const question =
        session.discovery.question.trim() ||
        `What might explain the campaign problem behind this objective: ${sharedPack.objective}`;
      const hasDiscoveryHistory = session.discovery.runs.some(
        (lensRun) => lensRun.versions.length,
      );
      const nextDiscovery = {
        ...session.discovery,
        question,
        contextVersion: version,
        runs: session.discovery.runs.map((lensRun) => ({
          ...lensRun,
          status: "researching" as const,
          error: undefined,
        })),
      };
      setSession((s) => ({
        ...s,
        sharedPack,
        outputs: [],
        selected: [],
        synthesis: [],
        synthesisResults: [],
        synthesisSources: [],
        finalSourceLines: [],
        approved: null,
        brief: null,
        discovery: nextDiscovery,
        step: 1,
      }));
      window.scrollTo({ top: 0 });
      for (const lens of discoveryLenses)
        locks.current.add(`discovery-${lens.id}`);
      setAgentBusy(discoveryLenses.map((lens) => lens.id));
      try {
        await Promise.all(
          discoveryLenses.map(async (lens) => {
            const previous =
              session.discovery.runs.find(
                (lensRun) => lensRun.lensId === lens.id,
              )?.versions ?? [];
            try {
              const generated = await generateDiscoveryVersion({
                lensId: lens.id,
                pack: sharedPack,
                question,
                investigationType: nextDiscovery.investigationType,
                action: hasDiscoveryHistory ? "refresh" : "initial",
                guidance: "",
                previous,
              });
              setSession((s) => ({
                ...s,
                discovery: {
                  ...s.discovery,
                  runs: s.discovery.runs.map((lensRun) =>
                    lensRun.lensId === lens.id
                      ? {
                          ...lensRun,
                          status: "complete",
                          versions: [generated, ...lensRun.versions],
                          currentVersionId: generated.id,
                          error: undefined,
                        }
                      : lensRun,
                  ),
                },
              }));
            } catch (failure) {
              setSession((s) => ({
                ...s,
                discovery: {
                  ...s.discovery,
                  runs: s.discovery.runs.map((lensRun) =>
                    lensRun.lensId === lens.id
                      ? {
                          ...lensRun,
                          status: "failed",
                          error:
                            failure instanceof Error
                              ? failure.message
                              : "This lens could not complete its research pass.",
                        }
                      : lensRun,
                  ),
                },
              }));
            } finally {
              locks.current.delete(`discovery-${lens.id}`);
              setAgentBusy((items) => items.filter((item) => item !== lens.id));
            }
          }),
        );
      } finally {
        for (const lens of discoveryLenses)
          locks.current.delete(`discovery-${lens.id}`);
      }
    });
  }
  async function runDiscoveryLens({
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
    if (locks.current.has(lock) || !session.sharedPack) return;
    const latestPack = currentDownstreamPack();
    if (!latestPack) {
      setError(
        "Prepare the current IMC brief and selected inputs before researching this lens.",
      );
      return;
    }
    const run = session.discovery.runs.find((item) => item.lensId === lensId)!;
    locks.current.add(lock);
    setAgentBusy((items) => [...items, lensId]);
    setError("");
    const userMessage = guidance.trim() || actionLabelsForThread(action);
    setSession((s) => ({
      ...s,
      discovery: {
        ...s.discovery,
        runs: s.discovery.runs.map((item) =>
          item.lensId === lensId
            ? {
                ...item,
                status: "researching",
                error: undefined,
                thread: [
                  ...item.thread,
                  {
                    id: crypto.randomUUID(),
                    author: "Kevin",
                    text: userMessage,
                    createdAt: new Date().toISOString(),
                    action,
                  },
                ],
              }
            : item,
        ),
        ...(selectedFinding
          ? {
              findingThreads: {
                ...s.discovery.findingThreads,
                [selectedFinding.id]: [
                  ...(s.discovery.findingThreads[selectedFinding.id] ?? []),
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
      },
    }));
    try {
      const version = await generateDiscoveryVersion({
        lensId,
        pack: latestPack,
        question: session.discovery.question,
        investigationType: session.discovery.investigationType,
        action,
        guidance,
        previous: run.versions,
        selectedFinding,
        routedFromLens,
      });
      setSession((s) => ({
        ...s,
        sharedPack: latestPack,
        discovery: {
          ...s.discovery,
          contextVersion: inputPackVersion(latestPack),
          selectedLensId: lensId,
          runs: s.discovery.runs.map((item) =>
            item.lensId === lensId
              ? {
                  ...item,
                  status: "complete",
                  versions: [version, ...item.versions],
                  currentVersionId: version.id,
                  error: undefined,
                  thread: [
                    ...item.thread,
                    {
                      id: crypto.randomUUID(),
                      author: "Agent",
                      text: `${version.findings.length} finding${version.findings.length === 1 ? "" : "s"} returned. ${version.provider === "mock" ? "Demonstration output;" : ""} supplied evidence only; no external connector was searched.`,
                      createdAt: new Date().toISOString(),
                      action,
                      usedNewRetrieval: false,
                    },
                  ],
                }
              : item,
          ),
          ...(selectedFinding
            ? {
                findingThreads: {
                  ...s.discovery.findingThreads,
                  [selectedFinding.id]: [
                    ...(s.discovery.findingThreads[selectedFinding.id] ?? []),
                    {
                      id: crypto.randomUUID(),
                      author: "Agent" as const,
                      text: `The finding was updated in V${version.number}. The response re-analyzed existing supplied evidence; no new source was retrieved.`,
                      createdAt: new Date().toISOString(),
                      action,
                      usedNewRetrieval: false,
                    },
                  ],
                },
              }
            : {}),
        },
      }));
    } catch (failure) {
      setSession((s) => ({
        ...s,
        discovery: {
          ...s.discovery,
          runs: s.discovery.runs.map((item) =>
            item.lensId === lensId
              ? {
                  ...item,
                  status: "failed",
                  error:
                    failure instanceof Error
                      ? failure.message
                      : "This lens failed. Previous findings are preserved.",
                }
              : item,
          ),
        },
      }));
    } finally {
      locks.current.delete(lock);
      setAgentBusy((items) => items.filter((item) => item !== lensId));
    }
  }
  async function refreshDiscovery() {
    if (!session.sharedPack || !session.discovery.question.trim()) return;
    await Promise.all(
      discoveryLenses.map((lens) =>
        runDiscoveryLens({
          lensId: lens.id,
          action: "refresh",
          guidance: "Refresh this lens against the current Input Pack.",
        }),
      ),
    );
  }
  async function connectFindings(guidance: string) {
    if (!session.sharedPack || locks.current.has("connections")) return;
    const allFindings = knownDiscoveryFindings(session.discovery);
    const selected = session.discovery.selectedFindingIds
      .map((id) => allFindings.get(id))
      .filter((finding): finding is DiscoveryFinding => Boolean(finding));
    if (selected.length < 2) return;
    locks.current.add("connections");
    setAgentBusy((items) => [...items, "connections"]);
    try {
      const note = await connectDiscoveryFindings({
        pack: session.sharedPack,
        findings: selected,
        guidance,
      });
      setSession((s) => ({
        ...s,
        discovery: {
          ...s.discovery,
          connectionNotes: [note, ...s.discovery.connectionNotes],
        },
      }));
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The selected findings could not be connected.",
      );
    } finally {
      locks.current.delete("connections");
      setAgentBusy((items) => items.filter((item) => item !== "connections"));
    }
  }
  function approveHumanStrategy() {
    if (!session.sharedPack || !session.finalLine.trim()) return;
    update({
      execution: prefillExecution(
        session.execution,
        session.sharedPack,
        session.executionSourcePack ?? session.approved?.strategyInputPack,
      ),
      executionSourcePack: structuredClone(session.sharedPack),
      approved: {
        approvalState: "Approved",
        sourcePerspectives: [],
        briefLine: session.finalLine.trim(),
        strategyInputPack: structuredClone(session.sharedPack),
        approvedAt: new Date().toISOString(),
        approvedBy: "Kevin",
        source: "Human-authored in Insight Discovery",
      },
      finalSource: "Human-authored in Insight Discovery",
      finalSourceLines: [],
      step: 2,
      brief: null,
    });
    window.scrollTo({ top: 0 });
  }
  async function brief() {
    if (!session.approved) return;
    await run("brief", async () => {
      const result = await generateXCBrief({
        strategyInputPack: session.approved!.strategyInputPack,
        approvedBriefLine: session.approved!,
        executionDirection: session.execution,
      });
      update({ brief: result, step: 3 });
      window.scrollTo({ top: 0 });
    });
  }
  const titles = [
    "Prepare the Inputs",
    "Insight Discovery",
    "From direction to deliverables.",
    "A clearer handoff to Creative.",
  ];
  const descriptions = [
    "Start with the IMC output brief. The same upstream context will be used by the preparation agents to create the working foundation for XC strategy.",
    "Investigate the problem through five evidence disciplines, then develop and approve the strategy yourself.",
    "Your strategy is approved. Add the practical details that turn a strong line into an actionable creative brief.",
    "Your approved strategy and execution direction, brought together in one review-ready document.",
  ];
  return (
    <>
      <header className="topbar">
        <Link className="brand" href="/" aria-label="XC Strategy home">
          <span className="brand-mark">xc</span>
          <span>STRATEGY STUDIO</span>
        </Link>
        <div className="top-right">
          <SavedProjects
            session={session}
            disabled={!ready || !!busy || preparing || agentBusy.length > 0}
            onOpen={(snapshot) => {
              setSession({
                ...initial,
                ...snapshot,
                discovery: {
                  ...initial.discovery,
                  ...(snapshot.discovery ?? {}),
                  runs: Array.isArray(snapshot.discovery?.runs)
                    ? snapshot.discovery.runs
                    : initial.discovery.runs,
                },
                step:
                  snapshot.step > 1 && !snapshot.approved ? 1 : snapshot.step,
              });
              setError("");
              window.scrollTo({ top: 0 });
            }}
          />
          <span className="demo-pill">
            <span /> Interactive prototype
          </span>
          <span className="avatar">K</span>
          <span className="user-name">
            Kevin <small>XC Strategist</small>
          </span>
        </div>
      </header>
      <div className="app-shell">
        <aside className="sidebar">
          <div>
            <span className="eyebrow">THE WORKSPACE</span>
            <h2>
              Insight
              <br />
              Discovery<span className="accent">.</span>
            </h2>
            <p>
              Better inputs.
              <br />
              Stronger thinking.
              <br />A clearer handoff.
            </p>
            <nav aria-label="Workflow">
              {[
                "Strategy input pack",
                "Insight discovery",
                "Execution direction",
                "Creative brief",
              ].map((label, i) => (
                <button
                  key={label}
                  aria-current={session.step === i ? "step" : undefined}
                  className={"nav-step " + (session.step === i ? "active" : "")}
                  disabled={
                    !!busy ||
                    preparing ||
                    agentBusy.length > 0 ||
                    (i === 1 && !session.sharedPack) ||
                    (i === 2 && !session.approved) ||
                    (i === 3 && !session.brief)
                  }
                  onClick={() => navigate(i)}
                >
                  <span className="step-number">
                    {session.step > i ? (
                      <Check size={14} />
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </span>
                  <span>{label}</span>
                  {session.step === i && <ChevronRight size={15} />}
                </button>
              ))}
            </nav>
          </div>
          <div className="sidebar-bottom">
            <div className="principles">
              <span>
                01 <b>AI gathers evidence.</b>
              </span>
              <span>
                02 <b>Kevin develops strategy.</b>
              </span>
              <span>
                03 <b>AI packages.</b>
              </span>
            </div>
            <details className="help">
              <summary>
                <CircleHelp size={15} /> About this prototype
              </summary>
              <p>
                {aiStatus.mode === "mock"
                  ? "AI outputs are simulated."
                  : "AI responses are generated live."}{" "}
                Writer and enterprise research connectors are not connected.
                Work is saved in this browser tab when storage is available.
              </p>
            </details>
            <div className="sidebar-footer">
              XFINITY CREATIVE <span>XC / 2026</span>
            </div>
          </div>
        </aside>
        <main id="main">
          <div className="breadcrumb">
            Workspace <ChevronRight size={12} />{" "}
            {campaignDisplayName(session.pack.campaignName) ||
              "Untitled campaign"}
            <span className="save-status">
              <span />
              {saved ? "Session saved in this tab" : "Browser session"}
            </span>
          </div>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {
                  [
                    "01 / PREPARE THE INPUTS",
                    "02 / INSIGHT DISCOVERY",
                    "03 / DEFINE THE HANDOFF",
                    "04 / REVIEW THE BRIEF",
                  ][session.step]
                }
              </div>
              <h1>{titles[session.step]}</h1>
              <p>{descriptions[session.step]}</p>
            </div>
            <span className="stage-icon">
              {session.step === 0 ? (
                <Layers3 size={28} />
              ) : (
                <Sparkles size={28} />
              )}
            </span>
          </div>
          <div className="mock-note">
            <span className="mock-label">
              {aiStatus.mode === "mock" ? "DEMO MODE" : "PROTOTYPE MODE"}
            </span>
            {aiStatus.mode === "mock"
              ? "Illustrative campaign content and simulated AI responses. No live Writer connection."
              : "Live AI-generated responses. Writer and enterprise research connectors are not yet connected."}
          </div>
          {aiStatus.error && (
            <div className="error" role="alert">
              {aiStatus.error}
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {session.step === 0 && (
            <PreparationWorkspace
              state={session.preparation}
              onChange={(change) =>
                setSession((s) => {
                  const preparation =
                    typeof change === "function"
                      ? change(s.preparation)
                      : change;
                  return {
                    ...s,
                    preparation,
                    pack: compileInputPack(preparation),
                  };
                })
              }
              onGenerate={generate}
              onBusyChange={setPreparing}
              generating={!!busy}
              hasSession={Boolean(
                session.sharedPack ||
                session.discovery.runs.some((run) => run.versions.length),
              )}
              aiMode={aiStatus.mode}
            />
          )}
          {session.step === 1 && session.sharedPack && (
            <InsightDiscoveryWorkspace
              state={session.discovery}
              pack={session.sharedPack}
              briefLine={session.finalLine}
              busy={agentBusy}
              onChange={(discovery) => update({ discovery })}
              onQuestionChange={(question, investigationType) =>
                setSession((current) => ({
                  ...current,
                  discovery: {
                    ...current.discovery,
                    question,
                    investigationType,
                  },
                }))
              }
              onRunLens={runDiscoveryLens}
              onRefreshAll={refreshDiscovery}
              onConnect={connectFindings}
              onBriefLineChange={(finalLine) =>
                update({
                  finalLine,
                  finalSource: "Human-authored in Insight Discovery",
                  approved: null,
                  brief: null,
                })
              }
              onApprove={approveHumanStrategy}
            />
          )}
          {session.step === 2 && session.approved && (
            <>
              <section className="approved-banner">
                <span className="approval-seal">
                  <Check size={15} /> Approved by Kevin
                </span>
                <span className="eyebrow">APPROVED STRATEGY RECORD</span>
                <blockquote>“{session.approved.briefLine}”</blockquote>
                <p>Source: {session.approved.source}</p>
                <p>
                  Selected sparks:{" "}
                  {session.approved.strategyInputPack.selectedSparks?.length ??
                    session.approved.strategyInputPack.sparks
                      .split("\n")
                      .filter(Boolean).length}{" "}
                  · Supporting research and campaign context saved with this
                  approval.
                </p>
                <button className="text-button" onClick={() => navigate(1)}>
                  Return to discovery <ArrowRight size={14} />
                </button>
              </section>
              <StrategyInputSummary pack={session.approved.strategyInputPack} />
              <ExecutionDirectionForm
                value={session.execution}
                onChange={(execution) => update({ execution, brief: null })}
                onGenerate={brief}
                busy={!!busy}
              />
            </>
          )}
          {session.step === 3 && session.brief && (
            <GeneratedBriefPreview
              brief={session.brief}
              onRegenerate={brief}
              onEdit={() => navigate(2)}
              onBack={() => navigate(1)}
              busy={!!busy}
            />
          )}
          <footer className="main-footer">
            <span>XC STRATEGY STUDIO</span>
            <span>Human judgment at the heart of every brief.</span>
            {session.step > 0 && (
              <button
                className="text-button"
                disabled={!!busy || preparing || agentBusy.length > 0}
                onClick={() => navigate(session.step - 1)}
              >
                <ArrowLeft size={13} /> Previous step
              </button>
            )}
          </footer>
          <div className="sr-only" role="status" aria-live="polite">
            {busy
              ? "Generating response"
              : agentBusy.length
                ? "Researching discovery lens"
                : "Ready"}
          </div>
        </main>
      </div>
    </>
  );
}
