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
}: {
  version: PreparationVersion;
  selectedIds: string[];
  disabled: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="spark-selection">
      <p className="selection-count" role="status">
        {
          version.sparks.filter((spark) => selectedIds.includes(spark.id))
            .length
        }{" "}
        / {version.sparks.length} selected · V{version.number}
      </p>
      <div className="spark-options">
        {version.sparks.map((spark, i) => (
          <label
            className={
              "spark-option " +
              (selectedIds.includes(spark.id) ? "checked" : "")
            }
            key={spark.id}
          >
            <input
              type="checkbox"
              disabled={disabled}
              checked={selectedIds.includes(spark.id)}
              onChange={() => onToggle(spark.id)}
            />
            <span>
              <small>IDEA STARTER {i + 1}</small>
              {spark.text}
            </span>
            <Check size={15} />
          </label>
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
  if (data && "suppliedEvidence" in data)
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
    /^(SUPPLIED EVIDENCE|AUDIENCE CONTEXT|HISTORICAL \/ CREATIVE PERFORMANCE|MARKET \/ CATEGORY CONTEXT|RESEARCH TO VALIDATE|EVIDENCE GAPS|SOURCE NOTES|REFINEMENT V\d+)$/m;
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
