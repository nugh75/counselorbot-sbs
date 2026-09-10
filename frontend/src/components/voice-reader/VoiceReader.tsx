'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { Headphones, Pause, Play, SkipBack, SkipForward, Square, Volume2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { useI18n } from '@/lib/i18n-context';
import { translate, type Lang } from '@/lib/i18n';
import { DEFAULT_VOICES, PIPER_VOICES, pageReadingText } from '@/lib/voice-content';
import { VoiceReaderController, type ReaderInput, type Segment } from '@/lib/voice-reader';
import { pronunciationRules } from '@/lib/voice-pronunciation';
import { PronunciationEditor } from './PronunciationEditor';

type Target = { id: string; text: string; language: Lang; counselorId?: number | null; literalPronunciation?: boolean };
type ReaderContext = { openSettings: () => void; read: (target: Target) => void; release: (id: string) => void };
const Context = createContext<ReaderContext | null>(null);
const PREFERENCE_EVENT = 'counselorbot-voice-change';
const preferenceKey = (language: Lang) => `cb_voice_${language}`;
const sessionPreferences = new Map<Lang, string>();
function preference(language: Lang) {
    try { return localStorage.getItem(preferenceKey(language)) || sessionPreferences.get(language) || 'edge:'; } catch { return sessionPreferences.get(language) || 'edge:'; }
}
function subscribePreference(notify: () => void) {
    window.addEventListener('storage', notify);
    window.addEventListener(PREFERENCE_EVENT, notify);
    return () => { window.removeEventListener('storage', notify); window.removeEventListener(PREFERENCE_EVENT, notify); };
}
function speechInput(target: Target): ReaderInput {
    const [storedEngine, voice] = preference(target.language).split(':');
    const engine = storedEngine === 'piper' ? 'piper' : 'edge';
    return { text: target.text, language: target.language, engine,
        voice: voice || (engine === 'piper' ? PIPER_VOICES : DEFAULT_VOICES)[target.language],
        counselor_id: target.counselorId, voice_override: !!voice, pronunciations: target.literalPronunciation ? [] : pronunciationRules(target.language) };
}

export function VoiceReaderProvider({ children }: { children: React.ReactNode }) {
    const { lang } = useI18n();
    const pathname = usePathname();
    const [controller] = useState(() => new VoiceReaderController());
    const [open, setOpen] = useState(false);
    const [target, setTarget] = useState<Target | null>(null);
    const source = useRef<string | null>(null);
    const [opener, setOpener] = useState<HTMLElement | null>(null);
    const close = useCallback(() => {
        controller.stop();
        source.current = null;
        setOpen(false);
        setTarget(null);
    }, [controller]);
    useEffect(() => () => close(), [pathname, lang, close]);
    const read = useCallback((next: Target) => {
        if (!document.activeElement?.closest('dialog')) setOpener(document.activeElement as HTMLElement);
        source.current = next.id;
        setTarget(next);
        setOpen(true);
        void controller.start(speechInput(next));
    }, [controller]);
    const release = useCallback((id: string) => { if (source.current === id) close(); }, [close]);
    return <Context.Provider value={{ read, release, openSettings: () => {
        setOpener(document.activeElement as HTMLElement);
        setOpen(true);
    } }}>
        {children}
        {open && <ReaderPanel controller={controller} target={target} onRead={read} onClose={close} opener={opener} />}
    </Context.Provider>;
}

export function VoiceReaderTrigger() {
    const reader = useContext(Context);
    const { t } = useI18n();
    return <Tooltip content={t('voice.title')}><button type="button" className="console-topbar-icon console-topbar-icon--lg" aria-label={t('voice.title')}
        onClick={() => reader?.openSettings()}><Headphones className="h-4 w-4" aria-hidden="true" /></button></Tooltip>;
}

export function ListenButton({ id, text, language, counselorId, className }: Target & { className?: string }) {
    const reader = useContext(Context);
    const release = reader?.release;
    const { t } = useI18n();
    // A source changing or disappearing ends its reading, including in-page
    // guided steps which do not change the URL. Opening the reader keeps drafts.
    useEffect(() => () => release?.(id), [release, id, text]);
    return <Tooltip content={t('voice.listen')}><Button type="button" variant="ghost" className={className} aria-label={t('voice.listen')}
        onClick={() => reader?.read({ id, text, language, counselorId })}><Volume2 className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>;
}

