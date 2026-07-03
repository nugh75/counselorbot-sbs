'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Link2, Plus, Trash2, Users, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { apiFetch } from '@/lib/auth';
import { PlanStudentsPanel } from './PlanStudentsPanel';

interface StudentGroup {
    id: number;
    code: string;
    name: string;
    owner_username: string;
    is_active: boolean;
    members_count: number;
    created_at: string | null;
}

// ponytail: testi inline it/en come il resto della UI gruppi/Telegram.
const TEXTS = {
    it: {
        title: 'Gruppi e classi',
        subtitle: 'Le tue classi: gli studenti entrano con il link di invito (web o Telegram) o inserendo il codice classe dal profilo. Aggancia la classe a un piano di somministrazione per taggare i risultati.',
        newGroup: 'Nuova classe',
        namePlaceholder: 'Nome classe (es. 3B Informatica)',
        create: 'Crea',
        cancel: 'Annulla',
        members: 'iscritti',
        inactive: 'disattivata',
        webLink: 'Link invito',
        telegramLink: 'Link Telegram',
        code: 'Codice classe',
        students: 'Studenti',
        deactivate: 'Disattiva',
        activate: 'Riattiva',
        deleteGroup: 'Elimina',
        empty: 'Nessuna classe. Creane una e condividi il link con gli studenti.',
        privacy: "Gli studenti che entrano vedono l'informativa: il docente/ricercatore della classe puo' vedere risultati e conversazioni.",
        error: 'Operazione non riuscita.',
    },
    en: {
        title: 'Groups and classes',
        subtitle: 'Your classes: students join via the invitation link (web or Telegram) or by entering the class code from their profile. Attach the class to an administration plan to tag results.',
        newGroup: 'New class',
        namePlaceholder: 'Class name (e.g. 3B Computer Science)',
        create: 'Create',
        cancel: 'Cancel',
        members: 'members',
        inactive: 'inactive',
        webLink: 'Invitation link',
        telegramLink: 'Telegram link',
        code: 'Class code',
        students: 'Students',
        deactivate: 'Deactivate',
        activate: 'Reactivate',
        deleteGroup: 'Delete',
        empty: 'No classes yet. Create one and share the link with your students.',
        privacy: 'Joining students see the notice: the class teacher/researcher can view results and conversations.',
        error: 'Operation failed.',
    },
};

