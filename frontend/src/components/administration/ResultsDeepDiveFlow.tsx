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
import { deleteFrozenSession, getFrozenSession, notifyFrozenSessionsChanged, FrozenSessionAccessError, type FrozenSessionDetail } from '@/lib/frozen-session';
import { getSelectedCounselorId } from "@/lib/counselor";
import { GuidedChatInterface } from "@/components/qsa/GuidedChatInterface";
import { PlanChatCompleted } from "@/components/administration/PlanChatCompleted";
import { SessionReport } from "@/components/qsa/SessionReport";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Callout } from "@/components/ui/Callout";
import type { RegisterActivitySave } from '@/lib/path-activity';

export function ResultsDeepDiveFlow({ pathId, stepId, registerSave, onExit, onCompleted, onSaveState, embedded = false }: {
  pathId: number; stepId: number; registerSave?: RegisterActivitySave; onExit?: () => void; onCompleted?: () => void; embedded?: boolean;
  onSaveState?: (state: 'saving' | 'saved' | 'error') => void;
}) {
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
        const requested = new URLSearchParams(window.location.search).get('attempt');
        if (requested && requested !== 'new') {
          const historical = next.attempts.find(item => item.session_id === requested);
          if (!historical) throw new ResultsDeepDiveError('error');
          selected = historical;
          next.completed = historical.completed;
        }
        const key = `deep-dive-attempt:${identity.username}:${pathId}:${stepId}`;
        const requestedResult = Number(new URLSearchParams(window.location.search).get('result_id'));
        const chosenResult = next.results.find(result => result.id === requestedResult);
        const newResultId = selected?.result.id ?? chosenResult?.id ?? (next.results.length === 1 ? next.results[0].id : undefined);
        if (active && requested === 'new' && next.ready && (!next.personal || newResultId)) {
          attemptId.current = sessionStorage.getItem(key) || crypto.randomUUID();
          sessionStorage.setItem(key, attemptId.current);
          selected = await startResultsDeepDive(apiFetch, pathId, stepId, next.personal ? newResultId : undefined, attemptId.current);
          notifyFrozenSessionsChanged();
          sessionStorage.removeItem(key);
          attemptId.current = null;
          const params = new URLSearchParams(window.location.search);
          params.set('attempt', selected.session_id);
          window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params}`);
          next.session = selected;
          next.completed = false;
        } else if (selected && sessionStorage.getItem(key) === selected.session_id) {
          sessionStorage.removeItem(key);
        }
        // Entering from the plan is already the student's decision to start.
        // Only ask for a choice when several personal results are available.
        if (active && !selected && next.ready && (!next.personal || next.results.length === 1 || chosenResult)) {
          if (owner.current !== (await getIdentity())?.username) throw new ResultsDeepDiveError('error');
          if (!active) return;
          selected = await startResultsDeepDive(apiFetch, pathId, stepId,
            next.personal ? chosenResult?.id ?? next.results[0].id : undefined);
          notifyFrozenSessionsChanged();
          next.session = selected;
          next.completed = false;
        }
        const frozen = selected ? await getFrozenSession(selected.session_id) : null;
        const selectedMetadata = next.attempts.find(item => item.session_id === selected?.session_id);
        if (selectedMetadata?.has_turns && !next.completed && !frozen) throw new ResultsDeepDiveError('error');
        if (frozen && (frozen.session_id !== selected?.session_id || frozen.questionnaire_type !== selected.result.questionnaire_type)) throw new ResultsDeepDiveError('error');
        if (active && owner.current === (await getIdentity())?.username) {
          setOptions(next); setSnapshot(frozen); setSession(selected);
        }
      } catch (error) { if (active) setFailure(error instanceof FrozenSessionAccessError && error.detail === 'qpcc_legacy_profile' ? 'legacy' : 'error'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [pathId, stepId, reload]);
  const start = async () => {
    if (pending.current || !options) return;
    pending.current = true; setBusy(true); setFailure(null);
    try {
      if (owner.current !== (await getIdentity())?.username) throw new ResultsDeepDiveError('error');
      const selected = options.personal ? Number(resultId) : undefined;
      const isNew = new URLSearchParams(window.location.search).get('attempt') === 'new';
      const key = `deep-dive-attempt:${owner.current}:${pathId}:${stepId}`;
      if (isNew) {
        attemptId.current = sessionStorage.getItem(key) || crypto.randomUUID();
        sessionStorage.setItem(key, attemptId.current);
      }
      const started = await startResultsDeepDive(apiFetch, pathId, stepId, selected, isNew ? attemptId.current! : undefined);
      notifyFrozenSessionsChanged();
      const frozen = await getFrozenSession(started.session_id);
      if (!frozen && options.attempts.some(item => item.session_id === started.session_id && item.has_turns && !item.completed)) throw new ResultsDeepDiveError('error');
      if (frozen && (frozen.session_id !== started.session_id || frozen.questionnaire_type !== started.result.questionnaire_type)) throw new ResultsDeepDiveError('error');
      if (owner.current === (await getIdentity())?.username) {setSnapshot(frozen);setSession(started);setCompleted(false);setOptions({...options, completed: false, session: started,
        attempts: options.attempts});}
      if (isNew) {
        const params = new URLSearchParams(window.location.search); params.set('attempt', started.session_id);
        window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params}`);
        sessionStorage.removeItem(key); attemptId.current = null;
      }
    } catch (error) {
      setFailure(error instanceof FrozenSessionAccessError && error.detail === 'qpcc_legacy_profile' ? 'legacy'
        : error instanceof ResultsDeepDiveError ? error.reason : 'error');
    } finally { pending.current = false; setBusy(false); }
  };
  const previous = options?.attempts.filter(item => item.session_id !== session?.session_id) ?? [];
  const history = previous.length > 0 && <details><summary className="cursor-pointer font-semibold">{r('attempts')}</summary>
    <div className="space-y-3">{previous.map(item => <div key={item.session_id} className="rounded border border-slate-200 p-3">
      <p>{new Date(item.started_at).toLocaleString(lang)} · {item.result.questionnaire_type}</p>
      {item.completed ? <SessionReport sessionId={item.session_id} questionnaireType={item.result.questionnaire_type} />
        : item.resumable ? <Link href={`/?frozen=${encodeURIComponent(item.session_id)}&from=plan`}>{r('resumeChat')}</Link>
        : <p>{r('noSavedAttempt')}</p>}
    </div>)}</div></details>;
  if (session && (completed || options?.completed)) return <div className="space-y-4"><PlanChatCompleted sessionId={session.session_id} questionnaireType={session.result.questionnaire_type} embedded={embedded} />{!embedded && history}</div>;
  if (session) return <div className="space-y-4"><GuidedChatInterface
    key={session.session_id}
    scores={session.result.scores} questionnaireType={session.result.questionnaire_type}
    sessionId={session.session_id} counselorId={snapshot?.counselor_id ?? getSelectedCounselorId()} locale={snapshot?.locale || lang}
    frozenSnapshot={snapshot}
    planOrigin={{pathId, stepId}}
    registerAttemptSave={registerSave}
    onSaveState={onSaveState}
    onFrozen={() => onExit ? onExit() : router.push('/profilo/piani-operativi')}
    onComplete={() => { setCompleted(true); onCompleted?.(); notifyFrozenSessionsChanged(); void deleteFrozenSession(session.session_id).catch(() => {}); }} />{!embedded && history}</div>;
  return <div className="space-y-4">
    {!embedded && <><Link href="/profilo/piani-operativi">{l('back')}</Link><h1 className="text-xl font-semibold">{l('deepDive')}</h1></>}
    {loading && <p role="status">{r('loading')}</p>}
    {failure === 'incomplete' && <Callout variant="warning">{r('missingPlan')}</Callout>}
    {(failure === 'legacy' || options?.legacy_profile) && <Callout variant="warning">{t('q.QPCC.legacyProfile')}</Callout>}
    {(failure === 'legacy' || options?.legacy_profile) && options && <Link
      className="inline-flex min-h-11 items-center font-semibold text-indigo-700 underline" href={options.source_href}>
      {r('reenterData')}
    </Link>}
    {failure && failure !== 'incomplete' && failure !== 'legacy' && <Callout variant="danger">{l('error')}{' '}
      <Button variant="secondary" onClick={() => setReload(value => value + 1)}>{l('retry')}</Button></Callout>}
    {!loading && options && !failure && <Card className="space-y-3 p-4">
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
