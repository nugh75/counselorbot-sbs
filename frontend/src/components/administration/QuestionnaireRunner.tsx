'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { useI18n } from '@/lib/i18n-context';
import {
    fetchRules,
    type InstrumentRules,
    type RulesUnavailable,
} from '@/lib/instruments-api';
import { addCompletedProfile } from '@/lib/profile-tracker';
import { apiFetch, loginHref as authLoginHref } from '@/lib/auth';
import { AGE_BANDS } from '@/lib/age-bands';
import {
    clearAdministrationDraft,
    loadAdministrationDraft,
    saveAdministrationDraft,
} from '@/lib/compilation-draft';
import { credentialText, type CredentialTextKey } from '@/lib/i18n-institution-credentials';
import {
    contextFailure,
    parseVerificationGrant,
    verificationRequest,
    verifyFailure,
    withInstitutionGrant,
    type VerificationRequest,
} from '@/lib/institution-credentials';
import { useClientValue } from '@/lib/use-client-value';

const QUESTIONNAIRE_SELECTION_HREF = '/?view=home';

// Profilo calcolato lato server (POST /api/instruments/{code}/score).
interface ScoreResult {
    code: string;
    label: string;
    dimension: string;
    orientation: string;
    raw_average: number;
    percentage: number;
    band: string;
    band_label: string;
    interpretation: string;
    stanine: number | null;
    stanine_is_normed: boolean;
}
interface ScoreResponse {
    instrument: string;
    locale: string;
    status: string;
    uses_validated_norms: boolean;
    results: ScoreResult[];
}

// Safe UUID generation
function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

const ANONYMOUS_RESEARCH_CODE_STORAGE_KEY = 'counselorbot.anonymousResearchCode.v1';
const ANONYMOUS_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomIndex(max: number) {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const bytes = new Uint32Array(1);
        crypto.getRandomValues(bytes);
        return bytes[0] % max;
    }
    return Math.floor(Math.random() * max);
}

