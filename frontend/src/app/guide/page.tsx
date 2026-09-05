'use client';

// Guida all'interfaccia: una pagina statica e tradotta che spiega, sezione per
// sezione, le schermate principali di CounselorBot. I testi vivono in i18n
// (chiavi `guide.*`) nelle sei lingue.

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal, Send, Snowflake, ThumbsDown, ThumbsUp, Volume2, X } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { useI18n } from '@/lib/i18n-context';

const SECTION_COUNT = 9;

export default function GuidePage() {
    const { t } = useI18n();
    const sections = Array.from({ length: SECTION_COUNT }, (_, i) => i + 1);
    const chatControls = [
        { key: 'options', icon: <MoreHorizontal className="h-4 w-4" aria-hidden="true" /> },
        { key: 'freeze', icon: <Snowflake className="h-4 w-4" aria-hidden="true" /> },
        {
            key: 'length',
            icon: (
                <span className="flex flex-col items-center gap-0.5" aria-hidden="true">
                    <span className="h-px w-2 rounded-full bg-current" />
                    <span className="h-px w-3 rounded-full bg-current" />
                    <span className="h-px w-4 rounded-full bg-current" />
                </span>
            ),
        },
        { key: 'message', icon: <Send className="h-4 w-4" aria-hidden="true" /> },
        { key: 'navigation', icon: <span className="flex" aria-hidden="true"><ChevronLeft className="h-4 w-4" /><ChevronRight className="h-4 w-4" /></span> },
        { key: 'feedback', icon: <span className="flex gap-1" aria-hidden="true"><Volume2 className="h-4 w-4" /><ThumbsUp className="h-4 w-4" /><ThumbsDown className="h-4 w-4" /></span> },
    ];

    // Ingrandimento delle immagini (GUA-02): overlay fullscreen con un solo
    // elemento focalizzabile (chiusura), Escape e ritorno del focus al trigger.
    const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);
    const zoomTrigger = useRef<HTMLElement | null>(null);
    const zoomCloseRef = useRef<HTMLButtonElement>(null);

    const closeZoom = useCallback(() => {
        setZoom(null);
        zoomTrigger.current?.focus();
        zoomTrigger.current = null;
    }, []);

    useEffect(() => {
        if (!zoom) return;
        zoomCloseRef.current?.focus();
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeZoom();
            if (e.key === 'Tab') {
                // Un solo elemento interattivo nell'overlay: trattieni il focus.
                e.preventDefault();
                zoomCloseRef.current?.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [zoom, closeZoom]);

    const openZoom = (src: string, alt: string, trigger: HTMLElement) => {
        zoomTrigger.current = trigger;
        setZoom({ src, alt });
    };

    const renderFigure = (src: string, alt: string, caption: string) => (
        <figure>
            <button
                type="button"
                onClick={(event) => openZoom(src, alt, event.currentTarget)}
                aria-label={t('guide.zoomHint')}
                className="block w-full cursor-zoom-in rounded-lg text-left"
            >
                <span className="block overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    <Image
                        src={src}
                        width={src === '/guide/chat-guidata.png' ? 1440 : 764}
                        height={src === '/guide/chat-guidata.png' ? 900 : 260}
                        alt={alt}
                        className="h-auto w-full"
                    />
                </span>
            </button>
            <figcaption className="mt-2 text-xs leading-relaxed text-slate-500">
                {caption}
            </figcaption>
        </figure>
    );

    return (
        <div className="page-narrow scroll-smooth space-y-8">
            <PageHeader title={t('guide.title')} subtitle={t('guide.subtitle')} backHref="/" backLabel={t('guide.back')} />

            {/* Indice con ancore (GUA-03): ogni sezione è raggiungibile senza
                attraversare l'intero documento. */}
            <nav aria-label={t('guide.indexTitle')} className="glass-panel p-5">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{t('guide.indexTitle')}</h2>
                <ol className="mt-3 space-y-1">
                    {sections.map((n) => (
                        <li key={n}>
                            <a
                                href={`#guide-section-${n}`}
                                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                                <span className="font-mono text-xs font-semibold text-ochre-600 dark:text-ochre-200">
                                    {String(n).padStart(2, '0')}
                                </span>
                                <span className="truncate">{t(`guide.section${n}.title`)}</span>
                            </a>
                            {n === 7 && (
                                <a
                                    href="#guide-chat-controls"
                                    className="ml-8 flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-700"
                                >
                                    {t('guide.chat.controlsTitle')}
                                </a>
                            )}
                        </li>
                    ))}
                </ol>
            </nav>

            <ol className="space-y-4">
                {sections.map((n) => (
                    <li key={n} id={`guide-section-${n}`} className="glass-panel scroll-mt-24 p-5 text-left">
                        <div className="flex gap-4">
                            <span className="font-mono text-sm font-semibold text-ochre-600 shrink-0 pt-0.5">
                                {String(n).padStart(2, '0')}
                            </span>
                            <div className="min-w-0">
                                <h2 className="font-bold text-slate-900">{t(`guide.section${n}.title`)}</h2>
                                <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-slate-600">
                                    {t(`guide.section${n}.body`)}
                                </p>
                            </div>
                        </div>

                        {n === 7 && (
                            <div className="mt-6 space-y-6 border-t border-slate-100 pt-6">
                                {renderFigure('/guide/chat-guidata.png', t('guide.chat.overviewAlt'), t('guide.chat.overviewCaption'))}

                                <div>
                                    <h3 className="font-semibold text-slate-900">{t('guide.chat.controlsTitle')}</h3>
                                    <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-slate-600">{t('guide.chat.controlsIntro')}</p>
                                </div>

                                {renderFigure('/guide/controlli-chat.png', t('guide.chat.controlsAlt'), t('guide.chat.controlsCaption'))}

                                <dl id="guide-chat-controls" className="grid scroll-mt-24 gap-3 sm:grid-cols-2">
                                    {chatControls.map((control) => (
                                        <div key={control.key} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                                            <dt className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                                <span className="flex min-h-7 min-w-7 items-center justify-center rounded-md border border-slate-200 bg-white px-1.5 text-slate-600">
                                                    {control.icon}
                                                </span>
                                                {t(`guide.chat.${control.key}.title`)}
                                            </dt>
                                            <dd className="mt-2 text-sm leading-relaxed text-slate-600">
                                                {t(`guide.chat.${control.key}.body`)}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>

                                <p className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs leading-relaxed text-indigo-900">
                                    {t('guide.chat.keyboardHint')}
                                </p>
                            </div>
                        )}
                    </li>
                ))}
            </ol>

            {zoom && (
                <div
                    className="fixed inset-0 z-[80] bg-slate-950/90"
                    role="dialog"
                    aria-modal="true"
                    aria-label={zoom.alt}
                    onClick={(event) => {
                        if (event.target === event.currentTarget) closeZoom();
                    }}
                >
                    <button
                        type="button"
                        ref={zoomCloseRef}
                        onClick={closeZoom}
                        aria-label={t('guide.zoomClose')}
                        className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                    >
                        <X className="h-5 w-5" />
                    </button>
                    <div className="absolute inset-0 flex items-center justify-center p-6 sm:p-12">
                        <div className="relative h-full w-full">
                            <Image src={zoom.src} alt={zoom.alt} fill sizes="100vw" className="object-contain" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
