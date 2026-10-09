import { ResultsDeepDiveFlow } from "@/components/administration/ResultsDeepDiveFlow";
export default async function ResultsDeepDivePage({
  params,
}: {
  params: Promise<{ pathId: string; stepId: string }>;
}) {
  const { pathId, stepId } = await params;
  return <ResultsDeepDiveFlow pathId={Number(pathId)} stepId={Number(stepId)} />;
}
