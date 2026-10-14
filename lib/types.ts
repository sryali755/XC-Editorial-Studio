import type { AgentData, AgentResponse, AgentDataMap } from "./ai/schemas";
import type { GenerationRecord } from "./ai/schemas";
import type { PersonalitySettings } from "./creative-controls";
export interface GenerationMetadata {
  promptTemplateVersion?: string;
  promptVersion?: string;
  generation?: GenerationRecord;
  provider?: "mock" | "openai" | "manual";
  model?: string;
  generatedAt?: string;
  data?: AgentData;
}
export type SparkTerritoryType =
  | "human_truth"
  | "social_cultural"
  | "category_convention"
  | "product_truth"
  | "moment"
  | "wildcard";
export interface StrategyInputPack {
  selectedSparks?: {
    id: string;
    text: string;
    title?: string;
    rationale?: string;
    campaignGrounding?: string;
    hypothesisToValidate?: string;
    territory_type?: SparkTerritoryType;
    territory?: string;
    idea?: string;
    excerpt?: string;
    hypothesis?: string;
    excerpt_verified?: boolean;
    versionId: string;
    version: number;
  }[];
  parsedIMC?: ParsedIMCBrief;
  upstream?: UpstreamContext;
  proposedRTB?: string;
  rtbApprovalStatus?: RtbApprovalStatus;
  researchFocus?: string;
  preparationSource?: string;
  reasonToBelieve: string;
  research: string;
  sparks: string;
  campaignName: string;
  objective: string;
  audience: string;
  product: string;
  channel: string;
  constraints: string;
}
export interface AgentPersona {
  id: string;
  name: string;
  role: string;
  thinking: string;
  color: string;
  icon: string;
}
export interface AgentVersion extends GenerationMetadata {
  id: string;
  number: number;
  text: string;
  guidance: string;
  createdAt: string;
}
export interface AgentOutput {
  refinementMode?: "explore" | "improve";
  personality?: PersonalitySettings;
  steeringText?: string;
  error?: string;
  agentId: string;
  versions: AgentVersion[];
  currentVersionId: string;
}
export interface SelectedBriefLine {
  id: string;
  agentId: string;
  personaName: string;
  version: number;
  text: string;
}
export interface SynthesisRequest {
  strategyInputPack: StrategyInputPack;
  lines: SelectedBriefLine[];
  weights: Record<string, number>;
}
export interface ApprovedStrategy {
  approvalState?: "Approved";
  sourcePerspectives?: SelectedBriefLine[];
  briefLine: string;
  strategyInputPack: StrategyInputPack;
  approvedAt: string;
  approvedBy: "Kevin";
  source: string;
}
export interface ExecutionDirection {
  creativeDirection?: string;
  requiredAssets: string;
  assetCount: number;
  channels: string;
  placements: string;
  desktop: string;
  mobile: string;
  messaging: string;
  copy: string;
  formats: string;
  timing: string;
  constraints: string;
}
export interface GeneratedBrief extends GenerationMetadata {
  id: string;
  createdAt: string;
  campaign: string;
  sections: { title: string; content: string }[];
  mock: boolean;
}
export interface BriefPayload {
  strategyInputPack: StrategyInputPack;
  approvedBriefLine: ApprovedStrategy;
  executionDirection: ExecutionDirection;
}

export type DiscoveryLensId =
  "consumer" | "culture" | "category" | "brand" | "analogous";
export type DiscoverySourceStatus =
  | "connected_searched"
  | "available_not_searched"
  | "not_connected"
  | "search_failed"
  | "insufficient_evidence";
export type DiscoveryAction =
  | "initial"
  | "explore_deeper"
  | "find_contrary"
  | "separate_audience"
  | "check_recency"
  | "compare_input"
  | "ask_another_lens"
  | "refresh";
