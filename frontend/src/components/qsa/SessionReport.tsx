'use client';

import { useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Download, Home } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';

const labels = {
    it: {
        title: 'Il riepilogo del percorso',
        loading: 'Preparazione della sintesi…',
        empty: 'Non ci sono ancora contenuti da riassumere.',
        unavailable: 'La sintesi non è disponibile. Puoi comunque scaricare il report completo.',
        downloaded: 'Report scaricato',
        downloadSuccess: 'Report scaricato con successo. Ritorno alla pagina principale…',
        returnHome: 'Torna alla pagina principale',
        error: 'Il download non è riuscito. Riprova.',
    },
    en: {
        title: 'Your session summary',
        loading: 'Preparing the summary…',
        empty: 'There is nothing to summarize yet.',
        unavailable: 'The summary is unavailable. You can still download the full report.',
        downloaded: 'Report downloaded',
        downloadSuccess: 'Report downloaded successfully. Returning to main page…',
        returnHome: 'Back to main page',
        error: 'Download failed. Please try again.',
    },
    es: {
        title: 'El resumen de tu recorrido',
        loading: 'Preparando el resumen…',
        empty: 'Todavía no hay contenido que resumir.',
        unavailable: 'El resumen no está disponible. Aún puedes descargar el informe completo.',
        downloaded: 'Informe descargado',
        downloadSuccess: 'Informe descargado con éxito. Volviendo a la página principal…',
        returnHome: 'Volver a la página principal',
        error: 'La descarga ha fallado. Reintenta.',
    },
    fr: {
        title: 'Le résumé de votre parcours',
        loading: 'Préparation du résumé…',
        empty: 'Il n’y a pas encore de contenu à résumer.',
        unavailable: 'Le résumé est indisponible. Vous pouvez tout de même télécharger le rapport complet.',
        downloaded: 'Rapport téléchargé',
        downloadSuccess: 'Rapport téléchargé avec succès. Retour à la page principale…',
        returnHome: 'Retour à la page principale',
        error: 'Le téléchargement a échoué. Réessayez.',
    },
    de: {
        title: 'Deine Zusammenfassung',
        loading: 'Zusammenfassung wird erstellt…',
        empty: 'Es gibt noch keinen Inhalt zum Zusammenfassen.',
        unavailable: 'Die Zusammenfassung ist nicht verfügbar. Du kannst dennoch den vollständigen Bericht herunterladen.',
        downloaded: 'Bericht heruntergeladen',
        downloadSuccess: 'Bericht erfolgreich heruntergeladen. Zurück zur Hauptseite…',
        returnHome: 'Zurück zur Hauptseite',
        error: 'Download fehlgeschlagen. Versuche es erneut.',
    },
    sv: {
        title: 'Sammanfattning av din session',
        loading: 'Förbereder sammanfattningen…',
        empty: 'Det finns inget att sammanfatta än.',
        unavailable: 'Sammanfattningen är inte tillgänglig. Du kan fortfarande ladda ner hela rapporten.',
        downloaded: 'Rapporten nedladdad',
        downloadSuccess: 'Rapporten har laddats ner. Återgår till startsidan…',
        returnHome: 'Tillbaka till startsidan',
        error: 'Nedladdningen misslyckades. Försök igen.',
    },
};

export function SessionReport({
    sessionId,
    questionnaireType,
    onReturnHome,
}: {
    sessionId: string;
    questionnaireType: string;
    onReturnHome?: () => void;
}) {
    const { lang, t } = useI18n();
    const copy = labels[lang] || labels.it;
    const [summary, setSummary] = useState<{ summary: string | null; status: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState(false);
    const [downloaded, setDownloaded] = useState(false);
    const [error, setError] = useState(false);

    const loadSummary = useCallback(async (signal: AbortSignal) => {
        setLoading(true);
        try {
            const response = await apiFetch(`/api/user/questionnaire-result/${encodeURIComponent(sessionId)}/summary?lang=${lang}`, { signal });
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

    const download = async () => {
        setDownloading(true);
        setError(false);
        try {
            const response = await apiFetch(`/api/questionnaire-result/${encodeURIComponent(sessionId)}/pdf?lang=${lang}&mode=full`);
            if (!response.ok) throw new Error('download failed');
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `counselorbot_${questionnaireType}_${sessionId.slice(0, 8)}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setDownloaded(true);
            if (onReturnHome) {
                setTimeout(() => {
                    onReturnHome();
                }, 1200);
            }
        } catch {
            setError(true);
        } finally {
            setDownloading(false);
        }
    };

    return (
        <section className="space-y-4 text-left" aria-label={copy.title}>
            <h3 className="text-lg font-semibold text-slate-800">{copy.title}</h3>

            {loading ? (
                <p role="status" className="text-sm text-slate-600">{copy.loading}</p>
            ) : summary?.status === 'unavailable' ? (
                <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{copy.unavailable}</p>
            ) : summary?.summary ? (
                <div className="prose prose-sm max-w-none rounded-lg border border-slate-200 bg-slate-50 p-4 max-h-72 overflow-y-auto">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary.summary}</ReactMarkdown>
                </div>
            ) : (
                <p className="text-sm text-slate-600">{copy.empty}</p>
            )}

            <div className="space-y-3 pt-2">
                <Button
                    size="lg"
                    className="w-full inline-flex items-center justify-center gap-2"
                    disabled={downloading}
                    onClick={() => void download()}
                >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    {downloaded ? copy.downloaded : (downloading ? t('completed.pdfPreparing') : t('completed.downloadPdf'))}
                </Button>

                {onReturnHome && (
                    <Button
                        variant="secondary"
                        size="lg"
                        className="w-full inline-flex items-center justify-center gap-2"
                        disabled={downloading}
                        onClick={onReturnHome}
                    >
                        <Home className="h-4 w-4" aria-hidden="true" />
                        {copy.returnHome}
                    </Button>
                )}
            </div>

            {downloaded && (
                <p role="status" className="text-sm font-medium text-teal-700 text-center">{copy.downloadSuccess}</p>
            )}

            {error && (
                <p role="alert" className="text-sm text-red-800 text-center">{copy.error}</p>
            )}
        </section>
    );
}
