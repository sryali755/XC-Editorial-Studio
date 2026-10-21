import StrategyWorkspace from "@/components/StrategyWorkspace";
import InsightDiscoveryPortal from "@/components/InsightDiscoveryPortal";
import { publicAIStatus } from "@/lib/ai/config";
export const dynamic = "force-dynamic";
export default function CreativeArchive() {
  const status = publicAIStatus();
  return (
    <>
      <StrategyWorkspace aiStatus={status} />
      <InsightDiscoveryPortal aiMode={status.mode} />
    </>
  );
}
