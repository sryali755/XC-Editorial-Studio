import { useRef, useState } from "react";
import {
  Check,
  Copy,
  Plus,
  RotateCcw,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  X,
} from "lucide-react";
import { personas } from "@/lib/demo";
import type {
  AgentOutput,
  AgentPersona,
  AgentVersion,
  SelectedBriefLine,
} from "@/lib/types";
export function BriefLineOutput({ text }: { text: string }) {
  return <blockquote>“{text}”</blockquote>;
}
function VersionActions({
  version,
  persona,
  selected,
  onSelect,
  onRestore,
}: {
  version: AgentVersion;
  persona: AgentPersona;
  selected: SelectedBriefLine[];
  onSelect: (line: SelectedBriefLine) => void;
  onRestore?: () => void;
}) {
  const [copyState, setCopyState] = useState("Copy");
  const isSelected = selected.some((s) => s.id === version.id);
  async function copy() {
    try {
      await navigator.clipboard.writeText(version.text);
      setCopyState("Copied");
    } catch {
      setCopyState("Copy unavailable");
    }
    setTimeout(() => setCopyState("Copy"), 2000);
  }
  return (
    <div className="version-actions">
      <button
        className={"button small " + (isSelected ? "is-selected" : "")}
        onClick={() =>
          onSelect({
            id: version.id,
            agentId: persona.id,
            personaName: persona.name,
            version: version.number,
            text: version.text,
          })
        }
      >
        {isSelected ? <Check size={14} /> : <Plus size={14} />}{" "}
        {isSelected ? "Selected" : "Select this version"}
      </button>
      <button
        className="icon-button"
        onClick={copy}
        aria-label={`${copyState} ${persona.name} V${version.number}`}
        title={copyState}
      >
        <Copy size={15} />
        <span className="sr-only">{copyState}</span>
      </button>
      {onRestore && (
        <button
          className="icon-button"
          onClick={onRestore}
          title="Restore / make current"
          aria-label={`Restore V${version.number}`}
        >
          <RotateCcw size={15} />
        </button>
      )}
    </div>
  );
}
export function VersionHistory({
  output,
  persona,
  selected,
  onSelect,
  onRestore,
}: {
  output: AgentOutput;
  persona: AgentPersona;
  selected: SelectedBriefLine[];
  onSelect: (s: SelectedBriefLine) => void;
  onRestore: (id: string) => void;
}) {
  return (
    <details className="history">
      <summary>
        Version History <span>{output.versions.length} versions</span>
      </summary>
      <div>
        {output.versions.map((v) => (
          <div className="history-version" key={v.id}>
            <span className="version-label">
              V{v.number}
              {v.id === output.currentVersionId ? " · Current" : ""}
            </span>
            <p>{v.text}</p>
            <small>Guidance: {v.guidance}</small>
            <VersionActions
              version={v}
              persona={persona}
              selected={selected}
              onSelect={onSelect}
              onRestore={
                v.id !== output.currentVersionId
                  ? () => onRestore(v.id)
                  : undefined
              }
            />
          </div>
        ))}
      </div>
    </details>
  );
}
export function AgentCard({
  persona,
  output,
  selected,
  onSelect,
  onRefine,
  onRestore,
  busy,
}: {
  persona: AgentPersona;
  output: AgentOutput;
  selected: SelectedBriefLine[];
  onSelect: (s: SelectedBriefLine) => void;
  onRefine: (guidance: string) => Promise<void>;
  onRestore: (id: string) => void;
  busy: boolean;
}) {
  const [guidance, setGuidance] = useState("");
  const current = output.versions.find((v) => v.id === output.currentVersionId);
  return (
    <article
      className={"agent-card " + persona.color}
      aria-label={persona.name}
      aria-busy={busy}
    >
      <div className="agent-heading">
        <span className="persona-symbol">{persona.icon}</span>
        <span className="status-dot" />{" "}
        <span className="muted">
          Perspective {personas.indexOf(persona) + 1}
        </span>
      </div>
      <h2>{persona.name}</h2>
      <p className="agent-role">{persona.role}</p>
      <div className="thinking">
        <h3>How this agent thinks</h3>
        <p>{persona.thinking}</p>
      </div>
      {output.error && (
        <div className="error agent-error" role="alert">
          {output.error}
        </div>
      )}
      {current ? (
        <div className="current-output">
          <div className="output-meta">
            <span>BRIEF-LINE CANDIDATE</span>
            <span className="version-label">V{current.number} · Current</span>
          </div>
          <BriefLineOutput text={current.text} />
          {current.data && "briefLines" in current.data && (
            <details className="candidate-rationale">
              <summary>Why this direction</summary>
              <p>{current.data.briefLines[0].rationale}</p>
            </details>
          )}
          <VersionActions
            version={current}
            persona={persona}
            selected={selected}
            onSelect={onSelect}
          />
        </div>
      ) : (
        <p className="muted">
          No candidate generated yet. Retry this perspective to continue.
        </p>
      )}
      <form
        className="refinement"
        onSubmit={async (e) => {
          e.preventDefault();
          await onRefine(guidance);
        }}
      >
        <label className="field">
          <span>Guide this perspective (optional)</span>
          <textarea
            aria-label={`Refinement for ${persona.name}`}
            placeholder="Leave blank for a fresh angle, or add direction…"
            rows={3}
            value={guidance}
            disabled={busy}
            onChange={(e) => setGuidance(e.target.value)}
          />
        </label>
        <button type="submit" className="button refine-button" disabled={busy}>
          <Sparkles size={15} />
          {busy
            ? "Exploring a new direction…"
            : output.error
              ? "Retry this perspective"
              : "Generate another version"}
        </button>
      </form>
      <VersionHistory
        output={output}
        persona={persona}
        selected={selected}
        onSelect={onSelect}
        onRestore={onRestore}
      />
    </article>
  );
}
export function AgentRoundTable({
  outputs,
  selected,
  onSelect,
  onRefine,
  onRestore,
  busy,
}: {
  outputs: AgentOutput[];
  selected: SelectedBriefLine[];
  onSelect: (s: SelectedBriefLine) => void;
  onRefine: (p: AgentPersona, g: string) => Promise<void>;
  onRestore: (agentId: string, id: string) => void;
  busy: string[];
}) {
  const workspace = useRef<HTMLDivElement>(null);
  function move(direction: number) {
    const el = workspace.current;
    if (!el) return;
    const cardWidth =
      el.firstElementChild?.getBoundingClientRect().width ?? 250;
    el.scrollBy({ left: direction * (cardWidth + 15), behavior: "smooth" });
  }
  return (
    <>
      <div className="workspace-controls">
        <p>
          Explore all five perspectives. Your selections stay in the shortlist
          below.
        </p>
        <div>
          <button
            className="button small"
            onClick={() => move(-1)}
            aria-label="Show previous agents"
            aria-controls="agent-workspace"
          >
            <ArrowLeft size={15} />
          </button>
          <button
            className="button small"
            onClick={() => move(1)}
            aria-label="Show next agents"
            aria-controls="agent-workspace"
          >
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
      <div
        className="agent-workspace"
        id="agent-workspace"
        ref={workspace}
        tabIndex={0}
        role="region"
        aria-label="Five strategic perspectives"
      >
        {personas.map((p) => {
          const output = outputs.find((o) => o.agentId === p.id);
          return output ? (
            <AgentCard
              key={p.id}
              persona={p}
              output={output}
              selected={selected}
              onSelect={onSelect}
              onRefine={(g) => onRefine(p, g)}
              onRestore={(id) => onRestore(p.id, id)}
              busy={busy.includes(p.id)}
            />
          ) : null;
        })}
      </div>
    </>
  );
}
export function SelectedLinesTray({
  selected,
  onRemove,
  onClear,
  onCombine,
  onUse,
}: {
  selected: SelectedBriefLine[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onCombine: () => void;
  onUse: (line: SelectedBriefLine) => void;
}) {
  return (
    <section className="panel selection-tray">
      <div className="section-title">
        <div>
          <span className="eyebrow">YOUR SHORTLIST</span>
          <h2>
            Selected Brief Lines{" "}
            <span className="count">{selected.length}</span>
          </h2>
        </div>
        <div className="actions">
          <button
            className="text-button"
            disabled={!selected.length}
            onClick={onClear}
          >
            Clear all
          </button>
          <button
            className="button"
            disabled={selected.length < 2}
            onClick={onCombine}
          >
            <Sparkles size={16} />
            Combine selected
          </button>
        </div>
      </div>
      {selected.length ? (
        <div className="selected-grid">
          {selected.map((s) => (
            <div className="selected-line" key={s.id}>
              <div>
                <span className="version-label">
                  {s.personaName} · V{s.version}
                </span>
                <button
                  className="icon-button"
                  aria-label={`Remove ${s.personaName} V${s.version}`}
                  onClick={() => onRemove(s.id)}
                >
                  <X size={15} />
                </button>
              </div>
              <p>“{s.text}”</p>
              <button className="text-button" onClick={() => onUse(s)}>
                Use as final line <ArrowRight size={13} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">
          <Plus size={20} />
          <p>
            Good thinking starts with a shortlist.
            <small>
              Select a candidate from any perspective or earlier version.
            </small>
          </p>
        </div>
      )}
    </section>
  );
}
export function PerspectiveWeighting({
  selected,
  onGenerate,
  busy,
}: {
  selected: SelectedBriefLine[];
  onGenerate: (weights: Record<string, number>) => void;
  busy: boolean;
}) {
  const [weights, setWeights] = useState<Record<string, number>>({});
  return (
    <section className="panel synthesis">
      <span className="eyebrow">OPTIONAL SYNTHESIS</span>
      <h2>Perspective Weighting</h2>
      <p className="muted">
        Set the intended creative emphasis. Percentages are directional and
        don’t need to total 100%.
      </p>
      {selected.map((s) => (
        <label className="weight" key={s.id}>
          <span>
            {s.personaName} · V{s.version}
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={weights[s.id] ?? 50}
            onChange={(e) =>
              setWeights({ ...weights, [s.id]: Number(e.target.value) })
            }
          />
          <strong>{weights[s.id] ?? 50}%</strong>
        </label>
      ))}
      <button
        className="button primary"
        disabled={busy || selected.length < 2}
        onClick={() => onGenerate(weights)}
      >
        {busy ? "Combining perspectives…" : "Generate Combined Brief Line"}
        <Sparkles size={16} />
      </button>
    </section>
  );
}
export function ApprovalGate({
  value,
  onChange,
  onApprove,
  source,
}: {
  value: string;
  onChange: (v: string) => void;
  onApprove: () => void;
  source: string;
}) {
  return (
    <section className="approval-gate">
      <div>
        <span className="eyebrow">THE HUMAN STRATEGY GATE</span>
        <h2>
          AI brings perspectives.
          <br />
          You choose the direction.
        </h2>
        <p>
          Select a candidate, blend ideas, or write your own.
          <br />
          Only your explicit approval moves this forward. This approves the
          brief line; upstream claims, Brand messaging and partner approvals
          retain their recorded status.
        </p>
        <span className="approval-seal">
          <Check size={15} /> Kevin decides
        </span>
      </div>
      <div>
        <label className="field">
          <span>FINAL BRIEF LINE</span>
          <textarea
            rows={3}
            aria-label="FINAL BRIEF LINE"
            placeholder="Choose a candidate or write your final brief line…"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
        <div className="approval-bottom">
          <small>{source || "Your strategic judgment, your final word."}</small>
          <button
            className="button primary"
            disabled={!value.trim()}
            onClick={onApprove}
          >
            Approve & Continue <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
