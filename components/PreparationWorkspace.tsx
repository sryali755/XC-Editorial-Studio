import { ResearchOutput, SparkChoices } from "./PreparationOutputs";
import { AgentRequestError } from "@/lib/ai/client";
import { parseIMCBrief } from "@/lib/imc-parser";
import ParsedIMCPreview from "./ParsedIMCPreview";
import DynamicInputPack from "./DynamicInputPack";
import {
  getUpstream,
  getParsedIMC,
  sourceContext,
  extractUpstream,
  resolveRtb,
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
  currentPreparation,
  demoIMCBrief,
  preparationAgents,
  preparationService,
  researchSources,
  selectedPreparationContent,
} from "@/lib/preparation";

type Change = (value: SetStateAction<PreparationState>) => void;
function displayedGuidance(version: PreparationVersion) {
  return version.number > 1 &&
    version.guidance === "Initial preparation from IMC brief"
    ? "Prepared from current IMC brief"
    : version.guidance;
}
function PreparationCard({
  id,
  state,
  onRefine,
  onRetry,
  onRestore,
  onSave,
  onToggleSpark,
  onGuidance,
  onKeepSpark,
  onReviseSpark,
  busy,
  disabled,
  aiMode,
}: {
  id: PreparationAgentId;
  state: PreparationState;
  onRefine: (guidance: string) => void;
  onRetry: () => void;
  onRestore: (version: PreparationVersion) => void;
  onSave: (text: string) => void;
  onToggleSpark: (id: string) => void;
  onGuidance: (text: string) => void;
  onKeepSpark: (id: string) => void;
  onReviseSpark: (id: string, intent: "explore" | "improve") => void;
  busy: boolean;
  disabled: boolean;
  aiMode: "mock" | "live";
}) {
  const definition = preparationAgents.find((a) => a.id === id)!;
  const current = currentPreparation(state, id);
  const upstream = getUpstream(state);
  const rtb = resolveRtb(upstream);
  const output = state.outputs.find((o) => o.agentId === id);
  const outputStatus =
    output?.status ??
    (output?.error
      ? "failed"
      : current?.provider === "mock"
        ? "mock"
        : current
          ? "success"
          : "idle");
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
            : outputStatus === "failed"
              ? current
                ? `Failed · V${current.number} preserved`
                : "Failed"
              : outputStatus === "pending"
                ? current
                  ? `Pending · V${current.number} preserved`
                  : "Pending"
                : current
                  ? outputStatus === "mock"
                    ? `V${current.number} · Current · Mock`
                    : `V${current.number} · Current${aiMode === "live" && current.provider === "mock" ? " · Saved mock" : ""}`
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
          <p>{rtb.field.sourceValue || "Not supplied in upstream brief"}</p>
          <small>
            RTB approval: {rtb.approvalStatus.replace("_", " ")}. GTM owns the
            strategic foundation. Proposed XC framing below does not replace or
            approve it.
          </small>
          {rtb.approvalNote && <small>{rtb.approvalNote}</small>}
        </div>
      )}
      <div className="preparation-result">
        <span className="eyebrow">
          {current
            ? outputStatus === "failed"
              ? "PREVIOUS OUTPUT PRESERVED · LATEST GENERATION FAILED"
              : outputStatus === "pending"
                ? "CURRENT OUTPUT PRESERVED · GENERATION PENDING"
                : id === "reasonToBelieve"
                  ? `PROPOSED XC ADAPTATION · ${current.provider === "mock" ? "MOCK · " : ""}NOT APPROVED`
                  : current.provider === "openai" ||
                      current.provider === "writer"
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
                keptIds={state.keptSparkIds}
                onKeep={onKeepSpark}
                onRevise={onReviseSpark}
              />
            ) : id === "research" ? (
              <ResearchOutput text={current.text} data={current.data} />
            ) : (
              <p className="prepared-text">{current.text}</p>
            )}
            <small className="version-label">
              V{current.number} · {displayedGuidance(current)}
            </small>
            {id === "sparks" && (
              <p className="context-note">
                Keep protects an idea during regeneration; Improve or Replace
                changes only that idea. Selecting a Spark carries its
                explanation into the Round Table; it does not approve a claim.
              </p>
            )}
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
          {output.errorCode && (
            <small>
              {output.errorCode} ·{" "}
              {output.errorCode.startsWith("sparks_")
                ? "Generated Sparks failed validation; retry only this agent."
                : output.retryable
                  ? "Temporary failure; retry this agent."
                  : "Action is required before retrying."}
            </small>
          )}
          <button
            className="button small"
            disabled={disabled || busy}
            onClick={onRetry}
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
              disabled={
                disabled ||
                busy ||
                (id === "sparks" && state.keptSparkIds?.length === 6)
              }
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
                {id === "sparks" &&
                  v.sparks.some((spark) => spark.rationale) && (
                    <details className="spark-rationale">
                      <summary>Grounding & hypotheses for this version</summary>
                      {v.sparks.map((spark, index) => (
                        <p key={spark.id}>
                          <strong>
                            {spark.title || `Idea starter ${index + 1}`}
                          </strong>
                          <br />
                          {spark.rationale || "No rationale recorded."}
                        </p>
                      ))}
                    </details>
                  )}
                <small>Guidance: {displayedGuidance(v)}</small>
                <details>
                  <summary>IMC source for this version</summary>
                  <p>{v.sourceBrief}</p>
                </details>
                {v.inputContext && (
                  <details>
                    <summary>Input context for this version</summary>
                    <p>
                      Steering: {v.inputContext.steeringText || "None supplied"}
                    </p>
                    <pre className="pack-payload">
                      {JSON.stringify(v.inputContext.selectedContent, null, 2)}
                    </pre>
                  </details>
                )}
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
  aiMode,
}: {
  state: PreparationState;
  onChange: Change;
  onGenerate: () => void;
  onBusyChange: (busy: boolean) => void;
  generating: boolean;
  hasSession: boolean;
  aiMode: "mock" | "live";
}) {
  const [busy, setBusy] = useState<string[]>([]);
  const locks = useRef(new Set<string>());
  const [error, setError] = useState("");
  const stale =
    !!state.sourceSnapshot &&
    state.sourceSnapshot.trim() !== state.upstreamDraft.trim();
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
              retryRequest: undefined,
              status: v.provider === "mock" ? "mock" : "success",
              errorCode: undefined,
              retryable: undefined,
              currentVersionId: v.id,
              versions: [v, ...o.versions],
            }
          : o,
      ),
      selectedSparkIds:
        id === "sparks"
          ? s.selectedSparkIds.filter((id) =>
              v.sparks.some((spark) => spark.id === id),
            )
          : s.selectedSparkIds,
      keptSparkIds:
        id === "sparks"
          ? s.keptSparkIds?.filter((id) =>
              v.sparks.some((spark) => spark.id === id),
            )
          : s.keptSparkIds,
      selectionNotice:
        id === "sparks" && currentPreparation(s, "sparks")
          ? `Sparks changed from V${currentPreparation(s, "sparks")!.number} to V${v.number}. ${s.selectedSparkIds.length && !s.selectedSparkIds.some((id) => v.sparks.some((spark) => spark.id === id)) ? "Previous selections were cleared. " : "Selections for unchanged ideas are preserved. "}Review and select the current ideas.`
          : s.selectionNotice,
    }));
  }
  function agentError(
    id: PreparationAgentId,
    error: unknown,
    retryRequest?: {
      guidance: string;
      targetId?: string;
      intent: "explore" | "improve";
    },
  ) {
    onChange((s) => ({
      ...s,
      outputs: s.outputs.map((o) =>
        o.agentId === id
          ? {
              ...o,
              retryRequest,
              status: "failed",
              error:
                error instanceof Error
                  ? error.message
                  : "This agent failed. Please retry.",
              errorCode:
                error instanceof AgentRequestError
                  ? error.code
                  : "generation_failed",
              retryable:
                error instanceof AgentRequestError ? error.retryable : true,
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
      const sameSource = source === state.sourceSnapshot;
      const upstream = sameSource
        ? getUpstream({ ...state, parsedIMC })
        : extractUpstream(parsedIMC);
      const selectedContent = sameSource
        ? selectedPreparationContent(state)
        : { selectedSparks: [] };
      onChange((s) => ({
        ...s,
        parsedIMC,
        upstream,
        sourceSnapshot: source,
        context: sourceContext(upstream),
        selectedSparkIds: [],
        keptSparkIds: [],
        selectionNotice: s.selectedSparkIds.length
          ? "Preparing the brief again cleared your Spark selections. Review the new ideas before continuing."
          : undefined,
        outputs: preparationAgents.map((agent) => {
          const existing = s.outputs.find((o) => o.agentId === agent.id);
          return {
            ...existing,
            agentId: agent.id,
            versions: existing?.versions ?? [],
            currentVersionId: sameSource
              ? (existing?.currentVersionId ?? "")
              : "",
            status: "pending" as const,
            error: undefined,
            errorCode: undefined,
            retryable: undefined,
          };
        }),
      }));
      // Keep the three calls independent but avoid a simultaneous traffic burst.
      for (const agent of preparationAgents) {
        begin(agent.id);
        try {
          const old = state.outputs.find((o) => o.agentId === agent.id);
          const version = await preparationService.generate({
            agentId: agent.id,
            parsedIMC,
            upstream,
            previous: old?.versions ?? [],
            currentVersion: sameSource
              ? currentPreparation(state, agent.id)
              : undefined,
            guidance: "",
            selectedContent,
          });
          commitVersion(agent.id, version);
        } catch (error) {
          agentError(agent.id, error);
        } finally {
          end(agent.id);
        }
      }
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
  async function refine(
    id: PreparationAgentId,
    guidance: string,
    targetId?: string,
    intent: "explore" | "improve" = "explore",
  ) {
    if (stale || generating || !begin(id)) return;
    onChange((s) => ({
      ...s,
      outputs: s.outputs.map((output) =>
        output.agentId === id
          ? {
              ...output,
              status: "pending",
              error: undefined,
              errorCode: undefined,
              retryable: undefined,
            }
          : output,
      ),
    }));
    try {
      const output = state.outputs.find((o) => o.agentId === id)!;
      const version = await preparationService.generate({
        agentId: id,
        parsedIMC: getParsedIMC(state),
        previous: output.versions,
        currentVersion: currentPreparation(state, id),
        guidance,
        upstream: getUpstream(state),
        selectedContent: selectedPreparationContent(state),
        ...(id === "sparks" && (targetId || state.keptSparkIds?.length)
          ? {
              sparkRevision: {
                targetId,
                keptIds: state.keptSparkIds ?? [],
                intent,
              },
            }
          : {}),
      });
      commitVersion(id, version);
    } catch (error) {
      agentError(id, error, { guidance, targetId, intent });
    } finally {
      end(id);
    }
  }
  function restore(id: PreparationAgentId, version: PreparationVersion) {
    onChange((s) => ({
      ...s,
      outputs: s.outputs.map((o) =>
        o.agentId === id
          ? {
              ...o,
              currentVersionId: version.id,
              status: version.provider === "mock" ? "mock" : "success",
              error: undefined,
              errorCode: undefined,
              retryable: undefined,
              retryRequest: undefined,
            }
          : o,
      ),
      selectedSparkIds: id === "sparks" ? [] : s.selectedSparkIds,
      keptSparkIds: id === "sparks" ? [] : s.keptSparkIds,
      selectionNotice:
        id === "sparks"
          ? `Sparks V${version.number} restored. ${s.selectedSparkIds.length ? "Previous selections were cleared. " : ""}Review and select the current ideas.`
          : s.selectionNotice,
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
      promptTemplateVersion: undefined,
      guidance: "Edited by Kevin",
      createdAt: new Date().toISOString(),
      inputContext: {
        sourceBrief: current.sourceBrief,
        selectedContent: selectedPreparationContent(state),
        steeringText: "Edited by Kevin",
      },
      sparks: ideas,
    });
  }
  return (
    <div className="preparation-workbench">
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
      <div
        className="section-title preparation-agents-heading"
        id="preparation-agents"
      >
        <div>
          <span className="eyebrow">REFINE YOUR FOUNDATION</span>
          <h2>Preparation agents</h2>
          <p>
            Refine an output here. Your working pack updates with the current
            version.
          </p>
        </div>
        <a className="text-button" href="#dynamic-input-pack">
          Review your input pack <ArrowRight size={14} />
        </a>
      </div>
      <div className="preparation-grid">
        {preparationAgents.map((a) => (
          <PreparationCard
            key={a.id}
            id={a.id}
            state={state}
            onRefine={(g) => refine(a.id, g)}
            onRetry={() => {
              const failed = state.outputs.find(
                (o) => o.agentId === a.id,
              )?.retryRequest;
              void refine(
                a.id,
                failed?.guidance ??
                  state.outputs.find((o) => o.agentId === a.id)?.guidance ??
                  "",
                failed?.targetId,
                failed?.intent,
              );
            }}
            onRestore={(v) => restore(a.id, v)}
            onSave={(text) => save(a.id, text)}
            onToggleSpark={toggleSpark}
            onKeepSpark={(id) =>
              onChange((s) => ({
                ...s,
                keptSparkIds: s.keptSparkIds?.includes(id)
                  ? s.keptSparkIds.filter((kept) => kept !== id)
                  : [...(s.keptSparkIds ?? []), id],
              }))
            }
            onReviseSpark={(id, intent) =>
              refine(
                "sparks",
                state.outputs.find((o) => o.agentId === "sparks")?.guidance ??
                  "",
                id,
                intent,
              )
            }
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
            aiMode={aiMode}
          />
        ))}
      </div>
      <DynamicInputPack
        state={state}
        onChange={onChange}
        onToggleSpark={toggleSpark}
        onGenerate={onGenerate}
        working={working}
        generating={generating}
        hasSession={hasSession}
        aiMode={aiMode}
      />
    </div>
  );
}
