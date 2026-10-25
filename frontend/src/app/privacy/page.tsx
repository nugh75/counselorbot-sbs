'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Callout } from '@/components/ui/Callout';
import { Button } from '@/components/ui/Button';
import { ChoiceHistory } from '@/components/privacy/ChoiceHistory';
import { ConsentToggles } from '@/components/privacy/ConsentToggles';
import { DocumentViewer } from '@/components/privacy/DocumentViewer';
import { SharingRevocation } from '@/components/privacy/SharingRevocation';
import { ai4authLoginUrl, apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import {
    SHARING_PURPOSE,
    documentForPurpose,
    type PrivacyChoice,
    type PrivacyChoicesPayload,
    type PrivacyDocument,
    type PrivacyDocumentsPayload,
    type PrivacyGroup,
    type PrivacyHistoryEntry,
    type PrivacyPurpose,
    type PrivacyPurposesPayload,
} from '@/lib/privacy';

export default function PrivacyPage() {
    const { lang, t } = useI18n();
    const [documents, setDocuments] = useState<PrivacyDocument[]>([]);
    const [validationStatus, setValidationStatus] = useState('[DA VALIDARE]');
    const [purposes, setPurposes] = useState<PrivacyPurpose[]>([]);
    const [choices, setChoices] = useState<PrivacyChoice[]>([]);
    const [history, setHistory] = useState<PrivacyHistoryEntry[]>([]);
    const [groups, setGroups] = useState<PrivacyGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [choicesLoading, setChoicesLoading] = useState(true);
    const [choicesError, setChoicesError] = useState(false);
    const [authRequired, setAuthRequired] = useState(false);

    const loadPublic = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            const [documentsResponse, purposesResponse] = await Promise.all([
                apiFetch(`/api/privacy/documents?locale=${encodeURIComponent(lang)}`),
                apiFetch('/api/privacy/purposes'),
            ]);
            if (!documentsResponse.ok || !purposesResponse.ok) throw new Error('privacy public read failed');
            const documentsPayload = await documentsResponse.json() as PrivacyDocumentsPayload;
            const purposesPayload = await purposesResponse.json() as PrivacyPurposesPayload;
            setDocuments(Array.isArray(documentsPayload.documents) ? documentsPayload.documents : []);
            setValidationStatus(documentsPayload.validation_status || '[DA VALIDARE]');
            setPurposes(Array.isArray(purposesPayload.purposes) ? purposesPayload.purposes : []);
        } catch {
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, [lang]);

    const loadSelf = useCallback(async () => {
        setChoicesLoading(true);
        setChoicesError(false);
        try {
            const response = await apiFetch('/api/privacy/choices');
            if (response.status === 401) {
                setAuthRequired(true);
                setChoices([]);
                setHistory([]);
                setGroups([]);
                return;
            }
            if (!response.ok) throw new Error('privacy choices read failed');
            const payload = await response.json() as PrivacyChoicesPayload;
            setAuthRequired(false);
            setChoices(Array.isArray(payload.choices) ? payload.choices : []);
            setHistory(Array.isArray(payload.history) ? payload.history : []);
            const groupsResponse = await apiFetch('/api/user/groups');
            if (groupsResponse.ok) {
                const groupsPayload: unknown = await groupsResponse.json();
                setGroups(Array.isArray(groupsPayload) ? groupsPayload as PrivacyGroup[] : []);
            } else {
                setGroups([]);
            }
        } catch {
            setChoicesError(true);
        } finally {
            setChoicesLoading(false);
        }
    }, []);

    useEffect(() => { void loadPublic(); }, [loadPublic]);
    useEffect(() => { void loadSelf(); }, [loadSelf]);

    const canEdit = !authRequired && !choicesError && !choicesLoading;
    const sharingPurpose = purposes.find((purpose) => purpose.key === SHARING_PURPOSE) || null;
    const sharingDocument = documentForPurpose(sharingPurpose, documents);

    return (
        <div className="page-wide space-y-6 py-8">
            <PageHeader
                title={t('privacy.title')}
                subtitle={t('privacy.subtitle')}
                backHref="/profilo"
                backLabel={t('privacy.back')}
                icon={<ShieldCheck className="h-7 w-7 text-indigo-600" aria-hidden />}
            />

            <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
                    {t('privacy.documents.validation')}: {t('privacy.documents.validationBadge') || validationStatus}
                </span>
                <p className="text-xs text-slate-600">{t('privacy.documents.validationHint')}</p>
            </div>

            {loading ? (
                <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    {t('privacy.loading')}
                </p>
            ) : loadError ? (
                <Callout variant="danger" title={t('privacy.loadError')}>
                    <Button variant="secondary" size="sm" onClick={() => void loadPublic()}>{t('privacy.retry')}</Button>
                </Callout>
            ) : (
                <>
                    <DocumentViewer documents={documents} validationStatus={validationStatus} />

                    {authRequired && (
                        <Callout variant="info" title={t('privacy.signInTitle')}>
                            <p>{t('privacy.signInBody')}</p>
                            <a
                                href={ai4authLoginUrl('/privacy')}
                                className="mt-3 inline-flex min-h-11 items-center rounded-md bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
                            >
                                {t('privacy.signIn')}
                            </a>
                        </Callout>
                    )}

                    {choicesError && (
                        <Callout variant="danger" title={t('privacy.purposes.error')}>
                            <p>{t('privacy.purposes.error.generic')}</p>
                            <Button variant="secondary" size="sm" className="mt-3" onClick={() => void loadSelf()}>{t('privacy.retry')}</Button>
                        </Callout>
                    )}

                    <ConsentToggles
                        purposes={purposes}
                        documents={documents}
                        choices={choices}
                        canEdit={canEdit}
                        choicesLoading={choicesLoading}
                        onSaved={loadSelf}
                    />

                    <SharingRevocation
                        choices={choices}
                        groups={groups}
                        purpose={sharingPurpose}
                        document={sharingDocument}
                        canEdit={canEdit}
                        choicesLoading={choicesLoading}
                        onChanged={loadSelf}
                    />

                    {!authRequired && (
                        <ChoiceHistory history={history} groups={groups} documents={documents} />
                    )}
                </>
            )}

            <p className="text-xs text-slate-500">
                <Link href="/guide" className="underline underline-offset-2 hover:text-indigo-700">{t('nav.guide')}</Link>
            </p>
        </div>
    );
}
