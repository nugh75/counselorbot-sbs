'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { pathActivityText } from '@/lib/i18n-path-activity';
import { parsePathActivity, readActivityReturn, type PathActivityDetail, type PathAttempt, type RegisterActivitySave } from '@/lib/path-activity';
import { getFrozenSession, deleteFrozenSession, notifyFrozenSessionsChanged, type FrozenSessionDetail } from '@/lib/frozen-session';
import { fetchCounselors, getSelectedCounselorId } from '@/lib/counselor';
import { AdministrationStepFlow } from '@/components/administration/AdministrationStepFlow';
import { ResultsDeepDiveFlow } from '@/components/administration/ResultsDeepDiveFlow';
import { GuidedChatInterface } from '@/components/qsa/GuidedChatInterface';
import { ChatViewport } from '@/components/qsa/ChatViewport';
import { PlanActivityReview } from '@/components/administration/PlanActivityReview';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { GuideHelpLink } from '@/components/guide/GuideHelpLink';

export function PlanActivityFlow({ pathId, stepId }: { pathId: number; stepId: number }) {
    const { lang } = useI18n();
    const router = useRouter();
    const l = (key: string) => pathActivityText(lang, key);
    const [activity, setActivity] = useState<PathActivityDetail | null>(null);
    const [attempt, setAttempt] = useState<PathAttempt | null>(null);
    const [error, setError] = useState(false);
    const [busy, setBusy] = useState(false);
    const [reload, setReload] = useState(0);
    const [readyToSave, setReadyToSave] = useState(false);
    const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error' | null>(null);
    const save = useRef<(() => Promise<void>) | null>(null);
    const token = useRef<string | null>(null);
    const registerSave = useCallback<RegisterActivitySave>(callback => {
        save.current = callback;
        if (callback) setReadyToSave(true);
    }, []);
    useEffect(() => {
        let active = true;
        setError(false);
        void (async () => {
            const response = await apiFetch(`/api/user/paths/${pathId}/steps/${stepId}/activity`);
            if (!response.ok) throw new Error('activity');
            const detail = await response.json() as PathActivityDetail;
            if (!parsePathActivity(detail)) throw new Error('activity contract');
            const params = new URLSearchParams(window.location.search);
            const requested = params.get('attempt');
            const newAttempt = requested === 'new' || params.get('intent') === 'new';
            let selected = requested && requested !== 'new'
                ? detail.attempts.find(item => item.session_id === requested) : detail.current;
            if (newAttempt && detail.kind === 'analysis') selected = null;
            if (['chat', 'questionnaire'].includes(detail.kind) && (newAttempt || (!requested && !selected && !params.has('review')) || (token.current !== null && requested === token.current))) {
                token.current ??= requested && requested !== 'new' ? requested : crypto.randomUUID();
                params.set('attempt', token.current);
                if (newAttempt) params.set('intent', 'new');
                window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params}`);
                const started = await apiFetch(`/api/user/paths/${pathId}/steps/${stepId}/attempts`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({attempt_id: token.current, new_attempt: newAttempt}),
                });
                if (!started.ok) throw new Error('start');
                selected = await started.json() as PathAttempt;
                notifyFrozenSessionsChanged();
                params.set('attempt', selected.session_id); params.delete('intent');
                window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params}`);
            }
            if (requested && requested !== 'new' && !selected) throw new Error('attempt missing');
            if (active) { setActivity(detail); setAttempt(selected ?? null); }
        })().catch(() => { if (active) setError(true); });
        return () => { active = false; };
    }, [pathId, stepId, reload]);

    const leave = async () => {
        if (busy) return;
        setBusy(true); setError(false);
        try {
            await save.current?.();
            router.push(readActivityReturn(stepId));
        } catch { setError(true); }
        finally { setBusy(false); }
    };
    const readOnly = attempt?.state === 'completed';
    return <div className="space-y-4" data-testid="plan-activity">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="min-w-0">
                <Button variant="ghost" onClick={() => void leave()} disabled={busy}>← {l('back')}</Button>
                <GuideHelpLink task="resume" />
                {activity && <p className="px-3 text-sm text-slate-600">{activity.path_title} · {activity.position}. {activity.title}</p>}
                {saveState && !readOnly && <p role="status" className="px-3 text-xs text-slate-600">{l(saveState === 'error' ? 'saveFailed' : saveState === 'saved' ? 'savedActivity' : 'saving')}</p>}
            </div>
            {activity && !readOnly && <Button variant="secondary" onClick={() => void leave()}
                disabled={busy || (!readyToSave && activity.kind !== 'analysis')}>{l(busy ? 'saving' : 'saveExit')}</Button>}
            {readOnly && <span className="px-3 text-sm font-semibold text-emerald-700">{l('readOnly')}</span>}
        </div>
        {error && <Callout variant="danger"><p>{l('error')}</p><Button onClick={() => setReload(value => value + 1)}>{l('retry')}</Button></Callout>}
        {!activity && !error && <p role="status">{l('loading')}</p>}
        {activity?.kind === 'analysis' && <ChatViewport><ResultsDeepDiveFlow pathId={pathId} stepId={stepId}
            registerSave={registerSave} onExit={() => router.push(readActivityReturn(stepId))} onCompleted={() => setReload(value => value + 1)} onSaveState={setSaveState} embedded /></ChatViewport>}
        {activity?.kind === 'questionnaire' && attempt && <AdministrationStepFlow key={`${attempt.session_id}:${attempt.revision}`}
            pathId={pathId} stepId={stepId} activityAttempt={attempt} nextHref={activity.next_href}
            registerSave={registerSave} onSaved={() => setReload(value => value + 1)} />}
        {activity?.kind === 'chat' && attempt && <ChatViewport><PlanStandaloneChat key={attempt.session_id}
            attempt={attempt} instrument={activity.instrument_code} pathId={pathId} stepId={stepId}
            registerSave={registerSave} onExit={() => router.push(readActivityReturn(stepId))} onCompleted={() => setReload(value => value + 1)} onSaveState={setSaveState} /></ChatViewport>}
    </div>;
}

