import { phase1Fixture } from "./phase1-input-pack";
import { seedStudioDiscovery, studioPack } from "../../lib/discovery-studio";
import { discoveryLenses, inputPackVersion } from "../../lib/discovery";
import { discoveryFoundation } from "../../lib/discovery-context";
import { discoveryStorageKey } from "../../lib/discovery-persistence";
import { mockDiscovery } from "../../lib/ai/mock-discovery";
import { requestSchema } from "../../lib/ai/schemas";
import { LENS_CONTRACT_VERSION } from "../../lib/discovery-lens-quality";
import type {
  DiscoveryLensId,
  DiscoveryRunVersion,
  DiscoveryRetryRequest,
  StrategyInputPack,
} from "../../lib/types";

export function phase2Version(
  pack: StrategyInputPack,
  lensId: DiscoveryLensId,
  number: number,
  question: string,
): DiscoveryRunVersion {
  const response = mockDiscovery(
    requestSchema.parse({
      agentType: "discovery",
      context: {
        foundation: discoveryFoundation(pack),
        lens: lensId,
        investigationType: "problem",
        question,
        action: "initial",
        previousFindings: [],
      },
    }) as Parameters<typeof mockDiscovery>[0],
  );
  const id = `${lensId}-generation-${number}`;
  return {
    id,
    lensContractVersion: LENS_CONTRACT_VERSION,
    number,
    question,
    investigationType: "problem",
    action: "initial",
    guidance: `Synthetic offline steering ${number}`,
    createdAt: `2026-10-19T12:${String(number).padStart(2, "0")}:00.000Z`,
    inputPackVersion: inputPackVersion(pack),
    inputPackSnapshot: structuredClone(pack),
    sourceCoverage: [],
    provider: "mock",
    retrievalStatus: "supplied_only",
    retrievalNote: "Synthetic offline test. No external research retrieved.",
    findings: response.findings.map((finding, index) => ({
      ...finding,
      id: `${lensId}-finding-${index + 1}`,
      lensId,
      researchRunId: id,
      inputPackVersion: inputPackVersion(pack),
      runVersion: number,
      provider: "mock",
    })),
  };
}
export function phase2Fixture(
  file = "movers_source_text.txt",
  completed = true,
) {
  const { session } = phase1Fixture(file);
  session.screen = "discovery";
  const pack = studioPack(session),
    state = seedStudioDiscovery(pack);
  const question = file.startsWith("movers")
    ? "Why might existing movers leave rather than transfer service?"
    : "What might work-from-home customers need from Xfinity Pro?";
  state.question = question;
  state.focusByMode = { problem: question };
  if (completed)
    state.runs = discoveryLenses.map((lens) => {
      const count = lens.id === "consumer" ? 5 : 1;
      const versions = Array.from({ length: count }, (_, i) =>
        phase2Version(pack, lens.id, count - i, question),
      );
      return {
        lensId: lens.id,
        status: "complete",
        versions,
        currentVersionId: versions[0].id,
        thread: [],
      };
    });
  return { session, pack, state, question };
}
export function phase2Turn(
  pack: StrategyInputPack,
  question: string,
  n: number,
  operation: "generation" | "conversation" = "conversation",
  lensId: DiscoveryLensId = "consumer",
): DiscoveryRetryRequest {
  return {
    lensId,
    operation,
    action: operation === "generation" ? "refresh" : "explore_deeper",
    guidance: `Synthetic question ${n}`,
    turnId: `${lensId}-${operation}-${n}`,
    threadId: `${lensId}-${operation}`,
    campaignKey: discoveryStorageKey(pack),
    inputPackVersion: inputPackVersion(pack),
    question,
    investigationType: "problem",
    generationContextId:
      operation === "conversation" ? `${lensId}-generation-5` : undefined,
  };
}
