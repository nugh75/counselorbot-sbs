'use client';

import { useEffect, useState } from 'react';
import { Languages } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { PreviousPageButton } from '@/components/ui/PreviousPageButton';
import { Callout } from '@/components/ui/Callout';
import { EntryLink } from '@/components/ui/EntryList';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import ToolIllustration from '@/components/ui/ToolIllustration';
import {
    fetchInstruments,
    instrumentName,
    type InstrumentSummary,
} from '@/lib/instruments-api';

import { useUserAccess } from '@/lib/use-user-access';
import { isToolAllowed } from '@/lib/user-access';

const QUESTIONNAIRE_SELECTION_HREF = '/profilo';

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
            <PageHeader
                title={t('admin.run.index.badge')}
                subtitle={t('admin.run.index.intro')}
                icon={<Languages className="h-6 w-6 shrink-0 text-link" aria-hidden="true" />}
            />

            <Callout variant="warning" title={t('admin.run.index.warningTitle')}>
                {t('admin.run.index.warningBody')}
            </Callout>

            <p className="text-sm leading-relaxed text-ink-muted">
                {t('admin.run.index.draft')}
            </p>

            {failed && (
                <Callout variant="danger">{t('admin.run.loadError')}</Callout>
            )}

            {!instruments && !failed && (
                <p role="status" className="text-sm text-ink-muted">
                    {t('admin.run.loading')}
                </p>
            )}

            <div className="grid grid-cols-1 gap-x-6 gap-y-1 border-t border-line-strong md:grid-cols-2">
                {visibleInstruments.map((instrument) => {
                    const available = instrument.available_locales.includes(lang);
                    const illustration = <ToolIllustration id={instrument.code} category={instrument.tool_category}
                        className="h-16 w-16 shrink-0 object-contain md:h-18 md:w-18" />;
                    const name = instrumentName(instrument, lang);
                    return available ? (
                        <EntryLink key={instrument.code} idPrefix="administration" id={instrument.code}
                            href={`/somministrazione/${instrument.code}`}
                            illustration={illustration}
                            name={name}
                            description={`${instrument.item_count} ${t('admin.run.index.items')}`} />
                    ) : (
                        // Non si nasconde: uno strumento che sparisce senza spiegazione
                        // e' peggio di uno che dice perche' non e' disponibile.
                        <div key={instrument.code} className="flex min-h-24 items-center gap-4 px-2 py-4">
                            {illustration}
                            <span className="min-w-0 flex-1 break-words">
                                <span className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                                    <span>{name}</span>
                                    <StatusBadge tone="warning">{t('admin.run.unavailable.title')}</StatusBadge>
                                </span>
                                <span className="mt-1 block text-sm text-ink-muted">
                                    {instrument.item_count} {t('admin.run.index.items')}
                                    {instrument.available_locales.length > 0 && ` · ${t('admin.run.unavailable.languages').replace('{langs}', instrument.available_locales.join(', '))}`}
                                </span>
                            </span>
                        </div>
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