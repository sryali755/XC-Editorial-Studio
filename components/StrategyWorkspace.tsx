"use client";
import Link from "next/link";
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
import { demoExecution } from "@/lib/demo";
import { generateXCBrief, strategyService } from "@/lib/services";
import type {
  AgentPersona,
  SelectedBriefLine,
  StrategySession,
} from "@/lib/types";
import {
  ExecutionDirectionForm,
  GeneratedBriefPreview,
  StrategyInputSummary,
} from "./StrategyPanels";
import {
  AgentRoundTable,
  ApprovalGate,
  PerspectiveWeighting,
  SelectedLinesTray,
} from "./AgentRoundTable";
import PreparationWorkspace from "./PreparationWorkspace";
import {
  compileInputPack,
  emptyPreparation,
  preparationReady,
} from "@/lib/preparation";
const initial: StrategySession = {
  step: 0,
  pack: compileInputPack(emptyPreparation),
  preparation: emptyPreparation,
  sharedPack: null,
  outputs: [],
  selected: [],
  synthesis: [],
  finalLine: "",
  finalSource: "",
  approved: null,
  execution: demoExecution,
  brief: null,
};
const storageKey = "xc-strategy-session-v1";
export default function StrategyWorkspace() {
  const [session, setSession] = useState<StrategySession>(initial);
  const [preparing, setPreparing] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState("");
  const [agentBusy, setAgentBusy] = useState<string[]>([]);
  const locks = useRef(new Set<string>());
  const [error, setError] = useState("");
  const [blending, setBlending] = useState(false);
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
          // Hydrate the browser-only demonstration session after the server render.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setSession({
            ...initial,
            ...parsed,
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
    if (preparing || !preparationReady(session.preparation)) return;
    await run("perspectives", async () => {
      const sharedPack = structuredClone(session.pack);
      const outputs = await strategyService.generatePerspectives(sharedPack);
      update({
        sharedPack,
        outputs,
        selected: [],
        synthesis: [],
        finalLine: "",
        finalSource: "",
        approved: null,
        brief: null,
        step: 1,
      });
      setBlending(false);
      window.scrollTo({ top: 0 });
    });
  }
  async function refine(persona: AgentPersona, guidance: string) {
    if (locks.current.has(persona.id) || !session.sharedPack) return;
    locks.current.add(persona.id);
    setAgentBusy((b) => [...b, persona.id]);
    setError("");
    try {
      const output = session.outputs.find((o) => o.agentId === persona.id)!;
      const version = await strategyService.refine(
        persona,
        session.sharedPack,
        output.versions,
        guidance,
      );
      setSession((s) => ({
        ...s,
        outputs: s.outputs.map((o) =>
          o.agentId === persona.id
            ? {
                ...o,
                versions: [version, ...o.versions],
                currentVersionId: version.id,
              }
            : o,
        ),
      }));
    } catch {
      setError(
        "This perspective could not be refined. Your previous versions are preserved. Please retry.",
      );
    } finally {
      locks.current.delete(persona.id);
      setAgentBusy((b) => b.filter((id) => id !== persona.id));
    }
  }
  function select(line: SelectedBriefLine) {
    setSession((s) => ({
      ...s,
      selected: s.selected.some((l) => l.id === line.id)
        ? s.selected.filter((l) => l.id !== line.id)
        : [...s.selected, line],
    }));
  }
  function chooseFinal(text: string, source: string) {
    update({
      finalLine: text,
      finalSource: source,
      approved: null,
      brief: null,
    });
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
    "A stronger starting point.",
    "Five perspectives. One shared ambition.",
    "From direction to deliverables.",
    "A clearer handoff to Creative.",
  ];
  const descriptions = [
    "Start with the IMC brief. Three preparation agents help you shape a focused input pack for the five strategic perspectives.",
    "Explore different angles, guide each perspective and choose the brief line that moves the strategy forward.",
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
              Strategy
              <br />
              Round Table<span className="accent">.</span>
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
                "Agent round table",
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
                    (i === 1 && !session.outputs.length) ||
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
                01 <b>AI prepares.</b>
              </span>
              <span>
                02 <b>Kevin decides.</b>
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
                All AI outputs and campaign evidence are simulated. Writer is
                not connected. Work is saved in this browser tab when storage is
                available.
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
            {session.pack.campaignName || "Untitled campaign"}
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
                    "02 / EXPLORE & APPROVE",
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
            <span className="mock-label">DEMO MODE</span>Illustrative campaign
            content and simulated AI responses. No live Writer connection.
          </div>
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
              hasSession={session.outputs.length > 0}
            />
          )}
          {session.step === 1 && session.sharedPack && (
            <>
              <StrategyInputSummary pack={session.sharedPack} />
              <div className="context-flow">
                <span />
                <Layers3 size={14} />
                <b>Same context.</b> Five distinct lenses.
                <span />
              </div>
              <div className="section-title roundtable-title">
                <div>
                  <h2>
                    Your thinking partners <span className="count">5</span>
                  </h2>
                  <p>
                    Brief lines, not conversations. Refine one perspective at a
                    time.
                  </p>
                </div>
                <span className="tag">Independent version histories</span>
              </div>
              <AgentRoundTable
                outputs={session.outputs}
                selected={session.selected}
                onSelect={select}
                onRefine={refine}
                busy={agentBusy}
                onRestore={(agentId, id) =>
                  setSession((s) => ({
                    ...s,
                    outputs: s.outputs.map((o) =>
                      o.agentId === agentId
                        ? { ...o, currentVersionId: id }
                        : o,
                    ),
                  }))
                }
              />
              <SelectedLinesTray
                selected={session.selected}
                onRemove={(id) =>
                  update({
                    selected: session.selected.filter((s) => s.id !== id),
                  })
                }
                onClear={() => update({ selected: [] })}
                onCombine={() => setBlending(true)}
                onUse={(s) =>
                  chooseFinal(s.text, `${s.personaName} · V${s.version}`)
                }
              />
              {blending && (
                <PerspectiveWeighting
                  selected={session.selected}
                  busy={busy === "synthesis"}
                  onGenerate={(weights) =>
                    run("synthesis", async () => {
                      const text = await strategyService.synthesize({
                        strategyInputPack: session.sharedPack!,
                        lines: session.selected,
                        weights,
                      });
                      setSession((s) => ({
                        ...s,
                        synthesis: [text, ...s.synthesis],
                      }));
                    })
                  }
                />
              )}{" "}
              {!!session.synthesis.length && (
                <section className="panel synthesis">
                  <span className="eyebrow">COMBINED CANDIDATES</span>
                  {session.synthesis.map((text, i) => (
                    <div className="combined" key={i}>
                      <div>
                        <span className="version-label">
                          Synthesis {session.synthesis.length - i}
                        </span>
                        <p>“{text}”</p>
                      </div>
                      <button
                        className="button"
                        onClick={() =>
                          chooseFinal(
                            text,
                            `Synthesis ${session.synthesis.length - i}`,
                          )
                        }
                      >
                        Use as final line
                      </button>
                    </div>
                  ))}
                </section>
              )}
              <ApprovalGate
                value={session.finalLine}
                source={session.finalSource}
                onChange={(v) => chooseFinal(v, "Manually edited by Kevin")}
                onApprove={() => {
                  if (!session.finalLine.trim()) return;
                  update({
                    approved: {
                      briefLine: session.finalLine.trim(),
                      strategyInputPack: structuredClone(session.sharedPack!),
                      approvedAt: new Date().toISOString(),
                      approvedBy: "Kevin",
                      source: session.finalSource || "Manual",
                    },
                    step: 2,
                    brief: null,
                  });
                  window.scrollTo({ top: 0 });
                }}
              />
            </>
          )}
          {session.step === 2 && session.approved && (
            <>
              <section className="approved-banner">
                <span className="approval-seal">
                  <Check size={15} /> Approved by Kevin
                </span>
                <span className="eyebrow">APPROVED BRIEF LINE</span>
                <blockquote>“{session.approved.briefLine}”</blockquote>
                <button className="text-button" onClick={() => navigate(1)}>
                  Review strategy <ArrowRight size={14} />
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
              ? "Generating mock response"
              : agentBusy.length
                ? "Refining perspective"
                : "Ready"}
          </div>
        </main>
      </div>
    </>
  );
}
