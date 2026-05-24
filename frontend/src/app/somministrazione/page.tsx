import Link from 'next/link';
import { AlertTriangle, ArrowRight, Languages } from 'lucide-react';

const instruments = [
    {
        id: 'QSA',
        titleEn: 'Learning Strategies Questionnaire',
        titleSv: 'Frågeformulär om inlärningsstrategier',
        itemCount: 100,
    },
    {
        id: 'QSAr',
        titleEn: 'Learning Strategies Questionnaire - Short Form',
        titleSv: 'Frågeformulär om inlärningsstrategier - kortversion',
        itemCount: 46,
    },
] as const;

export default function TestAdministrationsPage() {
    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <header className="glass-panel rounded-xl p-6 sm:p-8 space-y-3">
                <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                    <Languages className="w-4 h-4" />
                    Test administrations / Testgenomföranden
                </div>
                <h1 className="text-3xl font-bold text-slate-900">QSA and QSAr - English / Svenska</h1>
                <p className="text-slate-600">
                    Select an instrument and a language to test its questionnaire administration interface.
                </p>
            </header>

            <section className="rounded-xl border-2 border-amber-300 bg-amber-50 p-5 flex gap-3">
                <AlertTriangle className="w-6 h-6 shrink-0 text-amber-700" />
                <div className="space-y-2 text-sm leading-relaxed text-amber-950">
                    <p><strong>Important:</strong> these administrations are provided only for testing the English and Swedish adaptations. The profile produced after submission is an experimental raw-frequency preview, not a validated or normative result.</p>
                    <p><strong>Viktigt:</strong> dessa genomföranden tillhandahålls endast för att testa de engelska och svenska anpassningarna. Profilen som visas efter inskickning är en experimentell förhandsvisning av råa frekvenser, inte ett validerat eller normativt resultat.</p>
                </div>
            </section>

            <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-600">
                The candidate wording shown here was prepared from the available Italian source PDFs for interface testing. Wording and the provisional reduced-form factor mapping require scientific and linguistic review before any pilot or validation collection.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
                {instruments.map((instrument) => (
                    <section key={instrument.id} className="glass-panel rounded-xl p-5 space-y-4">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">{instrument.id}</h2>
                            <p className="mt-1 text-sm text-slate-700">{instrument.titleEn}</p>
                            <p className="text-sm text-slate-500">{instrument.titleSv}</p>
                            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {instrument.itemCount} items
                            </p>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Link
                                href={`/somministrazione/${instrument.id}/en`}
                                className="inline-flex items-center justify-between rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                            >
                                English test version
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                            <Link
                                href={`/somministrazione/${instrument.id}/sv`}
                                className="inline-flex items-center justify-between rounded-md border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-800 hover:bg-indigo-100"
                            >
                                Svensk testversion
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                        </div>
                    </section>
                ))}
            </div>

            <Link href="/" className="inline-flex text-sm font-semibold text-indigo-700 hover:text-indigo-900">
                Back to CounselorBot / Tillbaka
            </Link>
        </div>
    );
}
