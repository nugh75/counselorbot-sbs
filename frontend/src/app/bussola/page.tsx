'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowRight, Check, Compass, Loader2, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ListenButton } from '@/components/voice-reader/VoiceReader';
import { ChatBubble, ChatPending } from '@/components/ui/ChatBubble';
import { QuestionnaireLink } from '@/components/ui/QuestionnaireLink';
import { CompassMark } from '@/components/ui/CompassMark';
import { NotebookBookletPanel, NotebookBookletTriggers, type DeskTab } from '@/components/profile/NotebookBookletPanel';
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
import { skipOrientationThisVisit, orientationToolHref, safeOrientationNext } from '@/lib/tool-catalog';
import { fetchAccountPreferences } from '@/lib/account-preferences';

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
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [completing, setCompleting] = useState(false);
    const [input, setInput] = useState('');
    const [deskTab, setDeskTab] = useState<DeskTab | null>(null);
    const [error, setError] = useState('');
    const [nextHref, setNextHref] = useState<string | null>(null);
    const [atFork, setAtFork] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);
    const leavingRef = useRef(false);

    const openSession = useCallback(async (sessionId: string) => {
        setLoading(true);
        setError('');
        try {
            const row = await fetchOrientationSession(sessionId);
            if (row.status === 'in_progress' && !row.counselor_id) {
                const prefs = await fetchAccountPreferences();
                if (!prefs.counselor_ready || !prefs.counselor_id) {
                    router.push('/counselor?next=%2Fbussola');
                    return;
                }
                setSession(await startOrientation(lang, false, prefs.counselor_id));
            } else {
                setSession(row);
            }
        } catch {
            setError(t('orientation.error'));
        } finally {
            setLoading(false);
        }
    }, [lang, router, t]);

    const createSession = useCallback(async (newSession: boolean, counselorId: number) => {
        setLoading(true);
        setError('');
        try {
            const row = await startOrientation(lang, newSession, counselorId);
            setSession(row);
        } catch {
            setError(t('orientation.error'));
        } finally {
            setLoading(false);
        }
    }, [lang, t]);

    const startConversation = async () => {
        if (loading) return;
        setLoading(true);
        try {
            const prefs = await fetchAccountPreferences();
            if (!prefs.counselor_ready || !prefs.notebook_ready || !prefs.counselor_id) {
                router.push('/inizia?next=%2Fbussola');
                return;
            }
            setAtFork(false);
            await createSession(true, prefs.counselor_id);
        } catch { setError(t('orientation.error')); }
        finally { setLoading(false); }
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
                        setAtFork(true);
                        setLoading(false);
                    }
                } else {
                    setAtFork(!status.latest_session_id);
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
    const leaveForTool = async (tool: string) => {
        if (leavingRef.current || !session) return;
        leavingRef.current = true;
        try {
            if (session.status === 'in_progress') await completeOrientation(session.session_id);
            router.push(orientationToolHref(tool));
        } catch {
            setError(t('orientation.error'));
            leavingRef.current = false;
        }
    };

    // L'avviso di errore stava in fondo alla pagina, sotto le raccomandazioni e
    // il taccuino: chi vedeva fallire un invio doveva scorrere per sapere perché.
    // Con la conversazione aperta va sotto il trascritto, accanto alla casella.
    const errorNote = error
        ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>
        : null;

    // Due soli stati per lo screen reader: l'attesa e la risposta arrivata.
    const lastMessage = session?.messages[session.messages.length - 1];
    const liveAnnouncement = sending
        ? t('orientation.processing')
        : lastMessage?.role === 'assistant' ? lastMessage.content : '';

    // Chi sa gia' che cosa vuole aprire non deve passare da qui. Il salto vale
    // per la visita: il cancello tace, e il primo strumento davvero avviato
    // rende `required` falso da se'.
    const skipToTools = () => {
        skipOrientationThisVisit();
        router.push('/?view=questionnaires');
    };

    // L'altra strada del bivio: il catalogo degli strumenti, la stessa schermata
    // che accoglie chi torna. Il cancello tace per la visita, come nel salto.
    const goToTools = () => {
        skipOrientationThisVisit();
        router.push('/?view=home');
    };

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
            ) : atFork ? (
                <section className="rounded-xl border border-indigo-200 bg-white p-5 shadow-sm sm:p-7">
                    <div className="max-w-2xl">
                        <h2 className="font-display text-2xl font-bold text-slate-900">{t('orientation.fork.title')}</h2>
                        <p className="mt-2 text-sm leading-relaxed text-slate-600">{t('orientation.fork.body')}</p>
                    </div>
                    <div className="mt-6 flex flex-wrap gap-3">
                        <Button type="button" variant="accent" onClick={startConversation}>{t('orientation.landing.open')}</Button>
                        <Button type="button" variant="secondary" onClick={goToTools}>{t('orientation.landing.skip')}</Button>

                    </div>
                </section>
            ) : !session ? (
                <section className="glass-panel flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3"><Compass className="h-6 w-6 text-indigo-600" /><p className="text-sm leading-relaxed text-slate-600">{t('orientation.subtitle')}</p></div>
                    <div className="flex flex-wrap gap-2">
                        {latestSessionId && <Button type="button" variant="secondary" onClick={() => void openSession(latestSessionId)}>{t('orientation.landing.latest')}</Button>}
                        <Button type="button" variant="accent" onClick={() => void startConversation()}>{t('orientation.landing.new')}</Button>
                        {orientationRequired && <Button type="button" variant="ghost" onClick={skipToTools}>{t('orientation.landing.skip')}</Button>}
                    </div>
                </section>
            ) : (
                <>
                    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        {/* Come nella chat guidata e nell'assistente: il trascritto è un
                            role="log" da navigare, e l'annuncio vive in una regione a
                            parte con due soli stati. Un aria-live sul contenitore
                            rileggeva l'intera conversazione a ogni turno. */}
                        <p className="sr-only" aria-live="polite">{liveAnnouncement}</p>
                        <div
                            role="log"
                            aria-label={t('orientation.title')}
                            className="max-h-chat space-y-4 overflow-y-auto px-4 py-5 sm:px-6"
                        >
                            {session.messages.map((message, index) => (
                                <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <ChatBubble role={message.role === 'user' ? 'user' : 'assistant'} className="max-w-[88%] whitespace-pre-line sm:max-w-2xl">
                                        <div data-voice-source={message.role === 'assistant' ? `bussola-${session.session_id}-${index}` : undefined}
                                            data-voice-language={session.language || lang} data-voice-counselor={session.counselor_id ?? undefined}>{message.content}</div>
                                        {message.role === 'assistant' && <div className="mt-2" data-voice-ignore>
                                            <ListenButton id={`bussola-${session.session_id}-${index}`} text={message.content} language={session.language as typeof lang || lang} counselorId={session.counselor_id} className="min-h-[44px] min-w-[44px] px-2" />
                                        </div>}
                                    </ChatBubble>
                                </div>
                            ))}
                            {sending && <ChatPending label={t('orientation.processing')} />}
                            <div ref={endRef} />
                        </div>
                        {session.recommendations.length > 0 && (
                            <div className="border-t border-slate-100 px-4 py-2 sm:px-6">
                                <button
                                    type="button"
                                    // Qui scrollare la pagina e' l'intento: il pannello sta sotto
                                    // la piega e senza questo non c'era nulla che lo indicasse.
                                    onClick={() => document.getElementById('orientation-recommendations')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700 hover:underline"
                                >
                                    {t('orientation.recommendations.jump', { count: session.recommendations.length })}
                                    <ArrowDown className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                        {errorNote && <div className="border-t border-slate-100 px-4 py-3 sm:px-6">{errorNote}</div>}
                        {session.status === 'in_progress' && (
                            <form onSubmit={submitMessage} className="border-t border-slate-100 bg-slate-50/70 p-3 sm:p-4">
                                {!sending && (
                                    <details className="mb-2 text-xs text-slate-600">
                                        <summary className="min-h-9 cursor-pointer py-2">{t('orientation.suggested.label')}</summary>
                                        <div className="flex flex-wrap gap-1.5 pb-2">
                                            {[0, 1, 2, 3, 4].map((index) => (
                                                <button key={index} type="button"
                                                    onClick={() => {
                                                        setInput(t(`orientation.suggested.${index}`));
                                                        window.requestAnimationFrame(() => document.getElementById('bussola-composer')?.focus());
                                                    }}
                                                    className="min-h-9 max-w-full whitespace-normal break-words rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-left hover:bg-indigo-50">
                                                    {t(`orientation.suggested.${index}`)}
                                                </button>
                                            ))}
                                        </div>
                                    </details>
                                )}
                                <div className="mb-2 flex flex-wrap items-center gap-1">
                                    <NotebookBookletTriggers
                                        buttonClassName="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                                        onOpen={setDeskTab}
                                    />
                                </div>
                                <div className="flex items-end gap-2">
                                    <textarea id="bussola-composer" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={2} maxLength={4000} placeholder={t('orientation.input.placeholder')} className="min-h-20 flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                                    <button type="submit" disabled={!input.trim() || sending} aria-label={t('orientation.input.send')} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"><Send className="h-4 w-4" /></button>
                                </div>
                            </form>
                        )}
                    </section>

                    {session.recommendations.length > 0 && (
                        <div id="orientation-recommendations">
                            <RecommendationSection session={session} onPick={tool => void leaveForTool(tool)} />
                        </div>
                    )}

                    {session.status === 'in_progress' && session.recommendations.length > 0 && (
                        <div className="flex justify-end">
                            <Button type="button" size="lg" onClick={() => void finish()} disabled={completing}>
                                {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{t('orientation.complete')}
                            </Button>
                        </div>
                    )}

                    {session.status === 'completed' && (
                        <section className="glass-panel space-y-5 border-teal-200 p-5 sm:p-6">
                            <div className="flex gap-3"><Sparkles className="mt-0.5 h-6 w-6 shrink-0 text-teal-600" /><div><h2 className="font-display text-xl font-bold text-slate-900">{t('orientation.completed.title')}</h2><p className="mt-1 text-sm leading-relaxed text-slate-600">{t('orientation.completed.body')}</p></div></div>
                            {/* Concludere la Bussola non e' un vicolo cieco. Il collegamento
                                dipendeva da `?next=`, che mette solo il cancello quando rimanda
                                qui: chi apriva la Bussola dalla topbar arrivava in fondo senza
                                nessuna uscita che non fosse aprire uno degli strumenti. */}
                            <Link href={nextHref ?? '/'} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-ochre-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-ochre-700">{nextHref ? t('orientation.continue') : t('nav.home')}<ArrowRight className="h-4 w-4" /></Link>
                            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                                <Button type="button" variant="ghost" onClick={() => void startConversation()} className="ml-auto text-indigo-700 hover:bg-indigo-50">{t('orientation.landing.new')}</Button>
                            </div>
                        </section>
                    )}


                </>
            )}

            {!session && errorNote}
            <NotebookBookletPanel tab={deskTab} onSelectTab={setDeskTab} onClose={() => setDeskTab(null)} lang={lang} />
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
                        <p className="mt-4 grow text-sm leading-relaxed text-slate-700">{item.reason}</p>
                        {/* La Bussola manda a `/?start=<id>`, che salta la card di scelta:
                            senza questo, il link al questionario non lo vede mai nessuno. */}
                        <QuestionnaireLink instrument={item.id} className="mt-4" />
                        <Button type="button" onClick={() => onPick(item.id)} className="mt-5 justify-between">{t('orientation.recommendation.start')}<ArrowRight className="h-4 w-4" /></Button>
                    </article>
                ))}
            </div>
        </section>
    );
}
