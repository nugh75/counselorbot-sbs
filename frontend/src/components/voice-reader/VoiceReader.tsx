'use client';

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { Headphones, Maximize2, Minimize2, Pause, Play, SkipBack, SkipForward, Square, Volume2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { useI18n } from '@/lib/i18n-context';
import { translate, type Lang } from '@/lib/i18n';
import { DEFAULT_VOICES, PIPER_VOICES, VOICE_EXCLUDED, pageReadingSource, highlightReadingBlock, type ReadingBlock } from '@/lib/voice-content';
import { VoiceReaderController, type ReaderInput } from '@/lib/voice-reader';
import { pronunciationRules } from '@/lib/voice-pronunciation';
import { PronunciationEditor } from './PronunciationEditor';

type Target = { id: string; text: string; language: Lang; counselorId?: number | null; literalPronunciation?: boolean; blocks?: ReadingBlock[] };
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
        counselor_id: target.counselorId, voice_override: !!voice, plain_text: !!target.blocks,
        pronunciations: target.literalPronunciation ? [] : pronunciationRules(target.language) };
}

export function VoiceReaderProvider({ children }: { children: React.ReactNode }) {
    const { lang } = useI18n();
    const pathname = usePathname();
    const [controller] = useState(() => new VoiceReaderController());
    const [open, setOpen] = useState(false);
    const [expanded, setExpanded] = useState(true);
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
        if (!document.activeElement?.closest('[data-voice-reader]')) setOpener(document.activeElement as HTMLElement);
        if (!open) setExpanded(window.matchMedia('(min-width: 1024px)').matches);
        source.current = next.id;
        setTarget(next);
        setOpen(true);
        void controller.start(speechInput(next));
    }, [controller, open]);
    const release = useCallback((id: string) => { if (source.current === id) close(); }, [close]);
    useEffect(() => {
        const startAtSelection = (event: MouseEvent) => {
            const element = event.target instanceof Element ? event.target : null;
            const main = document.getElementById('contenuto');
            const selection = window.getSelection();
            if (!main || !element || !main.contains(element) || element.closest(`${VOICE_EXCLUDED}, a`) || !selection?.rangeCount || selection.isCollapsed) return;
            const root = element.closest<HTMLElement>('[data-voice-source]') ?? main;
            if (root === main && element.closest('[role="log"]')) return;
            const range = selection.getRangeAt(0).cloneRange();
            if (!root.contains(range.startContainer)) return;
            const snapshot = pageReadingSource(root, range);
            if (!snapshot.text) return;
            read({ id: root.dataset.voiceSource || 'page', ...snapshot,
                language: (root.dataset.voiceLanguage as Lang) || lang,
                counselorId: Number(root.dataset.voiceCounselor) || undefined });
        };
        document.addEventListener('dblclick', startAtSelection);
        return () => document.removeEventListener('dblclick', startAtSelection);
    }, [lang, read]);
    return <Context.Provider value={{ read, release, openSettings: () => {
        setOpener(document.activeElement as HTMLElement);
        setExpanded(true);
        setOpen(true);
    } }}>
        <div className="voice-reader-layout" data-reader-open={open} data-reader-expanded={expanded}>
            {/* The bundled CSS parser rejects ::highlight; browsers accept it. */}
            <style>{'::highlight(voice-reading) { background-color: var(--color-indigo-100); color: var(--color-indigo-950); }'}</style>
            <div className="voice-reader-workspace">{children}</div>
            {open && <ReaderPanel controller={controller} target={target} onRead={read} onClose={close} opener={opener}
                expanded={expanded} onToggle={() => setExpanded(value => !value)} />}
        </div>
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
        onClick={() => {
            const element = document.querySelector<HTMLElement>(`[data-voice-source="${CSS.escape(id)}"]`);
            reader?.read({ id, text, language, counselorId, ...(element ? pageReadingSource(element) : {}) });
        }}><Volume2 className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>;
}

