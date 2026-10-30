'use client';

// Barra di selezione classi per la chat guidata degli obiettivi didattici
// (OBIETTIVO_DOCENZA): il docente sceglie una o piu' classi tra quelle che
// gestisce o che gli sono state condivise; gli id viaggiano in ogni turno
// (chatPayload.group_ids) e il server riverifica l'accesso a ogni turno.
// Anche per l'admin l'elenco (`own=true`) mostra solo proprie o condivise:
// le stesse che il contesto accetta.

import { GraduationCap, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import type { NotebookContextChoice } from '@/lib/notebook-context';
import { docenzaClassesInContext } from '@/lib/docenza-groups';
import { useI18n } from '@/lib/i18n-context';
import { useTeacherResource } from '@/components/teacher/useTeacherResource';
import { teacherAreaText } from '@/lib/i18n-teacher-area';
import { teacherLoadingText } from '@/lib/i18n-teacher-loading';

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

function parseGroups(payload: unknown): TeacherGroup[] {
    if (!Array.isArray(payload)) throw new Error('invalid groups');
    return payload as TeacherGroup[];
}

export function DocenzaClassBar({ selected, onChange, notebookContext = 'default' }: { selected: number[]; onChange: (ids: number[]) => void; notebookContext?: NotebookContextChoice }) {
    const { lang, t } = useI18n();
    const texts = TEXTS[lang as keyof typeof TEXTS] ?? TEXTS.en;
    const { data: groups, loading, failed, forbidden, reload } = useTeacherResource('/api/admin/groups?own=true', parseGroups);

    const toggle = (id: number) => {
        const next = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
        onChange(next);
        try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* storage pieno */ }
    };

    return (
        <div className="mb-2 rounded-control border border-brand-line bg-brand-soft/60 px-2 py-2">
            <p className="flex items-center gap-2 text-xs font-semibold text-ink">
                <GraduationCap className="h-4 w-4 text-link" aria-hidden="true" />
                {texts.label}
            </p>
            <p className="mt-1 text-2xs text-ink-muted">{docenzaClassesInContext(notebookContext) ? texts.hint : texts.hintNoNotebook}</p>
            {loading && <p role="status" className="mt-1 flex items-center gap-1 text-xs text-ink-muted"><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> {t('common.loading')}</p>}
            {forbidden ? <p role="alert" className="mt-1 text-xs text-danger">{teacherAreaText(lang, 'forbidden')}</p>
                : failed && <div role="alert" className="mt-1 flex flex-wrap items-center gap-4 text-xs text-danger">
                    <p>{teacherLoadingText(lang, 'classes')}</p>
                    <Button type="button" variant="secondary" disabled={loading} onClick={() => void reload()} className="text-xs">{t('setup.retry')}</Button>
                </div>}
            {!loading && !failed && !forbidden && groups?.length === 0 ? (
                <p className="mt-1 text-xs text-ink-muted">{texts.none}</p>
            ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                    {(groups ?? []).filter((group) => group.is_active).map((group) => {
                        const isSelected = selected.includes(group.id);
                        return (
                            <button
                                key={group.id}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => toggle(group.id)}
                                className={cn(
                                    'min-h-control rounded-full border px-4 py-1 text-xs font-semibold transition-colors',
                                    isSelected
                                        ? 'border-brand bg-brand text-ink-on-brand'
                                        : 'border-line-strong bg-surface text-ink-muted hover:border-brand-line hover:bg-brand-soft',
                                )}
                            >
                                {group.name}
                            </button>
                        );
                    })}
                </div>
            )}
            {!failed && !forbidden && groups !== undefined && <Button type="button" variant="secondary" disabled={loading} onClick={() => void reload()} className="mt-2 text-xs">{t('common.refresh')}</Button>}
        </div>
    );
}
