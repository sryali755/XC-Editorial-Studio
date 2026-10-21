"use client";

import type { CampaignIdentity } from "@/lib/types";

export default function CampaignIdentityPanel({
  identity,
  value,
  onChange,
  onCommit,
  disabled,
  explanation,
}: {
  identity: CampaignIdentity;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  disabled: boolean;
  explanation?: string;
}) {
  const unresolved = identity.confirmationStatus === "unresolved";
  const candidate = identity.sourceCandidate;
  return (
    <section
      className="studio-campaign-identity"
      aria-label="Campaign Identity"
    >
      <h3>Campaign Identity</h3>
      <p className="context-note">
        Review the name used across this workspace and the XC Brief. Correcting
        the display name does not replace the selected campaign or rewrite
        source text.
      </p>
      <dl className="studio-campaign-metadata">
        <div>
          <dt>Detected / suggested campaign name</dt>
          <dd>{candidate?.name || "No unambiguous name detected"}</dd>
        </div>
        <div>
          <dt>Source document title</dt>
          <dd>{identity.sourceDocumentTitle || "Not explicitly supplied"}</dd>
        </div>
        <div>
          <dt>Source file</dt>
          <dd>{identity.sourceDocumentFileName || "Pasted IMC text"}</dd>
        </div>
        <div>
          <dt>Source attribution</dt>
          <dd>
            {candidate
              ? `${candidate.locator} · ${candidate.kind === "explicit" ? "Explicit campaign field" : "Cover title — candidate, not an official campaign field"}`
              : "No campaign-name source location supplied"}
          </dd>
        </div>
      </dl>
      {candidate && (
        <details>
          <summary>Original naming excerpt</summary>
          <pre className="studio-campaign-excerpt">{candidate.excerpt}</pre>
        </details>
      )}
      <label className="field" htmlFor="confirmed-campaign-name">
        <span>Campaign name</span>
        <input
          id="confirmed-campaign-name"
          value={value}
          maxLength={300}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onCommit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onCommit();
            }
          }}
        />
      </label>
      <div className="studio-campaign-confirmation">
        <p
          className="context-note"
          role="status"
          data-testid="campaign-identity"
        >
          {unresolved
            ? "The current valid name will be applied when you build the Input Pack."
            : `Campaign: ${identity.displayName} · ${identity.origin === "human_confirmed" ? "Human-confirmed; not source-extracted" : "Source-extracted · confirmed against the campaign field"}`}
        </p>
      </div>
      {explanation && <p className="context-note">{explanation}</p>}
      {identity.sourceName &&
        identity.humanConfirmedName &&
        identity.humanConfirmedName !== identity.sourceName && (
          <p className="context-note">
            Original source campaign name preserved: {identity.sourceName}
          </p>
        )}
      <small className="context-note">
        Campaign ID: {identity.id} · Display-name changes retain existing work.
        Selecting a different campaign keeps its work separate.
      </small>
    </section>
  );
}
