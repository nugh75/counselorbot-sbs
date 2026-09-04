'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, Check, Compass, Loader2, MessageCircle, NotebookPen, Route, Send, Sparkles } from 'lucide-react';
import { CompassMark } from '@/components/ui/CompassMark';
import { CounselorSelector } from '@/components/questionnaire/CounselorSelector';
import { LearnerProfileCard, type LearnerProfileData } from '@/components/profile/LearnerProfileCard';
import { StudentBookletCard, EVENT_BOOKLET_TYPES, bookletTypeOptionLabel, type BookletType } from '@/components/profile/StudentBookletCard';
import { toast } from '@/components/ui/Toast';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import {
    completeOrientation,
    fetchOrientationSession,
    fetchOrientationStatus,
    reviewOrientationNotebook,
    sendOrientationMessage,
    startOrientation,
    type OrientationSession,
} from '@/lib/orientation-api';
import { QUESTIONNAIRE_LIST, QUESTIONNAIRES, type QuestionnaireType } from '@/lib/questionnaires';
import { orientationToolHref, safeOrientationNext } from '@/lib/tool-catalog';
import { getSelectedCounselorId } from '@/lib/counselor';

const NOTEBOOK_FIELDS: { key: keyof LearnerProfileData; labelKey: string }[] = [
    { key: 'context', labelKey: 'lp.field.context' },
    { key: 'goal', labelKey: 'lp.field.goal' },
    { key: 'main_difficulty', labelKey: 'lp.field.difficulty' },
    { key: 'strengths', labelKey: 'lp.field.strengths' },
    { key: 'weaknesses', labelKey: 'lp.field.weaknesses' },
    { key: 'notes', labelKey: 'lp.field.notes' },
];

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

function recommendedBooklet(session: OrientationSession | null): QuestionnaireType {
    const id = session?.recommendations.find((item) => item.id in QUESTIONNAIRES)?.id;
    return (id as QuestionnaireType | undefined) ?? 'IDEA';
}

