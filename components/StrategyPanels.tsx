import UpstreamContextPanel from "./UpstreamContextPanel";
import { ArrowRight, Check, FileText } from "lucide-react";
import type {
  ExecutionDirection,
  GeneratedBrief,
  StrategyInputPack,
} from "@/lib/types";
export function Field({
  label,
  value,
  onChange,
  helper,
  rows = 3,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  helper?: string;
  rows?: number;
  required?: boolean;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <span className="required"> *</span>}
      </span>
      {helper && <small>{helper}</small>}
      <textarea
        rows={rows}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export function StrategyInputSummary({ pack }: { pack: StrategyInputPack }) {
  return (
    <details className="summary panel">
      <summary>
        <span>
          <span className="eyebrow">XC STRATEGY INPUT PACK</span>
          <strong>{pack.campaignName || "Campaign context"}</strong>
        </span>
        <span className="summary-tags">
          RTB <i /> DATA & RESEARCH <i /> SPARKS
        </span>
        <span className="tag">View context ↓</span>
      </summary>
      <div className="summary-grid">
        {Object.entries(pack)
          .filter(([key]) => key !== "upstream" && key !== "parsedIMC")
          .map(([key, value]) => (
            <div key={key}>
              <h3>
                {(
                  {
                    reasonToBelieve: "Original upstream RTB",
                    proposedRTB:
                      "Proposed XC adaptation — not upstream-approved",
                    research: "Data & Research",
                    sparks: "Strategic Sparks",
                    campaignName: "Campaign",
                    product: "Offer / Product",
                    channel: "Channel",
                    researchFocus: "Research Emphasis / Additional Direction",
                    preparationSource: "Preparation Source",
                  } as Record<string, string>
                )[key] || key}
              </h3>
              <p>
                {typeof value === "string"
                  ? value || "Not supplied"
                  : "Not supplied"}
              </p>
            </div>
          ))}
      </div>
      {pack.upstream && <UpstreamContextPanel value={pack.upstream} />}
    </details>
  );
}
export function ExecutionDirectionForm({
  value,
  onChange,
  onGenerate,
  busy,
}: {
  value: ExecutionDirection;
  onChange: (e: ExecutionDirection) => void;
  onGenerate: () => void;
  busy: boolean;
}) {
  return (
    <form
      className="panel execution"
      onSubmit={(e) => {
        e.preventDefault();
        onGenerate();
      }}
    >
      <div className="section-title">
        <div>
          <h2>Execution direction</h2>
          <p>Give Creative a clear picture of what to create.</p>
        </div>
        <span className="tag">Kevin / XC</span>
      </div>
      <div className="context-grid">
        <Field
          required
          label="Required assets"
          value={value.requiredAssets}
          onChange={(v) => onChange({ ...value, requiredAssets: v })}
        />
        <label className="field">
          <span>Number of assets *</span>
          <input
            required
            type="number"
            min={1}
            max={1000}
            value={value.assetCount}
            onChange={(e) =>
              onChange({ ...value, assetCount: Number(e.target.value) })
            }
          />
        </label>
        {(
          [
            "channels",
            "placements",
            "desktop",
            "mobile",
            "messaging",
            "copy",
            "formats",
            "timing",
            "constraints",
          ] as const
        ).map((key, i) => (
          <Field
            key={key}
            required={["channels", "messaging", "copy"].includes(key)}
            label={
              [
                "Channels",
                "Pages / placements",
                "Desktop requirements",
                "Mobile requirements",
                "Messaging direction",
                "Copy requirements",
                "Formats",
                "Timing",
                "Additional constraints",
              ][i]
            }
            value={value[key]}
            onChange={(v) => onChange({ ...value, [key]: v })}
          />
        ))}
      </div>
      <div className="equation">
        <span>
          <Check size={16} /> Approved strategy
        </span>
        <b>+</b>
        <span>Execution direction</span>
        <b>=</b>
        <strong>XC Creative Brief</strong>
      </div>
      <div className="right">
        <button className="button primary" disabled={busy}>
          {busy ? "Packaging your brief…" : "Generate XC Brief"}
          <ArrowRight size={17} />
        </button>
      </div>
    </form>
  );
}
export function GeneratedBriefPreview({
  brief,
  onRegenerate,
  onEdit,
  onBack,
  busy,
}: {
  brief: GeneratedBrief;
  onRegenerate: () => void;
  onEdit: () => void;
  onBack: () => void;
  busy: boolean;
}) {
  function download() {
    const text = `XC CREATIVE BRIEF — DEMONSTRATION\n${brief.campaign}\n\n${brief.sections.map((s) => `${s.title.toUpperCase()}\n${s.content || "To be confirmed"}`).join("\n\n")}`;
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "XC-Creative-Brief.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <div className="preview-actions">
        <button className="button" onClick={onBack}>
          ← Back to Strategy
        </button>
        <div>
          <button className="button" disabled={busy} onClick={onEdit}>
            Edit Execution Direction
          </button>
          <button className="button" disabled={busy} onClick={onRegenerate}>
            {busy ? "Regenerating…" : "Regenerate"}
          </button>
          <button className="button primary" onClick={download}>
            Download Brief <FileText size={16} />
          </button>
          <button className="button" onClick={() => window.print()}>
            Print / Save PDF
          </button>
        </div>
      </div>
      <article className="brief-paper">
        <div className="paper-top">
          <span className="wordmark">
            XC<span> / CREATIVE</span>
          </span>
          <span className="tag">MOCK BRIEF · FOR REVIEW</span>
        </div>
        <p className="eyebrow">STRATEGY → CREATIVE</p>
        <h1>{brief.campaign}</h1>
        <p className="paper-subtitle">XC creative brief</p>
        <div className="brief-sections">
          {brief.sections.map((section, i) => (
            <section
              className={
                section.title === "Approved Brief Line"
                  ? "approved-section"
                  : ""
              }
              key={section.title}
            >
              <span className="mono">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h2>{section.title}</h2>
                <p>{section.content || "To be confirmed"}</p>
              </div>
            </section>
          ))}
        </div>
        <footer>
          Illustrative content · Human-approved strategy · Final XC template
          pending confirmation
        </footer>
      </article>
      <p className="center muted">
        Download provides a text brief. Use Print / Save PDF for a
        browser-generated PDF.
      </p>
    </>
  );
}
