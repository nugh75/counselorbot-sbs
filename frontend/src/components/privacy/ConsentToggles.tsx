'use client';

import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import {
    canRecordNewChoice,
    currentChoice,
    documentForPurpose,
    initialSwitchState,
    legalBasisLabelKey,
    privacyErrorKey,
    purposeDescription,
    purposeLabelFallback,
    purposeLabelKey,
    purposeState,
    type PrivacyChoice,
    type PrivacyDocument,
    type PrivacyPurpose,
} from '@/lib/privacy';

type Feedback = { key: string; kind: 'ok' | 'error'; purpose: string };

async function errorKey(response: Response): Promise<string> {
    let detail: unknown = null;
    try {
        const payload = await response.json() as { detail?: unknown };
        detail = payload?.detail ?? null;
    } catch {
        // A non-JSON error still maps to the generic privacy message.
    }
    return privacyErrorKey(response.status, detail);
}

const STATE_CLASSES = {
    granted: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100',
    refused: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
    unset: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
    disabled: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100',
};

const STATE_KEYS: Record<keyof typeof STATE_CLASSES, string> = {
    granted: 'privacy.purposes.state.granted',
    refused: 'privacy.purposes.state.refused',
    unset: 'privacy.purposes.state.unset',
    disabled: 'privacy.purposes.state.disabled',
};

