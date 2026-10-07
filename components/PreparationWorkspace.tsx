import {
  ResearchOutput,
  SourceFields,
  SparkChoices,
} from "./PreparationOutputs";
import { parseIMCBrief } from "@/lib/imc-parser";
import ParsedIMCPreview from "./ParsedIMCPreview";
import UpstreamContextPanel from "./UpstreamContextPanel";
import {
  getUpstream,
  getParsedIMC,
  sourceContext,
  extractUpstream,
} from "@/lib/upstream";
import { useRef, useState, type SetStateAction } from "react";
import {
  ArrowRight,
  FileText,
  RefreshCw,
  Sparkles,
  Database,
} from "lucide-react";
import TextFileImport from "./TextFileImport";
import { Field } from "./StrategyPanels";
import type {
  PreparationAgentId,
  PreparationState,
  PreparationVersion,
} from "@/lib/types";
import {
  compileInputPack,
  currentPreparation,
  demoIMCBrief,
  preparationAgents,
  preparationReady,
  preparationService,
  researchSources,
} from "@/lib/preparation";

type Change = (value: SetStateAction<PreparationState>) => void;
function PreparationCard({
  id,
  state,
  onRefine,
  onRestore,
  onSave,
  onToggleSpark,
  onGuidance,
  busy,
  disabled,
}: {
  id: PreparationAgentId;
  state: PreparationState;
  onRefine: (guidance: string) => void;
  onRestore: (version: PreparationVersion) => void;
  onSave: (text: string) => void;
  onToggleSpark: (id: string) => void;
  onGuidance: (text: string) => void;
  busy: boolean;
  disabled: boolean;
}) {
  const definition = preparationAgents.find((a) => a.id === id)!;
  const current = currentPreparation(state, id);
  const upstream = getUpstream(state);
  const output = state.outputs.find((o) => o.agentId === id);
  const guidance = output?.guidance ?? "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  return (
    <article
      className={`preparation-card ${definition.color}`}
      aria-label={definition.name}
      aria-busy={busy}
    >
      <div className="card-top">
        <span className="icon-tile">{definition.symbol}</span>
        <span className="tag">
          {busy
            ? current
              ? "Regenerating…"
              : "Generating…"
            : current
              ? `V${current.number} · Current`
              : "Awaiting brief"}
        </span>
      </div>
      <h2>{definition.name}</h2>
      <div className="agent-process">
        <span>INPUT</span>
        <p>Same IMC output brief</p>
        <span>HOW THIS AGENT THINKS</span>
        <p>{definition.thinking}</p>
        <span>OUTPUT</span>
        <p>{definition.output}</p>
      </div>
      {id === "research" && (
        <details className="source-details" open>
          <summary>
            <Database size={13} /> Proposed research sources
          </summary>
          <div className="source-list">
            {researchSources.map((source) => (
              <div key={source.name}>
                <span>
                  <b>{source.name}</b>
                  <span className="source-purpose">{source.purpose}</span>
                </span>
                <small>Not connected</small>
              </div>
            ))}
          </div>
          <p>Potential sources only. No live data has been retrieved.</p>
        </details>
      )}
      {id === "reasonToBelieve" && current && (
        <div className="original-rtb-card">
          <span className="eyebrow">ORIGINAL UPSTREAM RTB · PRESERVED</span>
          <p>
            {upstream.fields.originalRTB.sourceValue ||
              "Not supplied in upstream brief"}
          </p>
          <small>
            GTM owns the strategic foundation. Proposed XC framing below does
            not replace or approve it.
          </small>
        </div>
      )}
      <div className="preparation-result">
        <span className="eyebrow">
          {current
            ? id === "reasonToBelieve"
              ? "PROPOSED XC ADAPTATION · NOT APPROVED"
              : current.provider === "openai"
                ? "PREPARED OUTPUT · AI PROPOSAL"
                : current.provider === "manual"
                  ? "PREPARED OUTPUT · EDITED"
                  : "PREPARED OUTPUT · MOCK"
            : "OUTPUT WILL APPEAR HERE"}
        </span>
        {current ? (
          <>
            {id === "sparks" ? (
              <SparkChoices
                version={current}
                selectedIds={state.selectedSparkIds}
                disabled={disabled || busy}
                onToggle={onToggleSpark}
              />
            ) : id === "research" ? (
              <ResearchOutput text={current.text} data={current.data} />
            ) : (
              <p className="prepared-text">{current.text}</p>
            )}
            <small className="version-label">
              V{current.number} · {current.guidance}
            </small>
          </>
        ) : (
          <p className="muted">
            Add an IMC brief above and prepare the inputs to see this agent’s
            response.
          </p>
        )}
      </div>
      {output?.error && (
        <div className="error agent-error" role="alert">
          <p>{output.error}</p>
          <button
            className="button small"
            disabled={disabled || busy}
            onClick={() => onRefine(guidance)}
          >
            Retry this agent
          </button>
        </div>
      )}
      {current && (
        <>
          <div className="prep-edit">
            <button
              className="text-button"
              disabled={disabled || busy}
              onClick={() => {
                setDraft(current.text);
                setEditing(!editing);
              }}
            >
              {editing ? "Cancel editing" : "Edit output"}
            </button>
            {editing && (
              <>
                <Field
                  label={`Edit ${definition.name} output`}
                  value={draft}
                  onChange={setDraft}
                  rows={6}
                  helper={
                    id === "sparks"
                      ? "One idea starter per line. Saving creates a new version; select its sparks again."
                      : "Saving creates a new version and updates the input pack."
                  }
                />
                <button
                  className="button"
                  disabled={disabled || busy || !draft.trim()}
                  onClick={() => {
                    onSave(draft);
                    setEditing(false);
                  }}
                >
                  Save as new version
                </button>
              </>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onRefine(guidance);
            }}
          >
            <Field
              label={`Guide ${definition.name}`}
              disabled={disabled || busy}
              value={guidance}
              onChange={onGuidance}
              rows={2}
              helper="Add context or steer this agent independently."
              placeholder="Add context or steer this agent independently."
            />
            <button
              className="button refine-button"
              disabled={disabled || busy}
            >
              <RefreshCw size={13} />
              {busy ? "Preparing a new version…" : "Regenerate this agent"}
            </button>
          </form>
          <details className="prep-history">
            <summary>
              Version History <span>{output?.versions.length} versions</span>
            </summary>
            {output?.versions.map((v) => (
              <div className="history-version" key={v.id}>
                <span className="version-label">
                  V{v.number}
                  {current.id === v.id ? " · Current" : ""}
                </span>
                <p>{v.text}</p>
                <small>Guidance: {v.guidance}</small>
                <details>
                  <summary>IMC source for this version</summary>
                  <p>{v.sourceBrief}</p>
                </details>
                <button
                  className="button small"
                  disabled={disabled || busy || current.id === v.id}
                  onClick={() => {
                    onRestore(v);
                    setEditing(false);
                  }}
                >
                  Make V{v.number} current
                </button>
              </div>
            ))}
          </details>
        </>
      )}
    </article>
  );
}
export default function PreparationWorkspace({
  state,
  onChange,
  onGenerate,
  onBusyChange,
  generating,
  hasSession,
}: {
  state: PreparationState;
  onChange: Change;
  onGenerate: () => void;
  onBusyChange: (busy: boolean) => void;
  generating: boolean;
  hasSession: boolean;
}) {
  const [busy, setBusy] = useState<string[]>([]);
  const locks = useRef(new Set<string>());
  const [error, setError] = useState("");
  const stale =
    !!state.sourceSnapshot &&
    state.sourceSnapshot.trim() !== state.upstreamDraft.trim();
  const pack = compileInputPack(state);
  const sparkVersion = currentPreparation(state, "sparks");
  const upstream = getUpstream(state);
  const working = busy.length > 0 || generating;
  function toggleSpark(id: string) {
    onChange((s) => ({
      ...s,
      selectedSparkIds: s.selectedSparkIds.includes(id)
        ? s.selectedSparkIds.filter((selected) => selected !== id)
        : [...s.selectedSparkIds, id],
    }));
  }
  function begin(key: string) {
    if (locks.current.has(key)) return false;
    locks.current.add(key);
    setBusy([...locks.current]);
    onBusyChange(true);
    setError("");
    return true;
  }
  function end(key: string) {
    locks.current.delete(key);
    setBusy([...locks.current]);
    onBusyChange(locks.current.size > 0);
  }
  function commitVersion(id: PreparationAgentId, v: PreparationVersion) {
    onChange((s) => ({
      ...s,
      outputs: s.outputs.map((o) =>
        o.agentId === id
          ? {
              ...o,
              error: undefined,
              currentVersionId: v.id,
              versions: [v, ...o.versions],
            }
          : o,
      ),
      selectedSparkIds: id === "sparks" ? [] : s.selectedSparkIds,
    }));
  }
  function agentError(id: PreparationAgentId, error: unknown) {
    onChange((s) => ({
      ...s,
      outputs: s.outputs.map((o) =>
        o.agentId === id
          ? {
              ...o,
              error:
                error instanceof Error
                  ? error.message
                  : "This agent failed. Please retry.",
            }
          : o,
      ),
    }));
  }
  async function prepare() {
    if (working || !state.upstreamDraft.trim() || !begin("initial")) return;
    const source = state.upstreamDraft;
    try {
      const parsedIMC = parseIMCBrief(source);
      const upstream =
        source === state.sourceSnapshot
          ? getUpstream({ ...state, parsedIMC })
          : extractUpstream(parsedIMC);
      onChange((s) => ({
        ...s,
        parsedIMC,
        upstream,
        sourceSnapshot: source,
        context: sourceContext(upstream),
        selectedSparkIds: [],
        outputs: preparationAgents.map((agent) => ({
          agentId: agent.id,
          versions: [],
          currentVersionId: "",
          ...s.outputs.find((o) => o.agentId === agent.id),
          error: undefined,
        })),
      }));
      await Promise.allSettled(
        preparationAgents.map(async (agent) => {
          begin(agent.id);
          try {
            const old = state.outputs.find((o) => o.agentId === agent.id);
            const version = await preparationService.generate({
              agentId: agent.id,
              parsedIMC,
              upstream,
              previous: old?.versions ?? [],
              currentVersion: currentPreparation(state, agent.id),
              guidance: "",
            });
            commitVersion(agent.id, version);
          } catch (error) {
            agentError(agent.id, error);
          } finally {
            end(agent.id);
          }
        }),
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The IMC brief could not be parsed. Please retry.",
      );
    } finally {
      end("initial");
    }
  }
  async function refine(id: PreparationAgentId, guidance: string) {
    if (stale || generating || !begin(id)) return;
    try {
      const output = state.outputs.find((o) => o.agentId === id)!;
      const version = await preparationService.generate({
        agentId: id,
        parsedIMC: getParsedIMC(state),
        previous: output.versions,
        currentVersion: currentPreparation(state, id),
        guidance,
        upstream: getUpstream(state),
      });
      commitVersion(id, version);
    } catch (error) {
      agentError(id, error);
    } finally {
      end(id);
    }
  }
  function restore(id: PreparationAgentId, version: PreparationVersion) {
    onChange((s) => ({
      ...s,
      outputs: s.outputs.map((o) =>
        o.agentId === id ? { ...o, currentVersionId: version.id } : o,
      ),
      selectedSparkIds: id === "sparks" ? [] : s.selectedSparkIds,
    }));
  }
  function save(id: PreparationAgentId, text: string) {
    const old = state.outputs.find((o) => o.agentId === id)!;
    const current = currentPreparation(state, id)!;
    const ideas =
      id === "sparks"
        ? text
            .split("\n")
            .map((t) => t.trim().replace(/^\d+[.)]\s*/, ""))
            .filter(Boolean)
            .map((text) => ({ id: crypto.randomUUID(), text }))
        : [];
    commitVersion(id, {
      ...current,
      id: crypto.randomUUID(),
      number: Math.max(...old.versions.map((v) => v.number)) + 1,
      text,
      data: undefined,
      provider: "manual",
      model: undefined,
      generatedAt: undefined,
      guidance: "Edited by Kevin",
      createdAt: new Date().toISOString(),
      sparks: ideas,
    });
  }
  const mismatched = state.outputs.some((o) => {
    const current = o.versions.find((v) => v.id === o.currentVersionId);
    return current && current.sourceBrief !== state.sourceSnapshot;
  });
  return (
    <>
      <section className="panel upstream-panel">
        <div className="section-title">
          <div>
            <span className="eyebrow">START HERE · GTM + BRAND → IMC → XC</span>
            <h2>IMC Output Brief</h2>
            <p>
              One upstream brief supplies the same starting context to all three
              preparation agents.
            </p>
          </div>
          <FileText size={26} />
        </div>
        <label className="field">
          <span>IMC output brief</span>
          <small>
            Paste the upstream brief or import a text file. PDF / PowerPoint
            extraction is not connected in this prototype.
          </small>
          <textarea
            rows={6}
            value={state.upstreamDraft}
            disabled={working}
            placeholder="Paste the IMC brief here. Labeled fields such as Campaign:, Objective:, Audience:, Product:, Channels:, Reason to believe: and Research: populate the corresponding sections."
            onChange={(e) =>
              onChange((s) => ({ ...s, upstreamDraft: e.target.value }))
            }
          />
        </label>
        <div className="upstream-actions">
          <TextFileImport
            label="IMC output brief"
            disabled={working}
            onImport={(text) =>
              onChange((s) => ({
                ...s,
                upstreamDraft: [s.upstreamDraft.trim(), text]
                  .filter(Boolean)
                  .join("\n\n"),
              }))
            }
          />
          <button
            className="button"
            disabled={working}
            onClick={() =>
              onChange((s) => ({ ...s, upstreamDraft: demoIMCBrief }))
            }
          >
            Load sample IMC brief
          </button>
          <button
            className="button primary"
            disabled={working || !state.upstreamDraft.trim()}
            onClick={prepare}
          >
            <Sparkles size={15} />
            {busy.includes("initial")
              ? "Preparing three agents…"
              : "Prepare XC Input Pack"}
          </button>
        </div>
        <p className="notice">
          Shared campaign context is extracted before any preparation agent
          runs. Original text and explicit exclusions are preserved. No external
          research is performed.
        </p>
        {stale && (
          <p role="status" className="notice">
            The IMC brief has changed. Prepare the pack again before refining
            agents or continuing. Existing versions are retained.
          </p>
        )}
      </section>
      {state.parsedIMC && (
        <ParsedIMCPreview
          parsed={state.parsedIMC}
          stale={state.parsedIMC.sourceText !== state.upstreamDraft}
        />
      )}
      <div className="preparation-flow">
        <span>IMC output brief</span>
        <ArrowRight size={15} />
        <span>Shared campaign context</span>
        <ArrowRight size={15} />
        <span>3 agents · review & refine</span>
        <ArrowRight size={15} />
        <strong>Dynamic XC Input Pack</strong>
        <ArrowRight size={15} />
        <span>Select sparks</span>
        <ArrowRight size={15} />
        <span>5 strategic perspectives</span>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="preparation-grid">
        {preparationAgents.map((a) => (
          <PreparationCard
            key={a.id}
            id={a.id}
            state={state}
            onRefine={(g) => refine(a.id, g)}
            onRestore={(v) => restore(a.id, v)}
            onSave={(text) => save(a.id, text)}
            onToggleSpark={toggleSpark}
            onGuidance={(guidance) =>
              onChange((s) => ({
                ...s,
                outputs: s.outputs.map((o) =>
                  o.agentId === a.id ? { ...o, guidance } : o,
                ),
              }))
            }
            busy={busy.includes(a.id)}
            disabled={stale || generating}
          />
        ))}
      </div>
      <section
        className="panel dynamic-pack"
        aria-label="Dynamic XC Input Pack"
      >
        <div className="section-title">
          <div>
            <span className="eyebrow">YOUR WORKING FOUNDATION</span>
            <h2>Dynamic XC Input Pack</h2>
            <p>
              This is the current working context that will travel with the
              strategic perspectives. It updates as the preparation agents are
              refined.
            </p>
          </div>
          <span className="tag">
            {state.outputs.length
              ? "Updates as you refine"
              : "Awaiting preparation"}
          </span>
        </div>
        {!state.outputs.length ? (
          <div className="empty">
            <FileText size={20} />
            <p>
              Your input pack starts here.
              <small>
                Prepare the IMC brief above, then review the results and choose
                your idea starters.
              </small>
            </p>
          </div>
        ) : (
          <>
            <section
              className="foundation-section campaign-foundation"
              aria-label="Campaign Context"
            >
              <div className="pack-section-title">
                <h3>A. Campaign Context</h3>
                <span className="tag">Extracted from IMC</span>
              </div>
              <SourceFields
                upstream={upstream}
                keys={[
                  "campaignName",
                  "objective",
                  "audience",
                  "product",
                  "channel",
                  "constraints",
                  "briefType",
                  "campaignTier",
                  "kpis",
                ]}
              />
            </section>
            <div className="pack-evidence">
              <section aria-label="Upstream RTB">
                <h3>B. Upstream RTB</h3>
                <p className="eyebrow">ORIGINAL RTB · PRESERVED</p>
                <p>
                  {upstream.fields.originalRTB.sourceValue ||
                    "Not supplied in upstream brief"}
                </p>
                <span className="tag">
                  {upstream.fields.originalRTB.status}
                </span>
                <p className="context-note">
                  Review note:{" "}
                  {upstream.fields.originalRTB.note ||
                    "No review note supplied."}
                </p>
              </section>
              <section aria-label="Current XC RTB proposal">
                <div className="pack-section-title">
                  <h3>C. Current XC RTB Proposal</h3>
                  <span className="tag">
                    V{currentPreparation(state, "reasonToBelieve")?.number} ·
                    Not approved
                  </span>
                </div>
                <p>{pack.proposedRTB}</p>
              </section>
            </div>
            <section
              className="foundation-section"
              aria-label="Supporting Data & Research"
            >
              <div className="pack-section-title">
                <h3>D. Supporting Data & Research</h3>
                <span className="tag">
                  V{currentPreparation(state, "research")?.number} · Current
                </span>
              </div>
              <ResearchOutput
                text={pack.research}
                data={currentPreparation(state, "research")?.data}
              />
            </section>
            <section
              className="pack-sparks foundation-section"
              aria-label="Strategic Sparks"
            >
              <h3>E. Strategic Sparks</h3>
              <p className="context-note">
                Select the strategic sparks to carry forward. Only selected idea
                starters reach the five perspectives; these are possibilities,
                not facts.
              </p>
              {sparkVersion && (
                <SparkChoices
                  version={sparkVersion}
                  selectedIds={state.selectedSparkIds}
                  disabled={busy.includes("sparks") || generating || stale}
                  onToggle={toggleSpark}
                />
              )}
              <p className="context-note">
                Regenerating, editing or restoring sparks clears their selection
                so you can review the new current version.
              </p>
            </section>
            <section
              className="foundation-section"
              aria-label="Brand, Planning & Execution Requirements"
            >
              <h3>F. Brand / Planning / Execution Requirements</h3>
              <SourceFields
                upstream={upstream}
                keys={[
                  "brandMessaging",
                  "messagingApproval",
                  "messageHierarchy",
                  "brandGuidelines",
                  "eligibility",
                  "exclusions",
                  "substantiation",
                  "disclaimers",
                  "partnerApproval",
                ]}
              />
            </section>
            <details className="review-upstream">
              <summary>Review upstream details & add clarification</summary>
              <UpstreamContextPanel
                value={upstream}
                disabled={working || stale}
                onChange={(key, field) =>
                  onChange((s) => ({
                    ...s,
                    upstream: {
                      fields: { ...getUpstream(s).fields, [key]: field },
                    },
                  }))
                }
              />
            </details>
            <label className="field">
              <span>Research emphasis / additional direction</span>
              <small>
                Tell every round-table agent what to pay attention to, such as a
                particular social insight.
              </small>
              <textarea
                rows={2}
                disabled={generating || stale}
                value={state.focus}
                onChange={(e) =>
                  onChange((s) => ({ ...s, focus: e.target.value }))
                }
                placeholder="Tell every round-table agent what to pay attention to, such as a particular social insight."
              />
            </label>
            {mismatched && (
              <p role="alert" className="notice">
                A restored output uses an earlier IMC brief. Regenerate that
                agent against the current brief before continuing.
              </p>
            )}
            <div className="input-bottom">
              <p>
                {state.selectedSparkIds.length
                  ? `${state.selectedSparkIds.length} selected idea starter(s) will travel with RTB, research and campaign context.`
                  : "Select at least one idea starter to continue."}
              </p>
              <button
                className="button primary"
                disabled={working || !preparationReady(state) || mismatched}
                onClick={onGenerate}
              >
                {generating
                  ? "Preparing perspectives…"
                  : "Generate Strategic Perspectives"}
                <ArrowRight size={15} />
              </button>
            </div>
            {hasSession && (
              <p className="notice">
                Your existing round table keeps its original context. Generating
                perspectives again starts a fresh round table with this pack.
              </p>
            )}
          </>
        )}
      </section>
    </>
  );
}
