import { ResultsDeepDiveFlow } from "@/components/administration/ResultsDeepDiveFlow";
import { ClassContentGate } from "@/components/profile/ClassContentGate";
export default async function ResultsDeepDivePage({
  params,
}: {
  params: Promise<{ pathId: string; stepId: string }>;
}) {
  const { pathId, stepId } = await params;
  return <ClassContentGate><ResultsDeepDiveFlow pathId={Number(pathId)} stepId={Number(stepId)} /></ClassContentGate>;
}