export function ConsentToggles({ purposes, documents, choices, canEdit, choicesLoading, onSaved }: {
    purposes: PrivacyPurpose[];
    documents: PrivacyDocument[];
    choices: PrivacyChoice[];
    canEdit: boolean;
    choicesLoading: boolean;
    onSaved: () => Promise<void> | void;
}) {
    const { lang, t } = useI18n();
    const [drafts, setDrafts] = useState<Record<string, boolean>>({});
    const [initial, setInitial] = useState<Record<string, boolean>>({});
    const [saving, setSaving] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<Feedback | null>(null);

    useEffect(() => {
        const next: Record<string, boolean> = {};
        for (const purpose of purposes) {
            const choice = currentChoice(choices, purpose.key);
            next[purpose.key] = initialSwitchState(purpose, choice);
        }
        setDrafts(next);
        setInitial(next);
    }, [purposes, choices]);

    const save = async (purpose: PrivacyPurpose) => {
        const document = documentForPurpose(purpose, documents);
        const checked = drafts[purpose.key] ?? false;
        const wasGranted = initial[purpose.key] ?? false;
        if (checked === wasGranted) {
            setFeedback({ purpose: purpose.key, kind: 'ok', key: 'privacy.purposes.unchanged' });
            return;
        }
        if (!document) {
            setFeedback({ purpose: purpose.key, kind: 'error', key: 'privacy.purposes.documentMissing' });
            return;
        }
        setSaving(purpose.key);
        setFeedback(null);
        try {
            const response = checked
                ? await apiFetch(`/api/privacy/choices/${encodeURIComponent(purpose.key)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ document_id: document.id, granted: true }),
                })
                : wasGranted
                    ? await apiFetch(`/api/privacy/choices/${encodeURIComponent(purpose.key)}/revoke`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({}),
                    })
                    : await apiFetch(`/api/privacy/choices/${encodeURIComponent(purpose.key)}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ document_id: document.id, granted: false }),
                    });
            if (!response.ok) {
                setFeedback({ purpose: purpose.key, kind: 'error', key: await errorKey(response) });
                return;
            }
            setFeedback({ purpose: purpose.key, kind: 'ok', key: 'privacy.purposes.saved' });
            await onSaved();
        } catch {
            setFeedback({ purpose: purpose.key, kind: 'error', key: 'privacy.purposes.error.generic' });
        } finally {
            setSaving(null);
        }
    };

    if (purposes.length === 0) {
        return (
            <section className="glass-panel space-y-3 p-5" aria-labelledby="privacy-purposes-title">
                <h2 id="privacy-purposes-title" className="flex items-center gap-2 text-lg font-bold text-slate-900">
                    <ShieldCheck className="h-5 w-5 text-indigo-600" aria-hidden />
                    {t('privacy.purposes.title')}
                </h2>
                <p className="text-sm text-slate-600">{t('privacy.purposes.empty')}</p>
            </section>
        );
    }

    return (
        <section className="glass-panel space-y-5 p-5" aria-labelledby="privacy-purposes-title">
            <div className="space-y-1">
                <h2 id="privacy-purposes-title" className="flex items-center gap-2 text-lg font-bold text-slate-900">
                    <ShieldCheck className="h-5 w-5 text-indigo-600" aria-hidden />
                    {t('privacy.purposes.title')}
                </h2>
                <p className="max-w-3xl text-sm text-slate-600">{t('privacy.purposes.intro')}</p>
                <p className="text-xs font-medium text-slate-600">{t('privacy.purposes.onlyExplicit')}</p>
            </div>

            <ul className="space-y-3">
                {purposes.map((purpose) => {
                    const choice = currentChoice(choices, purpose.key);
                    const state = purposeState(purpose, choice);
                    const document = documentForPurpose(purpose, documents);
                    const label = t(purposeLabelKey(purpose.key)) === purposeLabelKey(purpose.key)
                        ? purposeLabelFallback(purpose.key)
                        : t(purposeLabelKey(purpose.key));
                    const description = purposeDescription(purpose, lang);
                    const checked = drafts[purpose.key] ?? false;
                    const dirty = checked !== (initial[purpose.key] ?? false);
                    const canEnable = canRecordNewChoice(purpose, document);
                    const switchDisabled = !canEdit || choicesLoading || saving === purpose.key || (!checked && !canEnable);
                    const saveDisabled = !canEdit || choicesLoading || saving === purpose.key || !dirty || (checked && !canEnable);
                    const message = feedback?.purpose === purpose.key ? feedback : null;
                    return (
                        <li key={purpose.key} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <label className="flex min-h-11 cursor-pointer items-start gap-3">
                                        <input
                                            type="checkbox"
                                            role="switch"
                                            className="mt-1 h-5 w-5 shrink-0 accent-indigo-600 disabled:cursor-not-allowed"
                                            checked={checked}
                                            disabled={switchDisabled}
                                            aria-label={t('privacy.purposes.switch', { purpose: label })}
                                            onChange={(event) => {
                                                setDrafts((current) => ({ ...current, [purpose.key]: event.target.checked }));
                                                setFeedback(null);
                                            }}
                                        />
                                        <span className="min-w-0">
                                            <span className="block text-base font-semibold text-slate-900">{label}</span>
                                            {description.text && !description.pending && (
                                                <span className="mt-1 block text-sm text-slate-600">{description.text}</span>
                                            )}
                                            {description.pending && (
                                                <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-800 dark:text-amber-200">
                                                    <ShieldQuestion className="h-3.5 w-3.5" aria-hidden />
                                                    {t('privacy.purposes.descriptionPending')}
                                                </span>
                                            )}
                                        </span>
                                    </label>
                                </div>
                                <div className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${STATE_CLASSES[state]}`}>
                                    {t(STATE_KEYS[state])}
                                </div>
                            </div>

                            <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                                <div className="flex gap-1">
                                    <dt className="font-medium">{t('privacy.purposes.legalBasis')}:</dt>
                                    <dd>{t(legalBasisLabelKey(purpose.legal_basis))}</dd>
                                </div>
                                <div className="flex gap-1">
                                    <dt className="font-medium">{t('privacy.purposes.requiresConsent')}:</dt>
                                    <dd>{purpose.requires_consent ? t('privacy.purposes.requiresConsent') : t('privacy.purposes.noConsentRequired')}</dd>
                                </div>
                            </dl>

                            {!purpose.active || purpose.legal_basis === 'undefined' ? (
                                <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-200">{t('privacy.purposes.inactive')} · {t('privacy.purposes.undefined')}</p>
                            ) : !document ? (
                                <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-200">{t('privacy.purposes.documentMissing')}</p>
                            ) : null}

                            <div className="mt-3 flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => void save(purpose)}
                                    disabled={saveDisabled}
                                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
                                >
                                    {saving === purpose.key && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                                    {saving === purpose.key ? t('privacy.purposes.saving') : t('privacy.purposes.save')}
                                </button>
                                {message && (
                                    <p
                                        role={message.kind === 'error' ? 'alert' : 'status'}
                                        className={message.kind === 'error' ? 'text-sm font-medium text-red-700 dark:text-red-300' : 'text-sm font-medium text-emerald-700 dark:text-emerald-300'}
                                    >
                                        {t(message.key)}
                                    </p>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
