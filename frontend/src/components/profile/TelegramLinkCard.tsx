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
        notLinkedHint: 'Dopo la verifica riuscita lo stato diventa «Telegram collegato».',
        generate: 'Genera codice',
        newCode: 'Genera un nuovo codice',
        codeHint: 'Invia questo codice al bot entro 10 minuti con:',
        codeValid: 'Il codice resta valido per {minutes} minuti.',
        codeExpired: 'Codice scaduto. Generane uno nuovo.',
        verify: 'Verifica il collegamento',
        verifyHint: 'Se hai appena confermato nel bot, torna su questa pagina: la verifica parte da sola.',
        step1: 'Apri il bot su Telegram',
        step2: 'Conferma il collegamento nel bot',
        step3: 'Torna qui e verifica il collegamento',
        unlink: 'Scollega Telegram',
        openBot: 'Apri il bot su Telegram',
        botHint: 'Bot ufficiale:',
        error: 'Operazione non riuscita, riprova.',
        statusError: 'Impossibile verificare lo stato di Telegram.',
        retry: 'Riprova',
    },
    en: {
        title: 'Telegram',
        subtitle: 'Link Telegram to use CounselorBot from the bot too.',
        linked: 'Telegram linked',
        notLinked: 'Telegram not linked',
        notLinkedHint: 'After a successful check the status becomes “Telegram linked”.',
        generate: 'Generate code',
        newCode: 'Generate a new code',
        codeHint: 'Send this code to the bot within 10 minutes with:',
        codeValid: 'The code stays valid for {minutes} minutes.',
        codeExpired: 'Code expired. Generate a new one.',
        verify: 'Check the link',
        verifyHint: 'If you just confirmed in the bot, come back to this page: the check starts by itself.',
        step1: 'Open the bot on Telegram',
        step2: 'Confirm the link in the bot',
        step3: 'Come back here and check the link',
        unlink: 'Unlink Telegram',
        openBot: 'Open the bot on Telegram',
        botHint: 'Official bot:',
        error: 'Operation failed, please retry.',
        statusError: 'The Telegram status could not be checked.',
        retry: 'Retry',
    },
    es: {
        title: 'Telegram', subtitle: 'Vincula Telegram para usar CounselorBot también desde el bot.',
        linked: 'Telegram vinculado', notLinked: 'Telegram no vinculado',
        notLinkedHint: 'Tras una verificación correcta, el estado pasa a «Telegram vinculado».',
        generate: 'Generar código', newCode: 'Generar un código nuevo',
        codeHint: 'Envía este código al bot antes de 10 minutos con:',
        codeValid: 'El código sigue siendo válido durante {minutes} minutos.',
        codeExpired: 'Código caducado. Genera uno nuevo.',
        verify: 'Comprobar el vínculo',
        verifyHint: 'Si acabas de confirmar en el bot, vuelve a esta página: la comprobación arranca sola.',
        step1: 'Abre el bot en Telegram', step2: 'Confirma el vínculo en el bot', step3: 'Vuelve aquí y comprueba el vínculo',
        unlink: 'Desvincular Telegram',
        openBot: 'Abrir el bot en Telegram', botHint: 'Bot oficial:',
        error: 'La operación ha fallado. Inténtalo de nuevo.',
        statusError: 'No se pudo verificar el estado de Telegram.',
        retry: 'Reintentar',
    },
    fr: {
        title: 'Telegram', subtitle: 'Associez Telegram pour utiliser CounselorBot également depuis le bot.',
        linked: 'Telegram associé', notLinked: 'Telegram non associé',
        notLinkedHint: 'Après une vérification réussie, l’état devient « Telegram associé ».',
        generate: 'Générer un code', newCode: 'Générer un nouveau code',
        codeHint: 'Envoyez ce code au bot dans les 10 minutes avec :',
        codeValid: 'Le code reste valable pendant {minutes} minutes.',
        codeExpired: 'Code expiré. Générez-en un nouveau.',
        verify: 'Vérifier l’association',
        verifyHint: 'Si tu viens de confirmer dans le bot, reviens sur cette page : la vérification démarre toute seule.',
        step1: 'Ouvre le bot sur Telegram', step2: 'Confirme l’association dans le bot', step3: 'Revient ici et vérifie l’association',
        unlink: 'Dissocier Telegram',
        openBot: 'Ouvrir le bot sur Telegram', botHint: 'Bot officiel :',
        error: 'L’opération a échoué. Réessayez.',
        statusError: 'Impossible de vérifier l’état de Telegram.',
        retry: 'Réessayer',
    },
    de: {
        title: 'Telegram', subtitle: 'Verknüpfen Sie Telegram, um CounselorBot auch über den Bot zu nutzen.',
        linked: 'Telegram verknüpft', notLinked: 'Telegram nicht verknüpft',
        notLinkedHint: 'Nach einer erfolgreichen Prüfung wird der Status „Telegram verknüpft“.',
        generate: 'Code erstellen', newCode: 'Einen neuen Code erstellen',
        codeHint: 'Senden Sie diesen Code innerhalb von 10 Minuten mit folgendem Befehl an den Bot:',
        codeValid: 'Der Code bleibt {minutes} Minuten gültig.',
        codeExpired: 'Code abgelaufen. Erstelle einen neuen.',
        verify: 'Verknüpfung prüfen',
        verifyHint: 'Wenn du soeben im Bot bestätigt hast, kehre zu dieser Seite zurück: Die Prüfung startet von selbst.',
        step1: 'Öffne den Bot in Telegram', step2: 'Bestätige die Verknüpfung im Bot', step3: 'Kehre hierher zurück und prüfe die Verknüpfung',
        unlink: 'Telegram trennen',
        openBot: 'Bot in Telegram öffnen', botHint: 'Offizieller Bot:',
        error: 'Der Vorgang ist fehlgeschlagen. Versuchen Sie es erneut.',
        statusError: 'Der Telegram-Status konnte nicht geprüft werden.',
        retry: 'Erneut versuchen',
    },
    sv: {
        title: 'Telegram', subtitle: 'Länka Telegram för att använda CounselorBot även via boten.',
        linked: 'Telegram länkat', notLinked: 'Telegram inte länkat',
        notLinkedHint: 'Efter en lyckad kontroll blir statusen „Telegram länkat“.',
        generate: 'Skapa kod', newCode: 'Skapa en ny kod',
        codeHint: 'Skicka den här koden till boten inom 10 minuter med:',
        codeValid: 'Koden gäller i {minutes} minuter.',
        codeExpired: 'Koden har upphört att gälla. Skapa en ny.',
        verify: 'Kontrollera länken',
        verifyHint: 'Om du precis bekräftat i boten, återvänd till den här sidan: kontrollen startar av sig själv.',
        step1: 'Öppna boten i Telegram', step2: 'Bekräfta länken i boten', step3: 'Återvänd hit och kontrollera länken',
        unlink: 'Koppla från Telegram',
        openBot: 'Öppna boten i Telegram', botHint: 'Officiell bot:',
        error: 'Åtgärden misslyckades. Försök igen.',
        statusError: 'Det gick inte att kontrollera Telegram-statusen.',
        retry: 'Försök igen',
    },
};

