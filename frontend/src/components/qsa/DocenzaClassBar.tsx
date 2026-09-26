'use client';

// Barra di selezione classi per la chat guidata degli obiettivi didattici
// (OBIETTIVO_DOCENZA): il docente sceglie una o piu' classi tra quelle che
// gestisce o che gli sono state condivise; gli id viaggiano in ogni turno
// (chatPayload.group_ids) e il server riverifica l'accesso a ogni turno.

import { useEffect, useState } from 'react';
import { GraduationCap, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/auth';
import type { NotebookContextChoice } from '@/lib/notebook-context';
import { useI18n } from '@/lib/i18n-context';

interface TeacherGroup {
    id: number;
    name: string;
    school: string | null;
    is_active: boolean;
}

const TEXTS = {
    it: {
        label: 'Classi di questa conversazione',
        hint: 'Le classi scelte entrano nel contesto della chat, insieme al tuo taccuino del docente.',
        hintNoNotebook: 'Con questo taccuino nel contesto le classi restano fuori: valgono solo con il taccuino del docente.',
        none: 'Nessuna classe da gestire: creane una nell’area docenti.',
        error: 'Impossibile caricare le classi.',
    },
    en: {
        label: 'Classes for this conversation',
        hint: 'The classes you pick enter the chat context, together with your teacher notebook.',
        hintNoNotebook: 'With this notebook in context the classes stay out: they only apply with the teacher notebook.',
        none: 'No managed classes yet: create one in the teacher area.',
        error: 'Could not load the classes.',
    },
    es: {
        label: 'Clases para esta conversación',
        hint: 'Las clases elegidas entran en el contexto de la chat, junto con tu cuaderno del docente.',
        hintNoNotebook: 'Con este cuaderno en el contexto las clases quedan fuera: solo aplican con el cuaderno del docente.',
        none: 'Aún no gestionas clases: crea una en el área docente.',
        error: 'No se pudieron cargar las clases.',
    },
    fr: {
        label: 'Classes pour cette conversation',
        hint: 'Les classes choisies entrent dans le contexte de la conversation, avec votre carnet d’enseignant.',
        hintNoNotebook: 'Avec ce carnet dans le contexte, les classes restent en dehors : elles ne s’appliquent qu’avec le carnet de l’enseignant.',
        none: 'Vous ne gérez pas encore de classes : créez-en une dans l’espace enseignant.',
        error: 'Impossible de charger les classes.',
    },
    de: {
        label: 'Klassen für dieses Gespräch',
        hint: 'Die gewählten Klassen fließen in den Chatkontext ein, zusammen mit Ihrem Lehrkräfte-Notizbuch.',
        hintNoNotebook: 'Mit diesem Notizbuch im Kontext bleiben die Klassen außen: sie gelten nur mit dem Lehrkräfte-Notizbuch.',
        none: 'Noch keine Klassen verwaltet: Legen Sie eine im Lehrkräftebereich an.',
        error: 'Klassen konnten nicht geladen werden.',
    },
    sv: {
        label: 'Klasser för det här samtalet',
        hint: 'De valda klasserna kommer in i chattens kontext, tillsammans med din läraranteckningsbok.',
        hintNoNotebook: 'Med den här anteckningsboken i kontexten kommer klasserna inte in: de gäller bara med läraranteckningsboken.',
        none: 'Du hanterar inga klasser ännu: skapa en i lärarområdet.',
        error: 'Klasserna kunde inte laddas.',
    },
};

const STORAGE_KEY = 'cb-docenza-group-ids';

export function readStoredDocenzaGroupIds(): number[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((id) => Number.isInteger(id)) : [];
    } catch {
        return [];
    }
}

export function DocenzaClassBar({ selected, onChange, notebookContext = 'default' }: { selected: number[]; onChange: (ids: number[]) => void; notebookContext?: NotebookContextChoice }) {
    const { lang } = useI18n();
    const texts = TEXTS[lang as keyof typeof TEXTS] ?? TEXTS.en;
    const [groups, setGroups] = useState<TeacherGroup[] | null>(null);

    useEffect(() => {
        let active = true;
        apiFetch('/api/admin/groups')
            .then((res) => (res.ok ? res.json() : []))
            .then((payload) => {
                if (active) setGroups(Array.isArray(payload) ? payload as TeacherGroup[] : []);
            })
            .catch(() => { if (active) setGroups([]); });
        return () => { active = false; };
    }, []);

    const toggle = (id: number) => {
        const next = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
        onChange(next);
        try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* storage pieno */ }
    };

    return (
        <div className="mb-2 rounded-md border border-indigo-100 bg-indigo-50/60 px-2.5 py-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-indigo-900">
                <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                {texts.label}
            </p>
            <p className="mt-0.5 text-2xs text-indigo-700/80">{notebookContext === 'teacher' ? texts.hint : texts.hintNoNotebook}</p>
            {groups === null ? (
                <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Loader2 className="h-3 w-3 animate-spin" /> …</p>
            ) : groups.length === 0 ? (
                <p className="mt-1 text-xs text-slate-500">{texts.none}</p>
            ) : (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {groups.filter((group) => group.is_active).map((group) => {
                        const isSelected = selected.includes(group.id);
                        return (
                            <button
                                key={group.id}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => toggle(group.id)}
                                className={cn(
                                    'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                                    isSelected
                                        ? 'border-indigo-500 bg-indigo-600 text-white'
                                        : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-300 hover:bg-indigo-50',
                                )}
                            >
                                {group.name}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
