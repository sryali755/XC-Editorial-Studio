"use client";

import { useState } from "react";
import { runAgent } from "@/lib/ai/client";
import {
  strategySuggestionContext,
  strategySuggestionFingerprint,
} from "@/lib/ai/strategy-suggestions";
import { inputPackVersion } from "@/lib/discovery";
import type { DiscoveryState, StrategyInputPack } from "@/lib/types";

type SuggestionRun = NonNullable<
  DiscoveryState["strategySuggestionRuns"]
>[number];

export default function StrategySuggestions({
  pack,
  discovery,
  onRun,
  onChoose,
}: {
  pack: StrategyInputPack;
  discovery: DiscoveryState;
  onRun: (run: SuggestionRun) => void;
  onChoose: (briefLine: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hasHumanBriefLine = Boolean(discovery.humanBriefLine?.trim());
  const context = strategySuggestionContext(pack, discovery);
  const fingerprint = strategySuggestionFingerprint(context);
  const runs = discovery.strategySuggestionRuns ?? [];
  const [selectedRunId, setSelectedRunId] = useState("");
  const currentRun = runs.find((run) => run.id === selectedRunId) ?? runs[0];
  const traceComplete =
    !currentRun?.context.savedFindings.length ||
    currentRun.options.every((option) => option.findingLinks?.length);
  const current = currentRun?.fingerprint === fingerprint && traceComplete;
  const unavailableMessage = !context.sourceBrief
    ? "Add an IMC brief in the Input Pack before exploring suggestions."
    : !context.sourceExcerpts.length
      ? "No usable IMC brief excerpts are available for suggestions. Your strategy draft is unaffected."
      : "";

  async function generate() {
    if (busy || !context.sourceBrief || !context.sourceExcerpts.length) return;
    setBusy(true);
    setError("");
    try {
      const result = await runAgent({
        agentType: "strategySuggestions",
        context,
      });
      const run: SuggestionRun = {
        id: crypto.randomUUID(),
        createdAt: result.generatedAt,
        fingerprint: strategySuggestionFingerprint(context),
        inputPackVersion: inputPackVersion(pack),
        provider: result.provider,
        model: result.model,
        context,
        options: result.data.suggestions,
      };
      onRun(run);
      setSelectedRunId(run.id);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Brief-line suggestions could not be generated. Your current draft and prior suggestions are preserved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <details
      className="panel studio-suggestions"
      aria-label="Optional Brief-Line Suggestions"
    >
      <summary className="studio-suggestions-summary">
        <span>
          <span className="eyebrow">OPTIONAL · NOT YOUR APPROVED LANGUAGE</span>
          <strong>Optional Brief-Line Suggestions</strong>
          <small>
            Explore alternatives for inspiration; they never replace your brief
            line.
          </small>
        </span>
        <span className="button">Explore Suggestions</span>
      </summary>
      <div className="studio-suggestions-content">
      <div className="studio-suggestions-heading">
        <div>
          <p>
            Three directions from the current IMC brief, selected Sparks, and
            saved findings. Review, edit, or ignore them; only you confirm the
            strategy.
          </p>
          <p className="studio-suggestion-input-note">
            {context.savedFindings.length
              ? `${context.savedFindings.length} saved Discovery finding${context.savedFindings.length === 1 ? "" : "s"} will be traced to the suggested lines.`
              : "No Discovery findings saved yet. Suggestions will use the IMC brief and selected Sparks only."}
          </p>
        </div>
        <button
          className="button"
          type="button"
          disabled={busy || Boolean(unavailableMessage)}
          onClick={generate}
        >
          {busy
            ? "Generating suggestions…"
            : error
              ? "Retry suggestions"
              : runs.length
                ? "Suggest new lines"
                : "Explore Suggestions"}
        </button>
      </div>
      {!currentRun && !error && !unavailableMessage && (
        <p className="context-note" role="status">
          Suggestions have not been requested. Your brief line remains yours to
          write.
        </p>
      )}
      {unavailableMessage && (
        <p className="context-note" role="status">
          {unavailableMessage}
        </p>
      )}
      {error && (
        <p className="studio-suggestion-error" role="alert">
          {error}
        </p>
      )}
      {currentRun && (
        <>
          <div className="studio-suggestion-meta">
            <span>
              {currentRun.provider === "mock"
                ? "DEMO SUGGESTIONS · NOT LIVE AI"
                : "AI SUGGESTIONS · NOT APPROVED"}
            </span>
            <span>
              {currentRun.inputPackVersion} ·{" "}
              {new Date(currentRun.createdAt).toLocaleString()}
            </span>
          </div>
          {!current && (
            <p className="studio-suggestion-warning">
              {!traceComplete
                ? "This earlier run did not record how Discovery findings shaped its lines. Generate new suggestions to use a traceable line."
                : "These suggestions use older inputs. Generate again to use a line with the current Input Pack and findings."}
            </p>
          )}
          <div className="studio-suggestion-grid">
            {currentRun.options.map((option, index) => (
              <article
                className="studio-suggestion-card"
                key={`${currentRun.id}:${index}`}
              >
                <small>Direction {index + 1}</small>
                <h4>{option.briefLine}</h4>
                <p>{option.rationale}</p>
                {!!option.findingLinks?.length && (
                  <div className="studio-suggestion-discovery">
                    <strong>How Discovery shaped this line</strong>
                    {option.findingLinks.map((link) => {
                      const finding = currentRun.context.savedFindings.find(
                        (item) => item.id === link.findingId,
                      );
                      return finding ? (
                        <div key={link.findingId}>
                          <p>
                            <b>{finding.title}</b> ·{" "}
                            {finding.evidenceState === "research_gap"
                              ? "Research gap, not a proven fact"
                              : "Interpretation of supplied evidence"}
                          </p>
                          <p>{link.contribution}</p>
                          <details>
                            <summary>Read saved finding</summary>
                            <p>{finding.whatWeFound}</p>
                          </details>
                        </div>
                      ) : null;
                    })}
                  </div>
                )}
                {!option.findingLinks?.length &&
                  !currentRun.context.savedFindings.length && (
                    <p className="studio-suggestion-no-discovery">
                      No saved Discovery finding informed this direction.
                    </p>
                  )}
                <strong>Exact support from the IMC brief</strong>
                {option.evidenceIds.map((id) => {
                  const source = currentRun.context.sourceExcerpts.find(
                    (item) => item.id === id,
                  );
                  return source ? (
                    <blockquote key={id}>
                      <small>{source.label}</small>
                      <br />“{source.excerpt}”
                    </blockquote>
                  ) : null;
                })}
                {!!option.sparkIds.length && (
                  <p>
                    <strong>Selected Spark:</strong>{" "}
                    {option.sparkIds
                      .map(
                        (id) =>
                          currentRun.context.sparkInputs.find(
                            (spark) => spark.id === id,
                          )?.title ?? id,
                      )
                      .join(", ")}{" "}
                    <small>(creative input, not evidence)</small>
                  </p>
                )}
                <p>
                  <strong>To validate:</strong> {option.validationGap}
                </p>
                <button
                  className="button"
                  type="button"
                  disabled={!current || hasHumanBriefLine}
                  title={
                    hasHumanBriefLine
                      ? "Your existing brief line is protected. Clear it before using a suggestion."
                      : undefined
                  }
                  onClick={() => onChoose(option.briefLine)}
                >
                  Use as editable draft
                </button>
                {hasHumanBriefLine && (
                  <small>
                    Your existing brief line is unchanged. Clear it yourself
                    before choosing this suggestion.
                  </small>
                )}
              </article>
            ))}
          </div>
        </>
      )}
      {runs.length > 1 && (
        <details className="studio-suggestion-history">
          <summary>Previous suggestion runs · {runs.length}</summary>
          {runs.map((run) => (
            <button
              className="text-button"
              type="button"
              key={run.id}
              onClick={() => setSelectedRunId(run.id)}
            >
              View {new Date(run.createdAt).toLocaleString()} ·{" "}
              {run.inputPackVersion}
            </button>
          ))}
        </details>
      )}
      </div>
    </details>
  );
}
