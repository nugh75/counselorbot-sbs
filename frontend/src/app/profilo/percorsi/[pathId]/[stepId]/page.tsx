import { AdministrationStepFlow } from "@/components/administration/AdministrationStepFlow";
export default async function AdministrationStepPage({
  params,
}: {
  params: Promise<{ pathId: string; stepId: string }>;
}) {
  const { pathId, stepId } = await params;
  return (
    <AdministrationStepFlow pathId={Number(pathId)} stepId={Number(stepId)} />
  );
}
