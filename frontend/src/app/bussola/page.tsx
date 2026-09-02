'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Compass, Loader2, Send, Sparkles } from 'lucide-react';
import { CompassMark } from '@/components/ui/CompassMark';
import { CounselorSelector } from '@/components/questionnaire/CounselorSelector';
import { LearnerProfileCard } from '@/components/profile/LearnerProfileCard';
import { useI18n } from '@/lib/i18n-context';
import {
    completeOrientation,
    fetchOrientationSession,
    fetchOrientationStatus,
    sendOrientationMessage,
    startOrientation,
    type OrientationSession,
} from '@/lib/orientation-api';
import { QUESTIONNAIRES, type QuestionnaireType } from '@/lib/questionnaires';
import { orientationToolHref, safeOrientationNext } from '@/lib/tool-catalog';
import { getSelectedCounselorId } from '@/lib/counselor';

function safeNextHref(): string | null {
    if (typeof window === 'undefined') return null;
    return safeOrientationNext(new URLSearchParams(window.location.search).get('next'));
}

function toolName(id: string, t: (key: string) => string): string {
    if (id === 'pqbl') return t('pqbl.card.title');
    return QUESTIONNAIRES[id as QuestionnaireType]?.name ?? id;
}

function toolDescription(id: string, t: (key: string) => string): string {
    if (id === 'pqbl') return t('pqbl.card.desc');
    return t(`q.${id}.description`);
}

