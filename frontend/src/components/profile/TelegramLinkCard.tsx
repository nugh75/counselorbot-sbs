'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { Send } from 'lucide-react';

interface LinkStatus {
    linked: boolean;
    telegram_username: string | null;
    linked_at: string | null;
}

// ponytail: testi inline it/en (fallback en), come i testi del bot; niente chiavi i18n per ora.
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
};

export function TelegramLinkCard({ lang }: { lang: string }) {
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
        <section className="glass-panel p-5 space-y-3" aria-labelledby="telegram-link-section">
            <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-slate-500" aria-hidden />
                <h2 id="telegram-link-section" className="text-lg font-bold text-slate-800">{texts.title}</h2>
            </div>
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
