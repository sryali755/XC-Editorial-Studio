export interface StrategyInputPack {
  parsedIMC?: ParsedIMCBrief;
  upstream?: UpstreamContext;
  proposedRTB?: string;
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
export interface AgentVersion {
  id: string;
  number: number;
  text: string;
  guidance: string;
  createdAt: string;
}
export interface AgentOutput {
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
  briefLine: string;
  strategyInputPack: StrategyInputPack;
  approvedAt: string;
  approvedBy: "Kevin";
  source: string;
}
export interface ExecutionDirection {
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
export interface GeneratedBrief {
  id: string;
  createdAt: string;
  campaign: string;
  sections: { title: string; content: string }[];
  mock: true;
}
export interface BriefPayload {
  strategyInputPack: StrategyInputPack;
  approvedBriefLine: ApprovedStrategy;
  executionDirection: ExecutionDirection;
}
export interface StrategySession {
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
}

export type PreparationAgentId = "reasonToBelieve" | "research" | "sparks";
export interface PreparationVersion extends AgentVersion {
  sourceBrief: string;
  sparks: { id: string; text: string }[];
}
export interface PreparationOutput {
  agentId: PreparationAgentId;
  versions: PreparationVersion[];
  currentVersionId: string;
}
export interface PreparationState {
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
  readonly sourceText: string;
  readonly fields: Readonly<Record<IMCFieldKey, ParsedIMCField>>;
  readonly supplemental: Readonly<Partial<Record<UpstreamKey, ParsedIMCField>>>;
}
