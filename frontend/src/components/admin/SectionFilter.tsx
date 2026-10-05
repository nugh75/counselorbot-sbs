'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface SectionFilterItem {
    id: string;
    label: string;
    /** Nome esteso: mostrato nel campo chiuso e usato dalla ricerca. */
    detail?: string;
    icon: ReactNode;
}

export interface SectionFilterGroup {
    label: string;
    items: SectionFilterItem[];
}

interface SectionFilterProps {
    label: string;
    searchPlaceholder: string;
    emptyLabel: string;
    groups: SectionFilterGroup[];
    value: string;
    onChange: (id: string) => void;
}

// Filtro a tendina con ricerca e gruppi: sostituisce le file di bottoni che
// crescono a ogni nuovo strumento.
export function SectionFilter({ label, searchPlaceholder, emptyLabel, groups, value, onChange }: SectionFilterProps) {
    const id = useId();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeId, setActiveId] = useState(value);
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    const needle = query.trim().toLocaleLowerCase();
    const visibleGroups = groups
        .map(group => ({
            ...group,
            items: group.items.filter(item => !needle || `${item.label} ${item.detail ?? ''}`.toLocaleLowerCase().includes(needle)),
        }))
        .filter(group => group.items.length > 0);
    const visibleItems = visibleGroups.flatMap(group => group.items);
    const activeItem = visibleItems.find(item => item.id === activeId) ?? visibleItems[0];
    const selected = groups.flatMap(group => group.items).find(item => item.id === value);
    const optionId = (itemId: string) => `${id}-option-${itemId}`;

    useEffect(() => {
        if (!open) return;
        const closeOutside = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', closeOutside);
        return () => document.removeEventListener('pointerdown', closeOutside);
    }, [open]);

    useEffect(() => {
        if (open && activeItem) document.getElementById(optionId(activeItem.id))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, activeItem?.id]);

    const openList = () => {
        setQuery('');
        setActiveId(value);
        setOpen(true);
    };

    const choose = (itemId: string) => {
        setOpen(false);
        triggerRef.current?.focus();
        if (itemId !== value) onChange(itemId);
    };

    const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
            triggerRef.current?.focus();
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (activeItem) choose(activeItem.id);
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!visibleItems.length) return;
            const step = event.key === 'ArrowDown' ? 1 : -1;
            const index = activeItem ? visibleItems.indexOf(activeItem) : -1;
            setActiveId(visibleItems[(index + step + visibleItems.length) % visibleItems.length].id);
        } else if (event.key === 'Tab') {
            setOpen(false);
        }
    };

    return (
        <div ref={rootRef} className="relative w-full sm:max-w-md">
            <span id={`${id}-label`} className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span>
            <button
                ref={triggerRef}
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-labelledby={`${id}-label ${id}-value`}
                onClick={() => (open ? setOpen(false) : openList())}
                onKeyDown={(event) => {
                    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                        event.preventDefault();
                        openList();
                    }
                }}
                className="flex w-full min-w-0 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm font-medium text-slate-800 outline-none transition-colors hover:bg-slate-50 focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
            >
                {selected?.icon}
                <span id={`${id}-value`} className="min-w-0 flex-1 truncate">{selected?.detail ?? selected?.label}</span>
                <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
                    <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
                        <Search aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />
                        <input
                            autoFocus
                            type="text"
                            role="combobox"
                            aria-label={searchPlaceholder}
                            aria-expanded
                            aria-controls={`${id}-listbox`}
                            aria-autocomplete="list"
                            aria-activedescendant={activeItem ? optionId(activeItem.id) : undefined}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            onKeyDown={onSearchKeyDown}
                            placeholder={searchPlaceholder}
                            className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                        />
                    </div>
                    <ul id={`${id}-listbox`} role="listbox" aria-label={label} className="max-h-80 overflow-y-auto py-1">
                        {visibleGroups.map((group, groupIndex) => (
                            <li key={group.label} role="presentation">
                                <div id={`${id}-group-${groupIndex}`} className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                    {group.label}
                                </div>
                                <ul role="group" aria-labelledby={`${id}-group-${groupIndex}`}>
                                    {group.items.map(item => {
                                        const isSelected = item.id === value;
                                        const isActive = item.id === activeItem?.id;
                                        return (
                                            <li
                                                key={item.id}
                                                id={optionId(item.id)}
                                                role="option"
                                                aria-selected={isSelected}
                                                onMouseEnter={() => setActiveId(item.id)}
                                                onClick={() => choose(item.id)}
                                                className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-700'} ${isSelected ? 'font-semibold' : ''}`}
                                            >
                                                {item.icon}
                                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                                {isSelected && <Check aria-hidden className="h-4 w-4 shrink-0 text-indigo-600" />}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </li>
                        ))}
                        {visibleItems.length === 0 && (
                            <li role="presentation" className="px-3 py-3 text-sm text-slate-500">{emptyLabel}</li>
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
}
