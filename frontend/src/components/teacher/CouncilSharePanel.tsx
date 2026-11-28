'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { classCouncilText, type ClassCouncilTextKey } from '@/lib/i18n-class-council';
import type { CouncilMessage } from '@/lib/class-council';
import { Button } from '@/components/ui/Button';
import { Field, Select } from '@/components/ui/Field';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmInline } from '@/components/ui/ConfirmInline';
import { useTeacherResource } from './useTeacherResource';

const DURATIONS = [7, 14, 30, 60, 90];
const STATES = ['active', 'expired', 'revoked'] as const;
type ShareState = (typeof STATES)[number];

interface CouncilShare {
    id: number;
    result_id: number;
    whole_chat: boolean;
    message_indexes: number[] | null;
    created_at: string | null;
    expires_at: string;
    revoked_at: string | null;
    state: ShareState;
}

function parseShares(payload: unknown): CouncilShare[] {
    if (!Array.isArray(payload)) throw new Error('invalid council shares');
    return payload.filter((row): row is CouncilShare =>
        !!row && typeof row === 'object' && typeof (row as CouncilShare).id === 'number'
        && typeof (row as CouncilShare).result_id === 'number'
        && STATES.includes((row as CouncilShare).state as ShareState));
}

// Teacher action inside one student result: share the whole conversation or
// only selected student messages, each with its own expiry and revocation.
export function CouncilSharePanel({ path, resultId, messages }: { path: string; resultId: number; messages: CouncilMessage[] }) {
    const { lang } = useI18n();
    const l = (key: ClassCouncilTextKey) => classCouncilText(lang, key);
    const shares = useTeacherResource(`${path}/council-shares`, parseShares);
    const [mode, setMode] = useState<'whole' | 'selected'>('whole');
    const [selected, setSelected] = useState<number[]>([]);
    const [days, setDays] = useState(30);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [confirmRevoke, setConfirmRevoke] = useState<number | null>(null);
    const date = (value: string | null) => value ? new Date(value).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const own = (shares.data ?? []).filter(row => row.result_id === resultId);

    const toggle = (index: number) => setSelected(current =>
        current.includes(index) ? current.filter(value => value !== index) : [...current, index].sort((a, b) => a - b));

    const create = async () => {
        setBusy(true); setError('');
        try {
            const message_indexes = mode === 'selected' ? selected : null;
            if (mode === 'selected' && !selected.length) { setError('shareSelectHint'); return; }
            const res = await apiFetch(`${path}/council-shares`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ result_id: resultId, days, message_indexes }),
            });
            if (!res.ok) { setError('shareError'); return; }
            setSelected([]); setMode('whole');
            await shares.reload();
        } catch {
            setError('shareError');
        } finally {
            setBusy(false);
        }
    };

    const revoke = async (share: CouncilShare) => {
        setConfirmRevoke(null);
        await apiFetch(`/api/teacher/council-shares/${share.id}`, { method: 'DELETE' }).catch(() => null);
        await shares.reload();
    };

    return <section className="space-y-3 border-t border-line pt-4" aria-label={l('shareWithCouncil')}>
        <h3 className="font-semibold text-ink">{l('shareWithCouncil')}</h3>
        <p className="text-xs text-ink-muted">{l('shareHint')}</p>
        <div className="space-y-2">
            <label className="flex min-h-control items-center gap-2 text-sm text-ink-body">
                <input type="radio" name={`share-mode-${resultId}`} checked={mode === 'whole'} onChange={() => setMode('whole')} />
                {l('shareWholeChat')}
            </label>
            <label className="flex min-h-control items-center gap-2 text-sm text-ink-body">
                <input type="radio" name={`share-mode-${resultId}`} checked={mode === 'selected'} onChange={() => setMode('selected')} />
                {l('shareSelected')}
            </label>
            {mode === 'selected' && <div className="space-y-2 rounded-control border border-line bg-surface-sunken p-3">
                <p className="text-xs text-ink-muted">{l('shareSelectHint')}</p>
                {messages.map((message, index) => message.role === 'student'
                    ? <label key={index} className="flex items-start gap-2 text-sm text-ink-body">
                        <input type="checkbox" className="mt-1" checked={selected.includes(index)} onChange={() => toggle(index)} />
                        <span className="min-w-0 break-words">{index + 1}. {message.text}</span>
                    </label>
                    : null)}
            </div>}
        </div>
        <div className="flex flex-wrap items-end gap-4">
            <Field label={l('duration')}>
                <Select value={days} onChange={event => setDays(Number(event.target.value))} className="w-auto">
                    {DURATIONS.map(value => <option key={value} value={value}>{value} {l('days')}</option>)}
                </Select>
            </Field>
            <Button disabled={busy} onClick={() => void create()}>{l(busy ? 'shareCreating' : 'shareCreate')}</Button>
        </div>
        {error && <p role="alert" className="text-sm text-danger">{l(error as ClassCouncilTextKey)}</p>}
        <div className="space-y-2">
            <p className="text-sm font-semibold text-ink-body">{l('shareList')}</p>
            {shares.failed && <p role="alert" className="text-sm text-danger">{l('loadError')}</p>}
            {!shares.failed && own.length === 0 && <p className="text-sm text-ink-muted">{l('shareNone')}</p>}
            {own.length > 0 && <ul className="divide-y divide-line">
                {own.map(share => <li key={share.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="space-y-1 text-sm">
                        <p className="flex flex-wrap items-center gap-2">
                            <StatusBadge tone={share.state === 'active' ? 'success' : 'neutral'}>{l(share.state)}</StatusBadge>
                            <span className="text-ink-body">{share.whole_chat ? l('shareWholeChat') : `${l('sharedExtract')} (${share.message_indexes?.length ?? 0})`}</span>
                            <span className="text-ink-muted">{l('sharedUntil')} {date(share.expires_at)}</span>
                        </p>
                    </div>
                    {share.state === 'active' && (confirmRevoke === share.id
                        ? <ConfirmInline question={l('shareRevokeConfirm')} onConfirm={() => void revoke(share)} onCancel={() => setConfirmRevoke(null)} />
                        : <Button variant="secondary" onClick={() => setConfirmRevoke(share.id)}>{l('shareRevoke')}</Button>)}
                </li>)}
            </ul>}
        </div>
    </section>;
}
