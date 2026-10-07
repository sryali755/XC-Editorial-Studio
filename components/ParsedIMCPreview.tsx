import { imcSchema } from "@/lib/imc-parser";
import type { ParsedIMCBrief } from "@/lib/types";

export default function ParsedIMCPreview({
  parsed,
  stale,
}: {
  parsed: ParsedIMCBrief;
  stale: boolean;
}) {
  const supplied = Object.values(parsed.fields).filter(
    (f) => f.status === "Supplied",
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
            : `${supplied} supplied · ${imcSchema.length} fields checked`}
        </span>
      </summary>
      <p className="context-note">
        Original extraction before preparation. Agent proposals and manual
        review notes do not change this record.
      </p>
      <div className="parsed-field-grid">
        {imcSchema.map((def) => (
          <section key={def.key} aria-label={`Parsed ${def.key}`}>
            <div>
              <code>{def.key}</code>
              <span className="tag">{parsed.fields[def.key].status}</span>
            </div>
            <p>
              {parsed.fields[def.key].sourceValue ||
                (parsed.fields[def.key].present
                  ? "Field is present but empty."
                  : "Not supplied.")}
            </p>
          </section>
        ))}
      </div>
    </details>
  );
}