export function GroupsPanel() {
    const { lang } = useI18n();
    const texts = TEXTS[lang as keyof typeof TEXTS] ?? TEXTS.en;
    const [groups, setGroups] = useState<StudentGroup[] | null>(null);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [openStudentsId, setOpenStudentsId] = useState<number | null>(null);
    const [origin, setOrigin] = useState('');
    const [botUsername, setBotUsername] = useState('');

    useEffect(() => { setOrigin(window.location.origin); }, []);
    useEffect(() => {
        apiFetch('/api/telegram/bot-info')
            .then((res) => (res.ok ? res.json() : null))
            .then((info: { enabled: boolean; bot_username: string } | null) => {
                if (info?.enabled && info.bot_username) setBotUsername(info.bot_username);
            })
            .catch(() => { /* bot spento: nessun link Telegram */ });
    }, []);

    const load = useCallback(() => {
        apiFetch('/api/admin/groups')
            .then((res) => (res.ok ? res.json() : []))
            .then((payload) => setGroups(Array.isArray(payload) ? payload as StudentGroup[] : []))
            .catch(() => setGroups([]));
    }, []);

    useEffect(() => { load(); }, [load]);

    const copy = async (key: string, text: string) => {
        if (!navigator.clipboard) return;
        await navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 1500);
    };

    const create = async () => {
        if (!newName.trim()) return;
        setBusy(true);
        setMessage('');
        try {
            const res = await apiFetch('/api/admin/groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim() }),
            });
            if (!res.ok) throw new Error('create failed');
            setNewName('');
            setCreating(false);
            load();
        } catch {
            setMessage(texts.error);
        } finally {
            setBusy(false);
        }
    };

    const toggleActive = async (group: StudentGroup) => {
        setBusy(true);
        try {
            const res = await apiFetch(`/api/admin/groups/${group.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !group.is_active }),
            });
            if (res.ok) load();
        } finally {
            setBusy(false);
        }
    };

    const remove = async (group: StudentGroup) => {
        setBusy(true);
        setMessage('');
        try {
            const res = await apiFetch(`/api/admin/groups/${group.id}`, { method: 'DELETE' });
            if (!res.ok) {
                const payload = await res.json().catch(() => null) as { detail?: string } | null;
                setMessage(payload?.detail || texts.error);
                return;
            }
            load();
        } finally {
            setBusy(false);
        }
    };

    const webLink = (group: StudentGroup) => `${origin}/gruppo?g=${group.code}`;
    const telegramLink = (group: StudentGroup) => `https://t.me/${botUsername}?start=g_${group.code}`;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
                        <Users className="h-5 w-5 text-slate-500" /> {texts.title}
                    </h2>
                    <p className="mt-1 max-w-2xl text-sm text-slate-500">{texts.subtitle}</p>
                </div>
                <button
                    type="button"
                    onClick={() => setCreating(true)}
                    className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                    <Plus className="h-4 w-4" /> {texts.newGroup}
                </button>
            </div>

            {creating && (
                <div className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-3 sm:flex-row">
                    <input
                        value={newName}
                        onChange={(event) => setNewName(event.target.value)}
                        placeholder={texts.namePlaceholder}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                        <button
                            type="button"
                            disabled={busy || !newName.trim()}
                            onClick={() => void create()}
                            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {texts.create}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setCreating(false); setNewName(''); }}
                            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}

            {message && <p className="text-sm text-red-600">{message}</p>}
            {groups !== null && groups.length === 0 && <p className="text-sm text-slate-400">{texts.empty}</p>}

            <div className="space-y-3">
                {(groups || []).map((group) => (
                    <section key={group.id} className={`rounded-md border border-slate-200 bg-white p-4 ${group.is_active ? '' : 'opacity-60'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <h3 className="font-bold text-slate-800">
                                    {group.name}
                                    {!group.is_active && <span className="ml-2 text-xs font-normal text-slate-400">({texts.inactive})</span>}
                                </h3>
                                <p className="text-xs text-slate-400">
                                    {texts.code}: <span className="font-mono font-semibold text-slate-600">{group.code}</span>
                                    {' - '}{group.members_count} {texts.members}
                                    {' - '}{group.owner_username}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setOpenStudentsId(openStudentsId === group.id ? null : group.id)}
                                    className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                    <Users className="h-4 w-4" /> {texts.students}
                                </button>
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void toggleActive(group)}
                                    className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                    {group.is_active ? texts.deactivate : texts.activate}
                                </button>
                                <button
                                    type="button"
                                    disabled={busy}
                                    title={texts.deleteGroup}
                                    onClick={() => void remove(group)}
                                    className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        {origin && (
                            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                <input readOnly value={webLink(group)} className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700" />
                                <button
                                    type="button"
                                    onClick={() => void copy(`web-${group.id}`, webLink(group))}
                                    className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                    {copiedKey === `web-${group.id}` ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                                    {texts.webLink}
                                </button>
                            </div>
                        )}
                        {botUsername && (
                            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                <input readOnly value={telegramLink(group)} className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700" />
                                <button
                                    type="button"
                                    onClick={() => void copy(`tg-${group.id}`, telegramLink(group))}
                                    className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                    {copiedKey === `tg-${group.id}` ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                                    {texts.telegramLink}
                                </button>
                            </div>
                        )}
                        <p className="mt-2 text-xs text-slate-400">{texts.privacy}</p>

                        {openStudentsId === group.id && (
                            <PlanStudentsPanel base={`/api/admin/groups/${group.id}`} withNotes />
                        )}
                    </section>
                ))}
            </div>
        </div>
    );
}
