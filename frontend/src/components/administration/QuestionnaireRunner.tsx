'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { AdministrationCopy, AdministrationInstrument } from '@/lib/test-administrations';
import { addCompletedProfile } from '@/lib/profile-tracker';
import { ai4authLoginUrl } from '@/lib/auth';

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
        const res = await fetch('/api/user/anonymous-research-code');
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

// Demographic/validation form is not driven by AdministrationCopy, so localize it here per locale.
interface MetaCopy {
    sectionTitle: string;
    anonHint: string;
    researchCodeLabel: string;
    researchCodeHint: string;
    participationContextLabel: string;
    recruitmentSourceLabel: string;
    studyCodeLabel: string;
    studyCodePlaceholder: string;
    ageLabel: string;
    genderLabel: string;
    eduLabel: string;
    eduPlaceholder: string;
    consent: string;
    consentError: string;
    loginRequired: string;
    loginAction: string;
    preferNot: string;
    under18: string;
    female: string;
    male: string;
    other: string;
    contextLesson: string;
    contextLibrary: string;
    contextHome: string;
    contextLab: string;
    contextRemote: string;
    contextEvent: string;
    contextOther: string;
    sourceTeacher: string;
    sourceResearcher: string;
    sourceQr: string;
    sourceClassActivity: string;
    sourceWebsite: string;
    sourcePeer: string;
    sourceOther: string;
}

