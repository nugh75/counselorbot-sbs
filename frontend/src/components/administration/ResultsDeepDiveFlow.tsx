"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, getIdentity } from "@/lib/auth";
import { useI18n } from "@/lib/i18n-context";
import { administrationStepText } from "@/lib/i18n-administration-steps";
import {
  ResultsDeepDiveError,
  startResultsDeepDive,
  type ResultsDeepDiveFailure,
  type ResultsDeepDiveSession,
} from "@/lib/results-deep-dive";
import { getSelectedCounselorId } from "@/lib/counselor";
import { GuidedChatInterface } from "@/components/qsa/GuidedChatInterface";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Callout } from "@/components/ui/Callout";

export function ResultsDeepDiveFlow({
  pathId,
  stepId,
}: {
  pathId: number;
  stepId: number;
}) {
  const { lang } = useI18n();
  const router = useRouter();
  const l = (key: Parameters<typeof administrationStepText>[1]) =>
    administrationStepText(lang, key);
  const [session, setSession] = useState<ResultsDeepDiveSession | null>(null);
  const [failure, setFailure] = useState<ResultsDeepDiveFailure | null>(null);
  const [busy, setBusy] = useState(false);
  // The bound session belongs to the account that started it.
  const owner = useRef<string | null>(null);
  const start = async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const identity = await getIdentity();
      if (!identity?.username) throw new ResultsDeepDiveError("error");
      owner.current ??= identity.username;
      if (owner.current !== identity.username)
        throw new ResultsDeepDiveError("error");
      const started = await startResultsDeepDive(apiFetch, pathId, stepId);
      if (owner.current === (await getIdentity())?.username) setSession(started);
    } catch (error) {
      setFailure(error instanceof ResultsDeepDiveError ? error.reason : "error");
    } finally {
      setBusy(false);
    }
  };
  if (session)
    return (
      <GuidedChatInterface
        scores={session.result.scores}
        questionnaireType={session.result.questionnaire_type}
        sessionId={session.session_id}
        counselorId={getSelectedCounselorId()}
        locale={lang}
        onComplete={() => router.push("/profilo/percorsi")}
      />
    );
  return (
    <div className="space-y-4">
      <Link href="/profilo/percorsi">{l("back")}</Link>
      <h1 className="text-xl font-semibold">{l("deepDive")}</h1>
      {failure === "incomplete" && (
        <Callout variant="warning">{l("deepDiveIncomplete")}</Callout>
      )}
      {failure && failure !== "incomplete" && (
        <Callout variant="danger">{l("error")}</Callout>
      )}
      <Card className="space-y-3 p-4">
        <p>{l("deepDiveIntro")}</p>
        <Button disabled={busy} onClick={() => void start()}>
          {failure === "error" ? l("retry") : l("deepDiveStart")}
        </Button>
      </Card>
    </div>
  );
}
