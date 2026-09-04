'use client';

// Storia di un singolo prompt: chi l'ha scritto, quando, e ritorno indietro.
// Il backend tiene le revisioni in `prompt_revisions` (append-only) e distingue
// il testo di fabbrica dalle riscritture automatiche e dalle modifiche fatte
// qui dal pannello. Il ripristino e' a sua volta una modifica dell'admin:
// riporta il testo vivo a una versione passata senza cancellare nulla.

import { useCallback, useState } from 'react';
import { History, RotateCcw } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { toast } from '@/components/ui/Toast';
import { useI18n } from '@/lib/i18n-context';

export type PromptScope = 'config' | 'guided_step' | 'counselor_persona';

interface PromptRevision {
    id: number;
    scope: string;
    target_key: string;
    value: string;
    origin: string;
    author?: string | null;
    note?: string | null;
    created_at?: string | null;
}

const TEXTS = {
    it: {
        open: 'Cronologia', close: 'Chiudi cronologia', loading: 'Caricamento…',
        empty: 'Nessuna revisione registrata per questo prompt.',
        error: 'Impossibile leggere la cronologia', restoreError: 'Ripristino non riuscito',
        restored: 'Prompt ripristinato', restore: 'Ripristina',
        confirm: 'Riportare il prompt a questa versione? Il testo attuale resta nella cronologia.',
        inUse: 'in uso', chars: 'caratteri',
        origin: { seed: 'di fabbrica', migration: 'aggiornamento automatico', admin: 'modifica manuale' } as Record<string, string>,
        noFactory: "Questo prompt era già stato personalizzato prima che la cronologia esistesse: il testo di fabbrica non è fra le revisioni. Lo trovi in backend/prompts/.",
    },
    en: {
        open: 'History', close: 'Close history', loading: 'Loading…',
        empty: 'No revisions recorded for this prompt.',
        error: 'Could not load the history', restoreError: 'Restore failed',
        restored: 'Prompt restored', restore: 'Restore',
        confirm: 'Roll this prompt back to that version? The current text stays in the history.',
        inUse: 'in use', chars: 'characters',
        origin: { seed: 'factory', migration: 'automatic update', admin: 'manual edit' } as Record<string, string>,
        noFactory: 'This prompt had already been customised before the history existed, so the factory text is not among the revisions. You will find it in backend/prompts/.',
    },
    es: {
        open: 'Historial', close: 'Cerrar historial', loading: 'Cargando…',
        empty: 'No hay revisiones registradas para este prompt.',
        error: 'No se pudo cargar el historial', restoreError: 'La restauración ha fallado',
        restored: 'Prompt restaurado', restore: 'Restaurar',
        confirm: '¿Volver a esta versión del prompt? El texto actual permanece en el historial.',
        inUse: 'en uso', chars: 'caracteres',
        origin: { seed: 'de fábrica', migration: 'actualización automática', admin: 'edición manual' } as Record<string, string>,
        noFactory: 'Este prompt ya se había personalizado antes de que existiera el historial, por lo que el texto de fábrica no está entre las revisiones. Lo encontrarás en backend/prompts/.',
    },
    fr: {
        open: 'Historique', close: 'Fermer l’historique', loading: 'Chargement…',
        empty: 'Aucune révision enregistrée pour ce prompt.',
        error: 'Impossible de charger l’historique', restoreError: 'La restauration a échoué',
        restored: 'Prompt restauré', restore: 'Restaurer',
        confirm: 'Revenir à cette version du prompt ? Le texte actuel reste dans l’historique.',
        inUse: 'utilisé', chars: 'caractères',
        origin: { seed: 'd’origine', migration: 'mise à jour automatique', admin: 'modification manuelle' } as Record<string, string>,
        noFactory: 'Ce prompt avait déjà été personnalisé avant l’existence de l’historique : le texte d’origine ne figure pas parmi les révisions. Vous le trouverez dans backend/prompts/.',
    },
    de: {
        open: 'Verlauf', close: 'Verlauf schließen', loading: 'Wird geladen…',
        empty: 'Für diesen Prompt sind keine Versionen erfasst.',
        error: 'Verlauf konnte nicht geladen werden', restoreError: 'Wiederherstellung fehlgeschlagen',
        restored: 'Prompt wiederhergestellt', restore: 'Wiederherstellen',
        confirm: 'Den Prompt auf diese Version zurücksetzen? Der aktuelle Text bleibt im Verlauf.',
        inUse: 'in Verwendung', chars: 'Zeichen',
        origin: { seed: 'Werkszustand', migration: 'automatische Aktualisierung', admin: 'manuelle Änderung' } as Record<string, string>,
        noFactory: 'Dieser Prompt war bereits angepasst, bevor es den Verlauf gab: Der Werkstext gehört nicht zu den Versionen. Sie finden ihn unter backend/prompts/.',
    },
    sv: {
        open: 'Historik', close: 'Stäng historiken', loading: 'Laddar…',
        empty: 'Inga versioner registrerade för denna prompt.',
        error: 'Det gick inte att läsa historiken', restoreError: 'Återställningen misslyckades',
        restored: 'Prompten återställd', restore: 'Återställ',
        confirm: 'Vill du återgå till den här versionen av prompten? Den nuvarande texten finns kvar i historiken.',
        inUse: 'används', chars: 'tecken',
        origin: { seed: 'fabriksversion', migration: 'automatisk uppdatering', admin: 'manuell ändring' } as Record<string, string>,
        noFactory: 'Den här prompten hade redan anpassats innan historiken fanns, så fabrikstexten finns inte bland versionerna. Du hittar den i backend/prompts/.',
    },
};

