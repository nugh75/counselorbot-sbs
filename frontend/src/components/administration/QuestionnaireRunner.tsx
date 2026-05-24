'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { AdministrationCopy, AdministrationInstrument } from '@/lib/test-administrations';
import { calculateExperimentalProfile, ExperimentalProfileResult, ProfileDimension } from '@/lib/test-scoring';

interface QuestionnaireRunnerProps {
    copy: AdministrationCopy;
    instrument: AdministrationInstrument;
    locale: 'en' | 'sv';
}

export function QuestionnaireRunner({ copy, instrument, locale }: QuestionnaireRunnerProps) {
    const [answers, setAnswers] = useState<Record<number, number>>({});
    const [error, setError] = useState('');
    const [results, setResults] = useState<ExperimentalProfileResult[] | null>(null);
    const answered = Object.keys(answers).length;
    const completion = Math.round((answered / copy.items.length) * 100);
    const scaleLabels = useMemo(() => copy.scale.map((label, index) => ({
        value: index + 1,
        label,
    })), [copy.scale]);

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (answered !== copy.items.length) {
            setError(copy.missingAnswers);
            const firstMissing = copy.items.findIndex((_, index) => !answers[index + 1]);
            document.getElementById(`item-${firstMissing + 1}`)?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
            return;
        }
        setError('');
        setResults(calculateExperimentalProfile(instrument, locale, answers));
    };

    if (results) {
        const renderResults = (dimension: ProfileDimension, title: string) => (
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
                                        {result.bandLabel}
                                    </span>
                                </div>
                                <div>
                                    <div className="mb-1 flex justify-between text-xs text-slate-600">
                                        <span>{copy.rawAverage}</span>
                                        <span className="font-semibold">{result.average.toFixed(2)} / 4</span>
                                    </div>
                                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                                        <div
                                            className={`h-full rounded-full ${
                                                result.orientation === 'difficulty' ? 'bg-amber-500' : 'bg-indigo-600'
                                            }`}
                                            style={{ width: `${result.percentage}%` }}
                                        />
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
                <section className="glass-panel rounded-xl p-6 sm:p-8 space-y-5">
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

                {renderResults('cognitive', copy.cognitiveTitle)}
                {renderResults('affective', copy.affectiveTitle)}

                <div className="flex flex-col-reverse justify-between gap-3 sm:flex-row">
                    <Link
                        href="/somministrazione"
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-50"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        {copy.back}
                    </Link>
                    <button
                        type="button"
                        onClick={() => {
                            setAnswers({});
                            setResults(null);
                        }}
                        className="rounded-md bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-700"
                    >
                        {copy.restart}
                    </button>
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

            <header className="glass-panel rounded-xl p-6 space-y-4">
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

            <div className="sticky top-16 z-10 rounded-lg border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
                <div className="flex justify-between text-sm font-semibold text-slate-700">
                    <span>{answered}/{copy.items.length} {copy.progress}</span>
                    <span>{completion}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full bg-indigo-600 transition-all" style={{ width: `${completion}%` }} />
                </div>
            </div>

            <form onSubmit={submit} className="space-y-4">
                {copy.items.map((item, index) => {
                    const itemNumber = index + 1;
                    return (
                        <fieldset
                            key={itemNumber}
                            id={`item-${itemNumber}`}
                            className="glass-panel scroll-mt-36 rounded-lg p-4 sm:p-5"
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
