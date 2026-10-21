"use client";

import {
  discoveryFindingRef,
  discoveryLenses,
  knownDiscoveryFindings,
} from "@/lib/discovery";
import {
  compactPackParagraphs,
  dynamicPackPresentation,
  selectedJtbdFraming,
} from "@/lib/input-pack-presentation";
import { campaignDisplayLabel } from "@/lib/campaign-naming";
import type {
  DiscoveryFinding,
  DiscoveryState,
  StrategyInputPack,
} from "@/lib/types";

const agentNames: Record<DiscoveryFinding["lensId"], string> = {
  consumer: "Consumer Agent",
  culture: "Culture Agent",
  category: "Category Agent",
  brand: "Brand Agent",
  analogous: "Analogous Solutions Agent",
};

function savedFindingsByLens(state: DiscoveryState) {
  const known = knownDiscoveryFindings(state);
  const seen = new Set<string>();
  const findings = state.savedFindingIds.flatMap((id) => {
    const finding = known.get(id);
    if (!finding) return [];
    const ref = discoveryFindingRef(finding);
    if (seen.has(ref)) return [];
    seen.add(ref);
    return [finding];
  });
  return discoveryLenses
    .map((lens) => ({
      ...lens,
      findings: findings.filter((finding) => finding.lensId === lens.id),
    }))
    .filter((group) => group.findings.length > 0);
}

