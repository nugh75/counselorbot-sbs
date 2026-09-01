'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { BackButton } from '@/components/ui/BackButton';
import { useI18n } from '@/lib/i18n-context';
import {
    fetchRules,
    type InstrumentRules,
    type RulesUnavailable,
} from '@/lib/instruments-api';
import { addCompletedProfile } from '@/lib/profile-tracker';
import { apiFetch, ai4authLoginUrl } from '@/lib/auth';
import { AGE_BANDS } from '@/lib/age-bands';

const QUESTIONNAIRE_SELECTION_HREF = '/?view=questionnaires';

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
    const [loginHref, setLoginHref] = useState('/login');
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
        setLoginHref(ai4authLoginUrl(`${window.location.pathname}${window.location.search}`));
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
    useEffect(() => {
        let cancelled = false;
        setRules(null);
        setUnavailable(null);
        setLoadFailed(false);
        fetchRules(instrument, lang)
            .then((result) => {
                if (cancelled) return;
                if ('unavailable' in result) setUnavailable(result);
                else setRules(result);
            })
            .catch(() => { if (!cancelled) setLoadFailed(true); });
        return () => { cancelled = true; };
    }, [instrument, lang]);

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
            <section className="glass-panel max-w-xl mx-auto p-8 text-center space-y-4">
                <h1 className="text-2xl font-bold text-slate-900">{t('admin.run.unavailable.title')}</h1>
                <p className="text-slate-600">{t('admin.run.unavailable.body')}</p>
                {unavailable.availableLocales.length > 0 && (
                    <p className="text-sm text-slate-500">
                        {t('admin.run.unavailable.languages').replace(
                            '{langs}',
                            unavailable.availableLocales.join(', '),
                        )}
                    </p>
                )}
                <BackButton href={QUESTIONNAIRE_SELECTION_HREF} label={t('admin.run.back')} />
            </section>
        );
    }

    if (loadFailed) {
        return (
            <section className="glass-panel max-w-xl mx-auto p-8 text-center space-y-4">
                <p className="text-slate-600">{t('admin.run.loadError')}</p>
                <BackButton href={QUESTIONNAIRE_SELECTION_HREF} label={t('admin.run.back')} />
            </section>
        );
    }

    if (!rules) {
        return (
            <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
                {t('admin.run.loading')}
            </div>
        );
    }

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
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
                body: JSON.stringify({
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
                }),
            });
            if (!res.ok) {
                if (res.status === 401) {
                    setCodeRequiresLogin(true);
                    setError(t('admin.run.meta.loginRequired'));
                    return;
                }
                throw new Error(`score failed: ${res.status}`);
            }
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
        }
    };

    if (results) {
        const dimensions = [...new Set(results.map((r) => r.dimension))];
        const renderResults = (dimension: string, title: string) => (
            <section className="space-y-3">
                <h2 className="text-xl font-bold text-slate-900">{title}</h2>
                <div className="grid gap-3 md:grid-cols-2">
                    {results
                        .filter((result) => result.dimension === dimension)
                        .map((result) => (
                            <article key={result.code} className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-bold tracking-wide text-indigo-700">{result.code}</p>
                                        <h3 className="text-sm font-semibold text-slate-900">{result.label}</h3>
                                    </div>
                                    <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${
                                        result.orientation === 'difficulty' && result.band === 'higher'
                                            ? 'bg-amber-100 text-amber-900'
                                            : 'bg-indigo-50 text-indigo-800'
                                    }`}>
                                        {result.band_label}
                                    </span>
                                </div>
                                <div>
                                    <div className="mb-1 flex justify-between text-xs font-semibold text-slate-700">
                                        <span>{t('admin.run.stanineScore')}{result.stanine_is_normed ? '' : ' *'}</span>
                                        <span className="font-bold text-indigo-700">{result.stanine ?? '—'} / 9</span>
                                    </div>
                                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                                        <div
                                            className={`h-full rounded-full ${
                                                result.orientation === 'difficulty' ? 'bg-amber-500' : 'bg-indigo-600'
                                            }`}
                                            style={{ width: `${(((result.stanine ?? 1) - 1) / 8) * 100}%` }}
                                        />
                                    </div>
                                    <div className="mt-1.5 flex justify-between text-[10px] text-slate-400">
                                        <span>{t('admin.run.rawAverage')}: {result.raw_average.toFixed(2)} / {scaleMax}</span>
                                    </div>
                                </div>
                                <p className="text-xs leading-relaxed text-slate-600">{result.interpretation}</p>
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
                <section className="glass-panel p-6 sm:p-8 space-y-5">
                    <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-10 h-10 shrink-0 text-green-600" />
                        <div>
                            <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold tracking-wide text-amber-900">
                                {t('admin.run.testBadge')}
                            </span>
                            <h1 className="mt-2 text-2xl font-bold text-slate-900">{t('admin.run.submittedTitle')}</h1>
                        </div>
                    </div>
                    <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 flex gap-3">
                        <AlertTriangle className="w-6 h-6 shrink-0 text-amber-700" />
                        <p className="text-sm leading-relaxed text-amber-950">{t('admin.run.submittedBody')}</p>
                    </div>
                    <p className="rounded-md bg-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-700">
                        {t('admin.run.profileMethod')}
                    </p>
                </section>

                {dimensions.map((dim) => (
                    <div key={dim}>{renderResults(dim, dimensionTitle(dim))}</div>
                ))}

                <div className="flex flex-col-reverse justify-between gap-3 sm:flex-row sm:items-center">
                    <BackButton href={QUESTIONNAIRE_SELECTION_HREF} label={t('admin.run.back')} />
                    <div className="flex gap-2">
                        <Link
                            href={`/?session_id=${createdSessionId}&instrument=${instrument}`}
                            className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 font-semibold text-white transition-colors"
                        >
                            {t('admin.run.startChat')}
                        </Link>
                        <button
                            type="button"
                            onClick={() => {
                                setAnswers({});
                                setResults(null);
                                setStartedAt(Date.now());
                                setMetadata((previous) => ({ ...previous, consent: false }));
                            }}
                            className="rounded-md bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-700"
                        >
                            {t('admin.run.restart')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <BackButton href={QUESTIONNAIRE_SELECTION_HREF} label={t('admin.run.back')} />

            <header className="glass-panel p-6 space-y-4">
                <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold tracking-wide text-amber-900">
                    {t('admin.run.testBadge')}
                </span>
                <h1 className="text-2xl font-bold text-slate-900">
                    {rules.instrument.name} ({rules.instrument.code})
                </h1>
                <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 flex gap-3">
                    <AlertTriangle className="w-6 h-6 shrink-0 text-amber-700" />
                    <div>
                        <h2 className="font-bold text-amber-950">{t('admin.run.warningTitle')}</h2>
                        <p className="mt-1 text-sm leading-relaxed text-amber-900">{t('admin.run.warningBody')}</p>
                    </div>
                </div>
                <p className="text-slate-700 leading-relaxed">{t('admin.run.instructions')}</p>
                <p className="rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-700">{t('admin.run.privacyNote')}</p>
            </header>

            <section className="glass-panel p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">
                            {t('admin.run.meta.sectionTitle')}
                        </h2>
                        <p className="mt-1 text-sm text-slate-600">
                            {t('admin.run.meta.anonHint')}
                        </p>
                    </div>
                    <span className="rounded-md bg-slate-100 px-3 py-1.5 font-mono text-xs text-slate-600">
                        {versionLabel}
                    </span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                    <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                            {t('admin.run.meta.researchCodeLabel')}
                        </span>
                        <input
                            readOnly
                            value={anonymousResearchCode || '...'}
                            className="mt-1 w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 font-mono text-sm text-slate-700"
                        />
                        <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                            {t('admin.run.meta.researchCodeHint')}
                        </span>
                        {codeRequiresLogin && (
                            <a
                                href={loginHref}
                                className="mt-2 inline-flex rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                            >
                                {t('admin.run.meta.loginAction')}
                            </a>
                        )}
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                            {t('admin.run.meta.studyCodeLabel')}
                        </span>
                        <input
                            value={metadata.study}
                            onChange={(event) => setMetadata((previous) => ({ ...previous, study: event.target.value }))}
                            placeholder={t('admin.run.meta.studyCodePlaceholder')}
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                            {t('admin.run.meta.participationContextLabel')}
                        </span>
                        <select
                            value={metadata.participation_context}
                            onChange={(event) => setMetadata((previous) => ({ ...previous, participation_context: event.target.value }))}
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
                        <span className="text-xs font-semibold uppercase text-slate-500">
                            {t('admin.run.meta.recruitmentSourceLabel')}
                        </span>
                        <select
                            value={metadata.recruitment_source}
                            onChange={(event) => setMetadata((previous) => ({ ...previous, recruitment_source: event.target.value }))}
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
                        <span className="text-xs font-semibold uppercase text-slate-500">
                            {t('admin.run.meta.ageLabel')}
                        </span>
                        <select
                            value={metadata.age_range}
                            onChange={(event) => setMetadata((previous) => ({ ...previous, age_range: event.target.value }))}
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
                        <span className="text-xs font-semibold uppercase text-slate-500">
                            {t('admin.run.meta.genderLabel')}
                        </span>
                        <select
                            value={metadata.gender}
                            onChange={(event) => setMetadata((previous) => ({ ...previous, gender: event.target.value }))}
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        >
                            <option value="">{t('admin.run.meta.preferNot')}</option>
                            <option value="female">{t('admin.run.meta.female')}</option>
                            <option value="male">{t('admin.run.meta.male')}</option>
                            <option value="other">{t('admin.run.meta.other')}</option>
                        </select>
                    </label>
                    <label className="block md:col-span-2">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                            {t('admin.run.meta.eduLabel')}
                        </span>
                        <input
                            value={metadata.education_context}
                            onChange={(event) => setMetadata((previous) => ({ ...previous, education_context: event.target.value }))}
                            placeholder={t('admin.run.meta.eduPlaceholder')}
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                    </label>
                </div>
                <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700">
                    <input
                        type="checkbox"
                        checked={metadata.consent}
                        onChange={(event) => {
                            setMetadata((previous) => ({ ...previous, consent: event.target.checked }));
                            setError('');
                        }}
                        className="mt-1 accent-indigo-600"
                    />
                    <span>
                        {t('admin.run.meta.consent')}
                    </span>
                </label>
            </section>

            <div className="sticky top-16 z-10 rounded-lg border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
                <div className="flex justify-between text-sm font-semibold text-slate-700">
                    <span>{answered}/{displayItems.length} {t('admin.run.progress')}</span>
                    <span>{completion}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full bg-indigo-600 transition-all" style={{ width: `${completion}%` }} />
                </div>
            </div>

            <form onSubmit={submit} className="space-y-4">
                {displayItems.map((item) => (
                    <fieldset
                        key={item.number}
                        id={`item-${item.number}`}
                        className="glass-panel scroll-mt-36 p-4 sm:p-5"
                    >
                        <legend className="sr-only">{item.number}. {item.text}</legend>
                        <p className="text-sm sm:text-base leading-relaxed text-slate-800">
                            <span className="mr-2 font-bold text-indigo-700">{item.number}.</span>
                            {item.text}
                        </p>
                        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                            {scaleLabels.map(({ value, label }) => (
                                <label
                                    key={value}
                                    className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2.5 text-sm transition-colors ${
                                        answers[item.number] === value
                                            ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                                            : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'
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
                                        className="accent-indigo-600"
                                    />
                                    <span><strong>{value}</strong> {label}</span>
                                </label>
                            ))}
                        </div>
                    </fieldset>
                ))}

                {error && (
                    <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
                        {error}
                    </p>
                )}
                <div className="flex justify-end pt-2">
                    <button
                        type="submit"
                        className="rounded-md bg-indigo-600 px-7 py-3 font-semibold text-white hover:bg-indigo-700 transition-colors"
                    >
                        {t('admin.run.submit')}
                    </button>
                </div>
            </form>
        </div>
    );
}
