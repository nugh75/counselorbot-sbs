'use client';

import { useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';

const labels = {
    it: { title: 'Il riepilogo del percorso', refresh: 'Rigenera la sintesi', brief: 'Riepilogo breve', full: 'Documento completo', briefHelp: 'Sintesi, consigli e diagrammi.', fullHelp: 'Include anche risultati dettagliati e conversazione.', unavailable: 'La sintesi non è disponibile. Puoi riprovare o scaricare il documento completo.', empty: 'Non ci sono ancora contenuti da riassumere.', error: 'Il download non è riuscito. Riprova.', loading: 'Preparazione della sintesi…', format: 'Contenuto del PDF' },
    en: { title: 'Your session summary', refresh: 'Regenerate summary', brief: 'Brief report', full: 'Full document', briefHelp: 'Summary, recommendations and diagrams.', fullHelp: 'Also includes detailed results and conversation.', unavailable: 'The summary is unavailable. Try again or download the full document.', empty: 'There is nothing to summarize yet.', error: 'Download failed. Please try again.', loading: 'Preparing the summary…', format: 'PDF content' },
    es: { title: 'El resumen de tu recorrido', refresh: 'Regenerar resumen', brief: 'Informe breve', full: 'Documento completo', briefHelp: 'Resumen, recomendaciones y diagramas.', fullHelp: 'Incluye también resultados detallados y conversación.', unavailable: 'El resumen no está disponible. Reintenta o descarga el documento completo.', empty: 'Todavía no hay contenido que resumir.', error: 'La descarga ha fallado. Reintenta.', loading: 'Preparando el resumen…', format: 'Contenido del PDF' },
    fr: { title: 'Le résumé de votre parcours', refresh: 'Régénérer le résumé', brief: 'Rapport bref', full: 'Document complet', briefHelp: 'Résumé, recommandations et diagrammes.', fullHelp: 'Inclut aussi les résultats détaillés et la conversation.', unavailable: 'Le résumé est indisponible. Réessayez ou téléchargez le document complet.', empty: 'Il n’y a pas encore de contenu à résumer.', error: 'Le téléchargement a échoué. Réessayez.', loading: 'Préparation du résumé…', format: 'Contenu du PDF' },
    de: { title: 'Deine Zusammenfassung', refresh: 'Zusammenfassung neu erstellen', brief: 'Kurzbericht', full: 'Vollständiges Dokument', briefHelp: 'Zusammenfassung, Empfehlungen und Diagramme.', fullHelp: 'Enthält auch ausführliche Ergebnisse und das Gespräch.', unavailable: 'Die Zusammenfassung ist nicht verfügbar. Versuche es erneut oder lade das vollständige Dokument herunter.', empty: 'Es gibt noch keinen Inhalt zum Zusammenfassen.', error: 'Download fehlgeschlagen. Versuche es erneut.', loading: 'Zusammenfassung wird erstellt…', format: 'PDF-Inhalt' },
    sv: { title: 'Sammanfattning av din session', refresh: 'Skapa sammanfattningen igen', brief: 'Kort rapport', full: 'Fullständigt dokument', briefHelp: 'Sammanfattning, rekommendationer och diagram.', fullHelp: 'Innehåller även detaljerade resultat och samtalet.', unavailable: 'Sammanfattningen är inte tillgänglig. Försök igen eller ladda ner hela dokumentet.', empty: 'Det finns inget att sammanfatta än.', error: 'Nedladdningen misslyckades. Försök igen.', loading: 'Förbereder sammanfattningen…', format: 'PDF-innehåll' },
};

export function SessionReport({ sessionId, questionnaireType }: { sessionId: string; questionnaireType: string }) {
    const { lang, t } = useI18n();
    const copy = labels[lang];
    const [summary, setSummary] = useState<{ summary: string | null; status: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [mode, setMode] = useState<'brief' | 'full'>('full');
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState(false);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);

    const loadSummary = useCallback(async (signal: AbortSignal, regenerate = false) => {
        setLoading(true);
        try {
            const response = await apiFetch(`/api/user/questionnaire-result/${encodeURIComponent(sessionId)}/summary?lang=${lang}${regenerate ? '&regenerate=true' : ''}`, { signal });
            if (!response.ok) throw new Error('summary failed');
            const value = await response.json();
            if (!signal.aborted) setSummary(value);
        } catch {
            if (!signal.aborted) setSummary({ summary: null, status: 'unavailable' });
        } finally {
            if (!signal.aborted) setLoading(false);
        }
    }, [sessionId, lang]);

    useEffect(() => {
        const controller = new AbortController();
        void loadSummary(controller.signal);
        return () => controller.abort();
    }, [loadSummary]);
    useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

    const download = async () => {
        setDownloading(true);
        setError(false);
        try {
            const response = await apiFetch(`/api/questionnaire-result/${encodeURIComponent(sessionId)}/pdf?lang=${lang}&mode=${mode}`);
            if (!response.ok) throw new Error('download failed');
            if (response.headers.get('X-Summary-Status') === 'unavailable') setSummary({ summary: null, status: 'unavailable' });
            const url = URL.createObjectURL(await response.blob());
            const link = document.createElement('a');
            link.href = url;
            link.download = `counselorbot_${questionnaireType}_${sessionId.slice(0, 8)}_${mode}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setPdfUrl(url);
        } catch {
            setError(true);
        } finally {
            setDownloading(false);
        }
    };

    return <section className="space-y-4 text-left" aria-label={copy.title}>
        <h3 className="text-lg font-semibold text-slate-800">{copy.title}</h3>
        {loading ? <p role="status" className="text-sm text-slate-600">{copy.loading}</p> : summary?.status === 'unavailable' ? (
            <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{copy.unavailable}</p>
        ) : summary?.summary ? (
            <div className="prose prose-sm max-w-none rounded-lg border border-slate-200 bg-slate-50 p-4">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary.summary}</ReactMarkdown>
            </div>
        ) : <p className="text-sm text-slate-600">{copy.empty}</p>}
        <Button variant="secondary" disabled={loading || downloading} onClick={() => void loadSummary(new AbortController().signal, true)}>{copy.refresh}</Button>
        <fieldset className="space-y-2" disabled={loading || downloading}>
            <legend className="mb-2 text-sm font-semibold text-slate-700">{copy.format}</legend>
            {(['brief', 'full'] as const).map(value => <label key={value} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3">
                <input type="radio" name="report-mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="mt-1 accent-indigo-600" />
                <span><span className="block text-sm font-medium text-slate-800">{copy[value]}</span><span className="text-xs text-slate-600">{copy[value === 'brief' ? 'briefHelp' : 'fullHelp']}</span></span>
            </label>)}
        </fieldset>
        <Button size="lg" className="w-full" disabled={loading || downloading} onClick={() => void download()}>{t('completed.downloadPdf')}</Button>
        {downloading && <p role="status" className="text-sm text-slate-600">{t('completed.pdfPreparing')}</p>}
        {error && <p role="alert" className="text-sm text-red-800">{copy.error}</p>}
        {pdfUrl && <iframe src={pdfUrl} title={t('completed.pdfPreview')} className="h-[75vh] w-full rounded-xl border border-slate-200 bg-white" />}
    </section>;
}