function SavedFindingDetails({ finding }: { finding: DiscoveryFinding }) {
  const sources = [
    ...new Set(finding.evidence.map((evidence) => evidence.source)),
  ];
  return (
    <details className="dynamic-pack-saved-finding">
      <summary>
        <span>{finding.title}</span>
        <small>V{finding.runVersion - 1}</small>
      </summary>
      <article>
        <p className="dynamic-pack-finding-label">
          {finding.evidenceState === "research_gap"
            ? "Research gap · Agent interpretation · unverified"
            : "Agent interpretation · unverified"}
        </p>
        <p>{finding.whatWeFound}</p>
        {sources.length > 0 && (
          <p className="dynamic-pack-finding-sources">
            Source{sources.length === 1 ? "" : "s"}: {sources.join(", ")}
          </p>
        )}
        {(finding.evidence.length > 0 ||
          finding.whyItMayMatter ||
          finding.whatComplicatesIt ||
          finding.questionToExplore) && (
          <details className="dynamic-pack-finding-evidence">
            <summary>Supporting details</summary>
            {finding.evidence.map((evidence, index) => (
              <blockquote key={`${evidence.source}-${index}`}>
                <small>Source excerpt · not independently verified</small>
                {evidence.excerpt && <p>{evidence.excerpt}</p>}
                <small>
                  {[
                    evidence.source,
                    evidence.locator,
                    evidence.date,
                    evidence.audience,
                    evidence.context,
                    evidence.accessScope && `Access: ${evidence.accessScope}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </blockquote>
            ))}
            {finding.whyItMayMatter && (
              <>
                <b>Why it may matter · Agent interpretation</b>
                <p>{finding.whyItMayMatter}</p>
              </>
            )}
            {finding.whatComplicatesIt && (
              <>
                <b>What complicates it</b>
                <p>{finding.whatComplicatesIt}</p>
              </>
            )}
            {finding.questionToExplore && (
              <>
                <b>Question to explore</b>
                <p>{finding.questionToExplore}</p>
              </>
            )}
          </details>
        )}
      </article>
    </details>
  );
}

export default function DynamicInputPackDetails({
  pack,
  discovery,
}: {
  pack: StrategyInputPack;
  discovery: DiscoveryState;
}) {
  const presentation = dynamicPackPresentation(pack);
  const framing = selectedJtbdFraming(pack);
  const savedGroups = savedFindingsByLens(discovery);

  return (
    <div className="dynamic-pack-details">
      <section aria-label="Original Selected Context">
        <h3>Original Selected Context</h3>
        <dl className="studio-pack-summary">
          <dt>Campaign</dt>
          <dd>
            {campaignDisplayLabel(pack)}
            {pack.parentPlatform && (
              <p>
                Parent platform: {pack.parentPlatform.name} · Source:{" "}
                {pack.parentPlatform.sourceValue}
              </p>
            )}
          </dd>
          <dt>Campaign Objective</dt>
          <dd>
            {presentation.objectiveParts.length
              ? presentation.objectiveParts.map((part) => (
                  <section className="studio-objective-part" key={part.label}>
                    <strong>{part.label}</strong>
                    <p>{part.text.replace(/\s+/g, " ")}</p>
                  </section>
                ))
              : presentation.objective ||
                "Add a campaign objective in the IMC brief."}
          </dd>
          <dt>Target Audience</dt>
          <dd>
            {presentation.audience || "Add a target audience in the IMC brief."}
          </dd>
          <dt>JTBD</dt>
          <dd>
            <p className="studio-jtbd-value">
              {framing.text || "Generate a JTBD to continue."}
            </p>
            {framing.versionId && (
              <small>Selected version: {framing.versionId}</small>
            )}
            {pack.originalJTBD?.trim() && (
              <p>
                <strong>Original JTBD · from IMC brief</strong>
                <br />
                {pack.originalJTBD}
              </p>
            )}
            <h4 className="studio-strategic-context-title">
              Strategic Context
            </h4>
            <p>
              {presentation.strategicContext ||
                "Add campaign objective and audience context to establish the strategic opportunity."}
            </p>
          </dd>
          <dt>Reasons to Believe (RTBs)</dt>
          <dd>
            {presentation.rtbs.length ? (
              <ul>
                {presentation.rtbs.map((rtb, index) => (
                  <li key={index}>{rtb}</li>
                ))}
              </ul>
            ) : (
              "No RTBs available from the selected campaign."
            )}
          </dd>
          <dt>Data Points &amp; Research</dt>
          <dd>
            {presentation.research.length
              ? presentation.research.map((item) => (
                  <div className="studio-pack-research-item" key={item.id}>
                    <strong>
                      {item.category} · V{item.version - 1}
                    </strong>
                    <p>
                      {item.repeatsObjective
                        ? "Campaign objective — included in Campaign Objective above; not independent research."
                        : compactPackParagraphs(item.text)}
                    </p>
                    <small>
                      {item.status === "ai_synthesis"
                        ? "Brief-based synthesis · not externally verified"
                        : "Supplied evidence · not independently verified"}{" "}
                      · Source: {item.source} · Selected version:{" "}
                      {item.versionId}
                    </small>
                  </div>
                ))
              : "No data points selected."}
            <p>
              {pack.selectedResearchSources?.length
                ? pack.selectedResearchSources
                    .map((name) => `${name} · Not connected`)
                    .join("\n")
                : "No external source selected."}
            </p>
            <small>
              External research and data connections are not verified.
            </small>
          </dd>
          <dt>Sparks</dt>
          <dd>
            {pack.selectedSparks?.length
              ? pack.selectedSparks
                  .map((spark) =>
                    [
                      `${spark.title || spark.text} · V${spark.version - 1}`,
                      `Selected generation: ${spark.versionId}`,
                      spark.idea || spark.text,
                      `Grounding: ${spark.excerpt || spark.campaignGrounding || "Not supplied"}`,
                      `Rationale: ${spark.rationale || "Not supplied"}`,
                      `Hypothesis: ${spark.hypothesis || spark.hypothesisToValidate || "Not supplied"}`,
                    ].join("\n"),
                  )
                  .join("\n\n")
              : "No Sparks selected"}
          </dd>
        </dl>
        {!!(
          pack.jtbdContext?.proposed.length ||
          pack.reasonToBelieve.trim() ||
          pack.constraints.trim()
        ) && (
          <details className="dynamic-pack-additional-context">
            <summary>Additional campaign context</summary>
            <dl className="studio-pack-summary">
              {pack.jtbdContext?.proposed.length ? (
                <>
                  <dt>Supplied proposed JTBD · not approved</dt>
                  <dd>
                    {pack.jtbdContext.proposed
                      .map((record) => record.text)
                      .join("\n\n")}
                  </dd>
                </>
              ) : null}
              {pack.reasonToBelieve.trim() && (
                <>
                  <dt>Original RTB · GTM approval</dt>
                  <dd>{pack.rtbApprovalStatus ?? "unknown"}</dd>
                </>
              )}
              {pack.constraints.trim() && (
                <>
                  <dt>Constraints</dt>
                  <dd>{pack.constraints}</dd>
                </>
              )}
            </dl>
          </details>
        )}
      </section>
      {savedGroups.length > 0 && (
        <section
          className="dynamic-pack-saved-insights"
          aria-label="Saved Round Table Insights"
        >
          <h3>Saved Round Table Insights</h3>
          {savedGroups.map((group) => (
            <details className="dynamic-pack-agent-group" key={group.id}>
              <summary>
                <span>{agentNames[group.id]}</span>
                <small>
                  {group.findings.length} saved{" "}
                  {group.findings.length === 1 ? "finding" : "findings"}
                </small>
              </summary>
              <div>
                {group.findings.map((finding) => (
                  <SavedFindingDetails
                    key={discoveryFindingRef(finding)}
                    finding={finding}
                  />
                ))}
              </div>
            </details>
          ))}
        </section>
      )}
    </div>
  );
}
