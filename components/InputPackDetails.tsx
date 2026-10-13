import { selectedFoundation } from "@/lib/ai/context";
import { campaignDisplayName } from "@/lib/campaign-display";
import { imcSchema } from "@/lib/imc-parser";
import {
  candidateUnavailable,
  inputPackChanges,
  sparkReasoning,
  sparkSourceMatches,
} from "@/lib/input-pack";
import { upstreamFields } from "@/lib/upstream";
import type {
  IMCFieldKey,
  InputPackSnapshot,
  ParsedIMCBrief,
  PreparationState,
  PreparationVersion,
  StrategyInputPack,
} from "@/lib/types";
import PackDialog from "./PackDialog";
import { SourceFields } from "./PreparationOutputs";

export function OriginalFields({
  parsed,
  keys = imcSchema.map((f) => f.key),
}: {
  parsed: ParsedIMCBrief;
  keys?: IMCFieldKey[];
}) {
  return (
    <dl className="pack-original-fields">
      {keys.map((key) => {
        const field = parsed.fields[key];
        const definition = imcSchema.find((f) => f.key === key)!;
        const label = upstreamFields.find(
          (f) => f.key === definition.upstreamKey,
        )!.label;
        return (
          <div key={key}>
            <dt>
              {label}
              <span className="pack-status">{field.status}</span>
            </dt>
            <dd>{field.sourceValue || `${field.status}.`}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export function SparkTrace({
  spark,
  parsed,
  selected,
  disabled,
  onToggle,
  onClose,
}: {
  spark: PreparationVersion["sparks"][number];
  parsed: ParsedIMCBrief;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const reasoning = sparkReasoning(spark.rationale ?? "");
  const matches = sparkSourceMatches(spark.rationale ?? "", parsed);
  return (
    <PackDialog
      title={spark.title || "Idea starter"}
      eyebrow="TRACE THIS IDEA"
      onClose={onClose}
    >
      <p className="pack-lead">{spark.text}</p>
      <div className="pack-trace-grid">
        <section
          className="pack-detail-section"
          aria-label="Agent interpretation"
        >
          <span className="pack-label proposal">AGENT INTERPRETATION</span>
          {reasoning ? (
            <>
              <h3>Creative premise</h3>
              <p>{reasoning.premise}</p>
              <h3>Proposed grounding</h3>
              <p>{reasoning.grounding}</p>
              <h3>Hypothesis to validate</h3>
              <p>{reasoning.validate}</p>
            </>
          ) : (
            <>
              <h3>Recorded rationale</h3>
              <p>
                {spark.rationale || "No rationale was recorded for this Spark."}
              </p>
              <p className="context-note">
                A separate validation hypothesis was not recorded in this
                format. Review the rationale before carrying the idea forward.
              </p>
            </>
          )}
        </section>
        <section className="pack-detail-section" aria-label="Source trace">
          <span className="pack-label source">ORIGINAL IMC TEXT</span>
          <h3>
            {matches.length
              ? "Exact text found in the rationale"
              : "Source context to review"}
          </h3>
          {matches.length ? (
            <>
              <p className="context-note">
                These excerpts occur verbatim in both the rationale and parsed
                brief. A text match does not verify the interpretation or
                approve a claim.
              </p>
              {matches.map((m) => (
                <blockquote key={m.key}>
                  <small>{m.label}</small>
                  <p>{m.excerpt}</p>
                </blockquote>
              ))}
            </>
          ) : (
            <>
              <p className="context-note">
                No exact source citation was recorded for this Spark. The fields
                below are context for your review, not verified support for the
                idea.
              </p>
              <OriginalFields
                parsed={parsed}
                keys={[
                  "objective",
                  "audience",
                  "reason_to_believe",
                  "research",
                ]}
              />
            </>
          )}
        </section>
      </div>
      <details className="pack-fold">
        <summary>All 19 original IMC fields</summary>
        <OriginalFields parsed={parsed} />
      </details>
      <div className="pack-dialog-actions">
        <p>Creative possibility · subject to the brief’s requirements.</p>
        <button
          className="button primary"
          disabled={disabled}
          onClick={onToggle}
        >
          {selected ? "Remove from pack" : "Add to pack"}
        </button>
      </div>
    </PackDialog>
  );
}

// Render the same projection used by strategyService. No preview-only summary is sent to agents.
export function SharedPackContents({ pack }: { pack: StrategyInputPack }) {
  const foundation = selectedFoundation(pack);
  return (
    <div className="pack-preview-content">
      <section className="pack-detail-section">
        <h3>Campaign context</h3>
        <dl className="foundation-fields">
          {Object.entries(foundation.campaignContext).map(([key, value]) => (
            <div key={key}>
              <dt>{upstreamFields.find((f) => f.key === key)?.label ?? key}</dt>
              <dd>
                {value ||
                  "Empty in the shared context; see source status below."}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <div className="pack-trace-grid">
        <section className="pack-detail-section">
          <span className="pack-label source">
            UPSTREAM RTB · {foundation.currentRtb.status}
          </span>
          <p>{foundation.currentRtb.original}</p>
          {foundation.currentRtb.reviewNote && (
            <p>Review note: {foundation.currentRtb.reviewNote}</p>
          )}
        </section>
        <section className="pack-detail-section">
          <span className="pack-label proposal">
            XC PROPOSAL · NOT APPROVED
          </span>
          <p>
            {foundation.currentRtb.proposal || "No adaptation carried forward."}
          </p>
        </section>
      </div>
      <section className="pack-detail-section">
        <h3>Current research</h3>
        <p>
          {foundation.currentResearch ||
            "Preparation has not produced research yet."}
        </p>
      </section>
      <section
        className="pack-detail-section"
        aria-label="Selected Sparks in shared input"
      >
        <h3>Selected Sparks · {foundation.selectedSparks.length}</h3>
        {foundation.selectedSparks.length ? (
          foundation.selectedSparks.map((spark, i) => (
            <div className="pack-preview-spark" key={spark.id}>
              <h4>
                {spark.title || `Idea starter ${i + 1}`}{" "}
                <span className="tag">V{spark.version} · Hypothesis</span>
              </h4>
              <p>{spark.text}</p>
              {spark.rationale && (
                <p className="context-note">{spark.rationale}</p>
              )}
            </div>
          ))
        ) : (
          <p>No Sparks selected yet.</p>
        )}
      </section>
      <section className="pack-detail-section">
        <h3>Research emphasis / additional direction</h3>
        <p>
          {foundation.researchEmphasis || "No additional direction supplied."}
        </p>
      </section>
      <details className="pack-fold">
        <summary>All shared requirements, statuses & review notes</summary>
        <SourceFields
          upstream={foundation.requirements}
          keys={upstreamFields.map((f) => f.key)}
        />
      </details>
      <details className="pack-fold">
        <summary>Exact shared input · JSON</summary>
        <pre className="pack-payload" data-testid="shared-input-json">
          {JSON.stringify(foundation, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export function SharedInputPreview({
  pack,
  ready,
  onReview,
  onClose,
}: {
  pack: StrategyInputPack;
  ready: boolean;
  onReview: () => void;
  onClose: () => void;
}) {
  return (
    <PackDialog
      title="What the five agents receive"
      eyebrow="SHARED INPUT PREVIEW"
      onClose={onClose}
    >
      <p className="context-note">
        Every perspective receives this same working foundation, plus its own
        role and creative controls. Only selected Sparks travel forward. This
        preview updates with the current pack.
      </p>
      <SharedPackContents pack={pack} />
      <div className="pack-dialog-actions">
        <p>
          Review records your current pack; it does not approve the strategy.
        </p>
        <button className="button primary" disabled={!ready} onClick={onReview}>
          Mark pack reviewed
        </button>
      </div>
    </PackDialog>
  );
}

export function CompareInputPacks({
  state,
  disabled,
  canSave,
  onUse,
  onSave,
  onClose,
}: {
  state: PreparationState;
  disabled: boolean;
  canSave: boolean;
  onUse: (slot: "A" | "B") => void;
  onSave: (slot: "A" | "B") => void;
  onClose: () => void;
}) {
  const a = state.packCandidates?.A,
    b = state.packCandidates?.B;
  const differences = a && b ? inputPackChanges(a, b) : [];
  return (
    <PackDialog
      title="Compare directions"
      eyebrow="TWO POSSIBLE STARTING POINTS"
      onClose={onClose}
    >
      <p className="context-note">
        Each direction saves its Spark choices, preparation versions, emphasis
        and review notes in this tab. Choosing one restores those inputs for
        review. Generating perspectives starts a fresh round table.
      </p>
      {a && b && (
        <details className="pack-fold" open>
          <summary>
            {differences.length
              ? `${differences.length} differences between A and B`
              : "Both directions contain the same inputs"}
          </summary>
          <ul>
            {differences.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="pack-comparison">
        {(["A", "B"] as const).map((slot) => {
          const candidate: InputPackSnapshot | undefined =
            state.packCandidates?.[slot];
          const reason = candidate
            ? candidateUnavailable(state, candidate)
            : null;
          return (
            <section
              key={slot}
              className="pack-candidate"
              aria-label={`Direction ${slot}`}
            >
              <span className="pack-label proposal">DIRECTION {slot}</span>
              {candidate ? (
                <>
                  <h3>
                    {campaignDisplayName(candidate.pack.campaignName) ||
                      "Untitled campaign"}
                  </h3>
                  <small>
                    Saved {new Date(candidate.savedAt).toLocaleString()}
                  </small>
                  <p className="context-note">
                    RTB V{candidate.versions.reasonToBelieve.number} · Research
                    V{candidate.versions.research.number} · Sparks V
                    {candidate.versions.sparks.number}
                  </p>
                  <h4>Selected Sparks</h4>
                  {candidate.pack.selectedSparks?.map((spark, i) => (
                    <div className="pack-preview-spark" key={spark.id}>
                      <strong>{spark.title || `Idea starter ${i + 1}`}</strong>
                      <p>{spark.text}</p>
                    </div>
                  ))}
                  <h4>Additional direction</h4>
                  <p>
                    {candidate.pack.researchFocus ||
                      "No additional direction supplied."}
                  </p>
                  <details className="pack-fold">
                    <summary>View complete saved input</summary>
                    <SharedPackContents pack={candidate.pack} />
                  </details>
                  {reason && <p className="notice">{reason}</p>}
                  <button
                    className="button primary"
                    disabled={disabled || !!reason}
                    onClick={() => onUse(slot)}
                  >
                    Use Direction {slot}
                  </button>
                </>
              ) : (
                <p className="context-note">
                  Choose Sparks and an emphasis in your working pack, then save
                  them here.
                </p>
              )}
              <button
                className="button"
                disabled={!canSave}
                onClick={() => onSave(slot)}
              >
                {candidate ? "Update" : "Save"} Direction {slot}
              </button>
            </section>
          );
        })}
      </div>
    </PackDialog>
  );
}
