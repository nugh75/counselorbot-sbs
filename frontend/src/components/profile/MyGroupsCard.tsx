'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/auth';
import { learningText } from '@/lib/i18n-assignment-work';
import { ConfirmInline } from '@/components/ui/ConfirmInline';
import { Users, Loader2 } from 'lucide-react';

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
        leave: "Lascia il gruppo",
        leaveConfirm: "Lasciare «{name}»?",
        leaveConsequence: "Potrai rientrare solo con un nuovo invito del docente.",
        leaveError: "Uscita non riuscita. Riprova.",
        via: 'iscritto via',
        joinPlaceholder: "Codice di invito (GR-ABC123)",
        join: 'Entra',
        joinError: "Codice di invito non valido.",
        loading: 'Caricamento…',
        loadError: 'Impossibile caricare i gruppi. I dati non sono persi.',
        retry: 'Riprova',
    },
    en: {
        manage: 'To configure goals, manage groups and classes, and update catalogs, go to the Teacher area.',
        title: "Groups and classes I participate in",
        leave: "Leave the group",
        leaveConfirm: "Leave “{name}”?",
        leaveConsequence: "You can only rejoin with a new teacher invitation.",
        leaveError: "Leaving failed. Try again.",
        via: 'joined via',
        joinPlaceholder: "Invitation code (GR-ABC123)",
        join: 'Join',
        joinError: "Invalid invitation code.",
        loading: 'Loading…',
        loadError: 'The groups could not be loaded. Your data is not lost.',
        retry: 'Retry',
    },
    es: {
        manage: 'Para configurar objetivos, gestionar grupos y clases y actualizar los catálogos, ve al Área docente.',
        title: "Grupos y clases en los que participo", leave: "Salir del grupo",
        leaveConfirm: "¿Salir de «{name}»?",
        leaveConsequence: "Solo podrás volver a entrar con una nueva invitación del docente.",
        leaveError: "La salida ha fallado. Inténtalo de nuevo.",
        via: 'inscrito mediante',
        joinPlaceholder: "Código de invitación (GR-ABC123)", join: 'Entrar', joinError: "Código de invitación no válido.",
        loading: 'Cargando…',
        loadError: 'No se pudieron cargar los grupos. Tus datos no se han perdido.',
        retry: 'Reintentar',
    },
    fr: {
        manage: 'Pour configurer les objectifs, gérer les groupes et les classes et enrichir les catalogues, accède à l’Espace enseignant.',
        title: "Groupes et classes auxquels je participe", leave: "Quitter le groupe",
        leaveConfirm: "Quitter « {name} » ?",
        leaveConsequence: "Tu ne pourras y revenir qu’avec une nouvelle invitation de l’enseignant.",
        leaveError: "La sortie a échoué. Réessaie.",
        via: 'inscrit via',
        joinPlaceholder: "Code d’invitation (GR-ABC123)", join: 'Rejoindre', joinError: "Code d’invitation non valide.",
        loading: 'Chargement…',
        loadError: 'Impossible de charger les groupes. Tes données ne sont pas perdues.',
        retry: 'Réessayer',
    },
    de: {
        manage: 'Um Ziele festzulegen, Gruppen und Klassen zu verwalten und Kataloge zu bearbeiten, öffne den Lehrkräftebereich.',
        title: "Gruppen und Klassen, an denen ich teilnehme", leave: "Gruppe verlassen",
        leaveConfirm: "„{name}“ verlassen?",
        leaveConsequence: "Ein erneuter Beitritt geht nur mit einer neuen Einladung der Lehrkraft.",
        leaveError: "Das Verlassen ist fehlgeschlagen. Versuche es erneut.",
        via: 'beigetreten über',
        joinPlaceholder: "Einladungscode (GR-ABC123)", join: 'Beitreten', joinError: "Ungültiger Einladungscode.",
        loading: 'Wird geladen…',
        loadError: 'Die Gruppen konnten nicht geladen werden. Deine Daten sind nicht verloren.',
        retry: 'Erneut versuchen',
    },
    sv: {
        manage: 'För att konfigurera mål, hantera grupper och klasser och uppdatera kataloger, gå till Lärarområdet.',
        title: "Grupper och klasser jag deltar i", leave: "Lämna gruppen",
        leaveConfirm: "Lämna „{name}“?",
        leaveConsequence: "Du kan bara komma tillbaka med en ny inbjudan från läraren.",
        leaveError: "Det gick inte att lämna. Försök igen.",
        via: 'gick med via',
        joinPlaceholder: "Inbjudningskod (GR-ABC123)", join: 'Gå med', joinError: "Ogiltig inbjudningskod.",
        loading: 'Läser in…',
        loadError: 'Det gick inte att läsa in grupperna. Dina data har inte gått förlorade.',
        retry: 'Försök igen',
    },
};

