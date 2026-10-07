import { imcSchema } from "@/lib/imc-parser";
import type { ParsedIMCBrief } from "@/lib/types";

export default function ParsedIMCPreview({
  parsed,
  stale,
}: {
  parsed: ParsedIMCBrief;
  stale: boolean;
}) {
  const entries = [
    ...imcSchema.map((def) => ({
      key: def.key as string,
      field: parsed.fields[def.key],
    })),
    {
      key: "partner_approval_status",
      field: parsed.supplemental.partnerApproval,
    },
  ].filter((entry) => !!entry.field);
  const supplied = entries.filter(
    (entry) => entry.field!.status === "Supplied",
  ).length;
  return (
    <details className="panel parsed-imc" aria-label="Parsed IMC fields">
      <summary>
        <div>
          <span className="eyebrow">STEP 1 · STRUCTURED EXTRACTION</span>
          <h3>Parsed IMC fields</h3>
        </div>
        <span className="tag">
          {stale
            ? "Source changed — parse again"
            : `${supplied} supplied · ${entries.length} fields checked`}
        </span>
      </summary>
      <p className="context-note">
        Original extraction before preparation. Agent proposals and manual
        review notes do not change this record.
      </p>
      <div className="parsed-field-grid">
        {entries.map(({ key, field }) => (
          <section key={key} aria-label={`Parsed ${key}`}>
            <div>
              <code>{key}</code>
              <span className="tag">{field!.status}</span>
            </div>
            <p>
              {field!.sourceValue ||
                (field!.present
                  ? "Field is present but empty."
                  : "Not supplied.")}
            </p>
          </section>
        ))}
      </div>
    </details>
  );
}
