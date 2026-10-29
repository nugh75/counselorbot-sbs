import { PlanActivityFlow } from "@/components/profile/PlanActivityFlow";
import { ClassContentGate } from "@/components/profile/ClassContentGate";
export default async function ResultsDeepDivePage({
  params,
}: {
  params: Promise<{ pathId: string; stepId: string }>;
}) {
  const { pathId, stepId } = await params;
  return <ClassContentGate><PlanActivityFlow pathId={Number(pathId)} stepId={Number(stepId)} /></ClassContentGate>;
}