function generateAnonymousResearchCode() {
    const chars = Array.from({ length: 8 }, () => ANONYMOUS_CODE_ALPHABET[randomIndex(ANONYMOUS_CODE_ALPHABET.length)]).join('');
    return `SBS-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

function getOrCreateAnonymousResearchCode() {
    if (typeof window === 'undefined') return generateAnonymousResearchCode();
    try {
        const existing = window.localStorage.getItem(ANONYMOUS_RESEARCH_CODE_STORAGE_KEY);
        if (existing) return existing;
        const generated = generateAnonymousResearchCode();
        window.localStorage.setItem(ANONYMOUS_RESEARCH_CODE_STORAGE_KEY, generated);
        return generated;
    } catch {
        return generateAnonymousResearchCode();
    }
}

async function fetchAnonymousResearchCode(): Promise<{ code: string | null; authenticated: boolean }> {
    try {
        const res = await apiFetch('/api/user/anonymous-research-code');
        if (res.status === 401) return { code: null, authenticated: false };
        if (!res.ok) return { code: null, authenticated: true };
        const data = await res.json();
        return {
            code: typeof data?.anonymous_research_code === 'string' ? data.anonymous_research_code : null,
            authenticated: true,
        };
    } catch {
        return { code: null, authenticated: true };
    }
}

function rememberAnonymousResearchCode(code: string) {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(ANONYMOUS_RESEARCH_CODE_STORAGE_KEY, code);
    } catch {
        // Il codice server resta quello autorevole anche se localStorage non e' disponibile.
    }
}

interface QuestionnaireRunnerProps {
    instrument: string;
}

export function QuestionnaireRunner({ instrument }: QuestionnaireRunnerProps) {
    const { t, lang } = useI18n();
    const searchParams = useSearchParams();
    const [answers, setAnswers] = useState<Record<number, number>>({});
    const [error, setError] = useState('');
    const [results, setResults] = useState<ScoreResult[] | null>(null);
    const [createdSessionId, setCreatedSessionId] = useState<string>('');
    const [startedAt, setStartedAt] = useState(() => Date.now());
    // Item, etichette dei fattori e scala vengono dal catalogo DB: nessuna
    // seconda copia nel bundle, quindi nessuna lingua che ne serve un'altra.
    const [rules, setRules] = useState<InstrumentRules | null>(null);
    const [unavailable, setUnavailable] = useState<RulesUnavailable | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [anonymousResearchCode, setAnonymousResearchCode] = useState('');
    const [codeRequiresLogin, setCodeRequiresLogin] = useState(false);
    const loginHref = useClientValue(() => authLoginHref(`${window.location.pathname}${window.location.search}`), '/login');
    // Invio in corso: il comando resta fermo finché lo scoring non risponde.
    const [submitting, setSubmitting] = useState(false);
    // Institute verification: the grant lives only in memory, never in URLs or storage.
    const [verification, setVerification] = useState<VerificationRequest | null>(null);
    const [grant, setGrant] = useState<string | null>(null);
    const [institutionCode, setInstitutionCode] = useState('');
    const [institutionPassword, setInstitutionPassword] = useState('');
    const [verifyError, setVerifyError] = useState<CredentialTextKey | null>(null);
    const [verifying, setVerifying] = useState(false);
    // Bozza ritrovata all'ingresso: lo si dice, non lo si fa di nascosto.
    const [restoredDraft, setRestoredDraft] = useState(false);
    const [metadata, setMetadata] = useState({
        age_range: '',
        gender: '',
        education_context: '',
        participation_context: searchParams.get('context') ?? '',
        recruitment_source: searchParams.get('source') ?? '',
        study: searchParams.get('study') ?? searchParams.get('cohort') ?? '',
        consent: false,
    });
    const versionLabel = searchParams.get('version') || `${instrument}_${lang}_2026_v1`;

    useEffect(() => {
        let cancelled = false;
        fetchAnonymousResearchCode().then(({ code: serverCode, authenticated }) => {
            if (cancelled) return;
            setCodeRequiresLogin(!authenticated);
            if (serverCode) {
                rememberAnonymousResearchCode(serverCode);
                setAnonymousResearchCode(serverCode);
                return;
            }
            if (authenticated) {
                const fallbackCode = getOrCreateAnonymousResearchCode();
                rememberAnonymousResearchCode(fallbackCode);
                setAnonymousResearchCode(fallbackCode);
            }
        });
        return () => { cancelled = true; };
    }, []);

    // La lingua della somministrazione e' quella dell'interfaccia: cambiarla
    // ricarica lo strumento, e se in quella lingua non e' certificato lo dice.
    const rulesKey = `${instrument}:${lang}`;
    const [shownRulesKey, setShownRulesKey] = useState(rulesKey);
    if (shownRulesKey !== rulesKey) {
        setShownRulesKey(rulesKey);
        setRules(null);
        setUnavailable(null);
        setLoadFailed(false);
    }
    useEffect(() => {
        let cancelled = false;
        fetchRules(instrument, lang)
            .then((result) => {
                if (cancelled) return;
                if ('unavailable' in result) setUnavailable(result);
                else setRules(result);
            })
            .catch(() => { if (!cancelled) setLoadFailed(true); });
        return () => { cancelled = true; };
    }, [instrument, lang]);

    // Bozza: si ripristina all'ingresso e si riscrive a ogni risposta. Il
    // consenso non entra mai nella bozza né ne esce: è un gesto della sessione
    // in corso.
    useEffect(() => {
        const draft = loadAdministrationDraft(instrument, lang);
        if (!draft) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restores the localStorage draft after hydration (not readable during the server render)
        setAnswers(draft.answers);
        setMetadata((current) => ({ ...current, ...draft.metadata, consent: current.consent }));
        setRestoredDraft(true);
    }, [instrument, lang]);

    useEffect(() => {
        if (results) return;
        if (Object.keys(answers).length === 0) return;
        saveAdministrationDraft({
            instrument,
            locale: lang,
            answers,
            // Campo per campo, così il consenso non finisce nella bozza per
            // distrazione se un domani se ne aggiunge un altro.
            metadata: {
                age_range: metadata.age_range,
                gender: metadata.gender,
                education_context: metadata.education_context,
                participation_context: metadata.participation_context,
                recruitment_source: metadata.recruitment_source,
                study: metadata.study,
            },
            savedAt: new Date().toISOString(),
        });
    }, [answers, metadata, instrument, lang, results]);

    const displayItems = useMemo(() => {
        if (!rules) return [] as { number: number; text: string }[];
        return [...rules.items]
            .filter((item) => item.active)
            .sort((a, b) => a.item_number - b.item_number)
            .map((item) => ({ number: item.item_number, text: item.text ?? '' }));
    }, [rules]);

    // Etichette della scala dallo strumento; senza etichette restano i numeri,
    // che e' meglio di un'etichetta presa da un'altra lingua.
    const scaleLabels = useMemo(() => {
        if (!rules) return [] as { value: number; label: string }[];
        const { response_scale_min: min, response_scale_max: max, response_labels: labels } = rules.instrument;
        const out: { value: number; label: string }[] = [];
        for (let value = min; value <= max; value += 1) {
            out.push({ value, label: labels?.[value - min] ?? '' });
        }
        return out;
    }, [rules]);

    const scaleMax = rules?.instrument.response_scale_max ?? 4;
    const answered = Object.keys(answers).length;
    const completion = displayItems.length
        ? Math.round((answered / displayItems.length) * 100)
        : 0;

    if (unavailable) {
        return (
            <Card as="section" className="max-w-xl mx-auto p-8 text-center space-y-4">
                <h1 className="text-2xl font-semibold text-ink">{t('admin.run.unavailable.title')}</h1>
                <p className="text-ink-muted">{t('admin.run.unavailable.body')}</p>
                {unavailable.availableLocales.length > 0 && (
                    <p className="text-sm text-ink-muted">
                        {t('admin.run.unavailable.languages').replace(
                            '{langs}',
                            unavailable.availableLocales.join(', '),
                        )}
                    </p>
                )}
                <BackButton href={QUESTIONNAIRE_SELECTION_HREF} label={t('admin.run.back')} />
            </Card>
        );
    }

    if (loadFailed) {
        return (
            <Card as="section" className="max-w-xl mx-auto p-8 text-center space-y-4">
                <p className="text-ink-muted">{t('admin.run.loadError')}</p>
                <BackButton href={QUESTIONNAIRE_SELECTION_HREF} label={t('admin.run.back')} />
            </Card>
        );
    }

    if (!rules) {
        return (
            <div className="mx-auto max-w-2xl rounded-card border border-line bg-surface p-6 text-sm text-ink-muted">
                {t('admin.run.loading')}
            </div>
        );
    }

    const submit = async (event?: FormEvent<HTMLFormElement>, grantOverride?: string) => {
        event?.preventDefault();
        if (verification && !grantOverride) return;
        if (codeRequiresLogin) {
            setError(t('admin.run.meta.loginRequired'));
            return;
        }
        if (!metadata.consent) {
            setError(t('admin.run.meta.consentError'));
            return;
        }
        if (answered !== displayItems.length) {
            setError(t('admin.run.missingAnswers'));
            const firstMissing = displayItems.find((item) => !answers[item.number]);
            if (firstMissing) {
                document.getElementById(`item-${firstMissing.number}`)?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                });
            }
            return;
        }
        setError('');
        setSubmitting(true);

        const newSessionId = generateUUID();
        const researchCode = anonymousResearchCode || getOrCreateAnonymousResearchCode();
        if (!anonymousResearchCode) setAnonymousResearchCode(researchCode);
        setCreatedSessionId(newSessionId);
        const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));

        // Scoring lato server (le regole vivono nel DB) + salvataggio.
        try {
            const res = await apiFetch(`/api/instruments/${instrument}/score`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(withInstitutionGrant({
                    session_id: newSessionId,
                    locale: lang,
                    answers,
                    save: true,
                    save_validation: true,
                    version_label: versionLabel,
                    response_metadata: {
                        item_count: displayItems.length,
                        source: 'somministrazione',
                        participant_code: researchCode,
                        anonymous_research_code: researchCode,
                        participant_code_source: 'auto_device',
                        age_range: metadata.age_range,
                        gender: metadata.gender,
                        education_context: metadata.education_context.trim(),
                        participation_context: metadata.participation_context,
                        recruitment_source: metadata.recruitment_source,
                        study: metadata.study.trim(),
                        study_code: metadata.study.trim(),
                        consent: metadata.consent,
                    },
                    duration_seconds: durationSeconds,
                }, grantOverride ?? grant)),
            });
            if (!res.ok) {
                if (res.status === 401) {
                    setCodeRequiresLogin(true);
                    setError(t('admin.run.meta.loginRequired'));
                    return;
                }
                // Known administration context never falls back to a standalone save.
                const failure = await res.json().catch(() => null);
                const request = verificationRequest(res.status, failure);
                if (request) {
                    setGrant(null);
                    setInstitutionCode(request.institutionCode ?? '');
                    setVerification(request);
                    return;
                }
                if (contextFailure(failure)) {
                    setError(credentialText(lang, 'verifyUnavailable'));
                    return;
                }
                throw new Error(`score failed: ${res.status}`);
            }
            clearAdministrationDraft();
            const profile: ScoreResponse = await res.json();
            setResults(profile.results);

            const mappedScores: Record<string, number> = {};
            for (const r of profile.results) {
                if (r.stanine !== null) mappedScores[r.code] = r.stanine;
            }
            addCompletedProfile(instrument, newSessionId, mappedScores);
        } catch (e) {
            console.error('Failed to score/save questionnaire result', e);
            setError(t('admin.run.loadError'));
        } finally {
            setSubmitting(false);
        }
    };

    const verifyInstitution = async () => {
        if (!verification || verifying) return;
        setVerifying(true);
        setVerifyError(null);
        try {
            const res = await apiFetch(`/api/user/administrations/${verification.planId}/verify-institution`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ institution_code: institutionCode, password: institutionPassword }),
            });
            if (!res.ok) {
                const failure = verifyFailure(res.status, await res.json().catch(() => null));
                setVerifyError(failure === 'failed' ? 'verifyFailed' : failure === 'throttled' ? 'verifyThrottled'
                    : failure === 'unavailable' ? 'verifyUnavailable' : 'verifyError');
                return;
            }
            const issued = parseVerificationGrant(await res.json());
            setInstitutionPassword('');
            setGrant(issued.grant);
            setVerification(null);
            await submit(undefined, issued.grant);
        } catch (e) {
            console.error('Institution verification failed', e);
            setVerifyError('verifyError');
        } finally {
            setVerifying(false);
        }
    };

    if (results) {
        const dimensions = [...new Set(results.map((r) => r.dimension))];
        const renderResults = (dimension: string, title: string) => (
            <section className="space-y-4">
                <h2 className="text-xl font-semibold text-ink">{title}</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    {results
                        .filter((result) => result.dimension === dimension)
                        .map((result) => (
                            <article key={result.code} className="rounded-card border border-line bg-surface p-4 space-y-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-semibold text-link">{result.code}</p>
                                        <h3 className="text-sm font-semibold text-ink">{result.label}</h3>
                                    </div>
                                    <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${
                                        result.orientation === 'difficulty' && result.band === 'higher'
                                            ? 'bg-warning-soft text-warning-ink'
                                            : 'bg-brand-soft text-link'
                                    }`}>
                                        {result.band_label}
                                    </span>
                                </div>
                                <div>
                                    <div className="mb-1 flex justify-between text-xs font-semibold text-ink-body">
                                        <span>{t('admin.run.stanineScore')}{result.stanine_is_normed ? '' : ' *'}</span>
                                        <span className="font-semibold text-link">{result.stanine ?? '—'} / 9</span>
                                    </div>
                                    <div className="h-2 overflow-hidden rounded-full bg-surface-raised">
                                        <div
                                            className={`h-full rounded-full ${
                                                result.orientation === 'difficulty' ? 'bg-warning' : 'bg-brand'
                                            }`}
                                            style={{ width: `${(((result.stanine ?? 1) - 1) / 8) * 100}%` }}
                                        />
                                    </div>
                                    <div className="mt-2 flex justify-between text-2xs text-ink-muted">
                                        <span>{t('admin.run.rawAverage')}: {result.raw_average.toFixed(2)} / {scaleMax}</span>
                                    </div>
                                </div>
                                <p className="text-xs leading-relaxed text-ink-muted">{result.interpretation}</p>
                            </article>
                        ))}
                </div>
            </section>
        );

        // Le dimensioni sono un vocabolario chiuso, tradotto in i18n-factors;
        // una dimensione sconosciuta mostra il proprio codice invece di sparire.
        const dimensionTitle = (dimension: string | null) => {
            if (!dimension) return '';
            const translated = t(`dimension.${dimension}`);
            return translated === `dimension.${dimension}` ? dimension : translated;
        };

        return (
            <div className="max-w-5xl mx-auto space-y-6">
                <Card as="section" className="sm:p-8 space-y-4">
                    <div className="flex items-center gap-4">
                        <CheckCircle2 className="w-10 h-10 shrink-0 text-success" />
                        <div>
                            <span className="inline-flex rounded-full bg-warning-soft px-4 py-1 text-xs font-semibold text-warning-ink">
                                {t('admin.run.testBadge')}
                            </span>
                            <h1 className="mt-2 text-2xl font-semibold text-ink">{t('admin.run.submittedTitle')}</h1>
                        </div>
                    </div>
                    <Callout variant="warning">{t('admin.run.submittedBody')}</Callout>
                    <p className="rounded-control bg-surface-raised px-4 py-4 text-sm leading-relaxed text-ink-body">
                        {t('admin.run.profileMethod')}
                    </p>
                </Card>

                {dimensions.map((dim) => (
                    <div key={dim}>{renderResults(dim, dimensionTitle(dim))}</div>
                ))}

                <div className="flex flex-col-reverse justify-between gap-4 sm:flex-row sm:items-center">
                    <BackButton href={QUESTIONNAIRE_SELECTION_HREF} label={t('admin.run.back')} />
                    <div className="flex gap-2">
                        <Link
                            href={`/?session_id=${createdSessionId}&instrument=${instrument}`}
                            className="inline-flex min-h-control items-center justify-center gap-2 rounded-control bg-move px-6 py-2 text-sm font-semibold text-ink-on-brand transition-colors hover:bg-move-hover"
                        >
                            {t('admin.run.startChat')}
                        </Link>
                        <Button
                            type="button"
                            onClick={() => {
                                setAnswers({});
                                setResults(null);
                                setStartedAt(Date.now());
                                setMetadata((previous) => ({ ...previous, consent: false }));
                            }}
                        >
                            {t('admin.run.restart')}
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <BackButton href={QUESTIONNAIRE_SELECTION_HREF} label={t('admin.run.back')} />

            <Card as="section" className="space-y-4">
                <span className="inline-flex rounded-full bg-warning-soft px-4 py-1 text-xs font-semibold text-warning-ink">
                    {t('admin.run.testBadge')}
                </span>
                <h1 className="text-2xl font-semibold text-ink">
                    {rules.instrument.name} ({rules.instrument.code})
                </h1>
                <div className="rounded-card border border-warning-line bg-warning-soft p-4 flex gap-4">
                    <AlertTriangle className="w-6 h-6 shrink-0 text-warning" />
                    <div>
                        <h2 className="font-semibold text-warning-ink">{t('admin.run.warningTitle')}</h2>
                        <p className="mt-1 text-sm leading-relaxed text-warning-ink">{t('admin.run.warningBody')}</p>
                    </div>
                </div>
                <p className="text-ink-body leading-relaxed">{t('admin.run.instructions')}</p>
                <p className="rounded-control bg-surface-raised px-4 py-4 text-sm text-ink-body">{t('admin.run.privacyNote')}</p>
            </Card>

            <Card as="section" className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-ink">
                            {t('admin.run.meta.sectionTitle')}
                        </h2>
                        <p className="mt-1 text-sm text-ink-muted">
                            {t('admin.run.meta.anonHint')}
                        </p>
                    </div>
                    <span className="rounded-control bg-surface-raised px-4 py-2 font-mono text-xs text-ink-muted">
                        {versionLabel}
                    </span>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                    <label className="block">
                        <span className="text-xs font-semibold text-ink-muted">
                            {t('admin.run.meta.researchCodeLabel')}
                        </span>
                        <input
                            readOnly
                            value={anonymousResearchCode || '...'}
                            className="mt-1 w-full min-h-control rounded-control border border-line-strong bg-surface-raised px-4 py-2 font-mono text-sm text-ink-body"
                        />
                        <span className="mt-1 block text-xs leading-relaxed text-ink-muted">
                            {t('admin.run.meta.researchCodeHint')}
                        </span>
                        {codeRequiresLogin && (
                            <a
                                href={loginHref}
                                className="mt-2 inline-flex min-h-control items-center rounded-control bg-brand px-4 py-2 text-sm font-semibold text-ink-on-brand hover:bg-brand-hover"
                            >
                                {t('admin.run.meta.loginAction')}
                            </a>
                        )}
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold text-ink-muted">
                            {t('admin.run.meta.studyCodeLabel')}
                        </span>
                        <input
                            value={metadata.study}
                            onChange={(event) => setMetadata((previous) => ({ ...previous, study: event.target.value }))}
                            placeholder={t('admin.run.meta.studyCodePlaceholder')}
                            className="mt-1 w-full min-h-control rounded-control border border-line-strong px-4 py-2 text-sm"
                        />
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold text-ink-muted">
                            {t('admin.run.meta.participationContextLabel')}
                        </span>
                        <select
                            value={metadata.participation_context}
                            onChange={(event) => setMetadata((previous) => ({ ...previous, participation_context: event.target.value }))}
                            className="mt-1 w-full min-h-control rounded-control border border-line-strong px-4 py-2 text-sm"
                        >
                            <option value="">{t('admin.run.meta.preferNot')}</option>
                            <option value="lesson_classroom">{t('admin.run.meta.contextLesson')}</option>
                            <option value="library_study_room">{t('admin.run.meta.contextLibrary')}</option>
                            <option value="home">{t('admin.run.meta.contextHome')}</option>
                            <option value="lab">{t('admin.run.meta.contextLab')}</option>
                            <option value="university_campus">{t('admin.run.meta.contextUniversity')}</option>
                            <option value="online_remote">{t('admin.run.meta.contextRemote')}</option>
                            <option value="workshop_event">{t('admin.run.meta.contextEvent')}</option>
                            <option value="other">{t('admin.run.meta.contextOther')}</option>
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold text-ink-muted">
                            {t('admin.run.meta.recruitmentSourceLabel')}
                        </span>
                        <select
                            value={metadata.recruitment_source}
                            onChange={(event) => setMetadata((previous) => ({ ...previous, recruitment_source: event.target.value }))}
                            className="mt-1 w-full min-h-control rounded-control border border-line-strong px-4 py-2 text-sm"
                        >
                            <option value="">{t('admin.run.meta.preferNot')}</option>
                            <option value="teacher_invitation">{t('admin.run.meta.sourceTeacher')}</option>
                            <option value="researcher_invitation">{t('admin.run.meta.sourceResearcher')}</option>
                            <option value="qr_poster">{t('admin.run.meta.sourceQr')}</option>
                            <option value="class_activity">{t('admin.run.meta.sourceClassActivity')}</option>
                            <option value="website_platform">{t('admin.run.meta.sourceWebsite')}</option>
                            <option value="peer_invitation">{t('admin.run.meta.sourcePeer')}</option>
                            <option value="other">{t('admin.run.meta.sourceOther')}</option>
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold text-ink-muted">
                            {t('admin.run.meta.ageLabel')}
                        </span>
                        <select
                            value={metadata.age_range}
                            onChange={(event) => setMetadata((previous) => ({ ...previous, age_range: event.target.value }))}
                            className="mt-1 w-full min-h-control rounded-control border border-line-strong px-4 py-2 text-sm"
                        >
                            <option value="">{t('admin.run.meta.preferNot')}</option>
                            {AGE_BANDS.map((band) => (
                                <option key={band} value={band}>
                                    {band}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold text-ink-muted">
                            {t('admin.run.meta.genderLabel')}
                        </span>
                        <select
                            value={metadata.gender}
                            onChange={(event) => setMetadata((previous) => ({ ...previous, gender: event.target.value }))}
                            className="mt-1 w-full min-h-control rounded-control border border-line-strong px-4 py-2 text-sm"
                        >
                            <option value="">{t('admin.run.meta.preferNot')}</option>
                            <option value="female">{t('admin.run.meta.female')}</option>
                            <option value="male">{t('admin.run.meta.male')}</option>
                            <option value="other">{t('admin.run.meta.other')}</option>
                        </select>
                    </label>
                    <label className="block md:col-span-2">
                        <span className="text-xs font-semibold text-ink-muted">
                            {t('admin.run.meta.eduLabel')}
                        </span>
                        <input
                            value={metadata.education_context}
                            onChange={(event) => setMetadata((previous) => ({ ...previous, education_context: event.target.value }))}
                            placeholder={t('admin.run.meta.eduPlaceholder')}
                            className="mt-1 w-full min-h-control rounded-control border border-line-strong px-4 py-2 text-sm"
                        />
                    </label>
                </div>
                <label className="flex items-start gap-4 rounded-control border border-line bg-surface p-4 text-sm text-ink-body">
                    <input
                        type="checkbox"
                        checked={metadata.consent}
                        onChange={(event) => {
                            setMetadata((previous) => ({ ...previous, consent: event.target.checked }));
                            setError('');
                        }}
                        className="mt-1 accent-brand"
                    />
                    <span>
                        {t('admin.run.meta.consent')}
                    </span>
                </label>
            </Card>

            {restoredDraft && (
                <div className="flex flex-wrap items-center gap-4 rounded-card border border-info-line bg-info-soft px-4 py-4 text-sm text-info-ink" role="status">
                    <span>{t('admin.run.draftRestored')}</span>
                    <button
                        type="button"
                        onClick={() => {
                            clearAdministrationDraft();
                            setAnswers({});
                            setRestoredDraft(false);
                            setStartedAt(Date.now());
                        }}
                        className="min-h-control font-semibold underline underline-offset-2"
                    >
                        {t('admin.run.draftDiscard')}
                    </button>
                </div>
            )}

            <div className="sticky top-16 z-10 rounded-card border border-line bg-surface p-4 shadow-card">
                <div className="flex justify-between text-sm font-semibold text-ink-body">
                    <span>{answered}/{displayItems.length} {t('admin.run.progress')}</span>
                    <span>{completion}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-raised">
                    <div className="h-full bg-brand transition-all" style={{ width: `${completion}%` }} />
                </div>
            </div>

            <form onSubmit={submit} className="space-y-4">
                {displayItems.map((item) => (
                    <fieldset
                        key={item.number}
                        id={`item-${item.number}`}
                        className="rounded-card border border-line bg-surface shadow-card scroll-mt-36 p-4 sm:p-6"
                    >
                        <legend className="sr-only">{item.number}. {item.text}</legend>
                        <p className="text-sm sm:text-base leading-relaxed text-ink">
                            <span className="mr-2 font-semibold text-link">{item.number}.</span>
                            {item.text}
                        </p>
                        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                            {scaleLabels.map(({ value, label }) => (
                                <label
                                    key={value}
                                    className={`flex min-h-control cursor-pointer items-center gap-2 rounded-control border px-4 py-2 text-sm transition-colors ${
                                        answers[item.number] === value
                                            ? 'border-brand bg-brand-soft text-ink'
                                            : 'border-line bg-surface text-ink-muted hover:border-brand-line'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name={`item-${item.number}`}
                                        value={value}
                                        checked={answers[item.number] === value}
                                        onChange={() => {
                                            setAnswers((previous) => ({ ...previous, [item.number]: value }));
                                            setError('');
                                        }}
                                        className="accent-brand"
                                    />
                                    <span><strong>{value}</strong> {label}</span>
                                </label>
                            ))}
                        </div>
                    </fieldset>
                ))}

                {verification && (
                    <fieldset className="space-y-4 rounded-card border border-warning-line bg-warning-soft p-4" disabled={verifying}>
                        <legend className="px-1 text-sm font-semibold text-ink">{credentialText(lang, 'verifyTitle')}</legend>
                        <p className="text-sm text-ink-body">
                            {credentialText(lang, 'verifyIntro', { institute: verification.institutionName || verification.institutionCode || '' })}
                        </p>
                        <div className="grid gap-4 md:grid-cols-2">
                            <label className="block text-xs font-semibold text-ink-muted">
                                {credentialText(lang, 'codeLabel')}
                                <input
                                    value={institutionCode}
                                    autoComplete="off"
                                    onChange={(event) => setInstitutionCode(event.target.value)}
                                    className="mt-1 w-full min-h-control rounded-control border border-line-strong px-4 py-2 text-sm"
                                />
                            </label>
                            <label className="block text-xs font-semibold text-ink-muted">
                                {credentialText(lang, 'password')}
                                <input
                                    type="password"
                                    value={institutionPassword}
                                    autoComplete="off"
                                    onChange={(event) => setInstitutionPassword(event.target.value)}
                                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void verifyInstitution(); } }}
                                    className="mt-1 w-full min-h-control rounded-control border border-line-strong px-4 py-2 text-sm"
                                />
                            </label>
                        </div>
                        <p className="text-xs text-ink-muted">{credentialText(lang, 'verifyNotice')}</p>
                        {verifyError && <p role="alert" className="text-sm font-semibold text-danger-ink">{credentialText(lang, verifyError)}</p>}
                        <Button
                            type="button"
                            disabled={verifying || !institutionCode.trim() || !institutionPassword}
                            onClick={() => void verifyInstitution()}
                            variant="accent"
                        >
                            {credentialText(lang, 'verifyAction')}
                        </Button>
                    </fieldset>
                )}
                {error && (
                    <Callout variant="danger">{error}</Callout>
                )}
                <div className="flex justify-end pt-2">
                    <Button
                        type="submit"
                        disabled={submitting || verification !== null}
                        size="lg"
                    >
                        {submitting ? t('admin.run.submitting') : t('admin.run.submit')}
                    </Button>
                </div>
            </form>
        </div>
    );
}
