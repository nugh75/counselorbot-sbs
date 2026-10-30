'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Languages } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { PreviousPageButton } from '@/components/ui/PreviousPageButton';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import {
    fetchInstruments,
    instrumentName,
    type InstrumentSummary,
} from '@/lib/instruments-api';

import { useUserAccess } from '@/lib/use-user-access';
import { isToolAllowed } from '@/lib/user-access';

const QUESTIONNAIRE_SELECTION_HREF = '/?view=home';

export default function TestAdministrationsPage() {
    const { t, lang } = useI18n();
    const [instruments, setInstruments] = useState<InstrumentSummary[] | null>(null);
    const [failed, setFailed] = useState(false);
    const { access } = useUserAccess();

    useEffect(() => {
        let cancelled = false;
        fetchInstruments()
            .then((rows) => { if (!cancelled) setInstruments(rows); })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; };
    }, []);

    const visibleInstruments = (instruments ?? []).filter((inst) => isToolAllowed(access, inst.code));

    return (
        <div className="page-narrow space-y-6">
            <PreviousPageButton fallbackHref={QUESTIONNAIRE_SELECTION_HREF} />
            <Card as="section" className="sm:p-8 space-y-4">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-link">
                    <Languages className="w-4 h-4" />
                    {t('admin.run.index.badge')}
                </div>
                <h1 className="text-2xl font-semibold text-ink">{t('admin.run.index.badge')}</h1>
                <p className="text-ink-muted">{t('admin.run.index.intro')}</p>
            </Card>

            <Callout variant="warning" title={t('admin.run.index.warningTitle')}>
                {t('admin.run.index.warningBody')}
            </Callout>

            <p className="rounded-card border border-line bg-surface p-4 text-sm leading-relaxed text-ink-muted">
                {t('admin.run.index.draft')}
            </p>

            {failed && (
                <Callout variant="danger">{t('admin.run.loadError')}</Callout>
            )}

            {!instruments && !failed && (
                <p className="rounded-card border border-line bg-surface p-4 text-sm text-ink-muted">
                    {t('admin.run.loading')}
                </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
                {visibleInstruments.map((instrument) => {
                    const available = instrument.available_locales.includes(lang);
                    return (
                        <Card as="section" key={instrument.code} className="space-y-4">
                            <div>
                                <h2 className="text-lg font-semibold text-ink">{instrument.code}</h2>
                                <p className="mt-1 text-sm text-ink-body">
                                    {instrumentName(instrument, lang)}
                                </p>
                                <p className="mt-2 text-xs font-semibold text-ink-muted">
                                    {instrument.item_count} {t('admin.run.index.items')}
                                </p>
                            </div>
                            {available ? (
                                <Link
                                    href={`/somministrazione/${instrument.code}`}
                                    className="inline-flex min-h-control items-center rounded-control bg-brand px-4 py-2 text-sm font-semibold text-ink-on-brand hover:bg-brand-hover"
                                >
                                    {t('admin.run.index.open')}
                                </Link>
                            ) : (
                                // Non si nasconde: uno strumento che sparisce senza spiegazione
                                // e' peggio di uno che dice perche' non e' disponibile.
                                <div className="space-y-1 rounded-control border border-line bg-surface-sunken px-4 py-4">
                                    <p className="text-sm font-semibold text-ink-body">
                                        {t('admin.run.unavailable.title')}
                                    </p>
                                    {instrument.available_locales.length > 0 && (
                                        <p className="text-xs text-ink-muted">
                                            {t('admin.run.unavailable.languages').replace(
                                                '{langs}',
                                                instrument.available_locales.join(', '),
                                            )}
                                        </p>
                                    )}
                                </div>
                            )}
                        </Card>
                    );
                })}
            </div>

            <PreviousPageButton
                variant="labelled"
                fallbackHref={QUESTIONNAIRE_SELECTION_HREF}
                label={t('admin.run.index.back')}
            />
        </div>
    );
}