export interface DiscoverySourceCoverage {
  source: string;
  status: DiscoverySourceStatus;
  detail: string;
}
export interface DiscoveryEvidenceReference {
  source: string;
  locator?: string;
  excerpt: string;
  date: string;
  audience: string;
  context: string;
  accessScope: "supplied" | "connected" | "restricted";
}
export interface DiscoveryFinding {
  id: string;
  researchRunId?: string;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  title: string;
  whatWeFound: string;
  evidence: DiscoveryEvidenceReference[];
  whyItMayMatter: string;
  whatComplicatesIt: string;
  questionToExplore: string;
  evidenceState: "evidence_supported" | "research_gap";
  lensId: DiscoveryLensId;
  inputPackVersion: string;
  runVersion: number;
}
export interface DiscoveryThreadMessage {
  id: string;
  author: "Kevin" | "Agent";
  text: string;
  createdAt: string;
  action?: DiscoveryAction;
  usedNewRetrieval?: boolean;
}
export interface DiscoveryRunVersion {
  id: string;
  number: number;
  question: string;
  investigationType: "problem" | "hypothesis";
  action: DiscoveryAction;
  guidance: string;
  createdAt: string;
  inputPackVersion: string;
  findings: DiscoveryFinding[];
  sourceCoverage: DiscoverySourceCoverage[];
  provider?: "mock" | "openai";
  model?: string;
}
export interface DiscoveryLensRun {
  lensId: DiscoveryLensId;
  status: "idle" | "researching" | "complete" | "failed";
  versions: DiscoveryRunVersion[];
  currentVersionId: string;
  thread: DiscoveryThreadMessage[];
  error?: string;
}
export interface DiscoveryConnectionNote {
  id: string;
  findingIds: string[];
  findingVersions: { findingId: string; runVersion: number }[];
  relationships: string[];
  tensions: string[];
  questions: string[];
  note: string;
  createdAt: string;
  editedByKevin: boolean;
}
export interface DiscoveryState {
  investigationType: "problem" | "hypothesis";
  problemStatement?: string;
  evidenceInsights?: string;
  question: string;
  contextVersion: string;
  selectedLensId: DiscoveryLensId;
  runs: DiscoveryLensRun[];
  savedFindingIds: string[];
  selectedFindingIds: string[];
  findingThreads: Record<string, DiscoveryThreadMessage[]>;
  connectionNotes: DiscoveryConnectionNote[];
  notes: string;
  hypothesis: string;
  strategicDirection?: string;
  humanBriefLine?: string;
  openQuestions: string;
}
export interface StrategySession {
  synthesisResults?: AgentResponse<AgentDataMap["synthesis"]>[];
  executionSourcePack?: StrategyInputPack;
  finalSourceLines?: SelectedBriefLine[];
  synthesisSources?: SelectedBriefLine[][];
  preparation: PreparationState;
  step: number;
  pack: StrategyInputPack;
  sharedPack: StrategyInputPack | null;
  outputs: AgentOutput[];
  selected: SelectedBriefLine[];
  synthesis: string[];
  finalLine: string;
  finalSource: string;
  approved: ApprovedStrategy | null;
  execution: ExecutionDirection;
  brief: GeneratedBrief | null;
  discovery?: DiscoveryState;
}

export type PreparationAgentId = "reasonToBelieve" | "research" | "sparks";
export type RtbApprovalStatus =
  "approved" | "not_approved" | "pending" | "unknown";
