import StrategyWorkspace from "@/components/StrategyWorkspace";
import InsightDiscoveryStudio from "@/components/InsightDiscoveryStudio";
import { publicAIStatus } from "@/lib/ai/config";
import { developmentServerEpoch } from "@/lib/development-server-epoch";
import "./discovery-v2.css";
import "./studio-wireframe.css";
import "./team-discussion.css";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "XC · Strategy Studio",
  description:
    "Input Pack, Insight Discovery, human-led strategy and XC Brief.",
};
export default function Page() {
  const aiStatus = publicAIStatus();
  if (process.env.NEXT_PUBLIC_INSIGHT_DISCOVERY !== "false")
    return (
      <InsightDiscoveryStudio
        aiStatus={aiStatus}
        serverEpoch={developmentServerEpoch()}
      />
    );
  return <StrategyWorkspace aiStatus={aiStatus} />;
}