function PlanStandaloneChat({ attempt, instrument, pathId, stepId, registerSave, onExit, onCompleted, onSaveState }: {
    attempt: PathAttempt; instrument: string; pathId: number; stepId: number;
    registerSave: RegisterActivitySave; onExit: () => void; onCompleted: () => void;
    onSaveState: (state: 'saving' | 'saved' | 'error') => void;
}) {
    const { lang } = useI18n();
    const router = useRouter();
    const [snapshot, setSnapshot] = useState<FrozenSessionDetail | null>(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState(false);
    const [completed, setCompleted] = useState(attempt.state === 'completed');
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        let active = true;
        void getFrozenSession(attempt.session_id).then(async frozen => {
            if (!attempt.resumable && !completed) throw new Error('saved state missing');
            if (frozen && frozen.questionnaire_type !== instrument) throw new Error('snapshot mismatch');
            if (!frozen && !completed) {
                const counselors = await fetchCounselors(lang, lang, instrument);
                const selected = counselors.find(row => row.id === getSelectedCounselorId());
                if (!selected || selected.is_active === false || selected.suitable === false) {
                    if (active) router.push(`/counselor?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
                    return;
                }
            }
            if (active) { setError(false); setSnapshot(frozen); setReady(true); }
        }).catch(() => { if (active) setError(true); });
        return () => { active = false; };
    }, [attempt, instrument, completed, retry, lang, router]);
    if (completed) return <PlanActivityReview sessionId={attempt.session_id} instrument={instrument} />;
    if (error) return <Callout variant="danger">{pathActivityText(lang, 'error')} <Button onClick={() => setRetry(value => value + 1)}>{pathActivityText(lang, 'retry')}</Button></Callout>;
    if (!ready) return <p role="status">{pathActivityText(lang, 'loading')}</p>;
    return <GuidedChatInterface sessionId={attempt.session_id} questionnaireType={instrument} scores={{}}
        locale={snapshot?.locale || lang} counselorId={snapshot?.counselor_id ?? getSelectedCounselorId()}
        frozenSnapshot={snapshot} planOrigin={{pathId, stepId}} registerAttemptSave={registerSave}
        onSaveState={onSaveState}
        onFrozen={onExit} onComplete={() => { setCompleted(true); onCompleted(); notifyFrozenSessionsChanged(); void deleteFrozenSession(attempt.session_id).catch(() => {}); }} />;
}