const META_COPY: Record<'en' | 'es' | 'sv', MetaCopy> = {
    en: {
        sectionTitle: 'Validation data',
        anonHint: 'The app generates an anonymous research code. Do not enter names, surnames, or personal email addresses in the optional fields.',
        researchCodeLabel: 'Anonymous research code',
        researchCodeHint: 'Generated automatically from your authenticated session and reused for later questionnaires.',
        participationContextLabel: 'Where are you completing it?',
        recruitmentSourceLabel: 'How were you invited?',
        studyCodeLabel: 'Study code',
        studyCodePlaceholder: 'Optional code provided by the researcher or teacher',
        ageLabel: 'Age',
        genderLabel: 'Gender',
        eduLabel: 'Educational context',
        eduPlaceholder: 'University, course, degree, or group',
        consent: 'I agree to take part in this validation administration and understand that data will be handled anonymously for research analysis.',
        consentError: 'You must accept the participation conditions before submitting the administration.',
        loginRequired: 'Please sign in before completing the questionnaire, so your anonymous research code and results can be saved in the database.',
        loginAction: 'Sign in',
        preferNot: 'Prefer not to answer',
        under18: 'Under 18',
        female: 'Female',
        male: 'Male',
        other: 'Other',
        contextLesson: 'Lesson / classroom',
        contextLibrary: 'Library / study room',
        contextHome: 'Home',
        contextLab: 'School or university lab',
        contextRemote: 'Online / remote',
        contextEvent: 'Workshop / event',
        contextOther: 'Other context',
        sourceTeacher: 'Teacher invitation',
        sourceResearcher: 'Researcher invitation',
        sourceQr: 'QR code / poster',
        sourceClassActivity: 'Class activity',
        sourceWebsite: 'Website or platform',
        sourcePeer: 'Friend / peer',
        sourceOther: 'Other invitation',
    },
    es: {
        sectionTitle: 'Datos de validacion',
        anonHint: 'La aplicacion genera un codigo anonimo de investigacion. No introduzcas nombres, apellidos ni correos personales en los campos opcionales.',
        researchCodeLabel: 'Codigo anonimo de investigacion',
        researchCodeHint: 'Generado automaticamente a partir de tu sesion autenticada y reutilizado para cuestionarios posteriores.',
        participationContextLabel: 'Donde estas completandolo?',
        recruitmentSourceLabel: 'Como recibiste la invitacion?',
        studyCodeLabel: 'Codigo del estudio',
        studyCodePlaceholder: 'Codigo opcional proporcionado por el investigador o docente',
        ageLabel: 'Edad',
        genderLabel: 'Genero',
        eduLabel: 'Contexto educativo',
        eduPlaceholder: 'Universidad, curso, titulacion o grupo',
        consent: 'Acepto participar en esta administracion de validacion y entiendo que los datos se trataran de forma anonima para analisis de investigacion.',
        consentError: 'Debes aceptar las condiciones de participacion antes de enviar la administracion.',
        loginRequired: 'Inicia sesion antes de completar el cuestionario, para que tu codigo anonimo y los resultados se guarden en la base de datos.',
        loginAction: 'Iniciar sesion',
        preferNot: 'Prefiero no responder',
        under18: 'Menos de 18',
        female: 'Mujer',
        male: 'Hombre',
        other: 'Otro',
        contextLesson: 'Clase / aula',
        contextLibrary: 'Biblioteca / sala de estudio',
        contextHome: 'Casa',
        contextLab: 'Laboratorio escolar o universitario',
        contextRemote: 'En linea / remoto',
        contextEvent: 'Taller / evento',
        contextOther: 'Otro contexto',
        sourceTeacher: 'Invitacion de docente',
        sourceResearcher: 'Invitacion de investigador',
        sourceQr: 'Codigo QR / cartel',
        sourceClassActivity: 'Actividad de clase',
        sourceWebsite: 'Sitio web o plataforma',
        sourcePeer: 'Amigo / companero',
        sourceOther: 'Otra invitacion',
    },
    sv: {
        sectionTitle: 'Valideringsdata',
        anonHint: 'Appen skapar en anonym forskningskod. Ange inte namn, efternamn eller personliga e-postadresser i valfria fält.',
        researchCodeLabel: 'Anonym forskningskod',
        researchCodeHint: 'Skapas automatiskt fran din inloggade session och ateranvands for senare formular.',
        participationContextLabel: 'Var fyller du i formularet?',
        recruitmentSourceLabel: 'Hur blev du inbjuden?',
        studyCodeLabel: 'Studiekod',
        studyCodePlaceholder: 'Valfri kod fran forskare eller larare',
        ageLabel: 'Ålder',
        genderLabel: 'Kön',
        eduLabel: 'Utbildningskontext',
        eduPlaceholder: 'Universitet, kurs, examen eller grupp',
        consent: 'Jag samtycker till att delta i detta valideringsgenomförande och förstår att uppgifterna behandlas anonymt för forskningsanalys.',
        consentError: 'Du måste godkänna villkoren för deltagande innan du skickar in genomförandet.',
        loginRequired: 'Logga in innan du fyller i formularet, sa att din anonyma forskningskod och dina resultat kan sparas i databasen.',
        loginAction: 'Logga in',
        preferNot: 'Vill inte svara',
        under18: 'Under 18',
        female: 'Kvinna',
        male: 'Man',
        other: 'Annat',
        contextLesson: 'Lektion / klassrum',
        contextLibrary: 'Bibliotek / studierum',
        contextHome: 'Hemma',
        contextLab: 'Skol- eller universitetslabb',
        contextRemote: 'Online / distans',
        contextEvent: 'Workshop / evenemang',
        contextOther: 'Annan kontext',
        sourceTeacher: 'Inbjudan fran larare',
        sourceResearcher: 'Inbjudan fran forskare',
        sourceQr: 'QR-kod / affisch',
        sourceClassActivity: 'Klassaktivitet',
        sourceWebsite: 'Webbplats eller plattform',
        sourcePeer: 'Van / studiekamrat',
        sourceOther: 'Annan inbjudan',
    },
};

interface QuestionnaireRunnerProps {
    copy: AdministrationCopy;
    instrument: AdministrationInstrument;
    locale: 'en' | 'es' | 'sv';
}

