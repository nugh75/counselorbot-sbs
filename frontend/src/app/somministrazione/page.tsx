'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Languages } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { Callout } from '@/components/ui/Callout';
import {
    fetchInstruments,
    instrumentName,
    type InstrumentSummary,
} from '@/lib/instruments-api';

const QUESTIONNAIRE_SELECTION_HREF = '/?view=questionnaires';

export default function TestAdministrationsPage() {
    const { t, lang } = useI18n();
    const [instruments, setInstruments] = useState<InstrumentSummary[] | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetchInstruments()
            .then((rows) => { if (!cancelled) setInstruments(rows); })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; };
    }, []);

    return (
        <div className="page-narrow space-y-6">
            <header className="glass-panel p-6 sm:p-8 space-y-3">
                <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                    <Languages className="w-4 h-4" />
                    {t('admin.run.index.badge')}
                </div>
                <h1 className="text-2xl font-bold text-slate-900">{t('admin.run.index.badge')}</h1>
                <p className="text-slate-600">{t('admin.run.index.intro')}</p>
            </header>

            <Callout variant="warning" title={t('admin.run.index.warningTitle')}>
                {t('admin.run.index.warningBody')}
            </Callout>

            <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-600">
                {t('admin.run.index.draft')}
            </p>

            {failed && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {t('admin.run.loadError')}
                </p>
            )}

            {!instruments && !failed && (
                <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
                    {t('admin.run.loading')}
                </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
                {(instruments ?? []).map((instrument) => {
                    const available = instrument.available_locales.includes(lang);
                    return (
                        <section key={instrument.code} className="glass-panel p-5 space-y-4">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">{instrument.code}</h2>
                                <p className="mt-1 text-sm text-slate-700">
                                    {instrumentName(instrument, lang)}
                                </p>
                                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    {instrument.item_count} {t('admin.run.index.items')}
                                </p>
                            </div>
                            {available ? (
                                <Link
                                    href={`/somministrazione/${instrument.code}`}
                                    className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                                >
                                    {t('admin.run.index.open')}
                                </Link>
                            ) : (
                                // Non si nasconde: uno strumento che sparisce senza spiegazione
                                // e' peggio di uno che dice perche' non e' disponibile.
                                <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                                    <p className="text-sm font-semibold text-slate-700">
                                        {t('admin.run.unavailable.title')}
                                    </p>
                                    {instrument.available_locales.length > 0 && (
                                        <p className="text-xs text-slate-500">
                                            {t('admin.run.unavailable.languages').replace(
                                                '{langs}',
                                                instrument.available_locales.join(', '),
                                            )}
                                        </p>
                                    )}
                                </div>
                            )}
                        </section>
                    );
                })}
            </div>

            <Link href={QUESTIONNAIRE_SELECTION_HREF} className="inline-flex text-sm font-semibold text-indigo-700 hover:text-indigo-900">
                {t('admin.run.index.back')}
            </Link>
        </div>
    );
}
