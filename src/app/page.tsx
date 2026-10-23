import ScenarioExplorer from "@/components/ScenarioExplorer";
import { SCENARIOS } from "@/lib/deadbolt/agent/simulator";
import type { ScenarioId } from "@/lib/deadbolt/agent/simulator";

export default function HomePage() {
  const scenarios = Object.entries(SCENARIOS).map(([id, scenario]) => ({
    id: id as ScenarioId, title: scenario.title, description: scenario.description,
  }));
  return <ScenarioExplorer scenarios={scenarios} />;
}