interface PendingCode { code: string; expiresAt: number }

// F32 (lotto 5A): i passi «Apri il bot → Conferma → Verifica» sono espliciti, la
// scadenza sta nel riquadro del codice e al ritorno dal bot (tab di nuovo in
// primo piano) lo stato viene riverificato da solo.
export function TelegramLinkCard({ lang, showHeading = true }: { lang: string; showHeading?: boolean }) {
    const texts = TEXTS[lang as keyof typeof TEXTS] ?? TEXTS.en;
    const [status, setStatus] = useState<LinkStatus | null>(null);
    const [botUsername, setBotUsername] = useState('');
    const [pending, setPending] = useState<PendingCode | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [statusError, setStatusError] = useState(false);
    const [, setTick] = useState(0);

    const loadStatus = useCallback(async () => {
        // F03: un errore di rete non è “non collegato” — è un errore con Riprova.
        try {
            const res = await apiFetch('/api/telegram/link-status');
            if (!res.ok) throw new Error('link-status failed');
            setStatus(await res.json() as LinkStatus);
            setStatusError(false);
        } catch {
            setStatusError(true);
        }
    }, []);

    useEffect(() => { void loadStatus(); }, [loadStatus]);

    // F32: al ritorno dal bot (tab di nuovo visibile) si riverifica lo stato.
    useEffect(() => {
        const check = () => { if (document.visibilityState === 'visible') void loadStatus(); };
        document.addEventListener('visibilitychange', check);
        return () => document.removeEventListener('visibilitychange', check);
    }, [loadStatus]);

    // Aggiorna il conto alla rovescia della scadenza ogni mezzo minuto.
    useEffect(() => {
        if (!pending) return;
        const timer = setInterval(() => setTick(value => value + 1), 30_000);
        return () => clearInterval(timer);
    }, [pending]);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const res = await apiFetch('/api/telegram/bot-info');
                if (!res.ok) return;
                const info = await res.json() as { bot_username: string };
                if (!cancelled) setBotUsername(info.bot_username || '');
            } catch {
                // silenzioso: senza username restano solo le istruzioni testuali
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const deepLink = botUsername
        ? `https://t.me/${botUsername}${pending ? `?start=l_${pending.code}` : ''}`
        : '';
    const minutesLeft = pending ? Math.max(0, Math.ceil((pending.expiresAt - Date.now()) / 60_000)) : 0;
    const expired = Boolean(pending) && minutesLeft <= 0;

    const generateCode = async () => {
        setBusy(true);
        setError(false);
        try {
            const res = await apiFetch('/api/telegram/link-code', { method: 'POST' });
            if (!res.ok) throw new Error('link-code failed');
            const payload = await res.json() as { code: string; expires_in_minutes?: number };
            const minutes = payload.expires_in_minutes ?? 10;
            setPending({ code: payload.code, expiresAt: Date.now() + minutes * 60_000 });
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
            setPending(null);
            await loadStatus();
        } catch {
            setError(true);
        } finally {
            setBusy(false);
        }
    };

    const linked = !statusError && status?.linked;

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
                {/* F32: lo stato viene mostrato solo quando è il frutto di una verifica riuscita. */}
                {!statusError && status
                    ? (linked
                        ? `${texts.linked}${status.telegram_username ? ` (@${status.telegram_username})` : ''}`
                        : texts.notLinked)
                    : ''}
            </p>
            {statusError && (
                <p role="alert" className="text-sm text-red-800">
                    {statusError && !status ? texts.statusError : ''}
                    <button type="button" onClick={() => void loadStatus()} className="mt-2 block min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">{texts.retry}</button>
                </p>
            )}
            {linked && (
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => void unlink()}
                        disabled={busy}
                        className="min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                        {texts.unlink}
                    </button>
                </div>
            )}
            {!linked && (
                <ol className="space-y-2 text-sm text-slate-700">
                    <li className="rounded-md border border-slate-200 bg-white p-3">
                        <span className="font-semibold">{texts.step1}.</span>{' '}
                        {botUsername && (
                            <a
                                href={pending && !expired ? deepLink : `https://t.me/${botUsername}`}
                                target="_blank"
                                rel="noreferrer"
                                className="ml-1 inline-block rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                            >
                                {texts.openBot}
                            </a>
                        )}
                    </li>
                    <li className="rounded-md border border-slate-200 bg-white p-3"><span className="font-semibold">{texts.step2}.</span></li>
                    <li className="rounded-md border border-slate-200 bg-white p-3">
                        <span className="font-semibold">{texts.step3}.</span>{' '}
                        <button type="button" onClick={() => void loadStatus()} disabled={busy} className="ml-1 min-h-11 rounded-md border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">{texts.verify}</button>
                    </li>
                    <li className="text-xs text-slate-500">{texts.verifyHint}</li>
                </ol>
            )}
            {pending && !expired && (
                <div className="space-y-2 rounded-md border border-slate-300 bg-white p-3 text-sm text-slate-800" aria-live="polite">
                    <p>{texts.codeHint}</p>
                    <p className="font-mono text-lg font-bold tracking-widest">/link {pending.code}</p>
                    <p>{texts.codeValid.replace('{minutes}', String(minutesLeft))}</p>
                </div>
            )}
            {pending && expired && (
                <p className="text-sm text-amber-700" aria-live="polite">{texts.codeExpired}</p>
            )}
            {botUsername && (
                <p className="text-sm text-slate-600">
                    {texts.botHint}{' '}
                    <a
                        href={`https://t.me/${botUsername}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-indigo-600 hover:underline"
                    >
                        @{botUsername}
                    </a>
                </p>
            )}
            {error && <p className="text-sm text-red-600">{texts.error}</p>}
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={() => void generateCode()}
                    disabled={busy}
                    className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {pending ? texts.newCode : texts.generate}
                </button>
            </div>
        </section>
    );
}
