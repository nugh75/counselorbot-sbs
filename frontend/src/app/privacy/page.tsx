'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Callout } from '@/components/ui/Callout';
import { Button, buttonClasses } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
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
import { SkeletonEntryList } from '@/components/ui/Skeleton';

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
    const [seenLang, setSeenLang] = useState(lang);
    if (seenLang !== lang) {
        setSeenLang(lang);
        setLoading(true);
        setLoadError(false);
    }

    const fetchPublic = useCallback(async () => {
        const [documentsResponse, purposesResponse] = await Promise.all([
            apiFetch(`/api/privacy/documents?locale=${encodeURIComponent(lang)}`),
            apiFetch('/api/privacy/purposes'),
        ]);
        if (!documentsResponse.ok || !purposesResponse.ok) throw new Error('privacy public read failed');
        const documentsPayload = await documentsResponse.json() as PrivacyDocumentsPayload;
        const purposesPayload = await purposesResponse.json() as PrivacyPurposesPayload;
        return {
            documents: Array.isArray(documentsPayload.documents) ? documentsPayload.documents : [],
            validationStatus: documentsPayload.validation_status || '[DA VALIDARE]',
            purposes: Array.isArray(purposesPayload.purposes) ? purposesPayload.purposes : [],
        };
    }, [lang]);

    const loadPublic = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            const next = await fetchPublic();
            setDocuments(next.documents);
            setValidationStatus(next.validationStatus);
            setPurposes(next.purposes);
        } catch {
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, [fetchPublic]);

    const fetchSelf = useCallback(async () => {
        const response = await apiFetch('/api/privacy/choices');
        if (response.status === 401) {
            return { authRequired: true, choices: [] as PrivacyChoice[], history: [] as PrivacyHistoryEntry[], groups: [] as PrivacyGroup[] };
        }
        if (!response.ok) throw new Error('privacy choices read failed');
        const payload = await response.json() as PrivacyChoicesPayload;
        const groupsResponse = await apiFetch('/api/user/groups');
        const groupsPayload: unknown = groupsResponse.ok ? await groupsResponse.json() : [];
        return {
            authRequired: false,
            choices: Array.isArray(payload.choices) ? payload.choices : [],
            history: Array.isArray(payload.history) ? payload.history : [],
            groups: Array.isArray(groupsPayload) ? groupsPayload as PrivacyGroup[] : [],
        };
    }, []);

    const loadSelf = useCallback(async () => {
        setChoicesLoading(true);
        setChoicesError(false);
        try {
            const next = await fetchSelf();
            setAuthRequired(next.authRequired);
            setChoices(next.choices);
            setHistory(next.history);
            setGroups(next.groups);
        } catch {
            setChoicesError(true);
        } finally {
            setChoicesLoading(false);
        }
    }, [fetchSelf]);

    useEffect(() => {
        let active = true;
        fetchPublic()
            .then((next) => {
                if (!active) return;
                setDocuments(next.documents);
                setValidationStatus(next.validationStatus);
                setPurposes(next.purposes);
                setLoadError(false);
            })
            .catch(() => { if (active) setLoadError(true); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [fetchPublic]);

    useEffect(() => {
        let active = true;
        fetchSelf()
            .then((next) => {
                if (!active) return;
                setAuthRequired(next.authRequired);
                setChoices(next.choices);
                setHistory(next.history);
                setGroups(next.groups);
                setChoicesError(false);
            })
            .catch(() => { if (active) setChoicesError(true); })
            .finally(() => { if (active) setChoicesLoading(false); });
        return () => { active = false; };
    }, [fetchSelf]);

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
                icon={<ShieldCheck className="h-7 w-7 text-link" aria-hidden />}
            />

            <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone="warning">
                    {t('privacy.documents.validation')}: {t('privacy.documents.validationBadge') || validationStatus}
                </StatusBadge>
                <p className="text-xs text-ink-muted">{t('privacy.documents.validationHint')}</p>
            </div>

            {loading ? (
                <SkeletonEntryList rows={3} label={t('privacy.loading')} />
            ) : loadError ? (
                <Callout variant="danger" title={t('privacy.loadError')}>
                    <Button variant="secondary" onClick={() => void loadPublic()}>{t('privacy.retry')}</Button>
                </Callout>
            ) : (
                <>
                    <DocumentViewer documents={documents} validationStatus={validationStatus} />

                    {authRequired && (
                        <Callout variant="info" title={t('privacy.signInTitle')}>
                            <p>{t('privacy.signInBody')}</p>
                            <a
                                href={ai4authLoginUrl('/privacy')}
                                className={buttonClasses('primary', 'md', 'mt-4')}
                            >
                                {t('privacy.signIn')}
                            </a>
                        </Callout>
                    )}

                    {choicesError && (
                        <Callout variant="danger" title={t('privacy.purposes.error')}>
                            <p>{t('privacy.purposes.error.generic')}</p>
                            <Button variant="secondary" className="mt-4" onClick={() => void loadSelf()}>{t('privacy.retry')}</Button>
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

            <p className="text-xs text-ink-muted">
                <Link href="/guide" className="underline underline-offset-2 hover:text-link">{t('nav.guide')}</Link>
            </p>
        </div>
    );
}
