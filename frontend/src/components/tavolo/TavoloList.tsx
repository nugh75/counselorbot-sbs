'use client';

// L'elenco dei tavoli salvati piu' il bottone che ne apre uno nuovo: il posto
// da cui lo strumento si usa e si riprende. Le bozze non compaiono, perche'
// non hanno un nome con cui riconoscerle: una bozza vive dentro la discussione
// che l'ha aperta, e li' si ritrova.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil, Plus, Table2, Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { TavoloCompose } from '@/components/tavolo/TavoloCompose';
import { TavoloCounselor } from '@/components/tavolo/TavoloCounselor';
import { InlineRename } from '@/components/ui/InlineRename';
import { ConfirmInline } from '@/components/ui/ConfirmInline';
import { Button } from '@/components/ui/Button';
import {
    createTavolo,
    deleteTavolo,
    renameTavolo,
    fetchPresetExample,
    listTavoli,
    pendingIds,
    tavoloEnabled,
    writeTavolo,
    type TavoloPresetId,
    type TavoloSummary,
} from '@/lib/tavolo';
import { tavoloLabel } from '@/lib/i18n-tavolo';

interface TavoloListProps {
    // La casella del prompt resta nell'area personale: nel pannello della
    // chat (VisualTools) l'ingresso non riapre, e' solo l'elenco. Vedi la
    // spec, "Non fatto": "Prompt del tavolo dentro la chat: l'ingresso resta
    // l'area personale".
    showCompose?: boolean;
    onOpen?: (id: string, counselorId?: number) => void;
}

