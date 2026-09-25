'use client';

// Public, localized guide. The audience query selects documentation, not permissions.

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Image, { type StaticImageData } from 'next/image';
import chatOverview from '../../../public/guide/chat-guidata.png';
import chatControlsImage from '../../../public/guide/controlli-chat.png';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MoreVertical, RotateCcw, Send, Snowflake, ThumbsDown, ThumbsUp, Volume2, X } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { getIdentity, type Identity } from '@/lib/auth';
import { canUseTeacherAssistant } from '@/lib/roles';
import { useI18n } from '@/lib/i18n-context';
import { counselorHelp } from '@/lib/i18n-counselor-help';

import { categoryText } from '@/lib/i18n-institution-categories';
import { guideAudienceText, type GuideAudienceKey } from '@/lib/i18n-guide-audiences';
import { guideImages } from '@/lib/guide-images';

const TEACHER_ROUTES = ['/docente', '/docente', '/docente', '/docente', '/docente', '/docente', '/bussola'];

export default function GuidePage() {
    return <Suspense><GuideContent /></Suspense>;
}

function GuideContent() {
    const { t, lang } = useI18n();
    const params = useSearchParams();
    // Senza parametro esplicito la guida segue il ruolo dell'utente: docenti,
    // ricercatori e admin aprono la versione docente, tutti gli altri quella
    // studente. Gli studenti non vedono il selettore né la versione docente.
    const identityRef = useRef<Identity | null>(null);
    const [audience, setAudience] = useState<'student' | 'teacher' | null>(() => {
        const a = params.get('audience');
        return a === 'teacher' ? 'teacher' : a === 'student' ? 'student' : null;
    });
    const [isTeacherUser, setIsTeacherUser] = useState(false);
    useEffect(() => {
        let cancelled = false;
        getIdentity().then((identity) => {
            if (cancelled || !identity) return;
            identityRef.current = identity;
            setIsTeacherUser(canUseTeacherAssistant(identity));
            if (!params.get('audience')) {
                setAudience(canUseTeacherAssistant(identity) ? 'teacher' : 'student');
            }
        });
        return () => { cancelled = true; };
    }, [params]);
    const teacher = audience === 'teacher';
    const showAudienceSelector = params.get('audience') !== 'student' && isTeacherUser;
    const l = (key: GuideAudienceKey) => guideAudienceText(lang, key);
    const sections = Array.from({ length: teacher ? 7 : 15 }, (_, i) => i + 1);
    const sectionId = (n: number) => `guide-${teacher ? 'teacher-' : ''}section-${n}`;
    const sectionTitle = (n: number) => teacher ? l(`teacher${n}Title` as GuideAudienceKey) : t(`guide.section${n}.title`);
    const sectionBody = (n: number) => teacher ? l(`teacher${n}Body` as GuideAudienceKey) : n === 15 ? l('personalGroups') : t(`guide.section${n}.body`) + (n === 12 ? ` ${categoryText(lang, 'guideDirectory')}` : '');
    const images = guideImages[lang];
    const spotIllustrations: Record<number, string> = teacher ? {
        1: '/images/platform/feedback-docente.png',
        2: '/images/platform/classi.png',
        3: '/images/platform/idea.png',
        4: '/images/platform/assegnazioni.png',
        5: '/images/platform/chat-guidata.png',
        7: '/images/platform/bussola.png',
    } : {
        1: '/images/platform/bussola.png',
        2: '/images/platform/idea.png',
        3: '/images/platform/compilazioni.png',
        4: '/images/platform/counselor.png',
        5: '/images/platform/tavolo.png',
        6: '/images/platform/su-di-me.png',
        7: '/images/platform/chat-guidata.png',
        8: '/images/intro/practice.png',
        9: '/images/platform/carte-ordinare.png',
        10: '/images/platform/eventi.png',
        11: '/images/platform/bacheca-azioni.png',
        12: '/images/platform/libretto.png',
        13: '/images/platform/linea-del-tempo.png',
        14: '/images/platform/assegnazioni.png',
        15: '/images/platform/classi.png',
    };
    const sectionImages: Record<number, { image: StaticImageData; caption: string }[]> = teacher ? {
        1: [{ image: images['teacher-area'], caption: l('teacher1Title') }],
        2: [{ image: images['teacher-groups'], caption: l('teacher2Title') }, { image: images['institution-categories'], caption: categoryText(lang, 'title') }],
        3: [{ image: images['teacher-catalog'], caption: l('teacher3Title') }],
        4: [{ image: images['teacher-assignment'], caption: l('teacher4Title') }],
        5: [{ image: images['teacher-feedback'], caption: l('teacher5Title') }],
        6: [{ image: images['goal-sharing'], caption: l('teacher6Title') }],
        7: [
            { image: images['study-event'], caption: t('guide.section10.title') },
            { image: images['professional-event'], caption: t('guide.section11.title') },
        ],
    } : {
        1: [{ image: images['access'], caption: t('guide.section1.title') }],
        2: [{ image: images['introduction'], caption: t('guide.section2.title') }],
        3: [{ image: images['activities'], caption: t('guide.section3.title') }],
        4: [{ image: images['counselors'], caption: t('guide.section4.title') }],
        5: [{ image: images['tool-selection'], caption: t('guide.section5.title') }],
        6: [{ image: images['notebook'], caption: t('guide.section6.title') }],
        8: [
            { image: images['pdf-study'], caption: t('pqbl.card.title') },
            { image: images['flashcards'], caption: t('profile.area.flashcards.title') },
        ],
        9: [{ image: images['cards'], caption: t('guide.section9.title') }],
        10: [{ image: images['study-event'], caption: t('guide.section10.title') }],
        11: [{ image: images['professional-event'], caption: t('guide.section11.title') }],
        12: [
            { image: images['personal-area'], caption: t('guide.section12.title') },
            { image: images['personal-goals'], caption: t('guide.section12.title') },
            { image: images['orientation'], caption: t('referrals.area.title') },
        ],
        13: [{ image: images['calendar'], caption: t('guide.section13.title') }],
        14: [{ image: images['received-assignments'], caption: t('guide.section14.title') }],
        15: [{ image: images['personal-groups'], caption: t('guide.section15.title') }],
    };
    const chatControls = [
        { key: 'options', icon: <MoreVertical className="h-4 w-4" aria-hidden="true" /> },
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
        { key: 'navigation', icon: <span className="flex" aria-hidden="true"><ChevronLeft className="h-4 w-4" /><RotateCcw className="h-4 w-4" /><ChevronRight className="h-4 w-4" /></span> },
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

    const renderFigure = (image: StaticImageData, alt: string, caption: string) => (
        <figure className={image.width < image.height ? "mx-auto max-w-sm" : undefined}>
            <button
                type="button"
                onClick={(event) => openZoom(image.src, alt, event.currentTarget)}
                aria-label={`${t('guide.zoomHint')}: ${alt}`}
                className="block w-full cursor-zoom-in rounded-lg text-left"
            >
                <span className="block overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    <Image
                        src={image}
                        width={image.width}
                        height={image.height}
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
            <PageHeader title={t('guide.title')} subtitle={t('guide.subtitle')} backHref="/" />

            <div className="space-y-3">
                <nav aria-label={l('audience')} className="flex flex-wrap gap-2">
                    {showAudienceSelector && (['student', 'teacher'] as const).map(audienceOption => (
                        <a key={audienceOption} href={`/guide?audience=${audienceOption}`}
                            aria-current={teacher === (audienceOption === 'teacher') ? 'page' : undefined}
                            className={`inline-flex min-h-11 items-center rounded-lg border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${teacher === (audienceOption === 'teacher') ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}>
                            {l(audienceOption)}
                        </a>
                    ))}
                </nav>
                <p className="text-sm leading-relaxed text-slate-700">{l(teacher ? 'teacherIntro' : 'studentIntro')}</p>
                <p className="text-xs leading-relaxed text-slate-500">{l('screenshots')}</p>
            </div>

            {/* Indice con ancore (GUA-03): ogni sezione è raggiungibile senza
                attraversare l'intero documento. */}
            <nav aria-label={t('guide.indexTitle')} className="glass-panel p-5">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{t('guide.indexTitle')}</h2>
                <ol className="mt-3 space-y-1">
                    {sections.map((n) => (
                        <li key={n}>
                            <a
                                href={`#${sectionId(n)}`}
                                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                                <span className="font-mono text-xs font-semibold text-ochre-600 dark:text-ochre-200">
                                    {String(n).padStart(2, '0')}
                                </span>
                                <span className="min-w-0">{sectionTitle(n)}</span>
                            </a>
                            {!teacher && n === 7 && (
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
                    <li key={n} id={sectionId(n)} className="glass-panel scroll-mt-24 p-5 text-left">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex gap-4">
                                <span className="font-mono text-sm font-semibold text-ochre-600 shrink-0 pt-0.5">
                                    {String(n).padStart(2, '0')}
                                </span>
                                <div className="min-w-0">
                                    <h2 className="font-bold text-slate-900">{sectionTitle(n)}</h2>
                                    <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-slate-600">
                                        {sectionBody(n)}
                                    </p>
                                </div>
                            </div>
                            {spotIllustrations[n] && (
                                <div className="hidden sm:block shrink-0">
                                    <Image
                                        src={spotIllustrations[n]}
                                        alt=""
                                        width={80}
                                        height={80}
                                        className="h-20 w-20 object-contain"
                                    />
                                </div>
                            )}
                        </div>

                        {teacher && (
                            <Link href={TEACHER_ROUTES[n - 1]} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-indigo-700 underline">{l('open')}</Link>
                        )}
                        {sectionImages[n] && (
                            <div className="mt-6 space-y-6">
                                {sectionImages[n].map(({ image, caption }) => <div key={image.src}>{renderFigure(image, caption, caption)}</div>)}
                            </div>
                        )}
                        {!teacher && n === 4 && (
                            <div className="mt-4 space-y-2 text-sm leading-relaxed text-slate-600">
                                <h3 className="font-semibold text-slate-900">{counselorHelp(lang).title}</h3>
                                <p>{counselorHelp(lang).local}</p>
                                <p>{counselorHelp(lang).external}</p>
                                <p>{counselorHelp(lang).tools}</p>
                            </div>
                        )}
                        {!teacher && n === 7 && (
                            <div className="mt-6 space-y-6 border-t border-slate-100 pt-6">
                                {renderFigure(chatOverview, t('guide.chat.overviewAlt'), t('guide.chat.overviewCaption'))}

                                <div>
                                    <h3 className="font-semibold text-slate-900">{t('guide.chat.controlsTitle')}</h3>
                                    <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-slate-600">{t('guide.chat.controlsIntro')}</p>
                                </div>

                                {renderFigure(chatControlsImage, t('guide.chat.controlsAlt'), t('guide.chat.controlsCaption'))}

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
                        className="absolute z-10 right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                    >
                        <X className="h-5 w-5" />
                    </button>
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 sm:p-12">
                        <div className="relative h-full w-full">
                            <Image src={zoom.src} alt={zoom.alt} fill sizes="100vw" className="object-contain" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
