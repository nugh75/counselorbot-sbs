'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { Send } from 'lucide-react';

interface LinkStatus {
    linked: boolean;
    telegram_username: string | null;
    linked_at: string | null;
}

// Local copy is complete for every supported interface language.
const TEXTS = {
    it: {
        title: 'Telegram',
        subtitle: 'Collega Telegram per usare CounselorBot anche dal bot.',
        linked: 'Telegram collegato',
        notLinked: 'Telegram non collegato',
        generate: 'Genera codice',
        codeHint: 'Invia questo codice al bot entro 10 minuti con:',
        unlink: 'Scollega Telegram',
        error: 'Operazione non riuscita, riprova.',
    },
    en: {
        title: 'Telegram',
        subtitle: 'Link Telegram to use CounselorBot from the bot too.',
        linked: 'Telegram linked',
        notLinked: 'Telegram not linked',
        generate: 'Generate code',
        codeHint: 'Send this code to the bot within 10 minutes with:',
        unlink: 'Unlink Telegram',
        error: 'Operation failed, please retry.',
    },
    es: {
        title: 'Telegram', subtitle: 'Vincula Telegram para usar CounselorBot también desde el bot.',
        linked: 'Telegram vinculado', notLinked: 'Telegram no vinculado', generate: 'Generar código',
        codeHint: 'Envía este código al bot antes de 10 minutos con:', unlink: 'Desvincular Telegram',
        error: 'La operación ha fallado. Inténtalo de nuevo.',
    },
    fr: {
        title: 'Telegram', subtitle: 'Associez Telegram pour utiliser CounselorBot également depuis le bot.',
        linked: 'Telegram associé', notLinked: 'Telegram non associé', generate: 'Générer un code',
        codeHint: 'Envoyez ce code au bot dans les 10 minutes avec :', unlink: 'Dissocier Telegram',
        error: 'L’opération a échoué. Réessayez.',
    },
    de: {
        title: 'Telegram', subtitle: 'Verknüpfen Sie Telegram, um CounselorBot auch über den Bot zu nutzen.',
        linked: 'Telegram verknüpft', notLinked: 'Telegram nicht verknüpft', generate: 'Code erstellen',
        codeHint: 'Senden Sie diesen Code innerhalb von 10 Minuten mit folgendem Befehl an den Bot:', unlink: 'Telegram trennen',
        error: 'Der Vorgang ist fehlgeschlagen. Versuchen Sie es erneut.',
    },
    sv: {
        title: 'Telegram', subtitle: 'Länka Telegram för att använda CounselorBot även via boten.',
        linked: 'Telegram länkat', notLinked: 'Telegram inte länkat', generate: 'Skapa kod',
        codeHint: 'Skicka den här koden till boten inom 10 minuter med:', unlink: 'Koppla från Telegram',
        error: 'Åtgärden misslyckades. Försök igen.',
    },
};

export function TelegramLinkCard({ lang, showHeading = true }: { lang: string; showHeading?: boolean }) {
    const texts = TEXTS[lang as keyof typeof TEXTS] ?? TEXTS.en;
    const [status, setStatus] = useState<LinkStatus | null>(null);
    const [code, setCode] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);

    const loadStatus = useCallback(async () => {
        try {
            const res = await apiFetch('/api/telegram/link-status');
            if (res.ok) setStatus(await res.json() as LinkStatus);
        } catch {
            // silenzioso: la card resta in stato "non collegato"
        }
    }, []);

    useEffect(() => { void loadStatus(); }, [loadStatus]);

    const generateCode = async () => {
        setBusy(true);
        setError(false);
        try {
            const res = await apiFetch('/api/telegram/link-code', { method: 'POST' });
            if (!res.ok) throw new Error('link-code failed');
            const payload = await res.json() as { code: string };
            setCode(payload.code);
        } catch {
            setError(true);
        } finally {
            setBusy(false);
        }
    };

    const unlink = async () => {
        setBusy(true);
        setError(false);
        try {
            const res = await apiFetch('/api/telegram/unlink', { method: 'POST' });
            if (!res.ok) throw new Error('unlink failed');
            setCode(null);
            await loadStatus();
        } catch {
            setError(true);
        } finally {
            setBusy(false);
        }
    };

    return (
        <section
            className="glass-panel space-y-3 p-5"
            aria-labelledby={showHeading ? 'telegram-link-section' : undefined}
            aria-label={showHeading ? undefined : texts.title}
        >
            {showHeading && (
                <div className="flex items-center gap-2">
                    <Send className="h-4 w-4 text-slate-500" aria-hidden />
                    <h2 id="telegram-link-section" className="text-lg font-bold text-slate-800">{texts.title}</h2>
                </div>
            )}
            <p className="text-sm text-slate-500">{texts.subtitle}</p>
            <p className="text-sm font-medium text-slate-700">
                {status?.linked
                    ? `${texts.linked}${status.telegram_username ? ` (@${status.telegram_username})` : ''}`
                    : texts.notLinked}
            </p>
            {code && (
                <div className="rounded-md border border-slate-300 bg-white p-3 text-sm text-slate-800">
                    <p>{texts.codeHint}</p>
                    <p className="mt-1 font-mono text-lg font-bold tracking-widest">/link {code}</p>
                </div>
            )}
            {error && <p className="text-sm text-red-600">{texts.error}</p>}
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={() => void generateCode()}
                    disabled={busy}
                    className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {texts.generate}
                </button>
                {status?.linked && (
                    <button
                        type="button"
                        onClick={() => void unlink()}
                        disabled={busy}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                        {texts.unlink}
                    </button>
                )}
            </div>
        </section>
    );
}
