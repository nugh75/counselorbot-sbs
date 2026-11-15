'use client';

import { useState } from 'react';
import { History } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';
import {
    documentKindLabelKey,
    formatPrivacyDate,
    historyEventLabelKey,
    historyTarget,
    purposeLabelFallback,
    purposeLabelKey,
    type PrivacyDocument,
    type PrivacyGroup,
    type PrivacyHistoryEntry,
} from '@/lib/privacy';

const INITIAL_ROWS = 12;

export function ChoiceHistory({ history, groups, documents }: {
    history: PrivacyHistoryEntry[];
    groups: PrivacyGroup[];
    documents: PrivacyDocument[];
}) {
    const { lang, t } = useI18n();
    const [showAll, setShowAll] = useState(false);
    const visible = showAll ? history : history.slice(0, INITIAL_ROWS);

    return (
        <section className="space-y-4 border-t border-line pt-6" aria-labelledby="privacy-history-title">
            <div className="space-y-1">
                <h2 id="privacy-history-title" className="flex items-center gap-2 text-lg font-semibold text-ink">
                    <History className="h-5 w-5 text-link" aria-hidden />
                    {t('privacy.history.title')}
                </h2>
                <p className="max-w-3xl text-sm text-ink-body">{t('privacy.history.intro')}</p>
            </div>

            {history.length === 0 ? (
                <p className="text-sm text-ink-body">{t('privacy.history.empty')}</p>
            ) : (
                <>
                    <ol>
                        {visible.map((entry) => {
                            const purposeKey = purposeLabelKey(entry.purpose);
                            const purposeLabel = t(purposeKey) === purposeKey ? purposeLabelFallback(entry.purpose) : t(purposeKey);
                            const target = historyTarget(entry, groups);
                            const documentLabel = entry.document_kind
                                ? `${t(documentKindLabelKey(entry.document_kind))} ${entry.document_version || ''}`.trim()
                                : null;
                            const knownDocument = entry.document_kind
                                ? documents.find((document) => document.kind === entry.document_kind && document.version === entry.document_version)
                                : null;
                            return (
                                <li key={entry.id} className="border-t border-line py-3 first:border-t-0">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-ink">
                                                {entry.event_type === 'notice_viewed' ? t('privacy.history.notice') : purposeLabel}
                                            </p>
                                            <p className="text-xs text-ink-muted">
                                                {entry.event_type === 'notice_viewed' ? purposeLabel : t(historyEventLabelKey(entry.event_type))}
                                            </p>
                                        </div>
                                        <time className="shrink-0 text-xs text-ink-muted" dateTime={entry.created_at}>
                                            {formatPrivacyDate(entry.created_at, lang) || t('privacy.common.notAvailable')}
                                        </time>
                                    </div>
                                    <dl className="mt-2 grid gap-1 text-xs text-ink-muted sm:grid-cols-2">
                                        <div className="flex min-w-0 gap-1">
                                            <dt className="font-medium">{t('privacy.history.target')}:</dt>
                                            <dd className="min-w-0 break-words">{target || t('privacy.history.selfTarget')}</dd>
                                        </div>
                                        <div className="flex min-w-0 gap-1">
                                            <dt className="font-medium">{t('privacy.history.document')}:</dt>
                                            <dd className="min-w-0 break-words">
                                                {documentLabel || t('privacy.common.notAvailable')}
                                                {knownDocument?.locale ? ` (${knownDocument.locale})` : entry.document_locale ? ` (${entry.document_locale})` : ''}
                                            </dd>
                                        </div>
                                    </dl>
                                </li>
                            );
                        })}
                    </ol>
                    {history.length > INITIAL_ROWS && (
                        <Button type="button" variant="secondary" onClick={() => setShowAll((value) => !value)}>
                            {showAll ? t('privacy.history.showLess') : t('privacy.history.showAll')}
                        </Button>
                    )}
                </>
            )}
            <p className="text-xs text-ink-muted">{t('privacy.history.selfOnly')}</p>
        </section>
    );
}
