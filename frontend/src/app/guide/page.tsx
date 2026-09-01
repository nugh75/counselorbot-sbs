'use client';

// Guida all'interfaccia: una pagina statica e tradotta che spiega, sezione per
// sezione, le schermate principali di CounselorBot. I testi vivono in i18n
// (chiavi `guide.*`) nelle sei lingue.

import Image from 'next/image';
import { ChevronLeft, ChevronRight, MessageSquareText, Send, Snowflake, ThumbsDown, ThumbsUp, Volume2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { useI18n } from '@/lib/i18n-context';

const SECTION_COUNT = 9;

export default function GuidePage() {
    const { t } = useI18n();
    const sections = Array.from({ length: SECTION_COUNT }, (_, i) => i + 1);
    const chatControls = [
        { key: 'suggested', icon: <MessageSquareText className="h-4 w-4" aria-hidden="true" /> },
        { key: 'freeze', icon: <Snowflake className="h-4 w-4" aria-hidden="true" /> },
        { key: 'length', icon: <span className="font-mono text-xs font-bold" aria-hidden="true">S M L</span> },
        { key: 'message', icon: <Send className="h-4 w-4" aria-hidden="true" /> },
        { key: 'navigation', icon: <span className="flex" aria-hidden="true"><ChevronLeft className="h-4 w-4" /><ChevronRight className="h-4 w-4" /></span> },
        { key: 'feedback', icon: <span className="flex gap-1" aria-hidden="true"><Volume2 className="h-4 w-4" /><ThumbsUp className="h-4 w-4" /><ThumbsDown className="h-4 w-4" /></span> },
    ];

    return (
        <div className="page-narrow space-y-8">
            <PageHeader title={t('guide.title')} subtitle={t('guide.subtitle')} backHref="/" backLabel={t('guide.back')} />

            <ol className="space-y-4">
                {sections.map((n) => (
                    <li key={n} className="glass-panel p-5 text-left">
                        <div className="flex gap-4">
                            <span className="font-mono text-sm font-semibold text-ochre-500 shrink-0 pt-0.5">
                                {String(n).padStart(2, '0')}
                            </span>
                            <div className="min-w-0">
                                <h2 className="font-bold text-slate-900">{t(`guide.section${n}.title`)}</h2>
                                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                                    {t(`guide.section${n}.body`)}
                                </p>
                            </div>
                        </div>

                        {n === 7 && (
                            <div className="mt-6 space-y-6 border-t border-slate-100 pt-6">
                                <figure>
                                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                                        <Image
                                            src="/guide/chat-guidata.png"
                                            width={1440}
                                            height={1098}
                                            alt={t('guide.chat.overviewAlt')}
                                            className="h-auto w-full"
                                        />
                                    </div>
                                    <figcaption className="mt-2 text-xs leading-relaxed text-slate-500">
                                        {t('guide.chat.overviewCaption')}
                                    </figcaption>
                                </figure>

                                <div>
                                    <h3 className="font-semibold text-slate-900">{t('guide.chat.controlsTitle')}</h3>
                                    <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t('guide.chat.controlsIntro')}</p>
                                </div>

                                <figure>
                                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                                        <Image
                                            src="/guide/controlli-chat.png"
                                            width={803}
                                            height={171}
                                            alt={t('guide.chat.controlsAlt')}
                                            className="h-auto w-full"
                                        />
                                    </div>
                                    <figcaption className="mt-2 text-xs leading-relaxed text-slate-500">
                                        {t('guide.chat.controlsCaption')}
                                    </figcaption>
                                </figure>

                                <dl className="grid gap-3 sm:grid-cols-2">
                                    {chatControls.map((control) => (
                                        <div key={control.key} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                                            <dt className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                                <span className="flex min-h-7 min-w-7 items-center justify-center rounded-md border border-slate-200 bg-white px-1.5 text-slate-600">
                                                    {control.icon}
                                                </span>
                                                {t(`guide.chat.${control.key}.title`)}
                                            </dt>
                                            <dd className="mt-2 text-xs leading-relaxed text-slate-600">
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
        </div>
    );
}