export interface PreparationSelectedContent {
  reasonToBelieve?: { versionId: string; version: number; text: string };
  research?: { versionId: string; version: number; text: string };
  selectedSparks: {
    id: string;
    versionId: string;
    version: number;
    title?: string;
    text: string;
    rationale?: string;
    campaignGrounding?: string;
    hypothesisToValidate?: string;
    territory_type?: SparkTerritoryType;
    territory?: string;
    idea?: string;
    excerpt?: string;
    hypothesis?: string;
    excerpt_verified?: boolean;
  }[];
}
export interface PreparationVersion extends AgentVersion {
  inputContext?: {
    sourceBrief: string;
    selectedContent: PreparationSelectedContent;
    steeringText: string;
  };
  sourceBrief: string;
  sparks: {
    id: string;
    text: string;
    title?: string;
    rationale?: string;
    campaignGrounding?: string;
    hypothesisToValidate?: string;
    territory_type?: SparkTerritoryType;
    territory?: string;
    idea?: string;
    excerpt?: string;
    hypothesis?: string;
    excerpt_verified?: boolean;
  }[];
}
export interface PreparationOutput {
  retryRequest?: {
    guidance: string;
    targetId?: string;
    intent: "explore" | "improve";
  };
  error?: string;
  errorCode?: string;
  retryable?: boolean;
  status?: "idle" | "pending" | "success" | "failed" | "mock";
  guidance?: string;
  agentId: PreparationAgentId;
  versions: PreparationVersion[];
  currentVersionId: string;
}
export interface InputPackSnapshot {
  savedAt: string;
  sourceBrief: string;
  pack: StrategyInputPack;
  versions: Record<PreparationAgentId, { id: string; number: number }>;
}
export interface PreparationState {
  keptSparkIds?: string[];
  packCandidates?: Partial<Record<"A" | "B", InputPackSnapshot>>;
  reviewedPack?: InputPackSnapshot;
  selectionNotice?: string;
  parsedIMC?: ParsedIMCBrief;
  upstream?: UpstreamContext;
  upstreamDraft: string;
  sourceSnapshot: string;
  outputs: PreparationOutput[];
  selectedSparkIds: string[];
  focus: string;
  context: Pick<
    StrategyInputPack,
    | "campaignName"
    | "objective"
    | "audience"
    | "product"
    | "channel"
    | "constraints"
  >;
}

export type UpstreamKey =
  | "campaignName"
  | "objective"
  | "audience"
  | "product"
  | "channel"
  | "constraints"
  | "research"
  | "originalRTB"
  | "gtmApprovedRTB"
  | "rtbApproval"
  | "brandMessaging"
  | "messagingApproval"
  | "messageHierarchy"
  | "brandGuidelines"
  | "briefType"
  | "campaignTier"
  | "kpis"
  | "learningAgenda"
  | "journeyDestinations"
  | "milestones"
  | "eligibility"
  | "exclusions"
  | "substantiation"
  | "disclaimers"
  | "partnerApproval"
  | "sourceVersion"
  | "upstreamApproval"
  | "sourceReferences";
export interface SourceField {
  value: string;
  sourceValue: string;
  status:
    | "Supplied"
    | "Not supplied"
    | "Intentionally excluded"
    | "Needs clarification";
  note: string;
}
export interface UpstreamContext {
  fields: Record<UpstreamKey, SourceField>;
}

export type IMCFieldKey =
  | "campaign"
  | "objective"
  | "audience"
  | "product"
  | "channels"
  | "constraints"
  | "reason_to_believe"
  | "research"
  | "brief_type"
  | "campaign_tier"
  | "kpis"
  | "brand_messaging"
  | "messaging_approval"
  | "message_hierarchy"
  | "brand_guidelines"
  | "eligibility"
  | "exclusions"
  | "substantiation"
  | "disclaimers";
export interface ParsedIMCField {
  readonly value: string;
  readonly sourceValue: string;
  readonly status: "Supplied" | "Intentionally excluded" | "Not supplied";
  readonly note: string;
  readonly present: boolean;
  readonly occurrences: readonly string[];
}
export interface ParsedIMCBrief {
  readonly schemaVersion: 1;
  readonly parserVersion?: number;
  readonly sourceText: string;
  readonly fields: Readonly<Record<IMCFieldKey, ParsedIMCField>>;
  readonly supplemental: Readonly<
    Partial<Record<UpstreamKey | "brand", ParsedIMCField>>
  >;
}
