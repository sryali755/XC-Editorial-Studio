import StrategyWorkspace from "@/components/StrategyWorkspace";
import { publicAIStatus } from "@/lib/ai/config";
export const dynamic = "force-dynamic";
export default function Page() {
  return <StrategyWorkspace aiStatus={publicAIStatus()} />;
}