export default function BussolaPage() {
    const { t, tf, lang } = useI18n();
    const [session, setSession] = useState<OrientationSession | null>(null);
    const [latestSessionId, setLatestSessionId] = useState<string | null>(null);
    const [orientationRequired, setOrientationRequired] = useState(false);
    const [choosingCounselor, setChoosingCounselor] = useState(false);
    const [pendingNewSession, setPendingNewSession] = useState(false);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [completing, setCompleting] = useState(false);
    const [input, setInput] = useState('');
    const [error, setError] = useState('');
    const [nextHref, setNextHref] = useState<string | null>(null);
    const [openRecord, setOpenRecord] = useState<'notebook' | 'booklet' | null>(null);
    const [bookletType, setBookletType] = useState<BookletType>('IDEA');
    const endRef = useRef<HTMLDivElement>(null);

    const openSession = useCallback(async (sessionId: string) => {
        setLoading(true);
        setError('');
        try {
            const row = await fetchOrientationSession(sessionId);
            setSession(row);
            setBookletType(recommendedBooklet(row));
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
        setOpenRecord(null);
        try {
            const row = await startOrientation(lang, newSession, counselorId);
            setSession(row);
            setBookletType(recommendedBooklet(row));
            setChoosingCounselor(false);
        } catch {
            setError(t('orientation.error'));
        } finally {
            setLoading(false);
        }
    }, [lang, t]);

    const beginCounselorChoice = (newSession: boolean) => {
        setPendingNewSession(newSession);
        setChoosingCounselor(true);
        setError('');
    };

    const continueWithCounselor = async () => {
        const counselorId = getSelectedCounselorId();
        if (!counselorId) {
            setError(t('counselor.selectFirst'));
            return;
        }
        const newSession = pendingNewSession;
        await createSession(newSession, counselorId);
    };

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
            setBookletType(recommendedBooklet(row));
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

    const features = [
        { icon: MessageCircle, title: t('orientation.feature.listen.title'), body: t('orientation.feature.listen.body') },
        { icon: Route, title: t('orientation.feature.route.title'), body: t('orientation.feature.route.body') },
        { icon: NotebookPen, title: t('orientation.feature.reflect.title'), body: t('orientation.feature.reflect.body') },
    ];

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
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500">{t('orientation.platform')}</p>
                </div>
                <div className="relative mt-7 grid gap-4 border-t border-slate-100 pt-6 md:grid-cols-3">
                    {features.map(({ icon: Icon, title, body }) => (
                        <div key={title} className="flex gap-3">
                            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" />
                            <div><h2 className="text-sm font-bold text-slate-800">{title}</h2><p className="mt-1 text-sm leading-relaxed text-slate-500">{body}</p></div>
                        </div>
                    ))}
                </div>
            </header>

            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-indigo-600" /></div>
            ) : choosingCounselor ? (
                <section className="rounded-xl border border-indigo-200 bg-white p-5 shadow-sm sm:p-7">
                    <div className="mb-6 max-w-2xl">
                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ochre-600">{t('orientation.counselor.step')}</p>
                        <h2 className="font-display mt-1 text-2xl font-bold text-slate-900">{t('orientation.counselor.title')}</h2>
                        <p className="mt-2 text-sm leading-relaxed text-slate-600">{t('orientation.counselor.body')}</p>
                    </div>
                    <CounselorSelector
                        onContinue={() => void continueWithCounselor()}
                        onBack={orientationRequired ? undefined : () => setChoosingCounselor(false)}
                    />
                </section>
            ) : !session ? (
                <section className="glass-panel flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3"><Compass className="h-6 w-6 text-indigo-600" /><p className="text-sm leading-relaxed text-slate-600">{t('orientation.subtitle')}</p></div>
                    <div className="flex flex-wrap gap-2">
                        {latestSessionId && <button type="button" onClick={() => void openSession(latestSessionId)} className="rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-700">{t('orientation.landing.latest')}</button>}
                        <button type="button" onClick={() => beginCounselorChoice(true)} className="rounded-md bg-ochre-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-ochre-600">{t('orientation.landing.new')}</button>
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

                    {session.recommendations.length > 0 && <RecommendationSection session={session} />}

                    {session.recommendations.length > 0 && session.status === 'in_progress' && (
                        <NotebookDraftReview session={session} onSession={setSession} />
                    )}

                    {session.status === 'in_progress' && session.recommendations.length > 0 && (
                        <div className="flex justify-end">
                            <button type="button" onClick={() => void finish()} disabled={!session.notebook_reviewed || completing} className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40">
                                {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{t('orientation.complete')}
                            </button>
                        </div>
                    )}

                    {session.status === 'completed' && (
                        <section className="glass-panel space-y-5 border-teal-200 p-5 sm:p-6">
                            <div className="flex gap-3"><Sparkles className="mt-0.5 h-6 w-6 shrink-0 text-teal-600" /><div><h2 className="font-display text-xl font-bold text-slate-900">{t('orientation.completed.title')}</h2><p className="mt-1 text-sm leading-relaxed text-slate-600">{t('orientation.completed.body')}</p></div></div>
                            {nextHref && <Link href={nextHref} className="inline-flex items-center gap-2 rounded-md bg-ochre-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-ochre-600">{t('orientation.continue')}<ArrowRight className="h-4 w-4" /></Link>}
                            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                                <button type="button" onClick={() => setOpenRecord(openRecord === 'notebook' ? null : 'notebook')} className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-700"><NotebookPen className="h-4 w-4" />{openRecord === 'notebook' ? t('orientation.records.close') : t('orientation.records.notebook')}</button>
                                <button type="button" onClick={() => setOpenRecord(openRecord === 'booklet' ? null : 'booklet')} className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-700"><BookOpen className="h-4 w-4" />{openRecord === 'booklet' ? t('orientation.records.close') : t('orientation.records.booklet')}</button>
                                <button type="button" onClick={() => beginCounselorChoice(true)} className="ml-auto rounded-md px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">{t('orientation.landing.new')}</button>
                            </div>
                        </section>
                    )}

                    {session.status === 'completed' && openRecord === 'notebook' && <LearnerProfileCard variant="edit" sessionId={session.session_id} />}
                    {session.status === 'completed' && openRecord === 'booklet' && (
                        <div className="space-y-4">
                            <label className="block max-w-xl"><span className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t('orientation.booklet.select')}</span><select value={bookletType} onChange={(event) => setBookletType(event.target.value as BookletType)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">{[...QUESTIONNAIRE_LIST.map((item) => item.id), ...EVENT_BOOKLET_TYPES].map((type) => <option key={type} value={type}>{bookletTypeOptionLabel(type, t, tf)}</option>)}</select></label>
                            <StudentBookletCard key={bookletType} questionnaireType={bookletType} lang={lang} />
                        </div>
                    )}
                </>
            )}

            {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
        </div>
    );
}

