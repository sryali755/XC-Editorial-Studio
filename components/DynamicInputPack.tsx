import { useMemo, useState, type SetStateAction } from "react";
import { campaignDisplayName } from "@/lib/campaign-display";
import {
  ArrowRight,
  Check,
  Circle,
  Eye,
  FileText,
  GitCompareArrows,
  Sparkles,
  X,
} from "lucide-react";
import {
  compileInputPack,
  currentPreparation,
  preparationAgents,
  preparationReady,
} from "@/lib/preparation";
import { getParsedIMC, getUpstream } from "@/lib/upstream";
import { imcSchema } from "@/lib/imc-parser";
import {
  inputPackChanges,
  restoreInputPack,
  snapshotInputPack,
} from "@/lib/input-pack";
import type { PreparationState } from "@/lib/types";
import { ResearchOutput, SparkChoices } from "./PreparationOutputs";
import {
  CompareInputPacks,
  OriginalFields,
  SharedInputPreview,
  SparkTrace,
} from "./InputPackDetails";
import UpstreamContextPanel from "./UpstreamContextPanel";

export default function DynamicInputPack({
  state,
  onChange,
  onToggleSpark,
  onGenerate,
  working,
  generating,
  hasSession,
  aiMode,
}: {
  state: PreparationState;
  onChange: (value: SetStateAction<PreparationState>) => void;
  onToggleSpark: (id: string) => void;
  onGenerate: () => void;
  working: boolean;
  generating: boolean;
  hasSession: boolean;
  aiMode: "mock" | "live";
}) {
  const [view, setView] = useState<"preview" | "compare" | null>(null);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const pack = useMemo(() => compileInputPack(state), [state]);
  const snapshot = useMemo(() => snapshotInputPack(state), [state]);
  const parsed = getParsedIMC(state),
    upstream = getUpstream(state);
  const sparks = currentPreparation(state, "sparks");
  const research = currentPreparation(state, "research");
  const rtb = currentPreparation(state, "reasonToBelieve");
  const selected = pack.selectedSparks ?? [];
  const inspected = sparks?.sparks.find((s) => s.id === inspectedId);
  const stale = state.sourceSnapshot.trim() !== state.upstreamDraft.trim();
  const currentCount = preparationAgents.filter(({ id }) => {
    const v = currentPreparation(state, id);
    return v && v.sourceBrief === state.sourceSnapshot;
  }).length;
  const ready = preparationReady(state, aiMode) && !working;
  const disabled = working || stale;
  const changes = state.reviewedPack
    ? inputPackChanges(state.reviewedPack, snapshot)
    : [];
  const fields = imcSchema.map((def) => upstream.fields[def.upstreamKey]);
  const needsReview = fields.filter(
    (f) => f.status === "Not supplied" || f.status === "Needs clarification",
  ).length;
  const excluded = fields.filter(
    (f) => f.status === "Intentionally excluded",
  ).length;
  const status = working
    ? "Preparation in progress"
    : stale
      ? "Source changed · prepare again"
      : currentCount !== 3
        ? `${currentCount} / 3 current outputs`
        : !selected.length
          ? "Choose your Sparks"
          : "Ready for perspectives";
  function saveDirection(slot: "A" | "B") {
    if (!ready) return;
    onChange((s) => ({
      ...s,
      packCandidates: { ...s.packCandidates, [slot]: snapshotInputPack(s) },
    }));
    setMessage(
      `Direction ${slot} saved. You can change the working pack and compare both directions.`,
    );
  }
  function useDirection(slot: "A" | "B") {
    if (disabled) return;
    onChange((s) => {
      const candidate = s.packCandidates?.[slot];
      return candidate ? restoreInputPack(s, candidate) : s;
    });
    setView(null);
    setMessage(
      `Direction ${slot} loaded into the working pack. Review it before generating perspectives.`,
    );
  }
  function review() {
    if (!ready) return;
    onChange((s) => ({ ...s, reviewedPack: snapshotInputPack(s) }));
    setView(null);
    setMessage("Pack reviewed. Future changes will be highlighted here.");
  }
  const checks = [
    {
      done: !!state.sourceSnapshot && !stale,
      label: stale ? "IMC changed — prepare again" : "Current IMC source",
    },
    {
      done: currentCount === 3,
      label: `${currentCount} / 3 preparation outputs match the brief`,
    },
    {
      done: !!selected.length,
      label: selected.length
        ? `${selected.length} Spark${selected.length === 1 ? "" : "s"} selected`
        : "Select at least one Spark",
    },
  ];
  return (
    <>
      <section
        className="panel dynamic-pack pack-studio"
        id="dynamic-input-pack"
        aria-label="Dynamic XC Input Pack"
      >
        <div className="section-title pack-heading">
          <div>
            <span className="eyebrow">YOUR WORKING FOUNDATION</span>
            <h2>Dynamic XC Input Pack</h2>
            <p>
              Connect the brief, the evidence and the ideas you want to explore.
            </p>
          </div>
          <span className={"pack-readiness " + (ready ? "is-ready" : "")}>
            {ready ? <Check size={14} /> : <Circle size={14} />}
            {status}
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
            <div className="pack-canvas">
              <section
                className="pack-column pack-foundation"
                aria-label="Campaign Context"
              >
                <div className="pack-column-heading">
                  <span>01</span>
                  <h3>Campaign foundation</h3>
                </div>
                <span className="pack-label source">
                  ORIGINAL IMC · PRESERVED
                </span>
                <h4 className="pack-campaign-name">
                  {campaignDisplayName(parsed.fields.campaign.sourceValue) ||
                    "Campaign not supplied"}
                </h4>
                <OriginalFields
                  parsed={parsed}
                  keys={["objective", "audience", "product", "channels"]}
                />
                <section
                  className="pack-original-rtb"
                  aria-label="Upstream RTB"
                >
                  <OriginalFields
                    parsed={parsed}
                    keys={["reason_to_believe"]}
                  />
                </section>
                <details className="pack-fold">
                  <summary>Brand requirements & all 19 source fields</summary>
                  <OriginalFields parsed={parsed} />
                </details>
                <p className="context-note">
                  Original wording stays here. Review notes and proposed
                  adaptations travel separately.
                </p>
              </section>
              <section
                className="pack-column pack-direction"
                aria-label="Build your direction"
              >
                <div className="pack-column-heading">
                  <span>02</span>
                  <h3>Build your direction</h3>
                </div>
                <section
                  className="pack-output-summary"
                  aria-label="Current XC RTB proposal"
                >
                  <details className="pack-fold">
                    <summary>
                      <span>XC RTB proposal</span>
                      <span className="tag">
                        {rtb ? `V${rtb.number}` : "Pending"} · Not approved
                      </span>
                    </summary>
                    <p>{pack.proposedRTB || "Awaiting preparation."}</p>
                  </details>
                </section>
                <section
                  className="pack-output-summary"
                  aria-label="Supporting Data & Research"
                >
                  <details className="pack-fold">
                    <summary>
                      <span>Research & evidence</span>
                      <span className="tag">
                        {research ? `V${research.number} · Current` : "Pending"}
                      </span>
                    </summary>
                    <ResearchOutput
                      text={pack.research}
                      data={research?.data}
                    />
                  </details>
                </section>
                <div className="pack-sparks-heading">
                  <Sparkles size={17} />
                  <div>
                    <h4>Choose the ideas to carry forward</h4>
                    <p>Open a Spark to inspect its grounding and hypothesis.</p>
                  </div>
                </div>
                <section className="pack-sparks" aria-label="Strategic Sparks">
                  {sparks ? (
                    <SparkChoices
                      version={sparks}
                      selectedIds={state.selectedSparkIds}
                      disabled={disabled}
                      onToggle={onToggleSpark}
                      onInspect={setInspectedId}
                    />
                  ) : (
                    <p className="context-note">
                      Sparks will appear when preparation finishes.
                    </p>
                  )}
                  {!selected.length && state.selectionNotice && (
                    <p role="status" className="notice">
                      {state.selectionNotice}
                    </p>
                  )}
                </section>
                <label className="field pack-emphasis">
                  <span>Research emphasis / additional direction</span>
                  <small>
                    What should all five perspectives pay particular attention
                    to?
                  </small>
                  <textarea
                    rows={3}
                    disabled={disabled}
                    value={state.focus}
                    onChange={(e) =>
                      onChange((s) => ({ ...s, focus: e.target.value }))
                    }
                    placeholder="For example: explore the audience’s everyday rituals, while keeping product claims within the supplied proof."
                  />
                </label>
                <a className="text-button" href="#preparation-agents">
                  Refine the preparation agents <ArrowRight size={14} />
                </a>
              </section>
              <aside
                className="pack-column pack-decision"
                aria-label="Ready for the round table"
              >
                <div className="pack-column-heading">
                  <span>03</span>
                  <h3>Ready for the round table</h3>
                </div>
                <ul className="pack-checks">
                  {checks.map((c) => (
                    <li className={c.done ? "complete" : ""} key={c.label}>
                      {c.done ? <Check size={16} /> : <Circle size={16} />}
                      <span>{c.label}</span>
                    </li>
                  ))}
                </ul>
                <div className="pack-review-count">
                  <strong>{needsReview}</strong>
                  <span>
                    IMC fields marked missing or needing clarification
                  </span>
                </div>
                <p className="context-note">
                  {excluded} intentionally excluded. These statuses travel with
                  the pack; they do not automatically block generation.
                </p>
                <button
                  className="text-button"
                  onClick={() => {
                    const details = document.getElementById(
                      "pack-source-review",
                    ) as HTMLDetailsElement;
                    details.open = true;
                    details.querySelector("summary")?.focus();
                    details.scrollIntoView({ block: "start" });
                  }}
                >
                  Review source details <ArrowRight size={14} />
                </button>
                <div className="pack-review-state" aria-live="polite">
                  <h4>
                    {state.reviewedPack
                      ? changes.length
                        ? "Changed since your review"
                        : "Matches your reviewed pack"
                      : "Review your shared input"}
                  </h4>
                  {state.reviewedPack ? (
                    changes.length ? (
                      <ul>
                        {changes.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>All inputs match the version you reviewed.</p>
                    )
                  ) : (
                    <p>
                      Preview the pack and mark it reviewed to track later
                      changes.
                    </p>
                  )}
                </div>
                <div className="pack-directions">
                  <h4>Keep two possible directions</h4>
                  <p>
                    Save your choices, explore a different mix, then compare.
                  </p>
                  <div className="pack-save-buttons">
                    {(["A", "B"] as const).map((slot) => (
                      <button
                        key={slot}
                        className="button small"
                        disabled={!ready}
                        onClick={() => saveDirection(slot)}
                      >
                        {state.packCandidates?.[slot] ? "Update" : "Save"}{" "}
                        Direction {slot}
                      </button>
                    ))}
                  </div>
                  <button
                    className="text-button"
                    disabled={
                      !state.packCandidates?.A && !state.packCandidates?.B
                    }
                    onClick={() => setView("compare")}
                  >
                    <GitCompareArrows size={15} /> Compare directions
                  </button>
                  <small>Saved in this tab’s session.</small>
                </div>
              </aside>
            </div>
            {message && (
              <p className="pack-feedback" role="status">
                {message}
              </p>
            )}
            <details className="review-upstream" id="pack-source-review">
              <summary>Review upstream details & add clarification</summary>
              <UpstreamContextPanel
                value={upstream}
                disabled={disabled}
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
            {currentCount !== 3 && !working && (
              <p role="alert" className="notice">
                Some preparation outputs are missing or use an earlier IMC
                brief. Regenerate those agents against the current brief before
                continuing.
              </p>
            )}
            {hasSession && (
              <p className="notice">
                Your existing round table keeps its original context. Generating
                perspectives again starts a fresh round table with this pack.
              </p>
            )}
            <div
              className="pack-tray"
              role="region"
              aria-label="Selected Sparks tray"
            >
              <div className="pack-tray-selection">
                <a href="#dynamic-input-pack" className="pack-tray-title">
                  <Sparkles size={16} />
                  <strong>{selected.length} selected</strong>
                </a>
                <div className="pack-tray-chips">
                  {selected.length ? (
                    selected.map((s, i) => (
                      <span className="pack-chip" key={s.id}>
                        <button
                          aria-label={`Inspect selected Spark: ${s.title || `Idea starter ${i + 1}`}`}
                          onClick={() => setInspectedId(s.id)}
                        >
                          {s.title || `Idea starter ${i + 1}`}
                        </button>
                        <button
                          disabled={disabled}
                          onClick={() => onToggleSpark(s.id)}
                          aria-label={`Remove ${s.title || `idea starter ${i + 1}`} from pack`}
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="context-note">
                      Select at least one Spark to continue.
                    </span>
                  )}
                </div>
              </div>
              <div className="pack-tray-actions">
                <button className="button" onClick={() => setView("preview")}>
                  <Eye size={15} />
                  <span>Preview shared input</span>
                </button>
                <button
                  className="button primary"
                  disabled={!ready}
                  onClick={onGenerate}
                  aria-label="Generate Strategic Perspectives"
                >
                  {generating ? (
                    "Preparing perspectives…"
                  ) : (
                    <>
                      Generate{" "}
                      <span className="pack-generate-label">Strategic </span>
                      Perspectives <ArrowRight size={15} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </section>
      {view === "preview" && (
        <SharedInputPreview
          pack={pack}
          ready={ready}
          onReview={review}
          onClose={() => setView(null)}
        />
      )}
      {view === "compare" && (
        <CompareInputPacks
          state={state}
          disabled={disabled}
          canSave={ready}
          onSave={saveDirection}
          onUse={useDirection}
          onClose={() => setView(null)}
        />
      )}
      {inspected && (
        <SparkTrace
          spark={inspected}
          parsed={parsed}
          selected={selected.some((s) => s.id === inspected.id)}
          disabled={disabled}
          onToggle={() => onToggleSpark(inspected.id)}
          onClose={() => setInspectedId(null)}
        />
      )}
    </>
  );
}
