'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { FileAudio, Loader2, Mic, Pause, Play, Square, X } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { ChatActionsPopover } from './ChatActionsPopover';
import { useAudioAutoSend } from './AudioSendOption';
import { VoiceReaderController } from '@/lib/voice-reader';
import { speechInput } from '@/components/voice-reader/VoiceReader';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_SECONDS = 180;
type Stage = 'idle' | 'permission' | 'recording' | 'transcribing' | 'waiting' | 'reply';

export function AudioInput({ value, onChange, onSend, onBusyChange, composerId, sessionKey, disabled, maxLength = 60000, voiceMode = false, onExitVoice, counselorId, voiceOptionsContainer }: {
    value: string;
    onChange: (text: string) => void;
    onSend: (text: string) => Promise<string | undefined>;
    onBusyChange: (busy: boolean) => void;
    composerId: string;
    sessionKey: string;
    disabled?: boolean;
    maxLength?: number;
    voiceMode?: boolean;
    onExitVoice?: () => void;
    counselorId?: number | null;
    voiceOptionsContainer?: HTMLElement | null;
}) {
    const { t, lang } = useI18n();
    const autoSend = useAudioAutoSend();
    const [stage, setStage] = useState<Stage>('idle');
    const [error, setErrorCode] = useState('');
    const [seconds, setSeconds] = useState(0);
    const [overflow, setOverflow] = useState('');
    const [retry, setRetry] = useState(false);
    const [speech] = useState(() => new VoiceReaderController());
    const playback = useSyncExternalStore(speech.subscribe, speech.getSnapshot, speech.getSnapshot);
    const replyText = useRef('');
    const fileInput = useRef<HTMLInputElement>(null);
    const talkButton = useRef<HTMLButtonElement>(null);
    const recorder = useRef<MediaRecorder | null>(null);
    const stream = useRef<MediaStream | null>(null);
    const request = useRef<AbortController | null>(null);
    const generation = useRef(0);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const recorded = useRef<Blob | null>(null);
    const latest = useRef({ value, onChange, onSend, autoSend, voiceMode });
    useLayoutEffect(() => { latest.current = { value, onChange, onSend, autoSend, voiceMode }; }, [value, onChange, onSend, autoSend, voiceMode]);
    useEffect(() => { onBusyChange(stage !== 'idle' && stage !== 'reply'); }, [stage, onBusyChange]);

    const releaseMicrophone = useCallback(() => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
        stream.current?.getTracks().forEach(track => track.stop());
        stream.current = null;
    }, []);
    const cancel = useCallback(() => {
        generation.current += 1;
        speech.stop();
        replyText.current = '';
        request.current?.abort();
        request.current = null;
        if (recorder.current) {
            recorder.current.onstop = null;
            if (recorder.current.state !== 'inactive') recorder.current.stop();
            recorder.current = null;
        }
        releaseMicrophone();
        recorded.current = null;
        setStage('idle');
        setRetry(false);
        setOverflow('');
        setErrorCode('');
        onBusyChange(false);
    }, [onBusyChange, releaseMicrophone, speech]);
    useEffect(() => {
        window.addEventListener('pagehide', cancel);
        window.addEventListener('counselorbot-audio-playback', cancel);
        return () => {
            window.removeEventListener('pagehide', cancel);
            window.removeEventListener('counselorbot-audio-playback', cancel);
            cancel();
        };
    }, [cancel, lang, sessionKey, voiceMode, counselorId]);
    useEffect(() => { if (voiceMode) talkButton.current?.focus(); }, [voiceMode]);
    const voiceError = error || (stage === 'reply' ? playback.error : null);
    useEffect(() => {
        // Reveal recovery controls when an error needs attention, even with the menu closed.
        if (voiceMode && voiceError) voiceOptionsContainer?.closest<HTMLElement>('[popover]')?.showPopover();
    }, [voiceMode, voiceError, voiceOptionsContainer]);

    function playReply() {
        void speech.start(speechInput({ id: 'voice-conversation', text: replyText.current, language: lang, counselorId }));
    }

    async function sendAndSpeak(text: string, token: number) {
        setStage('waiting');
        try {
            const reply = await latest.current.onSend(text);
            if (token !== generation.current) return;
            if (!reply?.trim()) { setErrorCode('reply'); setStage('idle'); return; }
            replyText.current = reply;
            setStage('reply');
            playReply();
        } catch {
            if (token === generation.current) { setErrorCode('reply'); setStage('idle'); }
        }
    }

    function insert(text: string, close: () => void) {
        const draft = latest.current.value;
        const combined = draft.trim() ? `${draft.trimEnd()}\n${text.trim()}` : text.trim();
        if (combined.length > maxLength) {
            setOverflow(text);
            setErrorCode('too_much_text');
            return;
        }
        setOverflow('');
        setErrorCode('');
        latest.current.onChange(combined);
        if (latest.current.voiceMode) return sendAndSpeak(combined, generation.current);
        if (latest.current.autoSend) void latest.current.onSend(combined);
        close();
        window.requestAnimationFrame(() => document.getElementById(composerId)?.focus());
    }

    async function transcribe(blob: Blob, close: () => void, token: number) {
        if (token !== generation.current) return;
        setErrorCode('');
        setRetry(false);
        if (blob.size > MAX_BYTES || !blob.size) {
            setStage('idle');
            setErrorCode(blob.size ? 'too_large' : 'empty');
            return;
        }
        recorded.current = blob;
        setStage('transcribing');
        const controller = new AbortController();
        request.current = controller;
        const form = new FormData();
        form.append('audio', blob, 'recording');
        form.append('language', lang);
        try {
            const response = await apiFetch('/api/audio/transcribe', { method: 'POST', body: form, signal: controller.signal });
            const result = await response.json();
            if (token !== generation.current) return;
            if (!response.ok) {
                const codes = ['too_large', 'too_long', 'invalid_audio', 'empty', 'busy', 'unavailable', 'timeout'];
                setErrorCode(response.status === 401 ? 'auth' : codes.includes(result.detail) ? result.detail : 'unavailable');
                setRetry(response.status >= 500);
            } else if (typeof result.text !== 'string' || !result.text.trim()) {
                setErrorCode('empty');
            } else {
                recorded.current = null;
                await insert(result.text, close);
            }
        } catch {
            if (token === generation.current) { setErrorCode('unavailable'); setRetry(true); }
        } finally {
            if (token === generation.current) {
                setStage(current => current === 'transcribing' ? 'idle' : current);
                request.current = null;
            }
        }
    }

    async function startRecording(close: () => void) {
        cancel();
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            setErrorCode('unsupported');
            return;
        }
        const token = generation.current;
        setStage('permission');
        window.dispatchEvent(new Event('counselorbot-audio-recording'));
        try {
            const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
            if (token !== generation.current) { media.getTracks().forEach(track => track.stop()); return; }
            stream.current = media;
            const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
            const active = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
            recorder.current = active;
            const chunks: Blob[] = [];
            let size = 0;
            active.ondataavailable = event => {
                if (token !== generation.current) return;
                size += event.data.size;
                if (size > MAX_BYTES) { cancel(); setErrorCode('too_large'); return; }
                if (event.data.size) chunks.push(event.data);
            };
            active.onerror = () => { if (token === generation.current) { cancel(); setErrorCode('recording'); } };
            active.onstop = () => {
                releaseMicrophone();
                recorder.current = null;
                void transcribe(new Blob(chunks, { type: active.mimeType }), close, token);
            };
            active.start(1000);
            setSeconds(0);
            setStage('recording');
            const started = Date.now();
            timers.current = [setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000),
                setTimeout(() => { if (active.state === 'recording') active.stop(); }, (MAX_SECONDS - 1) * 1000)];
        } catch (cause) {
            if (token !== generation.current) return;
            cancel();
            setErrorCode(cause instanceof DOMException && cause.name === 'NotAllowedError' ? 'permission' : 'recording');
        }
    }

    const actionClass = 'flex min-h-[44px] w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-slate-100 disabled:opacity-50';
    if (voiceMode) {
        const speaking = stage === 'reply' && (playback.status === 'playing' || playback.status === 'buffering');
        const waiting = stage === 'permission' || stage === 'transcribing' || stage === 'waiting';
        const status = stage === 'recording' ? t('audio.recording', { seconds })
            : stage === 'idle' || (stage === 'reply' && playback.status === 'complete') ? t('audio.voice.ready')
            : stage === 'reply' ? t(`voice.${playback.status === 'error' ? 'paused' : playback.status}`)
            : t(`audio.${stage}`);
        return <><div role="group" aria-label={t('audio.voice.title')} className="min-w-0 flex-1" data-voice-ignore
            onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); cancel(); onExitVoice?.(); } }}>
            <button ref={talkButton} type="button" disabled={waiting || (disabled && stage !== 'recording')} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => { if (stage === 'recording') { if (recorder.current?.state === 'recording') recorder.current.stop(); } else void startRecording(() => {}); }}>
                {waiting ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" /> : stage === 'recording' ? <Square className="h-5 w-5 shrink-0" /> : <Mic className="h-5 w-5 shrink-0" />}
                {waiting ? status : stage === 'recording' ? t('audio.voice.send') : speaking ? t('audio.voice.interrupt') : t('audio.voice.talk')}
            </button>
        </div>
        {voiceOptionsContainer && createPortal(<div className="space-y-2" data-voice-ignore>
            <p className="px-2 text-sm font-semibold">{t('audio.voice.title')}</p>
            <p role="status" className="px-2 text-xs text-slate-500">{status}</p>
            {stage === 'reply' && <button type="button" className={actionClass} onClick={() => {
                if (speaking) speech.pause();
                else if (playback.status === 'paused') speech.resume();
                else playReply();
            }}>{speaking ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{t(speaking ? 'voice.pause' : playback.status === 'paused' ? 'voice.resume' : 'audio.voice.replay')}</button>}
            {error && <p role="alert" className="text-sm text-red-700">{t(`audio.error.${error}`)}</p>}
            {stage === 'reply' && playback.error && <p role="alert" className="text-sm text-red-700">{t(`voice.error.${playback.error}`)}</p>}
            {retry && <button type="button" className={actionClass} onClick={() => { if (recorded.current) void transcribe(recorded.current, () => {}, generation.current); }}>{t('audio.retry')}</button>}
            {overflow && <>
                <textarea aria-label={t('audio.transcript')} value={overflow} onChange={event => setOverflow(event.target.value)} rows={3} className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm" />
                <button type="button" className={actionClass} onClick={() => void insert(overflow, () => {})}>{t('audio.voice.send')}</button>
            </>}
            <button type="button" className={actionClass} onClick={() => {
                voiceOptionsContainer.closest<HTMLElement>('[popover]')?.hidePopover();
                cancel(); onExitVoice?.();
                window.requestAnimationFrame(() => document.getElementById(composerId)?.focus());
            }}><X className="h-4 w-4 shrink-0" />{t('audio.voice.exit')}</button>
            <p className="px-2 text-xs text-slate-500">{t('audio.voice.help')}</p>
        </div>, voiceOptionsContainer)}</>;
    }
    return <ChatActionsPopover label={t('audio.add')} icon={<Mic className="h-5 w-5" aria-hidden="true" />} disabled={disabled}
        onOpenChange={open => { if (!open) cancel(); }}>
        {close => <div className="space-y-2" data-voice-ignore>
            <p className="px-2 text-xs text-slate-500">{t(autoSend ? 'audio.helpAuto' : 'audio.help')}</p>
            <input ref={fileInput} type="file" accept="audio/*,.webm,.ogg,.wav,.mp3,.m4a,.mp4,.flac" className="hidden" aria-label={t('audio.upload')}
                onChange={event => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) { cancel(); void transcribe(file, close, generation.current); }
                }} />
            {stage === 'idle' && <>
                <button type="button" className={actionClass} onClick={() => void startRecording(close)}><Mic className="h-4 w-4 shrink-0" />{t('audio.record')}</button>
                <button type="button" className={actionClass} onClick={() => fileInput.current?.click()}><FileAudio className="h-4 w-4 shrink-0" />{t('audio.upload')}</button>
            </>}
            {stage !== 'idle' && <p role="status" className="flex items-center gap-2 px-2 text-sm text-indigo-700">
                {stage === 'recording' ? <Mic className="h-4 w-4 shrink-0" /> : <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
                {stage === 'recording' ? t('audio.recording', { seconds }) : t(`audio.${stage}`)}
            </p>}
            {stage === 'recording' && <button type="button" className={actionClass} onClick={() => { if (recorder.current?.state === 'recording') recorder.current.stop(); }}><Square className="h-4 w-4 shrink-0" />{t('audio.stop')}</button>}
            {error && <p role="alert" className="px-2 text-sm text-red-700">{t(`audio.error.${error}`)}</p>}
            {retry && <button type="button" className={actionClass} onClick={() => { if (recorded.current) void transcribe(recorded.current, close, generation.current); }}>{t('audio.retry')}</button>}
            {overflow && <>
                <textarea aria-label={t('audio.transcript')} value={overflow} onChange={event => setOverflow(event.target.value)} rows={5} className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm" />
                <button type="button" className={actionClass} onClick={() => insert(overflow, close)}>{t('audio.insert')}</button>
            </>}
            <button type="button" className={actionClass} onClick={() => { cancel(); close(); }}><X className="h-4 w-4 shrink-0" />{t('audio.cancel')}</button>
        </div>}
    </ChatActionsPopover>;
}