const ORIGIN_STYLE: Record<string, string> = {
    seed: 'bg-slate-100 text-slate-600',
    migration: 'bg-amber-100 text-amber-800',
    admin: 'bg-indigo-100 text-indigo-800',
};

export function PromptHistory({
    scope,
    targetKey,
    currentValue,
    onRestored,
}: {
    scope: PromptScope;
    targetKey: string;
    /** Testo servito adesso: serve solo a marcare quale revisione è quella viva. */
    currentValue?: string;
    /** Riceve il testo ripristinato, per chi tiene il campo in stato locale. */
    onRestored?: (restoredValue: string) => void;
}) {
    const { lang } = useI18n();
    const texts = TEXTS[lang as keyof typeof TEXTS] ?? TEXTS.en;

    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [revisions, setRevisions] = useState<PromptRevision[] | null>(null);
    const [expanded, setExpanded] = useState<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ scope, target_key: targetKey, limit: '25' });
            const res = await apiFetch(`/api/admin/prompt-revisions?${params.toString()}`);
            if (!res.ok) throw new Error('history failed');
            setRevisions(await res.json());
        } catch {
            toast.error(texts.error);
            setRevisions([]);
        } finally {
            setLoading(false);
        }
    }, [scope, targetKey, texts.error]);

    const toggle = useCallback(() => {
        const next = !open;
        setOpen(next);
        if (next && revisions === null) void load();
    }, [open, revisions, load]);

    const restore = useCallback(async (revision: PromptRevision) => {
        if (!window.confirm(texts.confirm)) return;
        try {
            const res = await apiFetch(`/api/admin/prompt-revisions/${revision.id}/restore`, { method: 'POST' });
            if (!res.ok) throw new Error('restore failed');
            toast.success(texts.restored);
            await load();
            onRestored?.(revision.value);
        } catch {
            toast.error(texts.restoreError);
        }
    }, [texts.confirm, texts.restored, texts.restoreError, load, onRestored]);

    const formatDate = (iso?: string | null) => {
        if (!iso) return '';
        const parsed = new Date(iso);
        return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString(lang);
    };

    // Una personalizzazione fatta prima che la cronologia esistesse non ha una
    // revisione "di fabbrica" alle spalle: il ripristino al default non ha un
    // bersaglio, e conviene dirlo invece di lasciare cercare il bottone.
    const hasFactory = (revisions ?? []).some((r) => r.origin === 'seed');

    return (
        <div className="border-t border-slate-100 pt-2">
            <button
                type="button"
                onClick={toggle}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-indigo-600"
            >
                <History className="h-3.5 w-3.5" />
                {open ? texts.close : texts.open}
                {revisions !== null && !open && <span className="text-slate-400">({revisions.length})</span>}
            </button>

            {open && (
                <div className="mt-2 space-y-1.5">
                    {loading && <p className="text-xs text-slate-400">{texts.loading}</p>}
                    {!loading && revisions !== null && revisions.length === 0 && (
                        <p className="text-xs text-slate-400">{texts.empty}</p>
                    )}
                    {!loading && revisions !== null && revisions.length > 0 && !hasFactory && (
                        <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-800">
                            {texts.noFactory}
                        </p>
                    )}
                    {(revisions ?? []).map((revision) => {
                        const isLive = currentValue !== undefined && revision.value === currentValue;
                        const isOpen = expanded === revision.id;
                        return (
                            <div key={revision.id} className="rounded-md border border-slate-200 bg-white px-3 py-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ORIGIN_STYLE[revision.origin] ?? ORIGIN_STYLE.seed}`}>
                                        {texts.origin[revision.origin] ?? revision.origin}
                                    </span>
                                    <span className="text-[11px] text-slate-500">{formatDate(revision.created_at)}</span>
                                    {revision.author && <span className="text-[11px] text-slate-400">· {revision.author}</span>}
                                    <span className="text-[11px] text-slate-400">· {revision.value.length} {texts.chars}</span>
                                    {isLive && (
                                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                                            {texts.inUse}
                                        </span>
                                    )}
                                    {!isLive && (
                                        <button
                                            type="button"
                                            onClick={() => void restore(revision)}
                                            className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
                                        >
                                            <RotateCcw className="h-3 w-3" />
                                            {texts.restore}
                                        </button>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setExpanded(isOpen ? null : revision.id)}
                                    className="mt-1 w-full text-left"
                                >
                                    <pre className={`whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-600 ${isOpen ? '' : 'line-clamp-2'}`}>
                                        {revision.value}
                                    </pre>
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