function RecommendationSection({ session }: { session: OrientationSession }) {
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
                        <p className="mt-4 grow text-sm leading-relaxed text-slate-700">{item.reason}</p>
                        {session.status === 'completed' && <Link href={orientationToolHref(item.id)} className="mt-5 inline-flex items-center justify-between rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">{t('orientation.recommendation.start')}<ArrowRight className="h-4 w-4" /></Link>}
                    </article>
                ))}
            </div>
        </section>
    );
}

function NotebookDraftReview({ session, onSession }: { session: OrientationSession; onSession: (row: OrientationSession) => void }) {
    const { t } = useI18n();
    const [current, setCurrent] = useState<LearnerProfileData>({});
    const [values, setValues] = useState<Record<string, string>>({});
    const [selected, setSelected] = useState<Record<string, boolean>>({});
    const [saving, setSaving] = useState(false);

    const entries = useMemo(() => NOTEBOOK_FIELDS.filter((field) => session.notebook_draft[field.key]), [session.notebook_draft]);
    const hasSelectedValue = Object.entries(values).some(([key, value]) => selected[key] && value.trim());

    useEffect(() => {
        let active = true;
        const draft = Object.fromEntries(entries.map((field) => [field.key, session.notebook_draft[field.key]]));
        setValues(draft);
        setSelected(Object.fromEntries(entries.map((field) => [field.key, true])));
        apiFetch('/api/user/learner-profile')
            .then((response) => response.ok ? response.json() : null)
            .then((revision) => { if (active) setCurrent(revision?.data ?? {}); })
            .catch(() => { if (active) setCurrent({}); });
        return () => { active = false; };
    }, [entries, session.notebook_draft]);

    const save = async (skip: boolean) => {
        setSaving(true);
        try {
            const data = skip ? {} : Object.fromEntries(Object.entries(values).filter(([key, value]) => selected[key] && value.trim()));
            const row = await reviewOrientationNotebook(session.session_id, data, skip);
            onSession(row);
            toast.success(t(skip ? 'orientation.notebook.skipped' : 'orientation.notebook.saved'));
        } catch {
            toast.error(t('orientation.error'));
        } finally {
            setSaving(false);
        }
    };

    if (session.notebook_reviewed) {
        return <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">{t(session.notebook_revision_id ? 'orientation.notebook.saved' : 'orientation.notebook.skipped')}</div>;
    }

    return (
        <section className="glass-panel space-y-5 p-5 sm:p-6">
            <div className="flex gap-3"><NotebookPen className="mt-0.5 h-6 w-6 shrink-0 text-teal-600" /><div><h2 className="font-display text-xl font-bold text-slate-900">{t('orientation.notebook.title')}</h2><p className="mt-1 text-sm leading-relaxed text-slate-500">{t('orientation.notebook.subtitle')}</p></div></div>
            {entries.length === 0 ? <p className="text-sm text-slate-600">{t('orientation.notebook.empty')}</p> : (
                <div className="space-y-4">
                    {entries.map((field) => (
                        <div key={field.key} className="rounded-lg border border-slate-200 bg-white p-4">
                            <label className="flex items-start gap-3">
                                <input type="checkbox" checked={selected[field.key] ?? false} onChange={(event) => setSelected((old) => ({ ...old, [field.key]: event.target.checked }))} className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400" />
                                <span className="grow"><span className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{t(field.labelKey)}</span>{current[field.key] && <span className="mt-1 block text-xs leading-relaxed text-slate-400">{t('orientation.notebook.current')}: {current[field.key]}</span>}</span>
                            </label>
                            <textarea value={values[field.key] ?? ''} onChange={(event) => setValues((old) => ({ ...old, [field.key]: event.target.value }))} disabled={!selected[field.key]} rows={3} maxLength={600} className="mt-3 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-slate-50 disabled:text-slate-400" />
                        </div>
                    ))}
                </div>
            )}
            <div className="flex flex-wrap gap-2">
                {entries.length > 0 && <button type="button" onClick={() => void save(false)} disabled={saving || !hasSelectedValue} className="inline-flex items-center gap-2 rounded-md bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-40">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{t('orientation.notebook.save')}</button>}
                <button type="button" onClick={() => void save(true)} disabled={saving} className="rounded-md px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">{t('orientation.notebook.skip')}</button>
            </div>
        </section>
    );
}