function ReaderPanel({ controller, target, onRead, onClose, opener, expanded, onToggle }: {
    controller: VoiceReaderController; target: Target | null; onRead: (target: Target) => void; onClose: () => void; opener: HTMLElement | null;
    expanded: boolean; onToggle: () => void;
}) {
    const { t, lang } = useI18n();
    const language = target?.language ?? lang;
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    const currentIndex = state.current;
    const selected = useSyncExternalStore(subscribePreference, () => preference(language), () => 'edge:');
    const [engineValue, voice = ''] = selected.split(':');
    const engine = engineValue === 'piper' ? 'piper' : 'edge';
    const panel = useRef<HTMLElement>(null);
    const [voices, setVoices] = useState<{ id: string; name: string; locale: string }[]>([]);
    const [catalogError, setCatalogError] = useState(false);
    const [retry, setRetry] = useState(0);
    const [catalogEngine, setCatalogEngine] = useState(engine);

    useLayoutEffect(() => {
        const element = panel.current;
        const layout = element?.parentElement;
        if (!element || !layout) return;
        const measure = () => layout.style.setProperty('--reader-measured-height', `${element.getBoundingClientRect().height}px`);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => { observer.disconnect(); layout.style.removeProperty('--reader-measured-height'); };
    }, [expanded]);
    useEffect(() => {
        const element = panel.current;
        const escape = (event: KeyboardEvent) => {
            // A disabled transport button can return focus to the body.
            if (event.key === 'Escape' && !event.defaultPrevented && document.activeElement === document.body && !document.querySelector('dialog[open]')) onClose();
        };
        document.addEventListener('keydown', escape);
        return () => {
            document.removeEventListener('keydown', escape);
            // Closing the reader must not steal focus from a chat being edited.
            if (opener?.isConnected && (element?.contains(document.activeElement) || document.activeElement === document.body)) opener.focus({ preventScroll: true });
        };
    }, [opener, onClose]);
    useEffect(() => { if (expanded) panel.current?.focus({ preventScroll: true }); }, [expanded]);
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
        if (state.status !== 'playing' && state.status !== 'paused') return;
        const segment = state.segments.find(s => s.index === currentIndex);
        const block = segment && target?.blocks?.[segment.paragraph_id];
        if (block) return highlightReadingBlock(block);
    }, [currentIndex, state.segments, state.status, target]);
    const choose = (value: string) => {
        controller.stop();
        sessionPreferences.set(language, value);
        try { localStorage.setItem(preferenceKey(language), value); } catch { /* Storage can be disabled. */ }
        window.dispatchEvent(new Event(PREFERENCE_EVENT));
    };
    const readPage = () => {
        const root = document.getElementById('contenuto');
        onRead({ id: 'page', text: '', language: lang, ...(root ? pageReadingSource(root) : {}) });
    };
    const active = state.status === 'playing' || state.status === 'buffering';
    const playbackLabel = t(active ? 'voice.pause' : state.status === 'idle' || state.status === 'error' ? 'voice.listen' : 'voice.resume');
    const togglePlayback = () => {
        if (active) controller.pause();
        else if (state.status === 'idle' || state.status === 'error') { if (target) onRead(target); }
        else controller.resume();
    };
    const available = catalogEngine === engine ? voices.filter(v => v.locale.split('-')[0] === language) : [];
    const currentPosition = state.segments.findIndex(s => s.index === state.current);
    return <aside ref={panel} aria-label={t('voice.title')} tabIndex={-1} data-voice-ignore data-voice-reader
        onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); onClose(); } }}
        className="voice-reader-panel border-slate-200 bg-slate-50 text-slate-900">
        <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 border-b border-slate-200 bg-white">
                <div className="flex items-center justify-between gap-1 px-3 py-2">
                    <h2 className={`min-w-0 flex-1 font-display font-bold ${expanded ? 'text-xl' : 'text-base'}`}>{t('voice.title')}</h2>
                    {!expanded && <Button type="button" variant="secondary" disabled={!target} onClick={togglePlayback} aria-label={playbackLabel} className="min-h-[44px] min-w-[44px] px-2">{active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button>}
                    <Button type="button" variant="ghost" onClick={onToggle} aria-label={t(expanded ? 'voice.minimize' : 'voice.expand')} aria-expanded={expanded} className="min-h-[44px] min-w-[44px] px-2">{expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Button>
                    <Button type="button" variant="ghost" onClick={onClose} aria-label={t('voice.close')} className="min-h-[44px] min-w-[44px] px-2"><X className="h-5 w-5" /></Button>
                </div>
                <div hidden={!expanded} className="max-h-[min(40dvh,calc(65dvh-14rem))] space-y-3 overflow-y-auto px-4 pb-4 sm:px-5 sm:pb-5 lg:max-h-[40dvh]">
                <div className="grid grid-cols-1 gap-3">
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
            <div className={`shrink-0 space-y-2 px-4 sm:px-5 ${expanded ? 'border-b border-slate-200 py-3' : 'py-1'}`}>
                <div hidden={!expanded}>
                <div className="flex flex-wrap items-center gap-1">
                    <Button variant="ghost" onClick={controller.previous} disabled={currentPosition <= 0} aria-label={t('voice.previous')} className="min-h-[44px] min-w-[44px] px-2"><SkipBack className="h-5 w-5" /></Button>
                    <Button variant="secondary" disabled={!target} onClick={togglePlayback}>{active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{playbackLabel}</Button>
                    <Button variant="ghost" onClick={controller.next} disabled={currentPosition < 0 || currentPosition >= state.segments.length - 1} aria-label={t('voice.next')} className="min-h-[44px] min-w-[44px] px-2"><SkipForward className="h-5 w-5" /></Button>
                    <Button variant="ghost" onClick={controller.stop} disabled={state.status === 'idle'} aria-label={t('voice.stop')} className="min-h-[44px] min-w-[44px] px-2"><Square className="h-4 w-4" /></Button>
                </div>
                </div>
                <p role="status" className={`${expanded ? 'text-sm' : 'truncate text-xs'} text-slate-600`}>{t(`voice.${state.status === 'error' ? 'error.request' : state.status}`)}{currentPosition >= 0 && ` · ${t('voice.progress', { current: currentPosition + 1, total: state.segments.length })}`}</p>
                {expanded && state.generating && <p className="text-xs text-slate-500">{t('voice.generating')}</p>}
                {state.error && <p role="alert" className="text-sm text-red-700">{t(`voice.error.${state.error}`)}</p>}
                {expanded && <p className="text-xs text-slate-500">{t('voice.pageHelp')}</p>}
            </div>
        </div>
    </aside>;
}
