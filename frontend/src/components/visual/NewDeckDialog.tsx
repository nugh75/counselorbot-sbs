'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Columns3, Compass, Layers, MessageCircleQuestion, Scale, SquareKanban, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { visualLabel } from '@/lib/i18n-visual-tools';
import { deckTypeColumns, type CardColumn, type DeckType } from '@/lib/visual-tools';

const inputClass = 'w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-800';
const typeIcons: Record<DeckType, typeof Layers> = {
    flashcard: Layers,
    kanban: SquareKanban,
    reflection: Columns3,
    exploration: Compass,
    prosCons: Scale,
    questions: MessageCircleQuestion,
};
const deckTypes: DeckType[] = ['flashcard', 'kanban', 'reflection', 'exploration', 'prosCons', 'questions'];

type Props = {
    open: boolean;
    locale: string;
    onCancel: () => void;
    onCreate: (title: string, columns: CardColumn[]) => void;
};

/** Creation dialog for a new card deck: a name and one column-set preset.
    The preset fixes the columns (renamable after creation in the cards tab). */
export function NewDeckDialog({ open, locale, onCancel, onCreate }: Props) {
    const l = (key: string) => visualLabel(locale, key);
    const id = useId();
    const nameRef = useRef<HTMLInputElement>(null);
    const [name, setName] = useState('');
    const [type, setType] = useState<DeckType>('flashcard');

    useEffect(() => {
        if (!open) return;
        setName('');
        setType('flashcard');
        nameRef.current?.focus();
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onCancel]);

    if (!open) return null;
    const typeLabel = (deckType: DeckType) => l(`deckType${deckType[0].toUpperCase()}${deckType.slice(1)}`);
    const create = () => {
        if (!name.trim()) return;
        onCreate(name.trim(), deckTypeColumns[type].map(column => ({ ...column })));
    };

    return createPortal(
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 p-4" onClick={onCancel}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${id}-title`}
                className="w-full max-w-xl rounded-xl bg-white p-5 shadow-xl"
                onClick={event => event.stopPropagation()}
            >
                <div className="mb-4 flex items-center justify-between">
                    <h3 id={`${id}-title`} className="text-base font-semibold text-slate-900">{l('newDeck')}</h3>
                    <Button type="button" variant="ghost" className="h-8 w-8 p-0" aria-label={l('deckCancel')} onClick={onCancel}>
                        <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label htmlFor={`${id}-name`} className="mb-1 block text-sm font-medium text-slate-700">{l('deckName')}</label>
                        <input
                            ref={nameRef}
                            id={`${id}-name`}
                            type="text"
                            maxLength={100}
                            value={name}
                            onChange={event => setName(event.target.value)}
                            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); create(); } }}
                            className={inputClass}
                        />
                    </div>
                    <div role="radiogroup" aria-label={l('deckType')}>
                        <span className="mb-1 block text-sm font-medium text-slate-700">{l('deckType')}</span>
                        <div className="grid gap-2 sm:grid-cols-3">
                            {deckTypes.map(deckType => {
                                const Icon = typeIcons[deckType];
                                const selected = type === deckType;
                                return (
                                    <button
                                        key={deckType}
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        onClick={() => setType(deckType)}
                                        className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all ${
                                            selected ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-600/20' : 'border-slate-200 bg-white hover:bg-slate-50'
                                        }`}
                                    >
                                        <Icon className={`h-5 w-5 ${selected ? 'text-indigo-700' : 'text-slate-500'}`} aria-hidden="true" />
                                        <span className={`text-sm font-medium ${selected ? 'text-indigo-900' : 'text-slate-800'}`}>{typeLabel(deckType)}</span>
                                        <span className="text-xs leading-snug text-slate-500">{l(`deckType${deckType[0].toUpperCase()}${deckType.slice(1)}Desc`)}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={onCancel}>{l('deckCancel')}</Button>
                    <Button type="button" disabled={!name.trim()} onClick={create}>{l('deckCreate')}</Button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
