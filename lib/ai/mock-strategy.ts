import { carryUpstream } from "../upstream";
import { personas } from "../demo";
import type {
  AgentOutput,
  AgentPersona,
  AgentVersion,
  BriefPayload,
  GeneratedBrief,
  StrategyInputPack,
  SynthesisRequest,
} from "../types";
const wait = () => new Promise((resolve) => setTimeout(resolve, 650));
const lines: Record<string, string[]> = {
  humor: [
    "Less buffering. More main-character energy.",
    "Your home has enough drama. Your connection shouldn’t.",
    "Big plans. Small screens. Zero room for a plot twist.",
    "Let life be unpredictable. Not your connection.",
  ],
  culture: [
    "For all the worlds under one roof.",
    "Together looks different in every room.",
    "Life happens everywhere. Connection brings it home.",
    "One home. A thousand ways to belong.",
  ],
  audience: [
    "More time living. Less time thinking about your connection.",
    "A connection that makes room for your kind of life.",
    "Keep the everyday moving, on your terms.",
    "Feel at home in every connected moment.",
  ],
  market: [
    "Beyond connected devices. A connected life.",
    "Make everyday possibility the real measure of connection.",
    "A better connection starts with what it makes possible.",
    "The difference isn’t just online. It’s in your everyday.",
  ],
  brand: [
    "A connection you count on. A life you make your own.",
    "Keep what matters connected.",
    "Built around the moments that make a home.",
    "Move life forward, one connection at a time.",
  ],
};
function candidate(
  persona: AgentPersona,
  pack: StrategyInputPack,
  number: number,
  guidance = "",
) {
  const pool = lines[persona.id];
  let index = number % pool.length;
  if (/playful|funny|wit/i.test(guidance)) index = 1;
  if (/short|concise/i.test(guidance))
    return `${pack.product || "Your connection"}. More life.`;
  return (
    pool[index] +
    (number >= pool.length ? ` ${pack.campaignName || "Life, connected"}.` : "")
  );
}
export interface StrategyService {
  generatePerspectives(pack: StrategyInputPack): Promise<AgentOutput[]>;
  refine(
    persona: AgentPersona,
    pack: StrategyInputPack,
    versions: AgentVersion[],
    guidance: string,
  ): Promise<AgentVersion>;
  synthesize(request: SynthesisRequest): Promise<string>;
}
// Deterministic demo copy, not live AI. Replace this adapter with approved persona services later.
export const mockStrategyService: StrategyService = {
  async generatePerspectives(pack) {
    await wait();
    return personas.map((p) => {
      const v = {
        id: crypto.randomUUID(),
        number: 0,
        text: candidate(p, pack, 0),
        guidance: "Initial perspective",
        createdAt: new Date().toISOString(),
      };
      return { agentId: p.id, versions: [v], currentVersionId: v.id };
    });
  },
  async refine(persona, pack, versions, guidance) {
    await wait();
    const number = Math.max(...versions.map((v) => v.number)) + 1;
    return {
      id: crypto.randomUUID(),
      number,
      text: candidate(persona, pack, number, guidance),
      guidance,
      createdAt: new Date().toISOString(),
    };
  },
  async synthesize({ lines: selected, weights }) {
    await wait();
    const ranked = [...selected].sort(
      (a, b) => (weights[b.id] ?? 50) - (weights[a.id] ?? 50),
    );
    return `${ranked[0].text.replace(/[.!?]$/, "")} — ${ranked[1].text.charAt(0).toLowerCase() + ranked[1].text.slice(1)}`;
  },
};
export interface BriefService {
  generateXCBrief(payload: BriefPayload): Promise<GeneratedBrief>;
}
export const mockBriefService: BriefService = {
  async generateXCBrief({
    strategyInputPack: p,
    approvedBriefLine: a,
    executionDirection: e,
  }) {
    if (!a.approvedAt || !a.briefLine.trim() || a.approvedBy !== "Kevin")
      throw new Error("Explicit strategy approval is required.");
    await wait();
    return {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      campaign: p.campaignName || "Untitled campaign",
      mock: true,
      sections: [
        { title: "Campaign", content: p.campaignName },
        { title: "Objective", content: p.objective },
        { title: "Approved Brief Line", content: a.briefLine },
        { title: "Original upstream RTB", content: p.reasonToBelieve },
        {
          title: "Proposed XC adaptation — not upstream-approved",
          content: p.proposedRTB || "No separate adaptation recorded.",
        },
        ...carryUpstream(p),
        { title: "Audience", content: p.audience },
        { title: "Messaging Direction", content: e.messaging },
        {
          title: "Creative Direction",
          content: e.creativeDirection || "Not supplied.",
        },
        {
          title: "Required Assets",
          content: `${e.assetCount} assets — ${e.requiredAssets}`,
        },
        { title: "Web Deliverables", content: e.desktop },
        { title: "Mobile Deliverables", content: e.mobile },
        { title: "Channels", content: e.channels },
        { title: "Placement", content: e.placements },
        { title: "Copy Requirements", content: e.copy },
        {
          title: "Specifications / Constraints",
          content: `${e.formats}\n${e.constraints}\n${p.constraints}`,
        },
        { title: "Timing", content: e.timing },
        {
          title: "Approval Notes",
          content: `Strategy explicitly approved by ${a.approvedBy} at ${a.approvedAt}.\nSource: ${a.source}\nUpstream claims, messaging and partner approvals retain their recorded statuses. XC proposals remain unapproved.`,
        },
        { title: "Supporting Data & Research", content: p.research },
        { title: "Strategic Sparks", content: p.sparks },
        {
          title: "Research Emphasis / Additional Direction",
          content: p.researchFocus || "No additional emphasis supplied.",
        },
      ],
    };
  },
};
// TODO: Invoke the approved Writer Playbook/API through a server-side adapter here.
// Confirm invocation, auth, XC template, job status and artifact/PDF return contract.
// Keep credentials server-side. The same Playbook must remain runnable within Writer.
// No Writer endpoint or API contract is assumed by this prototype.
export const generateXCBrief = (payload: BriefPayload) =>
  mockBriefService.generateXCBrief(payload);
