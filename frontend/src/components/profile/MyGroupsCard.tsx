'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/auth';
import { learningText } from '@/lib/i18n-assignment-work';
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
        manage: 'Per configurare obiettivi, gestire gruppi e classi e aggiornare i cataloghi, vai all’Area docenti.',
        title: "Gruppi e classi a cui partecipo",
        leave: "Lascia il gruppo o la classe",
        via: 'iscritto via',
        joinPlaceholder: "Codice di invito (GR-ABC123)",
        join: 'Entra',
        joinError: "Codice di invito non valido.",
    },
    en: {
        manage: 'To configure goals, manage groups and classes, and update catalogs, go to the Teacher area.',
        title: "Groups and classes I participate in",
        leave: "Leave the group or class",
        via: 'joined via',
        joinPlaceholder: "Invitation code (GR-ABC123)",
        join: 'Join',
        joinError: "Invalid invitation code.",
    },
    es: {
        manage: 'Para configurar objetivos, gestionar grupos y clases y actualizar los catálogos, ve al Área docente.',
        title: "Grupos y clases en los que participo", leave: "Salir del grupo o de la clase", via: 'inscrito mediante',
        joinPlaceholder: "Código de invitación (GR-ABC123)", join: 'Entrar', joinError: "Código de invitación no válido.",
    },
    fr: {
        manage: 'Pour configurer les objectifs, gérer les groupes et les classes et enrichir les catalogues, accède à l’Espace enseignant.',
        title: "Groupes et classes auxquels je participe", leave: "Quitter le groupe ou la classe", via: 'inscrit via',
        joinPlaceholder: "Code d’invitation (GR-ABC123)", join: 'Rejoindre', joinError: "Code d’invitation non valide.",
    },
    de: {
        manage: 'Um Ziele festzulegen, Gruppen und Klassen zu verwalten und Kataloge zu bearbeiten, öffne den Lehrkräftebereich.',
        title: "Gruppen und Klassen, an denen ich teilnehme", leave: "Gruppe oder Klasse verlassen", via: 'beigetreten über',
        joinPlaceholder: "Einladungscode (GR-ABC123)", join: 'Beitreten', joinError: "Ungültiger Einladungscode.",
    },
    sv: {
        manage: 'För att konfigurera mål, hantera grupper och klasser och uppdatera kataloger, gå till Lärarområdet.',
        title: "Grupper och klasser jag deltar i", leave: "Lämna gruppen eller klassen", via: 'gick med via',
        joinPlaceholder: "Inbjudningskod (GR-ABC123)", join: 'Gå med', joinError: "Ogiltig inbjudningskod.",
    },
};

export function MyGroupsCard({ lang, showHeading = true, canManageGroups = false }: { lang: string; showHeading?: boolean; canManageGroups?: boolean }) {
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
        <section
            className="glass-panel space-y-3 p-5"
            aria-labelledby={showHeading ? 'my-groups-section' : undefined}
            aria-label={showHeading ? undefined : texts.title}
        >
            {showHeading && (
                <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-slate-500" aria-hidden />
                    <h2 id="my-groups-section" className="text-lg font-bold text-slate-800">{texts.title}</h2>
                </div>
            )}
            {canManageGroups && (
                <Link href="/docente" className="block text-sm text-indigo-700 underline underline-offset-2">
                    {texts.manage}
                </Link>
            )}
            <p className="text-sm text-slate-600">{learningText(lang, 'groupVisibility')}</p>
            <ul className="space-y-2">
                {groups.map((group) => (
                    <li key={group.membership_id} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700">
                        <span className="flex-1">
                            <span className="font-semibold">{group.name}</span>
                            <span className="ml-2 text-xs text-slate-500">
                                {texts.via} {group.joined_via === 'telegram' ? 'Telegram' : 'web'}
                                {group.joined_at ? ` - ${new Date(group.joined_at).toLocaleDateString()}` : ''}
                            </span>
                        </span>
                        <button
                            type="button"
                            title={texts.leave}
                            onClick={() => void leave(group.membership_id)}
                            className="text-slate-500 hover:text-red-600"
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
                    aria-label={texts.joinPlaceholder}
                    className="min-w-0 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
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
