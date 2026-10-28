import { AdministrationStepFlow } from "@/components/administration/AdministrationStepFlow";
import { ClassContentGate } from "@/components/profile/ClassContentGate";
export default async function AdministrationStepPage({
  params,
}: {
  params: Promise<{ pathId: string; stepId: string }>;
}) {
  const { pathId, stepId } = await params;
  return (
    <ClassContentGate><AdministrationStepFlow pathId={Number(pathId)} stepId={Number(stepId)} /></ClassContentGate>
  );
}