export function TavoloList({ showCompose = true, onOpen }: TavoloListProps = {}) {
    const { lang } = useI18n();
    const router = useRouter();
    const [rows, setRows] = useState<TavoloSummary[] | null>(null);
    // Con la funzione spenta l'elenco risponde 404: dirlo, invece di mostrare
    // "nessun tavolo" a chi ne ha di salvati.
    const [disabled, setDisabled] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    // F26: rinomina in linea al posto del prompt nativo del browser.
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [counselorId, setCounselorId] = useState<number | undefined>();
    const [aiAvailable, setAiAvailable] = useState(false);
    const counselorChanged = useCallback((id: number | undefined, available: boolean) => {
        setCounselorId(id); setAiAvailable(available);
    }, []);
    const openTable = (id: string) => onOpen ? onOpen(id, counselorId) : router.push(tableHref(id));
    const tableHref = (id: string) => `/tavolo/${id}${counselorId ? `?counselor=${counselorId}` : ''}`;

    useEffect(() => {
        void tavoloEnabled().then((enabled) => {
            setDisabled(!enabled);
            if (enabled) listTavoli().then(setRows).catch(() => setRows([]));
        });
    }, []);

    const label = (key: Parameters<typeof tavoloLabel>[0]) => tavoloLabel(key, lang);

    const openNew = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const tavolo = await createTavolo({ counselor_id: counselorId, lang });
            openTable(tavolo.id);
        } catch {
            setMessage(label('openFailed'));
        } finally {
            setBusy(false);
        }
    };

    // L'esempio e' materiale nostro, non una proposta del modello: arriva gia'
    // "live", per questo si scrive con writeTavolo invece di passare da compose.
    const openExample = async (preset: TavoloPresetId, exampleId: string) => {
        if (busy) return;
        setBusy(true);
        try {
            const graph = await fetchPresetExample(preset, exampleId, lang);
            const created = await createTavolo({ preset, title: graph.title, lang });
            await writeTavolo(created.id, graph, created.index);
            openTable(created.id);
        } catch {
            setMessage(label('openFailed'));
        } finally {
            setBusy(false);
        }
    };

    const composeNew = async (preset: TavoloPresetId | null, prompt: string) => {
        if (busy) return;
        setBusy(true);
        try {
            const created = await createTavolo({ preset, source_text: prompt.trim(), lang, counselor_id: counselorId });
            if (!pendingIds(created.graph).length) { setMessage(label('composeFailed')); return; }
            openTable(created.id);
        } catch {
            setMessage(label('openFailed'));
        } finally {
            setBusy(false);
        }
    };

    const manage = async (row: TavoloSummary, action: 'rename' | 'delete', newName?: string) => {
        if (busy) return;
        const title = action === 'rename' ? newName ?? '' : null;
        if (action === 'rename' && !title?.trim()) return;
        setBusy(true); setMessage(null);
        try {
            if (action === 'rename') {
                const updated = await renameTavolo(row.id, title!.trim().slice(0, 80));
                setRows((items) => items?.map((item) => item.id === row.id ? { ...item, title: updated.title } : item) ?? null);
            } else {
                await deleteTavolo(row.id);
                setRows((items) => items?.filter((item) => item.id !== row.id) ?? null);
            }
        } catch { setMessage(label('manageFailed')); }
        finally { setBusy(false); }
    };

    return (
        <div className="space-y-4">
            {/* F26 (lotto 4): i tavoli salvati vengono prima di configurazione e creazione. */}
            <h3 className="text-base font-semibold text-ink">{label('savedTitle')}</h3>
            {message && <p role="alert" className="text-sm text-warning-ink">{message}</p>}

            {disabled && <p className="text-sm text-ink-muted">{label('notFound')}</p>}

            {rows === null && !disabled && (
                <p className="flex items-center gap-2 text-sm text-ink-muted" role="status">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{label('loading')}
                </p>
            )}
            {rows !== null && rows.length === 0 && !disabled && <p className="text-sm text-ink-muted">{label('none')}</p>}

            <ul className="space-y-2">
                {rows?.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center gap-1">
                        <Link href={tableHref(row.id)} onClick={(event) => { if (onOpen) { event.preventDefault(); onOpen(row.id, counselorId); } }}
                            className="flex min-h-14 min-w-0 flex-1 items-center gap-4 rounded-card border border-line bg-surface px-4 py-2 hover:bg-surface-sunken">
                            <Table2 className="h-4 w-4 shrink-0 text-link" aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate text-sm text-ink">
                                {row.title || label('untitled')}
                            </span>
                            {row.origin_instrument && (
                                <span className="shrink-0 rounded bg-surface-raised px-2 py-1 text-xs text-ink-muted">
                                    {row.origin_instrument}
                                </span>
                            )}
                            <span className="shrink-0 text-xs text-link">{label('openOne')}</span>
                        </Link>
                        {([['rename', Pencil, 'renameTable'], ['delete', Trash2, 'deleteTable']] as const).map(([action, Icon, key]) => (
                            <button key={action} type="button" disabled={busy} onClick={() => { if (action === 'rename') setRenamingId(row.id); else setConfirmDeleteId(row.id); }}
                                aria-label={`${label(key)}: ${row.title || label('untitled')}`} title={label(key)}
                                className="inline-flex h-control w-control shrink-0 items-center justify-center rounded-lg border border-line text-ink-muted hover:bg-surface-sunken disabled:opacity-40">
                                <Icon className="h-4 w-4" aria-hidden="true" />
                            </button>
                        ))}
                        {confirmDeleteId === row.id && <div className="w-full flex justify-end"><ConfirmInline question={label('deleteConfirm')} busy={busy} onConfirm={() => { setConfirmDeleteId(null); void manage(row, 'delete'); }} onCancel={() => setConfirmDeleteId(null)} /></div>}
                        {renamingId === row.id && <div className="w-full flex justify-end"><InlineRename value={row.title || ''} maxLength={80} ariaLabel={label('renameTable')} onRename={name => { void manage(row, 'rename', name); setRenamingId(null); }} onCancel={() => setRenamingId(null)} /></div>}
                    </li>
                ))}
            </ul>

            <div className="space-y-4 border-t border-line pt-4">
                <h3 className="text-base font-semibold text-ink">{label('createTitle')}</h3>
                <Button type="button" disabled={busy || disabled} onClick={() => void openNew()}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                    {label('newOne')}
                </Button>
                {showCompose && <TavoloCompose busy={busy || disabled} aiAvailable={aiAvailable} onCompose={composeNew} onOpenExample={openExample} />}
                <TavoloCounselor busy={busy} onChange={counselorChanged} />
                <p className="text-sm text-ink-muted">{label('modelHint')}</p>
            </div>
        </div>
    );
}
