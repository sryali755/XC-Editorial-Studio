import { demoExecution } from "@/lib/demo";
import { useRef, useState } from "react";
import { briefFilename, buildBriefDocument } from "@/lib/brief-document";
import BriefDocumentPreview from "./BriefDocumentPreview";
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
  placeholder,
  disabled = false,
  rows = 3,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  helper?: string;
  placeholder?: string;
  disabled?: boolean;
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
        placeholder={placeholder}
        disabled={disabled}
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
          .filter(([, value]) => typeof value === "string")
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
        <button
          type="button"
          className="button small"
          disabled={busy}
          onClick={() =>
            onChange({
              ...demoExecution,
              channels: value.channels || demoExecution.channels,
              messaging: value.messaging || demoExecution.messaging,
              copy: value.copy || demoExecution.copy,
              constraints: value.constraints || demoExecution.constraints,
              timing: value.timing || demoExecution.timing,
              creativeDirection:
                value.creativeDirection ||
                "Explore everyday moments through the approved strategy.",
            })
          }
        >
          Load sample execution details
        </button>
      </div>
      <p className="context-note">
        Known channels, messaging and restrictions are carried from your
        approved input pack. Confirm them and add the remaining creative
        requirements. Empty fields show examples to guide you. Use “Load sample
        execution details” to fill the form with editable sample values.
      </p>
      <div className="context-grid">
        <Field
          required
          label="Required assets"
          value={value.requiredAssets}
          placeholder={`e.g. ${demoExecution.requiredAssets}`}
          onChange={(v) => onChange({ ...value, requiredAssets: v })}
        />
        <label className="field">
          <span>Number of assets *</span>
          <input
            required
            type="number"
            min={1}
            max={1000}
            placeholder={`e.g. ${demoExecution.assetCount}`}
            value={value.assetCount || ""}
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
            "creativeDirection",
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
                "Creative direction",
                "Copy requirements",
                "Formats",
                "Timing",
                "Additional constraints",
              ][i]
            }
            value={value[key] ?? ""}
            placeholder={`e.g. ${
              demoExecution[key] ??
              "Show everyday moments through the approved strategy, with warm imagery and a clear product focus."
            }`}
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
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const downloadLock = useRef(false);
  const documentModel = buildBriefDocument(brief);
  async function download(format: "pdf" | "docx") {
    if (busy || downloadLock.current) return;
    downloadLock.current = true;
    setDownloading(format);
    setDownloadError("");
    try {
      // Load each document generator only when that format is requested.
      const blob =
        format === "pdf"
          ? await (
              await import("@/lib/export-brief-pdf")
            ).createBriefPdf(documentModel)
          : await (
              await import("@/lib/export-brief-word")
            ).createBriefWord(documentModel);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = briefFilename(brief.campaign, format);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setDownloadError(
        `The ${format === "pdf" ? "PDF" : "Word"} download could not be created. Your brief is saved; please try again.`,
      );
    } finally {
      downloadLock.current = false;
      setDownloading(null);
    }
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
          <button
            className="button primary"
            disabled={busy || !!downloading}
            onClick={() => download("pdf")}
          >
            {downloading === "pdf" ? "Preparing PDF…" : "Download PDF"}{" "}
            <FileText size={16} />
          </button>
          <button
            className="button"
            disabled={busy || !!downloading}
            onClick={() => download("docx")}
          >
            {downloading === "docx" ? "Preparing Word…" : "Download Word"}{" "}
            <FileText size={16} />
          </button>
          <button className="button" onClick={() => window.print()}>
            Print / Save PDF
          </button>
        </div>
      </div>
      {downloadError && (
        <div className="error brief-download-error" role="alert">
          {downloadError}
        </div>
      )}
      <BriefDocumentPreview document={documentModel} />
      <p className="center muted">
        Download the designed PDF or an editable Word document. Both include the
        full brief shown above.
      </p>
    </>
  );
}
