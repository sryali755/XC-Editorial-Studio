import { inputPackVersion, knownDiscoveryFindings } from "./discovery";
import { discoveryFoundation } from "./discovery-context";
import {
  discoverySourceDocuments,
  locatedDiscoveryCitation,
} from "./discovery-sources";
import type {
  DiscoveryState,
  StrategyInputPack,
  WorkspaceStarterField,
} from "./types";

const present = (text = "") =>
  text.trim() &&
  !/^(?:not (?:supplied|provided|connected)|unknown|pending|none|n\/a)[.!]?$/i.test(
    text.trim(),
  );
const concise = (text: string, limit = 220) => {
  const value = text
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^(?:Customer|Prospect|Primary audience):\s*/i, "")
    .trim();
  return value.length <= limit
    ? value.replace(/[.!?]$/, "")
    : `${value.slice(0, limit).replace(/\s+\S*$/, "")}…`;
};
const missing = (label: string): WorkspaceStarterField => ({
  value: "",
  kind: "missing",
  label: `Needs validation · ${label}`,
});

// Deterministic draft proposals, not research or modifications of source facts.
// Called only during new-draft initialization / its first unopened selection review.
export function canvasPrefill(
  pack: StrategyInputPack,
  source: { insight: string; originalJob: string; message: string },
  initialFindings?: DiscoveryState,
): { insight: WorkspaceStarterField; job: WorkspaceStarterField } {
  const research = pack.selectedResearch ?? [];
  const usable = (text: string) =>
    present(text) &&
    !/\b(?:no .* (?:retrieved|supplied)|not connected|source needed|research gap)\b/i.test(
      text,
    );
  const selectedJob = research.find(
    (item) =>
      /^(?:proposed (?:xc )?jtbd|(?:xc )?jtbd adaptation|proposed job to be done)$/i.test(
        item.category.trim(),
      ) && usable(item.text),
  );
  const excluded =
    /^(?:campaign name|objectives?|audience|product information|illustrative assumptions|research to validate|evidence gaps|source notes|proposed (?:xc )?jtbd|(?:xc )?jtbd adaptation|proposed job to be done)$/i;
  const metadataOnly = new Set(
    [pack.objective, pack.audience, pack.campaignName].map((value) =>
      value.replace(/\s+/g, " ").trim().toLowerCase(),
    ),
  );
  const usefulInsight = (text: string) =>
    usable(text) &&
    !metadataOnly.has(text.replace(/\s+/g, " ").trim().toLowerCase());
  const selectedInsight =
    research.find(
      (item) =>
        item.category.trim().toUpperCase() === "AUDIENCE CONTEXT" &&
        usefulInsight(item.text),
    ) ??
    research.find(
      (item) =>
        !excluded.test(item.category.trim()) && usefulInsight(item.text),
    );

  const currentVersion = inputPackVersion(pack);
  const known = initialFindings && knownDiscoveryFindings(initialFindings);
  const sourceDocuments = initialFindings
    ? discoverySourceDocuments(discoveryFoundation(pack))
    : [];
  const saved = initialFindings?.savedFindingIds
    .map((ref) => known?.get(ref))
    .find(
      (finding) =>
        finding?.inputPackVersion === currentVersion &&
        finding.evidenceState === "evidence_supported" &&
        finding.evidence.length > 0 &&
        finding.evidence.every((evidence) =>
          Boolean(locatedDiscoveryCitation(sourceDocuments, evidence)),
        ),
    );
  const audience = present(pack.audience) ? concise(pack.audience) : "";
  const objective = present(pack.objective) ? concise(pack.objective) : "";
  const message = present(source.message) ? concise(source.message) : "";
  const topic = present(pack.product)
    ? concise(pack.product, 100)
    : present(pack.campaignName)
      ? concise(pack.campaignName, 100)
      : "";
  let insight = missing(
    "add audience and objective context to form an insight",
  );
  if (saved)
    insight = {
      value: saved.whatWeFound,
      kind: "interpretation",
      label: `Based on saved ${saved.lensId} finding: ${saved.title} · Suggested interpretation · Validate with research`,
    };
  else if (
    selectedInsight &&
    (selectedInsight.status === "supplied" || !usable(source.insight))
  )
    insight = {
      value: selectedInsight.text,
      kind: "selected",
      label: `From selected research · ${selectedInsight.source} · not validated`,
    };
  else if (usable(source.insight))
    insight = {
      value: source.insight,
      kind: "supplied",
      label: "From the IMC audience insight · not validated",
    };
  else if (audience && objective) {
    const hypothesis = pack.selectedSparks?.find((spark) =>
      present(spark.hypothesis || spark.hypothesisToValidate),
    );
    insight = {
      value: [
        /\bmov(?:ing|ers?)\b/i.test(audience) &&
        /transfer|connect|worry/i.test(message + objective)
          ? "A working hypothesis is that people want continuity while moving, yet arranging their connection may feel like another decision to manage. Investigate whether uncertainty about the transfer or setup, rather than the WiFi promise alone, gets in the way."
          : /stream|gam|work/i.test(message + audience) &&
              /equipment|device|feature/i.test(message + pack.reasonToBelieve)
            ? "A working hypothesis is that people want to protect the activity that matters now, yet a list of equipment or features may not show how it helps. Investigate which activity and trade-off matter to this audience."
            : "A working hypothesis is that the audience may want the promised benefit but remain unsure whether the offer fits their situation. Investigate that uncertainty before assuming the product promise is meaningful to them.",
        `The brief addresses ${concise(audience.split(/(?<=[.!?])\s+/)[0])}.`,
        message
          ? `Its proposed audience benefit is: ${message.split(/(?<=[.!?])\s+/)[0].replace(/[.!?]$/, "")}.`
          : "The strategic opportunity is to find the audience need behind the campaign objective, rather than treating that objective as a consumer insight.",
        hypothesis
          ? `A selected Spark raises this hypothesis to test: ${concise(hypothesis.hypothesis || hypothesis.hypothesisToValidate || "")}.`
          : "",
        "Use that evidence to choose one benefit that can advance the campaign objective.",
      ]
        .filter(Boolean)
        .join(" "),
      kind: "interpretation",
      label: `Suggested interpretation · Validate with research · IMC objective and audience${message ? ", key message" : ""}${hypothesis ? ", selected Spark" : ""}`,
    };
  }

  let job = missing("add audience needs or a supplied JTBD");
  if (pack.proposedJTBD?.trim())
    job = {
      value: pack.proposedJTBD,
      kind: "selected",
      label:
        "Selected agent-proposed V0 JTBD · not original or approved · Validate",
    };
  else if (selectedJob)
    job = {
      value: selectedJob.text,
      kind: "selected",
      label: `From selected proposed JTBD · ${selectedJob.source} · not approved`,
    };
  else if (present(source.originalJob))
    job = {
      value: source.originalJob,
      kind: "supplied",
      label: "Original JTBD from the IMC brief · approval not established",
    };
  else if (audience && objective && (message || topic)) {
    // Derive the situation/benefit from actual source wording, not a campaign-name switch.
    const audienceSituation = /\bwho (?:are|is) ([^.]+)/i.exec(audience)?.[1];
    const activities = /\bwith an emphasis (?:upon|on) ([^.]+)/i
      .exec(audience)?.[1]
      .replace(/\s+audiences?$/i, "");
    const situation = audienceSituation
      ? `I am ${audienceSituation}`
      : activities
        ? `I am ${activities.replace(/work-from-home/gi, "working from home").replace(/\band\b/gi, "or")}`
        : `I consider ${topic || "the offer described in this brief"}`;
    const messageSentences = message.split(/(?<=[.!?])\s+/);
    const benefit = message
      ? (/^one less thing/i.test(messageSentences[0]) && messageSentences[1]
          ? messageSentences[1]
          : messageSentences[0]
        )
          .replace(/\byour\b/gi, "my")
          .replace(/\bour best\b/gi, "the available")
          .replace(/\bour\b/gi, "the")
          .replace(/\byou're\b/gi, "I am")
          .replace(/\byou've\b/gi, "I have")
          .replace(/\byou\b/gi, "I")
          .replace(/^I (?:can|will|should|need to)\s+/i, "")
          .replace(/[.!?]$/, "")
          .replace(/\s+and stay connected to what I love$/i, "")
      : `understand how ${topic} fits my needs`;
    const outcome = /stay connected to what you love/i.test(message)
      ? "stay connected to what I love"
      : activities
        ? "focus on the activity that matters most to me"
        : "make a confident choice for my situation";
    job = {
      value: `When ${situation}, I want ${/^(?:to\b|one\b|a\b|an\b)/i.test(benefit) ? "" : "to "}${benefit[0].toLowerCase()}${benefit.slice(1)}, so I can ${outcome}.`,
      kind: "interpretation",
      label: `Proposed V0 JTBD · not original or approved · From IMC audience${message ? " and key message" : " and campaign objective"} · Validate`,
    };
  }
  return { insight, job };
}
