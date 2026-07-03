'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { Users, LogOut } from 'lucide-react';

interface MyGroup {
    membership_id: number;
    plan_id: number;
    code: string;
    title: string;
    instrument_code: string;
    joined_via: string;
    joined_at: string | null;
}

// ponytail: testi inline it/en come TelegramLinkCard.
const TEXTS = {
    it: { title: 'I miei gruppi', leave: 'Esci dal gruppo', via: 'iscritto via' },
    en: { title: 'My groups', leave: 'Leave the group', via: 'joined via' },
};

export function MyGroupsCard({ lang }: { lang: string }) {
    const texts = TEXTS[lang as keyof typeof TEXTS] ?? TEXTS.en;
    const [groups, setGroups] = useState<MyGroup[]>([]);

    const load = useCallback(() => {
        apiFetch('/api/user/groups')
            .then((res) => (res.ok ? res.json() : []))
            .then((payload) => setGroups(Array.isArray(payload) ? payload as MyGroup[] : []))
            .catch(() => { /* nessun gruppo: card nascosta */ });
    }, []);

    useEffect(() => { load(); }, [load]);

    const leave = async (membershipId: number) => {
        try {
            const res = await apiFetch(`/api/user/groups/${membershipId}`, { method: 'DELETE' });
            if (res.ok) load();
        } catch { /* riprova dalla card */ }
    };

    if (groups.length === 0) return null;

    return (
        <section className="glass-panel space-y-3 p-5" aria-labelledby="my-groups-section">
            <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-500" aria-hidden />
                <h2 id="my-groups-section" className="text-lg font-bold text-slate-800">{texts.title}</h2>
            </div>
            <ul className="space-y-2">
                {groups.map((group) => (
                    <li key={group.membership_id} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700">
                        <span className="flex-1">
                            <span className="font-semibold">{group.title}</span>
                            <span className="ml-2 font-mono text-xs text-slate-400">{group.instrument_code}</span>
                            <span className="ml-2 text-xs text-slate-400">
                                {texts.via} {group.joined_via === 'telegram' ? 'Telegram' : 'web'}
                                {group.joined_at ? ` · ${new Date(group.joined_at).toLocaleDateString()}` : ''}
                            </span>
                        </span>
                        <button
                            type="button"
                            title={texts.leave}
                            onClick={() => void leave(group.membership_id)}
                            className="text-slate-400 hover:text-red-600"
                        >
                            <LogOut className="h-4 w-4" />
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
