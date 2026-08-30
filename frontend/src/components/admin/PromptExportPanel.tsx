'use client';

// Esporta in Markdown i prompt degli strumenti guidati: un file per singolo
// strumento (nome + meta + prompt + domande suggerite) oppure tutti insieme.

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { Download, FileText } from 'lucide-react';
import { toast } from '@/components/ui/Toast';
import { useI18n } from '@/lib/i18n-context';

// Ordine di presentazione degli strumenti (gli altri seguono in coda).
const INSTRUMENT_ORDER = ['QSA', 'QSAr', 'ZTPI', 'SAVICKAS', 'QPCS', 'QPCC', 'QAP', 'IDEA'];

interface GuidedStep {
    questionnaire_type: string;
}

const TEXTS = {
    it: { title: 'Esporta prompt', subtitle: 'Scarica i prompt degli strumenti in Markdown, un file per strumento. Per ogni step: nome, metadati (id, tipo di system prompt, tema), prompt e domande suggerite.', perTool: 'Per strumento', empty: 'Nessuno strumento disponibile.', error: 'Esportazione non riuscita', preparing: 'Preparazione…', all: 'Scarica tutti (un unico .md)' },
    en: { title: 'Export prompts', subtitle: 'Download instrument prompts as Markdown, one file per instrument. Each step includes its name, metadata (ID, system prompt type, topic), prompt, and suggested questions.', perTool: 'By instrument', empty: 'No instruments available.', error: 'Export failed', preparing: 'Preparing…', all: 'Download all (one .md file)' },
    es: { title: 'Exportar prompts', subtitle: 'Descarga los prompts de los instrumentos en Markdown, un archivo por instrumento. Cada paso incluye nombre, metadatos (ID, tipo de prompt del sistema, tema), prompt y preguntas sugeridas.', perTool: 'Por instrumento', empty: 'No hay instrumentos disponibles.', error: 'La exportación ha fallado', preparing: 'Preparando…', all: 'Descargar todos (un único archivo .md)' },
    fr: { title: 'Exporter les prompts', subtitle: 'Téléchargez les prompts des instruments au format Markdown, un fichier par instrument. Chaque étape comprend le nom, les métadonnées (ID, type de prompt système, thème), le prompt et les questions suggérées.', perTool: 'Par instrument', empty: 'Aucun instrument disponible.', error: 'Échec de l’exportation', preparing: 'Préparation…', all: 'Tout télécharger (un seul fichier .md)' },
    de: { title: 'Prompts exportieren', subtitle: 'Laden Sie die Instrument-Prompts als Markdown herunter, eine Datei pro Instrument. Jeder Schritt enthält Name, Metadaten (ID, System-Prompt-Typ, Thema), Prompt und vorgeschlagene Fragen.', perTool: 'Nach Instrument', empty: 'Keine Instrumente verfügbar.', error: 'Export fehlgeschlagen', preparing: 'Wird vorbereitet…', all: 'Alle herunterladen (eine .md-Datei)' },
    sv: { title: 'Exportera promptar', subtitle: 'Ladda ner instrumentens promptar som Markdown, en fil per instrument. Varje steg innehåller namn, metadata (ID, typ av systemprompt, ämne), prompt och föreslagna frågor.', perTool: 'Per instrument', empty: 'Inga instrument tillgängliga.', error: 'Exporten misslyckades', preparing: 'Förbereder…', all: 'Ladda ner alla (en .md-fil)' },
};

export function PromptExportPanel() {
    const { lang } = useI18n();
    const texts = TEXTS[lang as keyof typeof TEXTS] ?? TEXTS.en;
    const [instruments, setInstruments] = useState<string[]>([]);
    const [loading, setLoading] = useState<string | null>(null);

    useEffect(() => {
        void (async () => {
            try {
                const res = await apiFetch('/api/admin/guided-steps');
                if (!res.ok) return;
                const steps: GuidedStep[] = await res.json();
                const distinct = Array.from(new Set(steps.map((s) => s.questionnaire_type)));
                distinct.sort((a, b) => {
                    const ia = INSTRUMENT_ORDER.indexOf(a);
                    const ib = INSTRUMENT_ORDER.indexOf(b);
                    if (ia !== -1 && ib !== -1) return ia - ib;
                    if (ia !== -1) return -1;
                    if (ib !== -1) return 1;
                    return a.localeCompare(b);
                });
                setInstruments(distinct);
            } catch (e) {
                console.error('Failed to load instruments', e);
            }
        })();
    }, []);

    const download = useCallback(async (instrument?: string) => {
        const key = instrument ?? '__all__';
        setLoading(key);
        try {
            const url = instrument
                ? `/api/admin/guided-steps/export?instrument=${encodeURIComponent(instrument)}`
                : '/api/admin/guided-steps/export';
            const res = await apiFetch(url);
            if (!res.ok) throw new Error('export failed');
            const blob = await res.blob();
            const date = new Date().toISOString().slice(0, 10);
            const objectUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = `counselorbot_prompts${instrument ? `_${instrument}` : ''}_${date}.md`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(objectUrl);
        } catch (e) {
            console.error('Failed to export prompts', e);
            toast.error(texts.error);
        } finally {
            setLoading(null);
        }
    }, [texts.error]);

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-lg font-bold text-slate-800">{texts.title}</h2>
                <p className="mt-1 text-sm text-slate-500">{texts.subtitle}</p>
            </div>

            <div className="glass-panel p-6 space-y-5">
                <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{texts.perTool}</h3>
                    {instruments.length === 0 ? (
                        <p className="mt-2 text-sm text-slate-400">{texts.empty}</p>
                    ) : (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {instruments.map((instrument) => (
                                <button
                                    key={instrument}
                                    type="button"
                                    onClick={() => void download(instrument)}
                                    disabled={loading !== null}
                                    className="inline-flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50"
                                >
                                    <span className="flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-indigo-600" />
                                        {instrument}
                                    </span>
                                    <Download className="h-4 w-4 text-slate-400" />
                                    {loading === instrument && <span className="sr-only">…</span>}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="border-t border-slate-100 pt-4">
                    <button
                        type="button"
                        onClick={() => void download()}
                        disabled={loading !== null}
                        className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
                    >
                        <Download className="h-4 w-4" />
                        {loading === '__all__' ? texts.preparing : texts.all}
                    </button>
                </div>
            </div>
        </div>
    );
}
