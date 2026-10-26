import type {
  DiscoveryEvidenceReference,
  DiscoveryFinding,
  DiscoveryLensId,
} from "./types";

// Canonical persisted card contract. Existing UI/model field names remain
// readable for historical sessions; new runs also store this complete record.
export interface DiscoveryCardContract {
  id: string;
  version: number;
  lens: DiscoveryLensId;
  inputPackVersion: string;
  title: string;
  observedFinding: string;
  evidenceReferences: DiscoveryEvidenceReference[];
  interpretation: string;
  limitationsOrCounterevidence: string;
  nextQuestion: string;
  researchRunId: string;
  createdAt: string;
  updatedAt: string;
  evidenceState: "evidence_supported" | "research_gap";
  provider?: "mock" | "openai" | "writer";
}

export function discoveryCardContract(
  finding: DiscoveryFinding,
): DiscoveryCardContract {
  if (!finding.researchRunId || !finding.createdAt || !finding.updatedAt)
    throw new Error(
      "A Discovery card requires its research run and timestamps.",
    );
  return {
    id: finding.id,
    version: finding.version ?? finding.runVersion,
    lens: finding.lensId,
    inputPackVersion: finding.inputPackVersion,
    title: finding.title,
    observedFinding: finding.whatWeFound,
    evidenceReferences: structuredClone(finding.evidence),
    interpretation: finding.whyItMayMatter,
    limitationsOrCounterevidence: finding.whatComplicatesIt,
    nextQuestion: finding.questionToExplore,
    researchRunId: finding.researchRunId,
    createdAt: finding.createdAt,
    updatedAt: finding.updatedAt,
    evidenceState: finding.evidenceState,
    provider: finding.provider,
  };
}
