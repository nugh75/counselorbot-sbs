'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, FileText, Fingerprint, ShieldAlert, X } from 'lucide-react';
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
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
            <ShieldAlert className="h-3 w-3" aria-hidden />
            {label}
        </span>
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
        <section className="glass-panel space-y-4 p-5" aria-labelledby="privacy-documents-title">
            <div className="space-y-1">
                <h2 id="privacy-documents-title" className="flex items-center gap-2 text-lg font-bold text-slate-900">
                    <FileText className="h-5 w-5 text-indigo-600" aria-hidden />
                    {t('privacy.documents.title')}
                </h2>
                <p className="max-w-3xl text-sm text-slate-600">{t('privacy.documents.intro')}</p>
            </div>

            {documents.length === 0 ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    {t('privacy.documents.emptyLocale', { locale: lang })}
                </p>
            ) : (
                <ul className="grid gap-3 md:grid-cols-2">
                    {documents.map((document) => (
                        <li key={document.id} className="flex min-w-0 flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <h3 className="break-words text-base font-semibold text-slate-900">
                                        {t(documentKindLabelKey(document.kind))}
                                    </h3>
                                    <p className="text-xs text-slate-600">
                                        {t('privacy.documents.version')} {document.version} · {document.locale}
                                    </p>
                                </div>
                                <ValidationBadge label={t('privacy.documents.validationBadge') || validationStatus} />
                            </div>
                            <dl className="grid gap-1 text-xs text-slate-600">
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
                                <p className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                                    {t('privacy.documents.newConsent')}
                                </p>
                            )}
                            <button
                                type="button"
                                className="mt-auto inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                                onClick={() => setOpenId(document.id)}
                            >
                                {t('privacy.documents.details')}
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <p className="text-xs leading-relaxed text-slate-600">{t('privacy.documents.validationHint')}</p>

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
    const titleId = useId();
    const closeRef = useRef<HTMLButtonElement>(null);
    const openerRef = useRef<HTMLElement | null>(null);
    const href = documentHref(document.body_ref);

    useEffect(() => {
        openerRef.current = window.document.activeElement as HTMLElement | null;
        closeRef.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('keydown', onKey);
            openerRef.current?.focus();
        };
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4"
            role="presentation"
            onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-xl bg-white p-5 shadow-2xl sm:rounded-xl dark:bg-slate-900"
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 id={titleId} className="break-words text-xl font-bold text-slate-900">{t(documentKindLabelKey(document.kind))}</h2>
                        <p className="mt-1 text-sm text-slate-600">
                            {t('privacy.documents.version')} {document.version} · {document.locale}
                        </p>
                    </div>
                    <button
                        ref={closeRef}
                        type="button"
                        onClick={onClose}
                        aria-label={t('privacy.documents.close')}
                        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:hover:bg-slate-800"
                    >
                        <X className="h-5 w-5" aria-hidden />
                    </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                    <ValidationBadge label={t('privacy.documents.validationBadge') || validationStatus} />
                    {document.requires_new_consent && (
                        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-2xs font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
                            {t('privacy.documents.newConsent')}
                        </span>
                    )}
                </div>

                <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                    <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('privacy.documents.published')}</dt>
                        <dd className="mt-1 text-slate-800">{formatPrivacyDate(document.published_at, lang) || t('privacy.common.notAvailable')}</dd>
                    </div>
                    <div className="sm:col-span-2">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('privacy.documents.hash')}</dt>
                        <dd className="mt-1 break-all font-mono text-xs text-slate-800">{document.content_hash}</dd>
                    </div>
                    <div className="sm:col-span-2">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('privacy.documents.reference')}</dt>
                        <dd className="mt-1 break-all font-mono text-xs text-slate-800">{document.body_ref}</dd>
                    </div>
                </dl>

                <p className="mt-4 text-sm leading-relaxed text-slate-600">{t('privacy.documents.previewUnavailable')}</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">{t('privacy.documents.validationHint')}</p>

                <div className="mt-5 flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
                        {t('privacy.common.close')}
                    </button>
                    {href && (
                        <a
                            href={href}
                            target={href.startsWith('/') ? undefined : '_blank'}
                            rel={href.startsWith('/') ? undefined : 'noopener noreferrer'}
                            className="inline-flex min-h-11 items-center rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
                        >
                            {t('privacy.documents.open')}
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
}
