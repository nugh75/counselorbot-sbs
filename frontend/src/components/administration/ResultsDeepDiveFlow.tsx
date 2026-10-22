"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch, getIdentity } from "@/lib/auth";
import { useI18n } from "@/lib/i18n-context";
import { administrationStepText } from "@/lib/i18n-administration-steps";
import { resultsChatText } from "@/lib/i18n-results-chats";
import {
  ResultsDeepDiveError, loadResultsDeepDiveOptions, startResultsDeepDive,
  type ResultsDeepDiveFailure, type ResultsDeepDiveOptions, type ResultsDeepDiveSession,
} from "@/lib/results-deep-dive";
import { deleteFrozenSession, getFrozenSession, type FrozenSessionDetail } from '@/lib/frozen-session';
import { getSelectedCounselorId } from "@/lib/counselor";
import { GuidedChatInterface } from "@/components/qsa/GuidedChatInterface";
import { PlanChatCompleted } from "@/components/administration/PlanChatCompleted";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Callout } from "@/components/ui/Callout";

export function ResultsDeepDiveFlow({ pathId, stepId }: { pathId: number; stepId: number }) {
  const { lang } = useI18n();
  const l = (key: Parameters<typeof administrationStepText>[1]) => administrationStepText(lang, key);
  const r = (key: Parameters<typeof resultsChatText>[1]) => resultsChatText(lang, key);
  const [session, setSession] = useState<ResultsDeepDiveSession | null>(null);
  const [snapshot, setSnapshot] = useState<FrozenSessionDetail | null>(null);
  const [options, setOptions] = useState<ResultsDeepDiveOptions | null>(null);
  const [resultId, setResultId] = useState('');
  const [failure, setFailure] = useState<ResultsDeepDiveFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [completed, setCompleted] = useState(false);
  const owner = useRef<string | null>(null);
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    setLoading(true); setOptions(null); setSession(null); setSnapshot(null); setFailure(null); setResultId('');
    void (async () => {
      try {
        const identity = await getIdentity();
        if (!identity?.username) throw new ResultsDeepDiveError('error');
        owner.current ??= identity.username;
        if (owner.current !== identity.username) throw new ResultsDeepDiveError('error');
        const next = await loadResultsDeepDiveOptions(apiFetch, pathId, stepId);
        const frozen = next.session ? await getFrozenSession(next.session.session_id) : null;
        if (frozen && (frozen.session_id !== next.session?.session_id || frozen.questionnaire_type !== next.session.result.questionnaire_type)) throw new ResultsDeepDiveError('error');
        if (active && owner.current === (await getIdentity())?.username) {
          setOptions(next); setSnapshot(frozen); setSession(next.session);
        }
      } catch { if (active) setFailure('error'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [pathId, stepId, reload]);
  const start = async () => {
    if (pending.current || !options) return;
    pending.current = true; setBusy(true); setFailure(null);
    try {
      if (owner.current !== (await getIdentity())?.username) throw new ResultsDeepDiveError('error');
      const started = await startResultsDeepDive(apiFetch, pathId, stepId, options.personal ? Number(resultId) : undefined);
      const frozen = await getFrozenSession(started.session_id);
      if (frozen && (frozen.session_id !== started.session_id || frozen.questionnaire_type !== started.result.questionnaire_type)) throw new ResultsDeepDiveError('error');
      if (owner.current === (await getIdentity())?.username) {setSnapshot(frozen);setSession(started);}
    } catch (error) {
      setFailure(error instanceof ResultsDeepDiveError ? error.reason : 'error');
    } finally { pending.current = false; setBusy(false); }
  };
  // Finished and no pause left to resume: the step reopens on its final choices.
  if (session && (completed || (options?.completed && !snapshot))) return <PlanChatCompleted sessionId={session.session_id} questionnaireType={session.result.questionnaire_type} />;
  if (session) return <GuidedChatInterface
    scores={session.result.scores} questionnaireType={session.result.questionnaire_type}
    sessionId={session.session_id} counselorId={snapshot?.counselor_id ?? getSelectedCounselorId()} locale={snapshot?.locale || lang}
    frozenSnapshot={snapshot}
    onComplete={() => { setCompleted(true); void deleteFrozenSession(session.session_id).catch(() => {}); }} />;
  return <div className="space-y-4">
    <Link href="/profilo/piani-operativi">{l('back')}</Link>
    <h1 className="text-xl font-semibold">{l('deepDive')}</h1>
    {loading && <p role="status">{r('loading')}</p>}
    {failure === 'incomplete' && <Callout variant="warning">{r('missingPlan')}</Callout>}
    {failure && failure !== 'incomplete' && <Callout variant="danger">{l('error')}{' '}
      <Button variant="secondary" onClick={() => setReload(value => value + 1)}>{l('retry')}</Button></Callout>}
    {options && <Card className="space-y-3 p-4">
      <p>{r('intro')}</p>
      {!options.ready ? <>
        <Callout variant="warning">{r(options.personal ? 'missingPersonal' : 'missingPlan')}</Callout>
        <Link className="inline-flex min-h-[44px] items-center font-semibold text-indigo-700 underline" href={options.source_href}>
          {r(options.personal ? 'addResult' : 'completeSource')}</Link>
      </> : <>
        {options.personal && <label className="block text-sm">{r('chooseResult')}
          <select className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" value={resultId}
            onChange={event => setResultId(event.target.value)} disabled={busy}>
            <option value="">{r('chooseResult')}</option>
            {options.results.map(result => <option key={result.id} value={result.id}>
              {[new Date(result.submitted_at).toLocaleString(lang), result.locale.toUpperCase(), `#${result.id}`].filter(Boolean).join(' · ')}
            </option>)}
          </select></label>}
        <Button disabled={busy || (options.personal && !resultId)} onClick={() => void start()}>{l('deepDiveStart')}</Button>
      </>}
    </Card>}
  </div>;
}
