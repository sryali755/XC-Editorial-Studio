import StrategyWorkspace from "@/components/StrategyWorkspace";
import InsightDiscoveryPortal from "@/components/InsightDiscoveryPortal";
import { publicAIStatus } from "@/lib/ai/config";
export const dynamic = "force-dynamic";
export default function Page() {
  const aiStatus = publicAIStatus();
  const insightDiscoveryEnabled =
    process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY === "true";
  return (
    <>
      <StrategyWorkspace aiStatus={aiStatus} />
      {insightDiscoveryEnabled && (
        <InsightDiscoveryPortal aiMode={aiStatus.mode} />
      )}
    </>
  );
}
