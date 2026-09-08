'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookMarked, NotebookPen, X } from 'lucide-react';

import { useI18n } from '@/lib/i18n-context';
import { LearnerProfileCard } from '@/components/profile/LearnerProfileCard';
import {
    EVENT_BOOKLET_TYPES,
    StudentBookletCard,
    bookletTypeOptionLabel,
    type BookletType,
} from '@/components/profile/StudentBookletCard';

// Taccuino e libretto richiamabili senza uscire dalla conversazione: sono le
// stesse card di /profilo, quindi si consultano e si modificano.
export type DeskTab = 'notebook' | 'booklet';

const ALL_BOOKLET_TYPES: BookletType[] = [
    'QSA', 'QSAr', 'ZTPI', 'SAVICKAS', 'QPCS', 'QPCC', 'QAP', ...EVENT_BOOKLET_TYPES,
];

// Lo strumento in corso non ha sempre un libretto (Idea, per dirne uno): senza
// una corrispondenza il pannello mostra il selettore invece di indovinare.
export function asBookletType(value: string | undefined): BookletType | undefined {
    return (ALL_BOOKLET_TYPES as string[]).includes(value ?? '') ? (value as BookletType) : undefined;
}

interface TriggersProps {
    onOpen: (tab: DeskTab) => void;
    buttonClassName: string;
}

export function NotebookBookletTriggers({ onOpen, buttonClassName }: TriggersProps) {
    const { t } = useI18n();
    return (
        <>
            <button type="button" className={buttonClassName} onClick={() => onOpen('notebook')}>
                <NotebookPen className="h-4 w-4 shrink-0" aria-hidden="true" />{t('lp.title')}
            </button>
            <button type="button" className={buttonClassName} onClick={() => onOpen('booklet')}>
                <BookMarked className="h-4 w-4 shrink-0" aria-hidden="true" />{t('booklet.title')}
            </button>
        </>
    );
}

interface ContentProps {
    tab: DeskTab;
    lang: string;
    // Lo strumento della sessione. Dove non ce n'e' uno (chat libera, Bussola)
    // il libretto lo fa scegliere allo studente.
    questionnaireType?: BookletType;
}

// Le due schede senza cornice: cosi' le mostra sia il pannello a se' stante sia
// la finestra degli strumenti, che le tiene fra le proprie schede.
export function NotebookBookletContent({ tab, lang, questionnaireType }: ContentProps) {
    const { t, tf } = useI18n();
    // Scelta del libretto solo dove lo strumento non lo determina.
    const [pickedType, setPickedType] = useState<BookletType>('QSA');
    const bookletType = questionnaireType ?? pickedType;

    if (tab === 'notebook') return <LearnerProfileCard variant="edit" />;

    return (
        <div className="space-y-3">
            {!questionnaireType && (
                <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {t('profile.bookletSection.tool')}
                    </span>
                    <select
                        value={bookletType}
                        onChange={(event) => setPickedType(event.target.value as BookletType)}
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                        {ALL_BOOKLET_TYPES.map((type) => (
                            <option key={type} value={type}>{bookletTypeOptionLabel(type, t, tf)}</option>
                        ))}
                    </select>
                </label>
            )}
            <StudentBookletCard questionnaireType={bookletType} lang={lang} />
        </div>
    );
}

interface PanelProps {
    tab: DeskTab | null;
    // La scheda aperta la tiene il chiamante, che la apre gia' dal menu: qui
    // servono solo i due bottoni per passare dall'una all'altra.
    onSelectTab: (tab: DeskTab) => void;
    onClose: () => void;
    lang: string;
    questionnaireType?: BookletType;
}

export function NotebookBookletPanel({ tab, onSelectTab, onClose, lang, questionnaireType }: PanelProps) {
    const { t } = useI18n();

    useEffect(() => {
        if (!tab) return;
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [tab, onClose]);

    if (!tab || typeof document === 'undefined') return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[85] flex items-start justify-center bg-slate-900/50 p-2 sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-label={t(tab === 'notebook' ? 'lp.title' : 'booklet.title')}
            onClick={onClose}
        >
            <div
                className="mt-4 flex max-h-[90svh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
                    <div role="tablist" aria-label={t('lp.title')} className="flex min-w-0 gap-1">
                        {(['notebook', 'booklet'] as const).map((key) => (
                            <button
                                key={key}
                                type="button"
                                role="tab"
                                aria-selected={tab === key}
                                onClick={() => onSelectTab(key)}
                                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                                    tab === key ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                {key === 'notebook'
                                    ? <NotebookPen className="h-4 w-4" aria-hidden="true" />
                                    : <BookMarked className="h-4 w-4" aria-hidden="true" />}
                                <span className="truncate">{t(key === 'notebook' ? 'lp.title' : 'booklet.title')}</span>
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('common.close')}
                        className="ml-auto rounded-md p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                    >
                        <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
                    <NotebookBookletContent tab={tab} lang={lang} questionnaireType={questionnaireType} />
                </div>
            </div>
        </div>,
        document.body,
    );
}
