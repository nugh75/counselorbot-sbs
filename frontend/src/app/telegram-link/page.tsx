'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { Send } from 'lucide-react';

// Local copy is complete for every supported interface language.
const TEXTS = {
    it: {
        title: 'Collega Telegram',
        loading: 'Genero il codice...',
        ready: 'Codice pronto. Tocca il bottone per tornare al bot: il collegamento avviene da solo.',
        manual: 'Oppure invia al bot:',
        back: 'Torna al bot',
        expires: 'Il codice vale 10 minuti.',
        error: 'Impossibile generare il codice. Ricarica la pagina.',
    },
    en: {
        title: 'Link Telegram',
        loading: 'Generating your code...',
        ready: 'Code ready. Tap the button to go back to the bot: linking happens automatically.',
        manual: 'Or send to the bot:',
        back: 'Back to the bot',
        expires: 'The code is valid for 10 minutes.',
        error: 'Could not generate the code. Reload the page.',
    },
    es: {
        title: 'Vincular Telegram', loading: 'Generando tu código...',
        ready: 'Código listo. Pulsa el botón para volver al bot: la vinculación se realizará automáticamente.',
        manual: 'O envía al bot:', back: 'Volver al bot', expires: 'El código es válido durante 10 minutos.',
        error: 'No se pudo generar el código. Recarga la página.',
    },
    fr: {
        title: 'Associer Telegram', loading: 'Génération de votre code...',
        ready: 'Code prêt. Touchez le bouton pour revenir au bot : l’association se fera automatiquement.',
        manual: 'Ou envoyez au bot :', back: 'Retour au bot', expires: 'Le code est valable pendant 10 minutes.',
        error: 'Impossible de générer le code. Rechargez la page.',
    },
    de: {
        title: 'Telegram verknüpfen', loading: 'Code wird erstellt...',
        ready: 'Code bereit. Tippen Sie auf die Schaltfläche, um zum Bot zurückzukehren; die Verknüpfung erfolgt automatisch.',
        manual: 'Oder an den Bot senden:', back: 'Zurück zum Bot', expires: 'Der Code ist 10 Minuten gültig.',
        error: 'Der Code konnte nicht erstellt werden. Laden Sie die Seite neu.',
    },
    sv: {
        title: 'Länka Telegram', loading: 'Skapar din kod...',
        ready: 'Koden är klar. Tryck på knappen för att gå tillbaka till boten; länkningen sker automatiskt.',
        manual: 'Eller skicka till boten:', back: 'Tillbaka till boten', expires: 'Koden är giltig i 10 minuter.',
        error: 'Det gick inte att skapa koden. Ladda om sidan.',
    },
};

function TelegramLinkInner() {
    const { lang } = useI18n();
    const texts = TEXTS[lang as keyof typeof TEXTS] ?? TEXTS.en;
    const searchParams = useSearchParams();
    const groupCode = (searchParams.get('g') || '').trim();
    const [code, setCode] = useState('');
    const [botUsername, setBotUsername] = useState('');
    const [error, setError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [codeRes, infoRes] = await Promise.all([
                    apiFetch('/api/telegram/link-code', { method: 'POST' }),
                    apiFetch('/api/telegram/bot-info'),
                ]);
                if (!codeRes.ok) throw new Error('link-code failed');
                const payload = await codeRes.json() as { code: string };
                const info = infoRes.ok ? await infoRes.json() as { bot_username: string } : null;
                if (!cancelled) {
                    setCode(payload.code);
                    setBotUsername(info?.bot_username || '');
                }
            } catch {
                if (!cancelled) setError(true);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const startPayload = code ? `l_${code}${groupCode ? `__${groupCode}` : ''}` : '';
    const deepLink = botUsername && startPayload
        ? `https://t.me/${botUsername}?start=${startPayload}`
        : '';

    return (
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
            <Send className="h-10 w-10 text-slate-500" aria-hidden />
            <h1 className="text-2xl font-bold text-slate-800">{texts.title}</h1>
            {error && <p className="text-sm text-red-600">{texts.error}</p>}
            {!error && !code && <p className="text-sm text-slate-500">{texts.loading}</p>}
            {code && (
                <>
                    <p className="text-sm text-slate-600">{texts.ready}</p>
                    {deepLink && (
                        <a
                            href={deepLink}
                            className="rounded-md bg-indigo-600 px-6 py-3 text-base font-semibold text-white hover:bg-indigo-700"
                        >
                            {texts.back}
                        </a>
                    )}
                    <div className="rounded-md border border-slate-300 bg-white p-4 text-sm text-slate-800">
                        <p>{texts.manual}</p>
                        <p className="mt-1 font-mono text-lg font-bold tracking-widest">/link {code}</p>
                    </div>
                    <p className="text-xs text-slate-500">{texts.expires}</p>
                </>
            )}
        </main>
    );
}

export default function TelegramLinkPage() {
    return (
        <Suspense fallback={null}>
            <TelegramLinkInner />
        </Suspense>
    );
}
