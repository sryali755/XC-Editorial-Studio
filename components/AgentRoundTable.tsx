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
import {
  defaultPersonality,
  type PersonalitySettings,
} from "@/lib/creative-controls";
import { CreativeControls } from "./CreativeControls";
import PackDialog from "./PackDialog";
import type {
  AgentOutput,
  AgentPersona,
  AgentVersion,
  SelectedBriefLine,
} from "@/lib/types";
export function BriefLineOutput({ text }: { text: string }) {
  return <blockquote>“{text}”</blockquote>;
}

type DirectionOption = {
  tension: string;
  territory: string;
  why_on_strategy: string;
  evidence: string[];
};

function directionOption(data: unknown): DirectionOption | undefined {
  if (!data || typeof data !== "object" || !("options" in data)) return;
  const options = (data as { options?: unknown }).options;
  if (!Array.isArray(options) || !options[0] || typeof options[0] !== "object")
    return;
  const option = options[0] as Partial<DirectionOption>;
  if (
    typeof option.tension !== "string" ||
    typeof option.territory !== "string" ||
    typeof option.why_on_strategy !== "string" ||
    !Array.isArray(option.evidence)
  )
    return;
  return option as DirectionOption;
}

function legacyRationale(data: unknown) {
  if (!data || typeof data !== "object" || !("briefLines" in data)) return "";
  const lines = (data as { briefLines?: unknown }).briefLines;
  if (!Array.isArray(lines) || !lines[0] || typeof lines[0] !== "object")
    return "";
  const rationale = (lines[0] as { rationale?: unknown }).rationale;
  return typeof rationale === "string" ? rationale : "";
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
  onConfigure,
}: {
  persona: AgentPersona;
  output: AgentOutput;
  selected: SelectedBriefLine[];
  onSelect: (s: SelectedBriefLine) => void;
  onRefine: (guidance: string) => Promise<void>;
  onRestore: (id: string) => void;
  busy: boolean;
  onConfigure: (patch: {
    personality?: PersonalitySettings;
    steeringText?: string;
    refinementMode?: "explore" | "improve";
  }) => void;
}) {
  const guidance = output.steeringText ?? "";
  const current = output.versions.find((v) => v.id === output.currentVersionId);
  const detail = directionOption(current?.data);
  const oldRationale = legacyRationale(current?.data);
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
      <details className="thinking">
        <summary>How this agent thinks</summary>
        <p>{persona.thinking}</p>
      </details>
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
          {(detail || oldRationale) && (
            <details className="candidate-rationale">
              <summary>Why this direction</summary>
              {detail ? (
                <>
                  <p>
                    <strong>Tension:</strong> {detail.tension}
                  </p>
                  <p>
                    <strong>Creative territory:</strong> {detail.territory}
                  </p>
                  <p>
                    <strong>Why it is on strategy:</strong>{" "}
                    {detail.why_on_strategy}
                  </p>
                  <p>
                    <strong>Evidence from the Input Pack:</strong>
                  </p>
                  <ul>
                    {detail.evidence.map((excerpt) => (
                      <li key={excerpt}>“{excerpt}”</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>{oldRationale}</p>
              )}
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
          {busy
            ? "Creating this perspective… You can review other agents as they finish."
            : "No candidate generated yet. Retry this perspective to continue."}
        </p>
      )}
      <form
        className="refinement"
        onSubmit={async (e) => {
          e.preventDefault();
          await onRefine(guidance);
        }}
      >
        <CreativeControls
          agentId={persona.id}
          value={output.personality ?? defaultPersonality()}
          disabled={busy}
          onChange={(personality) => onConfigure({ personality })}
        />
        <label className="field">
          <span>Next version</span>
          <select
            aria-label={`Next version for ${persona.name}`}
            disabled={busy}
            value={output.refinementMode ?? "explore"}
            onChange={(e) =>
              onConfigure({
                refinementMode: e.target.value as "explore" | "improve",
              })
            }
          >
            <option value="explore">Explore a new direction</option>
            <option value="improve" disabled={!current}>
              Improve this direction
            </option>
          </select>
        </label>
        <label className="field">
          <span>Steer This Agent (optional)</span>
          <textarea
            aria-label={`Refinement for ${persona.name}`}
            placeholder="Leave blank for a fresh angle, or add direction…"
            rows={3}
            value={guidance}
            disabled={busy}
            maxLength={8000}
            onChange={(e) => onConfigure({ steeringText: e.target.value })}
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
  onConfigure,
}: {
  outputs: AgentOutput[];
  selected: SelectedBriefLine[];
  onSelect: (s: SelectedBriefLine) => void;
  onRefine: (p: AgentPersona, g: string) => Promise<void>;
  onRestore: (agentId: string, id: string) => void;
  busy: string[];
  onConfigure: (
    agentId: string,
    patch: {
      personality?: PersonalitySettings;
      steeringText?: string;
      refinementMode?: "explore" | "improve";
    },
  ) => void;
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
              onConfigure={(patch) => onConfigure(p.id, patch)}
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
  const [comparing, setComparing] = useState(false);
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
            className="button"
            disabled={selected.length < 2}
            onClick={() => setComparing(true)}
          >
            Compare selected
          </button>
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
      {comparing && (
        <PackDialog
          title="Compare your shortlist"
          eyebrow="CHOOSE A DIRECTION"
          onClose={() => setComparing(false)}
        >
          <p className="context-note">
            Compare the human stake, the creative choice and the evidence
            needed. Choose the direction that best serves the brief.
          </p>
          <div className="shortlist-comparison">
            {selected.map((line) => (
              <article key={line.id}>
                <span className="eyebrow">
                  {line.personaName} · V{line.version}
                </span>
                <blockquote>{line.text}</blockquote>
                <button
                  className="button primary"
                  onClick={() => {
                    onUse(line);
                    setComparing(false);
                  }}
                >
                  Use this direction
                </button>
              </article>
            ))}
          </div>
        </PackDialog>
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