export function MyGroupsCard({ lang, showHeading = true, canManageGroups = false }: { lang: string; showHeading?: boolean; canManageGroups?: boolean }) {
    const texts = TEXTS[lang as keyof typeof TEXTS] ?? TEXTS.en;
    const [groups, setGroups] = useState<MyGroup[]>([]);
    const [joinCode, setJoinCode] = useState('');
    const [joinError, setJoinError] = useState(false);
    const [busy, setBusy] = useState(false);
    // F03: caricamento, errore e dati distinguibili; un errore su un
    // ricaricamento non cancella i gruppi già mostrati.
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    // F04: uscita confermata in linea, con esito leggibile.
    const [confirmingLeave, setConfirmingLeave] = useState<number | null>(null);
    const [leavingId, setLeavingId] = useState<number | null>(null);
    const [leaveErrorId, setLeaveErrorId] = useState<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            const res = await apiFetch('/api/user/groups');
            if (!res.ok) throw new Error('groups failed');
            const payload = await res.json();
            setGroups(Array.isArray(payload) ? payload as MyGroup[] : []);
        } catch {
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const leave = async (membershipId: number) => {
        setLeavingId(membershipId);
        setLeaveErrorId(null);
        try {
            const res = await apiFetch(`/api/user/groups/${membershipId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('leave failed');
            setConfirmingLeave(null);
            await load();
        } catch {
            setLeaveErrorId(membershipId);
        } finally {
            setLeavingId(null);
        }
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
            await load();
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
            {loading && groups.length === 0 ? (
                <p className="flex items-center gap-2 py-4 text-sm text-slate-500" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{texts.loading}</p>
            ) : loadError && groups.length === 0 ? (
                <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    <p>{texts.loadError}</p>
                    <button type="button" onClick={() => void load()} className="mt-2 min-h-11 rounded-md border border-red-300 bg-white px-3 text-sm font-semibold text-red-700 hover:bg-red-50">{texts.retry}</button>
                </div>
            ) : (
                <>
                    {loadError && groups.length > 0 && (
                        <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                            {texts.loadError} <button type="button" onClick={() => void load()} className="min-h-11 font-semibold text-amber-900 underline">{texts.retry}</button>
                        </p>
                    )}
                    <ul className="space-y-2">
                        {groups.map((group) => (
                            <li key={group.membership_id} className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700">
                                <div className="flex items-center gap-2">
                                    <span className="flex-1">
                                        <span className="font-semibold">{group.name}</span>
                                        <span className="ml-2 text-xs text-slate-500">
                                            {texts.via} {group.joined_via === 'telegram' ? 'Telegram' : 'web'}
                                            {group.joined_at ? ` - ${new Date(group.joined_at).toLocaleDateString()}` : ''}
                                        </span>
                                    </span>
                                    <button
                                        type="button"
                                        aria-label={`${texts.leave}: ${group.name}`}
                                        aria-expanded={confirmingLeave === group.membership_id}
                                        onClick={() => { setConfirmingLeave(previous => previous === group.membership_id ? null : group.membership_id); setLeaveErrorId(null); }}
                                        className="min-h-11 shrink-0 rounded-md px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-red-600"
                                    >
                                        {texts.leave}
                                    </button>
                                </div>
                                {confirmingLeave === group.membership_id && (
                                    <div className="mt-2 space-y-2">
                                        <ConfirmInline
                                            question={texts.leaveConfirm.replace('{name}', group.name)}
                                            busy={leavingId === group.membership_id}
                                            onConfirm={() => void leave(group.membership_id)}
                                            onCancel={() => setConfirmingLeave(null)}
                                        />
                                        <p className="text-xs text-slate-500">{texts.leaveConsequence}</p>
                                        {leaveErrorId === group.membership_id && <p role="alert" className="text-xs text-red-700">{texts.leaveError}</p>}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                </>
            )}
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
