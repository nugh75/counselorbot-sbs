'use client';

// L'elenco dei tavoli salvati: il posto da cui si riprende. Le bozze non
// compaiono, perche' non hanno un nome con cui riconoscerle: una bozza vive
// dentro la discussione che l'ha aperta, e li' si ritrova.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Table2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { listTavoli, tavoloEnabled, type TavoloSummary } from '@/lib/tavolo';
import { tavoloLabel } from '@/lib/i18n-tavolo';

export default function TavoliPage() {
    const { lang } = useI18n();
    const [rows, setRows] = useState<TavoloSummary[] | null>(null);
    // Con la funzione spenta l'elenco risponde 404: dirlo, invece di mostrare
    // "nessun tavolo" a chi ne ha di salvati.
    const [disabled, setDisabled] = useState(false);

    useEffect(() => {
        void tavoloEnabled().then((enabled) => {
            setDisabled(!enabled);
            if (enabled) listTavoli().then(setRows).catch(() => setRows([]));
        });
    }, []);

    const label = (key: Parameters<typeof tavoloLabel>[0]) => tavoloLabel(key, lang);

    return (
        <main className="mx-auto max-w-3xl space-y-4 p-4">
            <h1 className="text-lg font-semibold text-slate-800">{label('all')}</h1>

            {disabled && <p className="text-sm text-slate-600">{label('notFound')}</p>}

            {rows === null && (
                <p className="flex items-center gap-2 text-sm text-slate-600" role="status">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{label('loading')}
                </p>
            )}
            {rows?.length === 0 && <p className="text-sm text-slate-600">{label('none')}</p>}

            <ul className="space-y-2">
                {rows?.map((row) => (
                    <li key={row.id}>
                        <Link href={`/tavolo/${row.id}`}
                            className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50">
                            <Table2 className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                                {row.title || label('untitled')}
                            </span>
                            {row.origin_instrument && (
                                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                                    {row.origin_instrument}
                                </span>
                            )}
                            <span className="shrink-0 text-xs text-indigo-700">{label('openOne')}</span>
                        </Link>
                    </li>
                ))}
            </ul>
        </main>
    );
}
