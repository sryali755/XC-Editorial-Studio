import { researchSections } from "@/lib/ai/format";
import type { AgentData } from "@/lib/ai/schemas";
import { Check } from "lucide-react";
import type {
  PreparationVersion,
  UpstreamContext,
  UpstreamKey,
} from "@/lib/types";
import { fieldText, upstreamFields } from "@/lib/upstream";

export function SparkChoices({
  version,
  selectedIds,
  disabled,
  onToggle,
  onInspect,
  keptIds = [],
  onKeep,
  onRevise,
}: {
  version: PreparationVersion;
  selectedIds: string[];
  disabled: boolean;
  onToggle: (id: string) => void;
  onInspect?: (id: string) => void;
  keptIds?: string[];
  onKeep?: (id: string) => void;
  onRevise?: (id: string, intent: "explore" | "improve") => void;
}) {
  return (
    <div
      className={"spark-selection" + (onInspect ? " pack-spark-selection" : "")}
    >
      <p className="selection-count" role="status">
        {
          version.sparks.filter((spark) => selectedIds.includes(spark.id))
            .length
        }{" "}
        / {version.sparks.length} selected · V{version.number}
      </p>
      <div className="spark-options">
        {version.sparks.map((spark, i) => (
          <div className="spark-choice" key={spark.id}>
            <label
              className={
                "spark-option " +
                (selectedIds.includes(spark.id) ? "checked" : "")
              }
            >
              <input
                type="checkbox"
                disabled={disabled}
                checked={selectedIds.includes(spark.id)}
                onChange={() => onToggle(spark.id)}
              />
              <span>
                <small>IDEA STARTER {i + 1}</small>
                {spark.title && (
                  <strong className="spark-title">{spark.title}</strong>
                )}
                {spark.territory && <small>{spark.territory}</small>}
                <small>CREATIVE OPPORTUNITY</small>
                <span className="spark-description">
                  {spark.idea || spark.text}
                </span>
              </span>
              <Check size={15} />
            </label>
            {onKeep && onRevise && version.sparks.length === 6 && (
              <div className="spark-actions">
                <button
                  type="button"
                  className="button small"
                  disabled={disabled}
                  aria-pressed={keptIds.includes(spark.id)}
                  onClick={() => onKeep(spark.id)}
                >
                  {keptIds.includes(spark.id)
                    ? "Kept · Release"
                    : "Keep this Spark"}
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={disabled || keptIds.includes(spark.id)}
                  onClick={() => onRevise(spark.id, "improve")}
                >
                  Improve
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={disabled || keptIds.includes(spark.id)}
                  onClick={() => onRevise(spark.id, "explore")}
                >
                  Replace
                </button>
              </div>
            )}
            {onInspect ? (
              <button
                className="pack-trace-button"
                onClick={() => onInspect(spark.id)}
                aria-label={`Trace this idea: ${spark.title || `Idea starter ${i + 1}`}`}
              >
                Trace this idea <span aria-hidden="true">↗</span>
              </button>
            ) : (
              (spark.rationale ||
                spark.excerpt ||
                spark.campaignGrounding ||
                spark.hypothesis ||
                spark.hypothesisToValidate) && (
                <details className="spark-rationale">
                  <summary>Why this spark · grounding & hypothesis</summary>
                  {(spark.excerpt || spark.campaignGrounding) && (
                    <p>
                      <strong>Campaign grounding:</strong>{" "}
                      {spark.excerpt || spark.campaignGrounding}
                    </p>
                  )}
                  {spark.excerpt_verified === false && (
                    <p className="error">Excerpt not verified</p>
                  )}
                  {(spark.hypothesis || spark.hypothesisToValidate) && (
                    <p>
                      <strong>Hypothesis to validate:</strong>{" "}
                      {spark.hypothesis || spark.hypothesisToValidate}
                    </p>
                  )}
                  {spark.rationale && <p>{spark.rationale}</p>}
                </details>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ResearchOutput({
  text,
  data,
}: {
  text: string;
  data?: AgentData;
}) {
  if (
    data &&
    "suppliedEvidence" in data &&
    "verifiedEvidence" in data &&
    "illustrativeAssumptions" in data
  )
    return (
      <div className="prepared-text research-output">
        {researchSections(data).map((section) => (
          <section key={section.title}>
            <h4>{section.title}</h4>
            <p>{section.values.join("\n") || "Not supplied."}</p>
          </section>
        ))}
      </div>
    );
  // Text-only rendering supports older sessions and manual edits, never model responses.
  // Render the saved artifact; refinement/history and the pack share this exact text.
  const headings =
    /^(CAMPAIGN NAME|OBJECTIVES|AUDIENCE|PRODUCT INFORMATION|SUPPLIED RESEARCH & SUPPORTING EVIDENCE|VERIFIED EVIDENCE|ILLUSTRATIVE ASSUMPTIONS|SUPPLIED EVIDENCE|AUDIENCE CONTEXT|HISTORICAL \/ CREATIVE PERFORMANCE|MARKET \/ CATEGORY CONTEXT|RESEARCH TO VALIDATE|EVIDENCE GAPS|SOURCE NOTES|REFINEMENT V\d+)$/m;
  const parts = text.split(headings);
  return (
    <div className="prepared-text research-output">
      {parts[0].trim() && <p>{parts[0]}</p>}
      {Array.from({ length: Math.floor(parts.length / 2) }, (_, i) => (
        <section key={i}>
          <h4>{parts[i * 2 + 1]}</h4>
          <p>{parts[i * 2 + 2].trim()}</p>
        </section>
      ))}
    </div>
  );
}

export function SourceFields({
  upstream,
  keys,
}: {
  upstream: UpstreamContext;
  keys: UpstreamKey[];
}) {
  return (
    <dl className="foundation-fields">
      {keys.map((key) => {
        const field = upstream.fields[key];
        return (
          <div key={key}>
            <dt>{upstreamFields.find((f) => f.key === key)?.label}</dt>
            <dd>
              {fieldText(field)}
              {field.status === "Supplied" && field.note && (
                <small>Review note: {field.note}</small>
              )}
            </dd>
            {field.sourceValue && field.sourceValue !== field.value && (
              <dd className="source-preserved">
                <small>Original upstream text · preserved</small>
                {field.sourceValue}
              </dd>
            )}
          </div>
        );
      })}
    </dl>
  );
}
