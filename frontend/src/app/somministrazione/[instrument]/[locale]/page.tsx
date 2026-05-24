'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { QuestionnaireRunner } from '@/components/administration/QuestionnaireRunner';
import { getTestAdministration } from '@/lib/test-administrations';

export default function AdministrationPage() {
    const params = useParams<{ instrument: string; locale: string }>();
    const copy = getTestAdministration(params.instrument, params.locale);

    if (
        !copy
        || (params.instrument !== 'QSA' && params.instrument !== 'QSAr')
        || (params.locale !== 'en' && params.locale !== 'sv')
    ) {
        return (
            <section className="glass-panel max-w-xl mx-auto rounded-xl p-8 text-center space-y-4">
                <h1 className="text-2xl font-bold text-slate-900">Test administration unavailable</h1>
                <p className="text-slate-600">Choose QSA or QSAr in English or Swedish.</p>
                <Link href="/somministrazione" className="font-semibold text-indigo-700 hover:text-indigo-900">
                    Back to test administrations
                </Link>
            </section>
        );
    }

    return <QuestionnaireRunner copy={copy} instrument={params.instrument} locale={params.locale} />;
}