export default function BussolaPage() {
    const { t, lang } = useI18n();
    const router = useRouter();
    const [session, setSession] = useState<OrientationSession | null>(null);
    const [latestSessionId, setLatestSessionId] = useState<string | null>(null);
    const [orientationRequired, setOrientationRequired] = useState(false);
    const [choosingCounselor, setChoosingCounselor] = useState(false);
    const [pendingNewSession, setPendingNewSession] = useState(false);
    // Taccuino di apertura: lo studente lo rivede prima che la conversazione inizi.
    const [pendingCounselorId, setPendingCounselorId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [completing, setCompleting] = useState(false);
    const [input, setInput] = useState('');
    const [error, setError] = useState('');
    const [nextHref, setNextHref] = useState<string | null>(null);
    // Strumento scelto dalle raccomandazioni: prima di uscire si chiede il taccuino.
    const [pendingTool, setPendingTool] = useState<string | null>(null);
    const endRef = useRef<HTMLDivElement>(null);
    const startingRef = useRef(false);
    const leavingRef = useRef(false);

    const openSession = useCallback(async (sessionId: string) => {
        setLoading(true);
        setError('');
        try {
            const row = await fetchOrientationSession(sessionId);
            setSession(row);
            if (row.status === 'in_progress' && !row.counselor_id) {
                setPendingNewSession(false);
                setChoosingCounselor(true);
            }
        } catch {
            setError(t('orientation.error'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    const createSession = useCallback(async (newSession: boolean, counselorId: number) => {
        setLoading(true);
        setError('');
        try {
            const row = await startOrientation(lang, newSession, counselorId);
            setSession(row);
            setPendingCounselorId(null);
        } catch {
            startingRef.current = false;
            setError(t('orientation.error'));
        } finally {
            setLoading(false);
        }
    }, [lang, t]);

    const beginCounselorChoice = (newSession: boolean) => {
        startingRef.current = false;
        setPendingNewSession(newSession);
        setPendingCounselorId(null);
        setChoosingCounselor(true);
        setError('');
    };

    const continueWithCounselor = () => {
        startingRef.current = false;
        const counselorId = getSelectedCounselorId();
        if (!counselorId) {
            setError(t('counselor.selectFirst'));
            return;
        }
        setPendingCounselorId(counselorId);
        setChoosingCounselor(false);
    };

    // Il taccuino apre la Bussola: rivisto (o saltato) lo studente entra in chat.
    // La card chiama onDone e poi onUnavailable dopo il salvataggio: la sessione va creata una volta sola.
    const startAfterNotebook = useCallback(() => {
        if (startingRef.current || pendingCounselorId === null) return;
        startingRef.current = true;
        void createSession(pendingNewSession, pendingCounselorId);
    }, [createSession, pendingCounselorId, pendingNewSession]);

    useEffect(() => {
        let active = true;
        setNextHref(safeNextHref());
        void (async () => {
            try {
                const status = await fetchOrientationStatus();
                if (!active) return;
                setLatestSessionId(status.latest_session_id ?? null);
                setOrientationRequired(status.required);
                if (status.required) {
                    if (status.in_progress_session_id) await openSession(status.in_progress_session_id);
                    else {
                        setPendingNewSession(false);
                        setChoosingCounselor(true);
                        setLoading(false);
                    }
                } else {
                    setLoading(false);
                }
            } catch {
                if (active) {
                    setError(t('orientation.error'));
                    setLoading(false);
                }
            }
        })();
        return () => { active = false; };
    }, [openSession, t]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [session?.messages.length, sending]);

    const submitMessage = async (event: FormEvent) => {
        event.preventDefault();
        const message = input.trim();
        if (!session || !message || sending || session.status === 'completed') return;
        setInput('');
        setSending(true);
        setError('');
        try {
            const row = await sendOrientationMessage(session.session_id, message, lang);
            setSession(row);
        } catch {
            setInput(message);
            setError(t('orientation.error'));
        } finally {
            setSending(false);
        }
    };

    const finish = async () => {
        if (!session) return;
        setCompleting(true);
        setError('');
        try {
            const row = await completeOrientation(session.session_id);
            setSession(row);
            setLatestSessionId(row.session_id);
            setOrientationRequired(false);
        } catch {
            setError(t('orientation.error'));
        } finally {
            setCompleting(false);
        }
    };

    // Aprire uno strumento chiude la Bussola: il gate rimanda qui chi non l'ha
    // conclusa, quindi la sessione va completata prima di uscire.
    const leaveForTool = useCallback(async () => {
        if (leavingRef.current || !pendingTool || !session) return;
        leavingRef.current = true;
        try {
            if (session.status === 'in_progress') await completeOrientation(session.session_id);
        } catch {
            setError(t('orientation.error'));
            leavingRef.current = false;
            setPendingTool(null);
            return;
        }
        router.push(orientationToolHref(pendingTool));
    }, [pendingTool, router, session, t]);

    return (
        <div className="page-wide space-y-8">
            <header className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white px-5 py-7 shadow-sm sm:px-8 sm:py-9">
                <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full border border-indigo-100" aria-hidden="true" />
                <div className="pointer-events-none absolute -right-5 top-8 h-28 w-28 rounded-full border border-ochre-100" aria-hidden="true" />
                <div className="relative max-w-3xl">
                    <div className="flex items-center gap-3">
                        <CompassMark className="h-12 w-12 shrink-0" animated />
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ochre-600">{t('orientation.eyebrow')}</p>
                            <h1 className="font-display text-3xl font-bold text-slate-900 sm:text-4xl">{t('orientation.title')}</h1>
                        </div>
                    </div>
                    <p className="mt-5 text-base leading-relaxed text-slate-600 sm:text-lg">{t('orientation.subtitle')}</p>
                </div>
            </header>

            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-indigo-600" /></div>
            ) : choosingCounselor ? (
                <section className="rounded-xl border border-indigo-200 bg-white p-5 shadow-sm sm:p-7">
                    <div className="mb-6 max-w-2xl border-l-2 border-ochre-400 pl-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ochre-600">{t('orientation.counselor.step')}</p>
                        <h2 className="font-display mt-1 text-2xl font-bold text-slate-900">{t('orientation.counselor.title')}</h2>
                        <p className="mt-2 text-sm leading-relaxed text-slate-600">{t('orientation.counselor.body')}</p>
                    </div>
                    <CounselorSelector
                        onContinue={continueWithCounselor}
                        onBack={orientationRequired ? undefined : () => setChoosingCounselor(false)}
                    />
                </section>
            ) : pendingCounselorId !== null ? (
                <LearnerProfileCard
                    variant="review"
                    onDone={startAfterNotebook}
                    onUnavailable={startAfterNotebook}
                    onBack={() => setChoosingCounselor(true)}
                />
            ) : session && pendingTool ? (
                <LearnerProfileCard
                    variant="update"
                    sessionId={session.session_id}
                    onDone={() => void leaveForTool()}
                    onUnavailable={() => void leaveForTool()}
                />
            ) : !session ? (
                <section className="glass-panel flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3"><Compass className="h-6 w-6 text-indigo-600" /><p className="text-sm leading-relaxed text-slate-600">{t('orientation.subtitle')}</p></div>
                    <div className="flex flex-wrap gap-2">
                        {latestSessionId && <button type="button" onClick={() => void openSession(latestSessionId)} className="rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-700">{t('orientation.landing.latest')}</button>}
                        <button type="button" onClick={() => beginCounselorChoice(true)} className="rounded-md bg-ochre-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-ochre-700">{t('orientation.landing.new')}</button>
                    </div>
                </section>
            ) : (
                <>
                    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="max-h-[34rem] space-y-4 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite">
                            {session.messages.map((message, index) => (
                                <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[88%] whitespace-pre-line rounded-xl px-4 py-3 text-sm leading-relaxed sm:max-w-2xl ${message.role === 'user' ? 'bg-indigo-600 text-white' : 'border border-slate-100 bg-slate-50 text-slate-700'}`}>
                                        {message.content}
                                    </div>
                                </div>
                            ))}
                            {sending && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-indigo-600" />{t('orientation.processing')}</div>}
                            <div ref={endRef} />
                        </div>
                        {session.status === 'in_progress' && (
                            <form onSubmit={submitMessage} className="border-t border-slate-100 bg-slate-50/70 p-3 sm:p-4">
                                <div className="flex items-end gap-2">
                                    <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={2} maxLength={4000} placeholder={t('orientation.input.placeholder')} className="min-h-20 flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                                    <button type="submit" disabled={!input.trim() || sending} aria-label={t('orientation.input.send')} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"><Send className="h-4 w-4" /></button>
                                </div>
                            </form>
                        )}
                    </section>

                    {session.recommendations.length > 0 && <RecommendationSection session={session} onPick={setPendingTool} />}

                    {session.status === 'in_progress' && session.recommendations.length > 0 && (
                        <div className="flex justify-end">
                            <button type="button" onClick={() => void finish()} disabled={completing} className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40">
                                {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{t('orientation.complete')}
                            </button>
                        </div>
                    )}

                    {session.status === 'completed' && (
                        <section className="glass-panel space-y-5 border-teal-200 p-5 sm:p-6">
                            <div className="flex gap-3"><Sparkles className="mt-0.5 h-6 w-6 shrink-0 text-teal-600" /><div><h2 className="font-display text-xl font-bold text-slate-900">{t('orientation.completed.title')}</h2><p className="mt-1 text-sm leading-relaxed text-slate-600">{t('orientation.completed.body')}</p></div></div>
                            {nextHref && <Link href={nextHref} className="inline-flex items-center gap-2 rounded-md bg-ochre-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-ochre-700">{t('orientation.continue')}<ArrowRight className="h-4 w-4" /></Link>}
                            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                                <button type="button" onClick={() => beginCounselorChoice(true)} className="ml-auto rounded-md px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">{t('orientation.landing.new')}</button>
                            </div>
                        </section>
                    )}

                    {/* Il taccuino chiude la Bussola: lo studente rivede quanto ha scritto. */}
                    {session.status === 'completed' && <LearnerProfileCard variant="update" sessionId={session.session_id} />}
                </>
            )}

            {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
        </div>
    );
}

function RecommendationSection({ session, onPick }: { session: OrientationSession; onPick: (id: string) => void }) {
    const { t } = useI18n();
    return (
        <section>
            <h2 className="font-display text-2xl font-bold text-slate-900">{t('orientation.recommendations.title')}</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">{t('orientation.recommendations.subtitle')}</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
                {session.recommendations.map((item, index) => (
                    <article key={item.id} className={`flex flex-col rounded-xl border bg-white p-5 shadow-sm ${index === 0 ? 'border-indigo-300 ring-1 ring-indigo-100' : 'border-slate-200'}`}>
                        <div className="flex items-center justify-between gap-3"><span className="font-mono text-xs font-semibold text-ochre-600">{String(index + 1).padStart(2, '0')}</span>{index === 0 && <Compass className="h-5 w-5 text-indigo-600" />}</div>
                        <h3 className="mt-3 text-lg font-bold text-slate-900">{toolName(item.id, t)}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-slate-500">{toolDescription(item.id, t)}</p>
                        <p className="mt-4 grow border-l-2 border-teal-400 pl-3 text-sm leading-relaxed text-slate-700">{item.reason}</p>
                        <button type="button" onClick={() => onPick(item.id)} className="mt-5 inline-flex items-center justify-between rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">{t('orientation.recommendation.start')}<ArrowRight className="h-4 w-4" /></button>
                    </article>
                ))}
            </div>
        </section>
    );
}


