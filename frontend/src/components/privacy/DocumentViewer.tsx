'use client';

import { useState } from 'react';
import { CalendarDays, FileText, Fingerprint, ShieldAlert } from 'lucide-react';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Dialog, DialogBody, DialogFooter } from '@/components/ui/Dialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useI18n } from '@/lib/i18n-context';
import {
    documentHref,
    documentKindLabelKey,
    formatPrivacyDate,
    shortHash,
    type PrivacyDocument,
} from '@/lib/privacy';

function ValidationBadge({ label }: { label: string }) {
    return (
        <StatusBadge tone="warning">
            <ShieldAlert className="h-3 w-3" aria-hidden />
            {label}
        </StatusBadge>
    );
}

export function DocumentViewer({ documents, validationStatus }: {
    documents: PrivacyDocument[];
    validationStatus: string;
}) {
    const { lang, t } = useI18n();
    const [openId, setOpenId] = useState<number | null>(null);
    const open = documents.find((document) => document.id === openId) || null;

    return (
        <section className="space-y-4 border-t border-line pt-6" aria-labelledby="privacy-documents-title">
            <div className="space-y-1">
                <h2 id="privacy-documents-title" className="flex items-center gap-2 text-lg font-semibold text-ink">
                    <FileText className="h-5 w-5 text-link" aria-hidden />
                    {t('privacy.documents.title')}
                </h2>
                <p className="max-w-3xl text-sm text-ink-body">{t('privacy.documents.intro')}</p>
            </div>

            {documents.length === 0 ? (
                <p className="text-sm text-ink-body">
                    {t('privacy.documents.emptyLocale', { locale: lang })}
                </p>
            ) : (
                <ul className="grid gap-x-6 md:grid-cols-2">
                    {documents.map((document) => (
                        <li key={document.id} className="flex min-w-0 flex-col gap-3 border-t border-line py-4 first:border-t-0 md:[&:nth-child(2)]:border-t-0">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <h3 className="break-words text-base font-semibold text-ink">
                                        {t(documentKindLabelKey(document.kind))}
                                    </h3>
                                    <p className="text-xs text-ink-muted">
                                        {t('privacy.documents.version')} {document.version} · {document.locale}
                                    </p>
                                </div>
                                <ValidationBadge label={t('privacy.documents.validationBadge') || validationStatus} />
                            </div>
                            <dl className="grid gap-1 text-xs text-ink-muted">
                                <div className="flex flex-wrap items-center gap-1">
                                    <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    <dt className="sr-only">{t('privacy.documents.published')}</dt>
                                    <dd>{t('privacy.documents.published')} {formatPrivacyDate(document.published_at, lang) || t('privacy.common.notAvailable')}</dd>
                                </div>
                                <div className="flex min-w-0 flex-wrap items-center gap-1">
                                    <Fingerprint className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    <dt className="sr-only">{t('privacy.documents.hash')}</dt>
                                    <dd className="min-w-0 break-all font-mono text-2xs" title={document.content_hash}>{shortHash(document.content_hash)}</dd>
                                </div>
                            </dl>
                            {document.requires_new_consent && (
                                <p><StatusBadge tone="warning">{t('privacy.documents.newConsent')}</StatusBadge></p>
                            )}
                            <Button type="button" variant="secondary" className="mt-auto" onClick={() => setOpenId(document.id)}>
                                {t('privacy.documents.details')}
                            </Button>
                        </li>
                    ))}
                </ul>
            )}

            <p className="text-xs leading-relaxed text-ink-muted">{t('privacy.documents.validationHint')}</p>

            {open && <DocumentDialog document={open} validationStatus={validationStatus} onClose={() => setOpenId(null)} />}
        </section>
    );
}

function DocumentDialog({ document, validationStatus, onClose }: {
    document: PrivacyDocument;
    validationStatus: string;
    onClose: () => void;
}) {
    const { lang, t } = useI18n();
    const href = documentHref(document.body_ref);

    return (
        <Dialog title={t(documentKindLabelKey(document.kind))} closeLabel={t('privacy.documents.close')} onClose={onClose}>
            <DialogBody className="space-y-4">
                <p className="text-sm text-ink-muted">
                    {t('privacy.documents.version')} {document.version} · {document.locale}
                </p>
                <div className="flex flex-wrap gap-2">
                    <ValidationBadge label={t('privacy.documents.validationBadge') || validationStatus} />
                    {document.requires_new_consent && <StatusBadge tone="warning">{t('privacy.documents.newConsent')}</StatusBadge>}
                </div>

                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                    <div>
                        <dt className="text-xs font-semibold text-ink-muted">{t('privacy.documents.published')}</dt>
                        <dd className="mt-1 text-ink">{formatPrivacyDate(document.published_at, lang) || t('privacy.common.notAvailable')}</dd>
                    </div>
                    <div className="sm:col-span-2">
                        <dt className="text-xs font-semibold text-ink-muted">{t('privacy.documents.hash')}</dt>
                        <dd className="mt-1 break-all font-mono text-xs text-ink">{document.content_hash}</dd>
                    </div>
                    <div className="sm:col-span-2">
                        <dt className="text-xs font-semibold text-ink-muted">{t('privacy.documents.reference')}</dt>
                        <dd className="mt-1 break-all font-mono text-xs text-ink">{document.body_ref}</dd>
                    </div>
                </dl>

                <p className="text-sm leading-relaxed text-ink-body">{t('privacy.documents.previewUnavailable')}</p>
                <p className="text-xs leading-relaxed text-ink-muted">{t('privacy.documents.validationHint')}</p>
            </DialogBody>
            <DialogFooter className="justify-end">
                <Button type="button" variant="secondary" onClick={onClose}>{t('privacy.common.close')}</Button>
                {href && (
                    <a
                        href={href}
                        target={href.startsWith('/') ? undefined : '_blank'}
                        rel={href.startsWith('/') ? undefined : 'noopener noreferrer'}
                        className={buttonClasses('primary')}
                    >
                        {t('privacy.documents.open')}
                    </a>
                )}
            </DialogFooter>
        </Dialog>
    );
}
