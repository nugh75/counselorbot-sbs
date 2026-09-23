'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Columns3, Layers, Minus, Plus, SquareKanban, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { visualLabel } from '@/lib/i18n-visual-tools';
import { deckColumnsForType, type CardColumn, type DeckType } from '@/lib/visual-tools';

const inputClass = 'w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-800';
const typeIcons: Record<DeckType, typeof Layers> = { flashcard: Layers, table: Columns3, kanban: SquareKanban };
const deckTypes: DeckType[] = ['flashcard', 'table', 'kanban'];

type Props = {
    open: boolean;
    locale: string;
    onCancel: () => void;
    onCreate: (title: string, columns: CardColumn[]) => void;
};

/** Creation dialog for a new card deck: name, deck type and, when the type
    allows it, the number of columns and their names. The type fixes the
    structure (flashcard = front/back, kanban = three stages); a table takes
    2–8 named columns. */
export function NewDeckDialog({ open, locale, onCancel, onCreate }: Props) {
    const l = (key: string) => visualLabel(locale, key);
    const id = useId();
    const nameRef = useRef<HTMLInputElement>(null);
    const [name, setName] = useState('');
    const [type, setType] = useState<DeckType>('table');
    const [count, setCount] = useState(3);
    const [names, setNames] = useState<string[]>(() => Array.from({ length: 8 }, () => ''));

    useEffect(() => {
        if (!open) return;
        setName('');
        setNames(Array.from({ length: 8 }, () => ''));
        nameRef.current?.focus();
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onCancel]);

    if (!open) return null;
    const fixedColumns = type === 'flashcard' ? ['fronte', 'retro'] : type === 'kanban' ? ['card_todo', 'card_doing', 'card_done'] : null;
    const columnCount = fixedColumns ? fixedColumns.length : count;
    // A table column is a custom column: an empty name would be rejected by the
    // backend validation, so the localized placeholder becomes the label.
    const finalNames = deckTypes.includes(type)
        ? Array.from({ length: 8 }, (_, i) => (!fixedColumns && !names[i]?.trim()) ? `${l('deckColumnWord')} ${i + 1}` : names[i])
        : [];
    const create = () => {
        if (!name.trim()) return;
        onCreate(name.trim(), deckColumnsForType(type, count, finalNames));
    };

    return createPortal(
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 p-4" onClick={onCancel}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${id}-title`}
                className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"
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
                    <div>
                        <span className="mb-1 block text-sm font-medium text-slate-700">{l('deckType')}</span>
                        <div className="grid gap-2 sm:grid-cols-3">
                            {deckTypes.map((deckType, index) => {
                                const Icon = typeIcons[deckType];
                                const selected = type === deckType;
                                return (
                                    <button
                                        key={deckType}
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        aria-label={l(`deckType${deckType[0].toUpperCase()}${deckType.slice(1)}`)}
                                        onClick={() => setType(deckType)}
                                        className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all ${
                                            selected ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-600/20' : 'border-slate-200 bg-white hover:bg-slate-50'
                                        }`}
                                    >
                                        <Icon className={`h-5 w-5 ${selected ? 'text-indigo-700' : 'text-slate-500'}`} aria-hidden="true" />
                                        <span className={`text-sm font-medium ${selected ? 'text-indigo-900' : 'text-slate-800'}`}>{l(`deckType${deckType[0].toUpperCase()}${deckType.slice(1)}`)}</span>
                                        <span className="text-xs leading-snug text-slate-500">{l(`deckType${deckType[0].toUpperCase()}${deckType.slice(1)}Desc`)}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div>
                        <span className="mb-1 block text-sm font-medium text-slate-700">{l('deckColumns')}</span>
                        <div className="space-y-2">
                            {!fixedColumns && (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-slate-600">{l('deckColumnsCount')}</span>
                                    <span className="ml-auto flex items-center gap-1">
                                        <Button type="button" variant="secondary" className="h-8 w-8 p-0" aria-label="-" disabled={count <= 2} onClick={() => setCount(value => Math.max(2, value - 1))}>
                                            <Minus className="h-4 w-4" aria-hidden="true" />
                                        </Button>
                                        <span aria-live="polite" className="w-8 text-center font-mono text-sm text-slate-800">{count}</span>
                                        <Button type="button" variant="secondary" className="h-8 w-8 p-0" aria-label="+" disabled={count >= 8} onClick={() => setCount(value => Math.min(8, value + 1))}>
                                            <Plus className="h-4 w-4" aria-hidden="true" />
                                        </Button>
                                    </span>
                                </div>
                            )}
                            {fixedColumns && (
                                <p className="text-xs text-slate-500">{fixedColumns.length} — {l(type === 'flashcard' ? 'deckColumnsFlashcardFixed' : 'deckColumnsKanbanFixed')}</p>
                            )}
                            {Array.from({ length: columnCount }, (_, i) => {
                                const value = fixedColumns ? l(fixedColumns[i]) : names[i] ?? '';
                                const placeholder = !fixedColumns ? `${l('deckColumnWord')} ${i + 1}` : undefined;
                                return (
                                    <input
                                        key={fixedColumns ? fixedColumns[i] : i}
                                        type="text"
                                        maxLength={100}
                                        aria-label={placeholder ?? l('columnName')}
                                        value={value}
                                        disabled={Boolean(fixedColumns) && type === 'flashcard'}
                                        placeholder={placeholder}
                                        onChange={event => setNames(previous => previous.map((entry, index) => index === i ? event.target.value : entry))}
                                        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); create(); } }}
                                        className={`${inputClass} ${fixedColumns && type === 'flashcard' ? 'bg-slate-100 text-slate-500' : ''}`}
                                    />
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
