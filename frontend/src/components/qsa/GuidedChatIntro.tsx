'use client';

import { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Compass, ExternalLink, X } from 'lucide-react';
import { guidedIntroText, guideSectionFor } from '@/lib/i18n-guided-intro';
import { useI18n } from '@/lib/i18n-context';

const STORAGE_KEY = 'cb_guided_intro_seen_v2';
const CHAT_CONTROLS = ['options', 'freeze', 'length', 'message', 'navigation', 'feedback'] as const;

function wasSeen(): boolean {
    try { return window.localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

// Al primo ingresso spiega cosa fa la chat, quanto dura, cosa fare, dove stanno
// i pulsanti avanti/indietro (barra sotto la finestra della chat su desktop,
// barra sotto la casella di scrittura su mobile: vedi ChatWorkspace) e come
// chiudere. Una volta chiusa resta solo il pulsante che apre la guida.
export function GuidedChatIntro({ locale, questionnaireType, stepNavigation = true }: { locale: string; questionnaireType: string; stepNavigation?: boolean }) {
    // Letto dopo il mount: lo storage non esiste lato server, e leggerlo nell'inizializzatore romperebbe l'idratazione.
    const [hidden, setHidden] = useState(true);
    const [guideOpen, setGuideOpen] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { setHidden(wasSeen()); }, []);

    const dismiss = () => {
        try { window.localStorage.setItem(STORAGE_KEY, '1'); } catch { /* storage non disponibile */ }
        setHidden(true);
    };
    const closeGuide = () => { setGuideOpen(false); trigger.current?.focus(); };
    const text = (key: Parameters<typeof guidedIntroText>[1]) => guidedIntroText(locale, key);
    const guideButton = (
        <button ref={trigger} type="button" onClick={() => setGuideOpen(true)} aria-haspopup="dialog"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-3 text-xs font-semibold text-teal-900 underline-offset-2 hover:bg-teal-100 hover:underline">
            <BookOpen className="h-4 w-4 shrink-0" aria-hidden="true" />{text('openGuide')}
        </button>
    );
    const dialog = guideOpen && <GuideSectionDialog section={guideSectionFor(questionnaireType)} locale={locale} onClose={closeGuide} />;

    if (hidden) return <div className="mx-auto flex w-full max-w-2xl justify-center">{guideButton}{dialog}</div>;

    return (
        <section aria-labelledby="guided-intro-title" data-testid="guided-intro" className="mx-auto w-full max-w-2xl rounded-lg border border-teal-200 bg-teal-50/60 px-4 py-3 text-left">
            <h4 id="guided-intro-title" className="flex items-center gap-2 text-sm font-semibold text-teal-900">
                <Compass className="h-4 w-4 shrink-0" aria-hidden="true" />{text('title')}
            </h4>
            <p className="mt-1.5 text-xs leading-relaxed text-teal-900/80">{text('purpose')}</p>
            <p className="mt-1 text-xs leading-relaxed text-teal-900/80">{text('duration')}</p>
            <p className="mt-1 text-xs leading-relaxed text-teal-900/80">{text('todo')}</p>
            {stepNavigation && <>
                <p className="mt-1 hidden text-xs leading-relaxed text-teal-900/80 lg:block">
                    <ChevronLeft className="inline h-3.5 w-3.5" aria-hidden="true" /><ChevronRight className="inline h-3.5 w-3.5" aria-hidden="true" /> {text('buttonsDesktop')}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-teal-900/80 lg:hidden">
                    <ChevronLeft className="inline h-3.5 w-3.5" aria-hidden="true" /><ChevronRight className="inline h-3.5 w-3.5" aria-hidden="true" /> {text('buttonsMobile')}
                </p>
            </>}
            <p className="mt-1 text-xs leading-relaxed text-teal-900/80">{text('close')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
                {guideButton}
                <button type="button" onClick={dismiss} className="min-h-[44px] rounded-md px-3 text-xs font-semibold text-teal-900 hover:bg-teal-100">{text('dismiss')}</button>
            </div>
            {dialog}
        </section>
    );
}

// Mostra in un dialog modale la sezione della guida (/guide) pertinente allo
// strumento, con gli stessi testi della pagina: la chat resta sotto, intatta.
function GuideSectionDialog({ section, locale, onClose }: { section: number; locale: string; onClose: () => void }) {
    const { t } = useI18n();
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => { const node = ref.current; if (node && !node.open) node.showModal(); }, []);
    const text = (key: Parameters<typeof guidedIntroText>[1]) => guidedIntroText(locale, key);
    // Chiude il dialog prima di smontarlo: finché è modale la pagina è inerte e il focus non torna al pulsante.
    const close = () => { ref.current?.close(); onClose(); };

    return (
        <dialog ref={ref} aria-labelledby="guided-guide-title" data-testid="guided-guide"
            onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === ref.current) close(); }}
            className="m-0 h-dvh max-h-none w-full max-w-none bg-white p-0 text-slate-900 backdrop:bg-slate-900/50 sm:m-auto sm:h-auto sm:max-h-[90vh] sm:max-w-xl sm:rounded-xl">
            <div className="flex h-full max-h-[inherit] flex-col">
                <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 sm:px-6">
                    <h2 id="guided-guide-title" className="text-lg font-bold">{t(`guide.section${section}.title`)}</h2>
                    <button type="button" onClick={close} aria-label={text('closeGuide')}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100">
                        <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm leading-relaxed text-slate-700 sm:px-6">
                    <p>{t(`guide.section${section}.body`)}</p>
                    {section === 7 && <div>
                        <h3 className="font-semibold text-slate-900">{t('guide.chat.controlsTitle')}</h3>
                        <dl className="mt-2 space-y-2">
                            {CHAT_CONTROLS.map(key => <div key={key}>
                                <dt className="font-semibold text-slate-800">{t(`guide.chat.${key}.title`)}</dt>
                                <dd>{t(`guide.chat.${key}.body`)}</dd>
                            </div>)}
                        </dl>
                    </div>}
                    <a href={`/guide#guide-section-${section}`} target="_blank" rel="noopener"
                        className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-indigo-700 underline">
                        {text('fullGuide')}<ExternalLink className="h-4 w-4" aria-hidden="true" />
                    </a>
                </div>
            </div>
        </dialog>
    );
}
