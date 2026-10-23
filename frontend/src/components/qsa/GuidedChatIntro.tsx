'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Compass } from 'lucide-react';
import { guidedIntroText } from '@/lib/i18n-guided-intro';

const STORAGE_KEY = 'cb_guided_intro_seen';

function wasSeen(): boolean {
    try { return window.localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

// Al primo ingresso spiega scopo, passaggi, approfondimento e dove stanno i
// pulsanti avanti/indietro (barra sotto la finestra della chat su desktop, barra sotto la
// casella di scrittura su mobile: vedi ChatWorkspace). Una volta chiusa non
// ricompare.
export function GuidedChatIntro({ locale }: { locale: string }) {
    // Letto dopo il mount: lo storage non esiste lato server, e leggerlo nell'inizializzatore romperebbe l'idratazione.
    const [hidden, setHidden] = useState(true);
    useEffect(() => { setHidden(wasSeen()); }, []);
    if (hidden) return null;

    const dismiss = () => {
        try { window.localStorage.setItem(STORAGE_KEY, '1'); } catch { /* storage non disponibile */ }
        setHidden(true);
    };
    const text = (key: Parameters<typeof guidedIntroText>[1]) => guidedIntroText(locale, key);

    return (
        <section aria-labelledby="guided-intro-title" className="mx-auto w-full max-w-2xl rounded-lg border border-teal-200 bg-teal-50/60 px-4 py-3 text-left">
            <h4 id="guided-intro-title" className="flex items-center gap-2 text-sm font-semibold text-teal-900">
                <Compass className="h-4 w-4 shrink-0" aria-hidden="true" />{text('title')}
            </h4>
            <p className="mt-1.5 text-xs leading-relaxed text-teal-900/80">{text('purpose')}</p>
            <p className="mt-1 text-xs leading-relaxed text-teal-900/80">{text('steps')}</p>
            <p className="mt-1 text-xs leading-relaxed text-teal-900/80">{text('deepen')}</p>
            <p className="mt-1 hidden text-xs leading-relaxed text-teal-900/80 lg:block">
                <ChevronLeft className="inline h-3.5 w-3.5" aria-hidden="true" /><ChevronRight className="inline h-3.5 w-3.5" aria-hidden="true" /> {text('buttonsDesktop')}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-teal-900/80 lg:hidden">
                <ChevronLeft className="inline h-3.5 w-3.5" aria-hidden="true" /><ChevronRight className="inline h-3.5 w-3.5" aria-hidden="true" /> {text('buttonsMobile')}
            </p>
            <button type="button" onClick={dismiss} className="mt-2 min-h-[44px] rounded-md px-3 text-xs font-semibold text-teal-900 hover:bg-teal-100">{text('dismiss')}</button>
        </section>
    );
}