export function QuestionnaireRunner({ copy, instrument, locale }: QuestionnaireRunnerProps) {
    const searchParams = useSearchParams();
    const [answers, setAnswers] = useState<Record<number, number>>({});
    const [error, setError] = useState('');
    const [results, setResults] = useState<ScoreResult[] | null>(null);
    const [createdSessionId, setCreatedSessionId] = useState<string>('');
    const [startedAt, setStartedAt] = useState(() => Date.now());
    // Testo item: dal backend (DB editabile) se disponibile, altrimenti fallback statico.
    const [backendItems, setBackendItems] = useState<string[] | null>(null);
    const [backendItemsChecked, setBackendItemsChecked] = useState(false);
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
    const scaleMax = copy.scale.length;
    const meta = META_COPY[locale];
    const versionLabel = searchParams.get('version') || `${instrument}_${locale}_2026_v1`;

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

    // Carica gli item dal catalogo DB-driven (le modifiche admin diventano visibili).
    useEffect(() => {
        let cancelled = false;
        setBackendItems(null);
        setBackendItemsChecked(false);
        fetch(`/api/instruments/${instrument}/rules?locale=${locale}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (cancelled || !data?.items) return;
                const ordered = [...data.items]
                    .filter((it: { active: boolean }) => it.active)
                    .sort((a: { item_number: number }, b: { item_number: number }) => a.item_number - b.item_number);
                const texts = ordered.map((it: { text: string | null }) => it.text ?? '');
                if (texts.every((t: string) => t)) setBackendItems(texts);
            })
            .catch(() => { /* fallback statico per EN/SV */ })
            .finally(() => {
                if (!cancelled) setBackendItemsChecked(true);
            });
        return () => { cancelled = true; };
    }, [instrument, locale]);

    const displayItems = backendItems ?? copy.items;
    const answered = Object.keys(answers).length;
    const completion = Math.round((answered / displayItems.length) * 100);
    const scaleLabels = useMemo(() => copy.scale.map((label, index) => ({
        value: index + 1,
        label,
    })), [copy.scale]);

    if (locale === 'es' && !backendItemsChecked) {
        return (
            <div lang={locale} className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
                Caricamento della versione spagnola...
            </div>
        );
    }

    if (locale === 'es' && backendItemsChecked && backendItems === null) {
        return (
            <div lang={locale} className="mx-auto max-w-2xl space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-6 text-amber-950">
                <h1 className="text-xl font-bold">Version espanola no configurada</h1>
                <p className="text-sm leading-relaxed">
                    La somministrazione in spagnolo richiede che tutti gli item siano compilati nel catalogo admin come <code>text_es</code>. Completa prima la versione spagnola in Admin → Questionari & Scale → Item.
                </p>
                <Link href="/somministrazione" className="inline-flex text-sm font-semibold text-amber-900 underline">
                    {copy.back}
                </Link>
            </div>
        );
    }

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (codeRequiresLogin) {
            setError(meta.loginRequired);
            return;
        }
        if (!metadata.consent) {
            setError(meta.consentError);
            return;
        }
        if (answered !== displayItems.length) {
            setError(copy.missingAnswers);
            const firstMissing = displayItems.findIndex((_, index) => !answers[index + 1]);
            document.getElementById(`item-${firstMissing + 1}`)?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
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
            const res = await fetch(`/api/instruments/${instrument}/score`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: newSessionId,
                    locale,
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
                    setError(meta.loginRequired);
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
            setError(copy.missingAnswers);
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
                                        <span>{copy.stanineScore}{result.stanine_is_normed ? '' : ' *'}</span>
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
                                        <span>{copy.rawAverage}: {result.raw_average.toFixed(2)} / {scaleMax}</span>
                                    </div>
                                </div>
                                <p className="text-xs leading-relaxed text-slate-600">{result.interpretation}</p>
                            </article>
                        ))}
                </div>
            </section>
        );

        return (
            <div lang={locale} className="max-w-5xl mx-auto space-y-6">
                <section className="glass-panel p-6 sm:p-8 space-y-5">
                    <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-10 h-10 shrink-0 text-green-600" />
                        <div>
                            <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold tracking-wide text-amber-900">
                                {copy.testBadge}
                            </span>
                            <h1 className="mt-2 text-2xl font-bold text-slate-900">{copy.submittedTitle}</h1>
                        </div>
                    </div>
                    <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 flex gap-3">
                        <AlertTriangle className="w-6 h-6 shrink-0 text-amber-700" />
                        <p className="text-sm leading-relaxed text-amber-950">{copy.submittedBody}</p>
                    </div>
                    <p className="rounded-md bg-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-700">
                        {copy.profileMethod}
                    </p>
                </section>

                {dimensions.map((dim) => (
                    renderResults(dim, copy.dimensionTitles[dim] ?? dim)
                ))}

                <div className="flex flex-col-reverse justify-between gap-3 sm:flex-row">
                    <Link
                        href="/somministrazione"
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-50"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        {copy.back}
                    </Link>
                    <div className="flex gap-2">
                        <Link
                            href={`/?session_id=${createdSessionId}&instrument=${instrument}`}
                            className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 font-semibold text-white transition-colors"
                        >
                            {copy.startChat}
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
                            {copy.restart}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div lang={locale} className="max-w-5xl mx-auto space-y-6">
            <Link href="/somministrazione" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-indigo-700">
                <ArrowLeft className="w-4 h-4" />
                {copy.back}
            </Link>

            <header className="glass-panel p-6 space-y-4">
                <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold tracking-wide text-amber-900">
                    {copy.testBadge}
                </span>
                <h1 className="text-3xl font-bold text-slate-900">{copy.title}</h1>
                <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 flex gap-3">
                    <AlertTriangle className="w-6 h-6 shrink-0 text-amber-700" />
                    <div>
                        <h2 className="font-bold text-amber-950">{copy.warningTitle}</h2>
                        <p className="mt-1 text-sm leading-relaxed text-amber-900">{copy.warningBody}</p>
                    </div>
                </div>
                <p className="text-slate-700 leading-relaxed">{copy.instructions}</p>
                <p className="rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-700">{copy.privacyNote}</p>
            </header>

            <section className="glass-panel p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">
                            {meta.sectionTitle}
                        </h2>
                        <p className="mt-1 text-sm text-slate-600">
                            {meta.anonHint}
                        </p>
                    </div>
                    <span className="rounded-md bg-slate-100 px-3 py-1.5 font-mono text-xs text-slate-600">
                        {versionLabel}
                    </span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                    <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                            {meta.researchCodeLabel}
                        </span>
                        <input
                            readOnly
                            value={anonymousResearchCode || '...'}
                            className="mt-1 w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 font-mono text-sm text-slate-700"
                        />
                        <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                            {meta.researchCodeHint}
                        </span>
                        {codeRequiresLogin && (
                            <a
                                href={loginHref}
                                className="mt-2 inline-flex rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                            >
                                {meta.loginAction}
                            </a>
                        )}
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                            {meta.studyCodeLabel}
                        </span>
                        <input
                            value={metadata.study}
                            onChange={(event) => setMetadata((previous) => ({ ...previous, study: event.target.value }))}
                            placeholder={meta.studyCodePlaceholder}
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                            {meta.participationContextLabel}
                        </span>
                        <select
                            value={metadata.participation_context}
                            onChange={(event) => setMetadata((previous) => ({ ...previous, participation_context: event.target.value }))}
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        >
                            <option value="">{meta.preferNot}</option>
                            <option value="lesson_classroom">{meta.contextLesson}</option>
                            <option value="library_study_room">{meta.contextLibrary}</option>
                            <option value="home">{meta.contextHome}</option>
                            <option value="school_university_lab">{meta.contextLab}</option>
                            <option value="online_remote">{meta.contextRemote}</option>
                            <option value="workshop_event">{meta.contextEvent}</option>
                            <option value="other">{meta.contextOther}</option>
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                            {meta.recruitmentSourceLabel}
                        </span>
                        <select
                            value={metadata.recruitment_source}
                            onChange={(event) => setMetadata((previous) => ({ ...previous, recruitment_source: event.target.value }))}
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        >
                            <option value="">{meta.preferNot}</option>
                            <option value="teacher_invitation">{meta.sourceTeacher}</option>
                            <option value="researcher_invitation">{meta.sourceResearcher}</option>
                            <option value="qr_poster">{meta.sourceQr}</option>
                            <option value="class_activity">{meta.sourceClassActivity}</option>
                            <option value="website_platform">{meta.sourceWebsite}</option>
                            <option value="peer_invitation">{meta.sourcePeer}</option>
                            <option value="other">{meta.sourceOther}</option>
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                            {meta.ageLabel}
                        </span>
                        <select
                            value={metadata.age_range}
                            onChange={(event) => setMetadata((previous) => ({ ...previous, age_range: event.target.value }))}
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        >
                            <option value="">{meta.preferNot}</option>
                            <option value="under_18">{meta.under18}</option>
                            <option value="18_20">18-20</option>
                            <option value="21_24">21-24</option>
                            <option value="25_plus">25+</option>
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                            {meta.genderLabel}
                        </span>
                        <select
                            value={metadata.gender}
                            onChange={(event) => setMetadata((previous) => ({ ...previous, gender: event.target.value }))}
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        >
                            <option value="">{meta.preferNot}</option>
                            <option value="female">{meta.female}</option>
                            <option value="male">{meta.male}</option>
                            <option value="other">{meta.other}</option>
                        </select>
                    </label>
                    <label className="block md:col-span-2">
                        <span className="text-xs font-semibold uppercase text-slate-500">
                            {meta.eduLabel}
                        </span>
                        <input
                            value={metadata.education_context}
                            onChange={(event) => setMetadata((previous) => ({ ...previous, education_context: event.target.value }))}
                            placeholder={meta.eduPlaceholder}
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
                        {meta.consent}
                    </span>
                </label>
            </section>

            <div className="sticky top-16 z-10 rounded-lg border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
                <div className="flex justify-between text-sm font-semibold text-slate-700">
                    <span>{answered}/{displayItems.length} {copy.progress}</span>
                    <span>{completion}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full bg-indigo-600 transition-all" style={{ width: `${completion}%` }} />
                </div>
            </div>

            <form onSubmit={submit} className="space-y-4">
                {displayItems.map((item, index) => {
                    const itemNumber = index + 1;
                    return (
                        <fieldset
                            key={itemNumber}
                            id={`item-${itemNumber}`}
                            className="glass-panel scroll-mt-36 p-4 sm:p-5"
                        >
                            <legend className="sr-only">{itemNumber}. {item}</legend>
                            <p className="text-sm sm:text-base leading-relaxed text-slate-800">
                                <span className="mr-2 font-bold text-indigo-700">{itemNumber}.</span>
                                {item}
                            </p>
                            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                                {scaleLabels.map(({ value, label }) => (
                                    <label
                                        key={value}
                                        className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2.5 text-sm transition-colors ${
                                            answers[itemNumber] === value
                                                ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                                                : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name={`item-${itemNumber}`}
                                            value={value}
                                            checked={answers[itemNumber] === value}
                                            onChange={() => {
                                                setAnswers((previous) => ({ ...previous, [itemNumber]: value }));
                                                setError('');
                                            }}
                                            className="accent-indigo-600"
                                        />
                                        <span><strong>{value}</strong> {label}</span>
                                    </label>
                                ))}
                            </div>
                        </fieldset>
                    );
                })}

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
                        {copy.submit}
                    </button>
                </div>
            </form>
        </div>
    );
}