function ReaderPanel({ controller, target, onRead, onClose, opener }: {
    controller: VoiceReaderController; target: Target | null; onRead: (target: Target) => void; onClose: () => void; opener: HTMLElement | null;
}) {
    const { t, lang } = useI18n();
    const language = target?.language ?? lang;
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    const currentIndex = state.current;
    const selected = useSyncExternalStore(subscribePreference, () => preference(language), () => 'edge:');
    const [engineValue, voice = ''] = selected.split(':');
    const engine = engineValue === 'piper' ? 'piper' : 'edge';
    const dialog = useRef<HTMLDialogElement>(null);
    const transcript = useRef<HTMLDivElement>(null);
    const [voices, setVoices] = useState<{ id: string; name: string; locale: string }[]>([]);
    const [catalogError, setCatalogError] = useState(false);
    const [retry, setRetry] = useState(0);
    const [catalogEngine, setCatalogEngine] = useState(engine);

    useEffect(() => {
        const element = dialog.current;
        element?.showModal();
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            element?.close();
            document.body.style.overflow = overflow;
            if (opener?.isConnected) opener.focus({ preventScroll: true });
        };
    }, [opener]);
    useEffect(() => {
        const abort = new AbortController();
        fetch(`/api/tts/voices?engine=${engine}`, { signal: abort.signal }).then(async response => {
            if (!response.ok) throw new Error();
            const data = await response.json();
            if (!Array.isArray(data.voices)) throw new Error('Invalid voice catalog');
            if (!abort.signal.aborted) { setCatalogEngine(engine); setVoices(data.voices); setCatalogError(false); }
        }).catch(() => { if (!abort.signal.aborted) setCatalogError(true); });
        return () => abort.abort();
    }, [engine, retry]);
    useEffect(() => {
        const active = transcript.current?.querySelector<HTMLElement>('[data-active-word="true"]')
            ?? transcript.current?.querySelector<HTMLElement>('[data-active-segment="true"]');
        if (!active || !transcript.current || state.status !== 'playing') return;
        const bounds = transcript.current.getBoundingClientRect(), rect = active.getBoundingClientRect();
        if (rect.top < bounds.top || rect.bottom > bounds.bottom) active.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }, [currentIndex, state.word, state.status]);
    const choose = (value: string) => {
        controller.stop();
        sessionPreferences.set(language, value);
        try { localStorage.setItem(preferenceKey(language), value); } catch { /* Storage can be disabled. */ }
        window.dispatchEvent(new Event(PREFERENCE_EVENT));
    };
    const readPage = () => {
        // Native showModal makes the rest of the document inert implicitly;
        // this does not change its visible content or the explicit inert attribute.
        const root = document.getElementById('contenuto');
        onRead({ id: 'page', text: root ? pageReadingText(root) : '', language: lang });
    };
    const active = state.status === 'playing' || state.status === 'buffering';
    const available = catalogEngine === engine ? voices.filter(v => v.locale.split('-')[0] === language) : [];
    const currentPosition = state.segments.findIndex(s => s.index === state.current);
    return <dialog ref={dialog} aria-label={t('voice.title')} aria-modal="true" data-voice-ignore
        onCancel={event => { event.preventDefault(); onClose(); }}
        className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-xl border-0 bg-slate-50 p-0 text-slate-900 backdrop:bg-slate-950/40">
        <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 border-b border-slate-200 bg-white">
                <div className="flex items-center justify-between gap-3 p-4 sm:px-5">
                    <h2 className="font-display text-xl font-bold">{t('voice.title')}</h2>
                    <Button type="button" variant="ghost" onClick={onClose} aria-label={t('voice.close')} className="min-h-[44px] min-w-[44px] px-2"><X className="h-5 w-5" /></Button>
                </div>
                <div className="max-h-[45dvh] space-y-3 overflow-y-auto px-4 pb-4 sm:px-5 sm:pb-5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="min-w-0 text-sm font-semibold">{t('voice.engine')}
                        <select aria-label={t('voice.engine')} value={engine} onChange={event => choose(`${event.target.value}:`)} className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-2 text-sm">
                            <option value="edge">{t('voice.edge')}</option><option value="piper">{t('voice.piper')}</option>
                        </select>
                    </label>
                    <label className="min-w-0 text-sm font-semibold">{t('voice.voice')}
                        <select aria-label={t('voice.voice')} value={voice} onChange={event => choose(`${engine}:${event.target.value}`)} className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-2 text-sm">
                            <option value="">{t('voice.auto')}</option>
                            {voice && !available.some(v => v.id === voice) && <option value={voice}>{voice}</option>}
                            {available.map(v => <option key={v.id} value={v.id}>{v.name} · {v.locale}</option>)}
                        </select>
                    </label>
                </div>
                <p className="text-xs text-slate-500">{t('voice.saved')}</p>
                <PronunciationEditor key={language} language={language} onChange={controller.stop}
                    onPreview={(text, literalPronunciation) => onRead({ id: 'pronunciation-preview', text, language, literalPronunciation })} />
                {catalogError && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700">{t('voice.catalogError')}<Button variant="ghost" onClick={() => setRetry(n => n + 1)}>{t('voice.retry')}</Button></div>}
                <div className="flex flex-wrap gap-2">
                    <Button onClick={readPage}><Headphones className="h-4 w-4" />{t('voice.page')}</Button>
                    <Button variant="secondary" onClick={() => onRead({ id: 'preview', text: translate(language, 'voice.sample'), language })}>{t('voice.preview')}</Button>
                </div>
                </div>
            </div>
            <div className="shrink-0 space-y-2 border-b border-slate-200 px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center gap-1">
                    <Button variant="ghost" onClick={controller.previous} disabled={currentPosition <= 0} aria-label={t('voice.previous')} className="min-h-[44px] min-w-[44px] px-2"><SkipBack className="h-5 w-5" /></Button>
                    <Button variant="secondary" disabled={!target} onClick={() => {
                        if (active) controller.pause();
                        else if (state.status === 'idle' || state.status === 'error') { if (target) onRead(target); }
                        else controller.resume();
                    }}>{active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{t(active ? 'voice.pause' : state.status === 'idle' || state.status === 'error' ? 'voice.listen' : 'voice.resume')}</Button>
                    <Button variant="ghost" onClick={controller.next} disabled={currentPosition < 0 || currentPosition >= state.segments.length - 1} aria-label={t('voice.next')} className="min-h-[44px] min-w-[44px] px-2"><SkipForward className="h-5 w-5" /></Button>
                    <Button variant="ghost" onClick={controller.stop} disabled={state.status === 'idle'} aria-label={t('voice.stop')} className="min-h-[44px] min-w-[44px] px-2"><Square className="h-4 w-4" /></Button>
                </div>
                <p role="status" className="text-sm text-slate-600">{t(`voice.${state.status === 'error' ? 'error.request' : state.status}`)}{currentPosition >= 0 && ` · ${t('voice.progress', { current: currentPosition + 1, total: state.segments.length })}`}</p>
                {state.generating && <p className="text-xs text-slate-500">{t('voice.generating')}</p>}
                {state.error && <p role="alert" className="text-sm text-red-700">{t(`voice.error.${state.error}`)}</p>}
                {engine === 'piper' && <p className="text-xs text-slate-500">{t('voice.segmentOnly')}</p>}
            </div>
            <div ref={transcript} role="region" aria-label={t('voice.transcript')} tabIndex={0} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
                {state.segments.map(segment => <p key={segment.index} data-active-segment={segment.index === state.current}
                    className={`rounded-md border-l-2 p-2 text-base leading-relaxed whitespace-pre-wrap break-words ${segment.index === state.current ? 'border-indigo-600 bg-indigo-50' : 'border-transparent'} ${segment.failed ? 'text-slate-500 line-through' : ''}`}>
                    <SegmentText segment={segment} word={segment.index === state.current ? state.word : -1} />
                </p>)}
            </div>
        </div>
    </dialog>;
}

function SegmentText({ segment, word }: { segment: Segment; word: number }) {
    const timing = segment.words[word];
    if (!timing) return segment.text;
    return <>{segment.text.slice(0, timing.from)}<mark data-active-word="true" className="rounded-sm bg-indigo-200 text-indigo-950">{segment.text.slice(timing.from, timing.to)}</mark>{segment.text.slice(timing.to)}</>;
}
