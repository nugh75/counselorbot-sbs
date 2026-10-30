'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { tavoloLabel } from '@/lib/i18n-tavolo';
import { helpTavolo, type TavoloHelpTurn } from '@/lib/tavolo';
import { Button } from '@/components/ui/Button';

export function TavoloHelp({ id, counselorId, available, beforeAsk, onBusy, onClose }: {
    id: string;
    counselorId?: number;
    available: boolean;
    beforeAsk: () => Promise<unknown>;
    onClose: () => void;
    onBusy: (busy: boolean) => void;
}) {
    const { lang } = useI18n();
    const label = (key: Parameters<typeof tavoloLabel>[0]) => tavoloLabel(key, lang);
    const [question, setQuestion] = useState('');
    const [turns, setTurns] = useState<TavoloHelpTurn[]>([]);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const log = useRef<HTMLDivElement>(null);
    useEffect(() => { log.current?.scrollTo(0, log.current.scrollHeight); }, [turns, busy]);
    return <section aria-label={label('help')} className="shrink-0 space-y-2 border-b border-line bg-surface px-4 py-2">
        <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">{label('help')}</h2>
            <button type="button" onClick={onClose} className="min-h-control px-2 text-sm text-ink-muted">{label('close')}</button>
        </div>
        <div ref={log} role="log" aria-live="polite" className="max-h-40 space-y-2 overflow-y-auto text-sm text-ink-body">
            {turns.map((turn, index) => <div key={index} className="space-y-1">
                <p>{turn.question}</p>
                <p className="whitespace-pre-wrap">{turn.reply}</p>
            </div>)}
        </div>
        {failed && <p role="alert" className="text-sm text-warning-ink">{label('helpFailed')}</p>}
        <form className="flex gap-2" onSubmit={(event) => {
            event.preventDefault();
            if (!question.trim() || busy || !available) return;
            const sent = question.trim();
            setBusy(true); onBusy(true); setFailed(false);
            void (async () => {
                try {
                    await beforeAsk();
                    const reply = await helpTavolo(id, { question: sent, history: turns.slice(-6), counselor_id: counselorId, lang });
                    setTurns((previous) => [...previous, { question: sent, reply: reply.reply }]);
                    setQuestion('');
                } catch { setFailed(true); }
                finally { setBusy(false); onBusy(false); }
            })();
        }}>
            <input value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1200} disabled={busy}
                aria-label={label('helpQuestion')} placeholder={label('helpQuestion')}
                className="min-h-control min-w-0 flex-1 rounded-lg border border-line px-4 text-sm text-ink" />
            <Button disabled={busy || !available || !question.trim()}>
                {busy ? '…' : label('send')}
            </Button>
        </form>
    </section>;
}
