'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { Users, LogOut } from 'lucide-react';

interface MyGroup {
    membership_id: number;
    group_id: number;
    code: string;
    name: string;
    joined_via: string;
    joined_at: string | null;
}

// Local copy is complete for every supported interface language.
const TEXTS = {
    it: {
        title: 'Le mie classi',
        leave: 'Esci dalla classe',
        via: 'iscritto via',
        joinPlaceholder: 'Codice classe (es. GR-ABC123)',
        join: 'Entra',
        joinError: 'Codice classe non valido.',
    },
    en: {
        title: 'My classes',
        leave: 'Leave the class',
        via: 'joined via',
        joinPlaceholder: 'Class code (e.g. GR-ABC123)',
        join: 'Join',
        joinError: 'Invalid class code.',
    },
    es: {
        title: 'Mis clases', leave: 'Salir de la clase', via: 'inscrito mediante',
        joinPlaceholder: 'Código de clase (p. ej., GR-ABC123)', join: 'Entrar', joinError: 'Código de clase no válido.',
    },
    fr: {
        title: 'Mes classes', leave: 'Quitter la classe', via: 'inscrit via',
        joinPlaceholder: 'Code de classe (ex. GR-ABC123)', join: 'Rejoindre', joinError: 'Code de classe non valide.',
    },
    de: {
        title: 'Meine Klassen', leave: 'Klasse verlassen', via: 'beigetreten über',
        joinPlaceholder: 'Klassencode (z. B. GR-ABC123)', join: 'Beitreten', joinError: 'Ungültiger Klassencode.',
    },
    sv: {
        title: 'Mina klasser', leave: 'Lämna klassen', via: 'gick med via',
        joinPlaceholder: 'Klasskod (t.ex. GR-ABC123)', join: 'Gå med', joinError: 'Ogiltig klasskod.',
    },
};

export function MyGroupsCard({ lang }: { lang: string }) {
    const texts = TEXTS[lang as keyof typeof TEXTS] ?? TEXTS.en;
    const [groups, setGroups] = useState<MyGroup[]>([]);
    const [joinCode, setJoinCode] = useState('');
    const [joinError, setJoinError] = useState(false);
    const [busy, setBusy] = useState(false);

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

    const join = async () => {
        if (!joinCode.trim()) return;
        setBusy(true);
        setJoinError(false);
        try {
            const res = await apiFetch('/api/groups/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: joinCode.trim() }),
            });
            if (!res.ok) throw new Error('join failed');
            setJoinCode('');
            load();
        } catch {
            setJoinError(true);
        } finally {
            setBusy(false);
        }
    };

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
                            <span className="font-semibold">{group.name}</span>
                            <span className="ml-2 text-xs text-slate-400">
                                {texts.via} {group.joined_via === 'telegram' ? 'Telegram' : 'web'}
                                {group.joined_at ? ` - ${new Date(group.joined_at).toLocaleDateString()}` : ''}
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
            <div className="flex gap-2">
                <input
                    value={joinCode}
                    onChange={(event) => setJoinCode(event.target.value)}
                    placeholder={texts.joinPlaceholder}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
                />
                <button
                    type="button"
                    disabled={busy || !joinCode.trim()}
                    onClick={() => void join()}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {texts.join}
                </button>
            </div>
            {joinError && <p className="text-sm text-red-600">{texts.joinError}</p>}
        </section>
    );
}
