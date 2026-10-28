"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, getIdentity } from "@/lib/auth";
import { useI18n } from "@/lib/i18n-context";
import { administrationStepText } from "@/lib/i18n-administration-steps";
import { resultsChatText } from "@/lib/i18n-results-chats";
import {
  ResultsDeepDiveError, loadResultsDeepDiveOptions, startResultsDeepDive,
  type ResultsDeepDiveFailure, type ResultsDeepDiveOptions, type ResultsDeepDiveSession,
} from "@/lib/results-deep-dive";
import { deleteFrozenSession, getFrozenSession, FrozenSessionAccessError, type FrozenSessionDetail } from '@/lib/frozen-session';
import { getSelectedCounselorId } from "@/lib/counselor";
import { GuidedChatInterface } from "@/components/qsa/GuidedChatInterface";
import { PlanChatCompleted } from "@/components/administration/PlanChatCompleted";
import { SessionReport } from "@/components/qsa/SessionReport";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Callout } from "@/components/ui/Callout";

export function ResultsDeepDiveFlow({ pathId, stepId }: { pathId: number; stepId: number }) {
  const router = useRouter();
  const { lang, t } = useI18n();
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
  const attemptId = useRef<string | null>(null);
  const saveAttempt = useRef<(() => Promise<void>) | null>(null);
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
        // Keep the source action available even when loading the saved chat fails.
        if (active && owner.current === (await getIdentity())?.username) setOptions(next);
        let selected = next.session;
        const key = `deep-dive-attempt:${identity.username}:${pathId}:${stepId}`;
        if (active && selected && new URLSearchParams(window.location.search).get('attempt') === 'new') {
          setSession(selected);
          attemptId.current = sessionStorage.getItem(key) || crypto.randomUUID();
          sessionStorage.setItem(key, attemptId.current);
          selected = await startResultsDeepDive(apiFetch, pathId, stepId, next.personal ? selected.result.id : undefined, attemptId.current);
          sessionStorage.removeItem(key);
          attemptId.current = null;
          window.history.replaceState(window.history.state, '', window.location.pathname);
          next.session = selected;
          next.completed = false;
        } else if (selected && sessionStorage.getItem(key) === selected.session_id) {
          sessionStorage.removeItem(key);
        }
        const frozen = selected ? await getFrozenSession(selected.session_id) : null;
        if (frozen && (frozen.session_id !== selected?.session_id || frozen.questionnaire_type !== selected.result.questionnaire_type)) throw new ResultsDeepDiveError('error');
        if (active && owner.current === (await getIdentity())?.username) {
          setOptions(next); setSnapshot(frozen); setSession(selected);
        }
      } catch (error) { if (active) setFailure(error instanceof FrozenSessionAccessError && error.detail === 'qpcc_legacy_profile' ? 'legacy' : 'error'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [pathId, stepId, reload]);
  const start = async (redo = false) => {
    if (pending.current || !options) return;
    pending.current = true; setBusy(true); setFailure(null);
    try {
      if (owner.current !== (await getIdentity())?.username) throw new ResultsDeepDiveError('error');
      if (redo && session && !completed && !options.completed && saveAttempt.current) await saveAttempt.current();
      const key = `deep-dive-attempt:${owner.current}:${pathId}:${stepId}`;
      if (redo && !attemptId.current) {
        attemptId.current = sessionStorage.getItem(key) || crypto.randomUUID();
        sessionStorage.setItem(key, attemptId.current);
      }
      const selected = redo ? session?.result.id : options.personal ? Number(resultId) : undefined;
      const started = await startResultsDeepDive(apiFetch, pathId, stepId, options.personal ? selected : undefined, redo ? attemptId.current! : undefined);
      const frozen = await getFrozenSession(started.session_id);
      if (frozen && (frozen.session_id !== started.session_id || frozen.questionnaire_type !== started.result.questionnaire_type)) throw new ResultsDeepDiveError('error');
      if (owner.current === (await getIdentity())?.username) {setSnapshot(frozen);setSession(started);setCompleted(false);setOptions({...options, completed: false, session: started,
        attempts: session ? [{...session, completed: completed || options.completed}, ...options.attempts.filter(item => item.session_id !== session.session_id)] : options.attempts});attemptId.current = null;sessionStorage.removeItem(key);}
    } catch (error) {
      setFailure(error instanceof FrozenSessionAccessError && error.detail === 'qpcc_legacy_profile' ? 'legacy'
        : error instanceof ResultsDeepDiveError ? error.reason : 'error');
    } finally { pending.current = false; setBusy(false); }
  };
  const dataEntry = options && <Link className="inline-flex min-h-11 items-center font-semibold text-indigo-700 underline" href={options.source_href}>
    {r('reenterData')}
  </Link>;
  // Finished and no pause left to resume: the step reopens on its final choices.
  const redoButton = <Button variant="secondary" disabled={busy} onClick={() => void start(true)}>{r('redo')}</Button>;
  const redoError = failure && <Callout variant="danger">{l('error')} <Button variant="secondary" disabled={busy} onClick={() => void start(true)}>{l('retry')}</Button></Callout>;
  const previous = options?.attempts.filter(item => item.session_id !== session?.session_id) ?? [];
  const history = previous.length > 0 && <details><summary className="cursor-pointer font-semibold">{r('attempts')}</summary>
    <div className="space-y-3">{previous.map(item => <div key={item.session_id} className="rounded border border-slate-200 p-3">
      <p>{new Date(item.started_at).toLocaleString(lang)} · {item.result.questionnaire_type}</p>
      {item.completed ? <SessionReport sessionId={item.session_id} questionnaireType={item.result.questionnaire_type} />
        : <Link href={`/?frozen=${encodeURIComponent(item.session_id)}&from=plan`}>{r('resumeChat')}</Link>}
    </div>)}</div></details>;
  if (session && (completed || (options?.completed && !snapshot))) return <div className="space-y-4">{dataEntry}{redoButton}{redoError}{history}<PlanChatCompleted sessionId={session.session_id} questionnaireType={session.result.questionnaire_type} /></div>;
  if (session) return <div className="space-y-4">{dataEntry}{redoButton}{redoError}{history}<GuidedChatInterface
    key={session.session_id}
    scores={session.result.scores} questionnaireType={session.result.questionnaire_type}
    sessionId={session.session_id} counselorId={snapshot?.counselor_id ?? getSelectedCounselorId()} locale={snapshot?.locale || lang}
    frozenSnapshot={snapshot}
    planOrigin={{pathId, stepId}}
    registerAttemptSave={save => { saveAttempt.current = save; }}
    onFrozen={() => router.push('/profilo/piani-operativi')}
    onComplete={() => { setCompleted(true); void deleteFrozenSession(session.session_id).catch(() => {}); }} /></div>;
  return <div className="space-y-4">
    <Link href="/profilo/piani-operativi">{l('back')}</Link>
    <h1 className="text-xl font-semibold">{l('deepDive')}</h1>
    {loading && <p role="status">{r('loading')}</p>}
    {failure === 'incomplete' && <Callout variant="warning">{r('missingPlan')}</Callout>}
    {(failure === 'legacy' || options?.legacy_profile) && <Callout variant="warning">{t('q.QPCC.legacyProfile')}</Callout>}
    {failure && failure !== 'incomplete' && failure !== 'legacy' && <Callout variant="danger">{l('error')}{' '}
      <Button variant="secondary" onClick={() => setReload(value => value + 1)}>{l('retry')}</Button></Callout>}
    {options && <Card className="space-y-3 p-4">
      {dataEntry}
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
        {failure !== 'legacy' && <Button disabled={busy || (options.personal && !resultId)} onClick={() => void start()}>{l('deepDiveStart')}</Button>}
      </>}
    </Card>}
  </div>;
}
