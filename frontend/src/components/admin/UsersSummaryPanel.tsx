'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, RefreshCw, School, Search, UserCheck, Users } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { apiFetch } from '@/lib/auth';

interface UserEntry {
    username: string;
    display_name: string;
    in_plans: boolean;
    in_groups: boolean;
    in_notes: boolean;
    in_results: boolean;
    in_memberships: boolean;
    in_logs: boolean;
    in_research_contacts: boolean;
    research_contact_id: number | null;
    plans_count: number;
    groups_count: number;
    notes_count: number;
    results_count: number;
    memberships_count: number;
}

interface GroupEntry {
    id: number;
    code: string;
    name: string;
    school: string | null;
    owner_username: string;
    is_active: boolean;
    members_count: number;
    members: { username: string; display_name: string }[];
    created_at: string | null;
}

interface Summary {
    users: UserEntry[];
    groups: GroupEntry[];
    total_users: number;
    total_groups: number;
}

const TEXTS: Record<string, Record<string, string>> = {
    it: {
        title: 'Utenti e classi',
        subtitle: 'Elenco di tutti gli utenti che hanno interagito con l\'applicazione e di tutte le classi create.',
        totalUsers: 'Utenti totali',
        totalGroups: 'Classi totali',
        refresh: 'Aggiorna',
        username: 'Username',
        role: 'Ruolo',
        groupsOwned: 'Classi',
        plansCreated: 'Piani',
        notesWritten: 'Note',
        resultsSubmitted: 'Risultati',
        memberOf: 'Iscritto a',
        tabsUsers: 'Utenti',
        tabsGroups: 'Classi',
        tabsSchools: 'Scuole',
        groups: 'Classi',
        owner: 'Proprietario',
        code: 'Codice',
        members: 'Iscritti',
        school: 'Scuola',
        noSchool: 'Senza scuola',
        studentsList: 'Studenti',
        noStudents: 'Nessuno studente iscritto.',
        classCol: 'Classe',
        status: 'Stato',
        active: 'Attiva',
        inactive: 'Disattiva',
        created: 'Creata il',
        search: 'Cerca utente...',
        searchGroups: 'Cerca classe...',
        noUsers: 'Nessun utente trovato.',
        noGroups: 'Nessuna classe trovata.',
        loading: 'Caricamento...',
        inPlans: 'Piani',
        inGroups: 'Classi',
        inNotes: 'Note',
        inResults: 'Risultati',
        inMemberships: 'Iscrizioni',
        inLogs: 'Log',
        docentiRicercatori: 'Docenti / Ricercatori',
        studenti: 'Studenti',
        altri: 'Altri',
    },
    en: {
        title: 'Users & Classes',
        subtitle: 'List of all users who have interacted with the application and all created classes.',
        totalUsers: 'Total users',
        totalGroups: 'Total classes',
        refresh: 'Refresh',
        username: 'Username',
        role: 'Role',
        groupsOwned: 'Classes',
        plansCreated: 'Plans',
        notesWritten: 'Notes',
        resultsSubmitted: 'Results',
        memberOf: 'Member of',
        tabsUsers: 'Users',
        tabsGroups: 'Classes',
        tabsSchools: 'Schools',
        groups: 'Classes',
        owner: 'Owner',
        code: 'Code',
        members: 'Members',
        school: 'School',
        noSchool: 'No school',
        studentsList: 'Students',
        noStudents: 'No students enrolled.',
        classCol: 'Class',
        status: 'Status',
        active: 'Active',
        inactive: 'Inactive',
        created: 'Created on',
        search: 'Search user...',
        searchGroups: 'Search class...',
        noUsers: 'No users found.',
        noGroups: 'No classes found.',
        loading: 'Loading...',
        inPlans: 'Plans',
        inGroups: 'Groups',
        inNotes: 'Notes',
        inResults: 'Results',
        inMemberships: 'Memberships',
        inLogs: 'Logs',
        docentiRicercatori: 'Teachers / Researchers',
        studenti: 'Students',
        altri: 'Others',
    },
    es: {
        title: 'Usuarios y clases', subtitle: 'Lista de todos los usuarios que han interactuado con la aplicación y de todas las clases creadas.',
        totalUsers: 'Usuarios totales', totalGroups: 'Clases totales', refresh: 'Actualizar', username: 'Nombre de usuario', role: 'Rol',
        groupsOwned: 'Clases', plansCreated: 'Planes', notesWritten: 'Notas', resultsSubmitted: 'Resultados', memberOf: 'Miembro de',
        tabsUsers: 'Usuarios', tabsGroups: 'Clases', tabsSchools: 'Escuelas', groups: 'Clases', owner: 'Propietario', code: 'Código',
        members: 'Miembros', school: 'Escuela', noSchool: 'Sin escuela', studentsList: 'Estudiantes', noStudents: 'No hay estudiantes inscritos.',
        classCol: 'Clase', status: 'Estado', active: 'Activa', inactive: 'Inactiva', created: 'Creada el', search: 'Buscar usuario...',
        searchGroups: 'Buscar clase...', noUsers: 'No se encontraron usuarios.', noGroups: 'No se encontraron clases.', loading: 'Cargando...',
        inPlans: 'Planes', inGroups: 'Clases', inNotes: 'Notas', inResults: 'Resultados', inMemberships: 'Inscripciones', inLogs: 'Registros',
        docentiRicercatori: 'Docentes / Investigadores', studenti: 'Estudiantes', altri: 'Otros',
    },
    fr: {
        title: 'Utilisateurs et classes', subtitle: 'Liste de tous les utilisateurs ayant interagi avec l’application et de toutes les classes créées.',
        totalUsers: 'Nombre total d’utilisateurs', totalGroups: 'Nombre total de classes', refresh: 'Actualiser', username: 'Nom d’utilisateur', role: 'Rôle',
        groupsOwned: 'Classes', plansCreated: 'Plans', notesWritten: 'Notes', resultsSubmitted: 'Résultats', memberOf: 'Membre de',
        tabsUsers: 'Utilisateurs', tabsGroups: 'Classes', tabsSchools: 'Écoles', groups: 'Classes', owner: 'Propriétaire', code: 'Code',
        members: 'Membres', school: 'École', noSchool: 'Sans école', studentsList: 'Étudiants', noStudents: 'Aucun étudiant inscrit.',
        classCol: 'Classe', status: 'État', active: 'Active', inactive: 'Inactive', created: 'Créée le', search: 'Rechercher un utilisateur...',
        searchGroups: 'Rechercher une classe...', noUsers: 'Aucun utilisateur trouvé.', noGroups: 'Aucune classe trouvée.', loading: 'Chargement...',
        inPlans: 'Plans', inGroups: 'Classes', inNotes: 'Notes', inResults: 'Résultats', inMemberships: 'Inscriptions', inLogs: 'Journaux',
        docentiRicercatori: 'Enseignants / Chercheurs', studenti: 'Étudiants', altri: 'Autres',
    },
    de: {
        title: 'Benutzer und Klassen', subtitle: 'Liste aller Benutzer, die mit der Anwendung interagiert haben, und aller erstellten Klassen.',
        totalUsers: 'Benutzer insgesamt', totalGroups: 'Klassen insgesamt', refresh: 'Aktualisieren', username: 'Benutzername', role: 'Rolle',
        groupsOwned: 'Klassen', plansCreated: 'Pläne', notesWritten: 'Notizen', resultsSubmitted: 'Ergebnisse', memberOf: 'Mitglied von',
        tabsUsers: 'Benutzer', tabsGroups: 'Klassen', tabsSchools: 'Schulen', groups: 'Klassen', owner: 'Eigentümer', code: 'Code',
        members: 'Mitglieder', school: 'Schule', noSchool: 'Keine Schule', studentsList: 'Lernende', noStudents: 'Keine Lernenden eingeschrieben.',
        classCol: 'Klasse', status: 'Status', active: 'Aktiv', inactive: 'Inaktiv', created: 'Erstellt am', search: 'Benutzer suchen...',
        searchGroups: 'Klasse suchen...', noUsers: 'Keine Benutzer gefunden.', noGroups: 'Keine Klassen gefunden.', loading: 'Wird geladen...',
        inPlans: 'Pläne', inGroups: 'Klassen', inNotes: 'Notizen', inResults: 'Ergebnisse', inMemberships: 'Mitgliedschaften', inLogs: 'Protokolle',
        docentiRicercatori: 'Lehrkräfte / Forschende', studenti: 'Lernende', altri: 'Andere',
    },
    sv: {
        title: 'Användare och klasser', subtitle: 'Lista över alla användare som har interagerat med appen och alla skapade klasser.',
        totalUsers: 'Totalt antal användare', totalGroups: 'Totalt antal klasser', refresh: 'Uppdatera', username: 'Användarnamn', role: 'Roll',
        groupsOwned: 'Klasser', plansCreated: 'Planer', notesWritten: 'Anteckningar', resultsSubmitted: 'Resultat', memberOf: 'Medlem i',
        tabsUsers: 'Användare', tabsGroups: 'Klasser', tabsSchools: 'Skolor', groups: 'Klasser', owner: 'Ägare', code: 'Kod',
        members: 'Medlemmar', school: 'Skola', noSchool: 'Ingen skola', studentsList: 'Studenter', noStudents: 'Inga studenter inskrivna.',
        classCol: 'Klass', status: 'Status', active: 'Aktiv', inactive: 'Inaktiv', created: 'Skapad den', search: 'Sök användare...',
        searchGroups: 'Sök klass...', noUsers: 'Inga användare hittades.', noGroups: 'Inga klasser hittades.', loading: 'Laddar...',
        inPlans: 'Planer', inGroups: 'Klasser', inNotes: 'Anteckningar', inResults: 'Resultat', inMemberships: 'Medlemskap', inLogs: 'Loggar',
        docentiRicercatori: 'Lärare / Forskare', studenti: 'Studenter', altri: 'Övriga',
    },
};

export function UsersSummaryPanel() {
    const { lang } = useI18n();
    const texts = TEXTS[lang] ?? TEXTS.en;
    const [data, setData] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [tab, setTab] = useState<'users' | 'groups' | 'schools'>('users');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiFetch('/api/admin/users-summary');
            if (res.ok) setData(await res.json());
        } catch (e) {
            console.error('Failed to load users summary', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const filteredUsers = useMemo(() => {
        if (!data) return [];
        const q = query.trim().toLowerCase();
        if (!q) return data.users;
        return data.users.filter((u) =>
            u.username.toLowerCase().includes(q) ||
            u.display_name.toLowerCase().includes(q),
        );
    }, [data, query]);

    const filteredGroups = useMemo(() => {
        if (!data) return [];
        const q = query.trim().toLowerCase();
        if (!q) return data.groups;
        return data.groups.filter((g) =>
            g.name.toLowerCase().includes(q) ||
            g.code.toLowerCase().includes(q) ||
            g.owner_username.toLowerCase().includes(q) ||
            (g.school || '').toLowerCase().includes(q),
        );
    }, [data, query]);

    // Classi raggruppate per scuola (null -> bucket "senza scuola" in coda)
    const schoolBuckets = useMemo(() => {
        const buckets = new Map<string, GroupEntry[]>();
        for (const group of filteredGroups) {
            const key = (group.school || '').trim();
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key)!.push(group);
        }
        return [...buckets.entries()].sort(([a], [b]) => {
            if (!a) return 1;
            if (!b) return -1;
            return a.localeCompare(b);
        });
    }, [filteredGroups]);

    const staffUsers = useMemo(() => filteredUsers.filter((u) => u.in_plans || u.in_groups || u.in_notes), [filteredUsers]);
    const studentUsers = useMemo(() => filteredUsers.filter((u) => !u.in_plans && !u.in_groups && !u.in_notes && (u.in_results || u.in_memberships)), [filteredUsers]);
    const otherUsers = useMemo(() => filteredUsers.filter((u) => !u.in_plans && !u.in_groups && !u.in_notes && !u.in_results && !u.in_memberships), [filteredUsers]);

    return (
        <div className="space-y-4">
            <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
                            <Users className="h-5 w-5 text-slate-500" /> {texts.title}
                        </h2>
                        <p className="mt-1 max-w-2xl text-sm text-slate-500">{texts.subtitle}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void load()}
                        className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        {texts.refresh}
                    </button>
                </div>
                {data && (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                            <p className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                                <UserCheck className="h-4 w-4" /> {texts.totalUsers}
                            </p>
                            <p className="mt-1 text-2xl font-bold text-indigo-700">{data.total_users}</p>
                        </div>
                        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                            <p className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                                <School className="h-4 w-4" /> {texts.totalGroups}
                            </p>
                            <p className="mt-1 text-2xl font-bold text-emerald-700">{data.total_groups}</p>
                        </div>
                    </div>
                )}
            </section>

            <div className="flex gap-1 rounded-md border border-slate-200 bg-white p-1">
                <button
                    type="button"
                    onClick={() => setTab('users')}
                    className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold ${tab === 'users' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                    <Users className="mr-1.5 inline h-4 w-4" />
                    {texts.tabsUsers} {data ? `(${data.total_users})` : ''}
                </button>
                <button
                    type="button"
                    onClick={() => setTab('groups')}
                    className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold ${tab === 'groups' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                    <School className="mr-1.5 inline h-4 w-4" />
                    {texts.tabsGroups} {data ? `(${data.total_groups})` : ''}
                </button>
                <button
                    type="button"
                    onClick={() => setTab('schools')}
                    className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold ${tab === 'schools' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                    <Building2 className="mr-1.5 inline h-4 w-4" />
                    {texts.tabsSchools}
                </button>
            </div>

            {tab === 'users' && (
                <>
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={texts.search}
                            className="h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-indigo-400"
                        />
                    </div>

                    {loading && <p className="text-sm text-slate-400">{texts.loading}</p>}
                    {!loading && data && staffUsers.length > 0 && (
                        <section className="rounded-lg border border-slate-200 bg-white p-4">
                            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-indigo-600">{texts.docentiRicercatori} ({staffUsers.length})</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                                            <th className="px-3 py-2">{texts.username}</th>
                                            <th className="px-3 py-2">{texts.groupsOwned}</th>
                                            <th className="px-3 py-2">{texts.plansCreated}</th>
                                            <th className="px-3 py-2">{texts.notesWritten}</th>
                                            <th className="px-3 py-2">{texts.resultsSubmitted}</th>
                                            <th className="px-3 py-2">{texts.memberOf}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {staffUsers.map((user) => (
                                            <tr key={user.username} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                                <td className="px-3 py-2.5">
                                                    <span className="font-medium text-slate-800">{user.display_name}</span>
                                                    <span className="block text-[10px] text-slate-400">{user.username}</span>
                                                </td>
                                                <td className="px-3 py-2.5 text-slate-600">{user.groups_count || '—'}</td>
                                                <td className="px-3 py-2.5 text-slate-600">{user.plans_count || '—'}</td>
                                                <td className="px-3 py-2.5 text-slate-600">{user.notes_count || '—'}</td>
                                                <td className="px-3 py-2.5 text-slate-600">{user.results_count || '—'}</td>
                                                <td className="px-3 py-2.5 text-slate-600">{user.memberships_count || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}

                    {studentUsers.length > 0 && (
                        <section className="rounded-lg border border-slate-200 bg-white p-4">
                            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-emerald-600">{texts.studenti} ({studentUsers.length})</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                                            <th className="px-3 py-2">{texts.username}</th>
                                            <th className="px-3 py-2">{texts.resultsSubmitted}</th>
                                            <th className="px-3 py-2">{texts.memberOf}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {studentUsers.map((user) => (
                                            <tr key={user.username} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                                <td className="px-3 py-2.5">
                                                    <span className="font-medium text-slate-800">{user.display_name}</span>
                                                    <span className="block text-[10px] text-slate-400">{user.username}</span>
                                                </td>
                                                <td className="px-3 py-2.5 text-slate-600">{user.results_count || '—'}</td>
                                                <td className="px-3 py-2.5 text-slate-600">{user.memberships_count || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}

                    {otherUsers.length > 0 && (
                        <section className="rounded-lg border border-slate-200 bg-white p-4">
                            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">{texts.altri} ({otherUsers.length})</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                                            <th className="px-3 py-2">{texts.username}</th>
                                            <th className="px-3 py-2">{texts.inLogs}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {otherUsers.map((user) => (
                                            <tr key={user.username} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                                <td className="px-3 py-2.5">
                                                    <span className="font-medium text-slate-800">{user.display_name}</span>
                                                    <span className="block text-[10px] text-slate-400">{user.username}</span>
                                                </td>
                                                <td className="px-3 py-2.5 text-slate-600">{user.in_logs ? '✓' : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}

                    {!loading && data && filteredUsers.length === 0 && (
                        <p className="text-sm text-slate-400">{texts.noUsers}</p>
                    )}
                </>
            )}

            {tab === 'groups' && (
                <>
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={texts.searchGroups}
                            className="h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-indigo-400"
                        />
                    </div>

                    {loading && <p className="text-sm text-slate-400">{texts.loading}</p>}
                    {data && !loading && (
                        <div className="space-y-3">
                            {filteredGroups.map((group) => (
                                <section key={group.id} className={`rounded-lg border border-slate-200 bg-white p-4 ${group.is_active ? '' : 'opacity-60'}`}>
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div>
                                            <h3 className="font-bold text-slate-800">{group.name}</h3>
                                            <p className="mt-0.5 text-xs text-slate-400">
                                                {texts.code}: <span className="font-mono font-semibold text-slate-600">{group.code}</span>
                                                {' · '}{texts.owner}: {group.owner_username}
                                                {' · '}{group.members_count} {texts.members}
                                                {group.school ? <>{' · '}{texts.school}: {group.school}</> : null}
                                            </p>
                                        </div>
                                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${group.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                            {group.is_active ? texts.active : texts.inactive}
                                        </span>
                                    </div>
                                    {group.created_at && (
                                        <p className="mt-2 text-xs text-slate-400">{texts.created}: {new Date(group.created_at).toLocaleDateString(lang, { year: 'numeric', month: '2-digit', day: '2-digit' })}</p>
                                    )}
                                </section>
                            ))}
                            {filteredGroups.length === 0 && (
                                <p className="text-sm text-slate-400">{texts.noGroups}</p>
                            )}
                        </div>
                    )}
                </>
            )}

            {tab === 'schools' && (
                <>
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={texts.searchGroups}
                            className="h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-indigo-400"
                        />
                    </div>

                    {loading && <p className="text-sm text-slate-400">{texts.loading}</p>}
                    {data && !loading && (
                        <div className="space-y-3">
                            {schoolBuckets.map(([school, schoolGroups]) => (
                                <section key={school || '—'} className="rounded-lg border border-slate-200 bg-white p-4">
                                    <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
                                        <Building2 className="h-4 w-4 text-slate-500" />
                                        {school || texts.noSchool}
                                        <span className="text-xs font-normal text-slate-400">
                                            ({schoolGroups.length} {texts.groups.toLowerCase()} · {schoolGroups.reduce((n, g) => n + g.members_count, 0)} {texts.members.toLowerCase()})
                                        </span>
                                    </h3>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-sm">
                                            <thead>
                                                <tr className="border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
                                                    <th className="px-3 py-2">{texts.classCol}</th>
                                                    <th className="px-3 py-2">{texts.owner}</th>
                                                    <th className="px-3 py-2">{texts.studentsList}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {schoolGroups.map((group) => (
                                                    <tr key={group.id} className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50">
                                                        <td className="px-3 py-2.5">
                                                            <span className="font-medium text-slate-800">{group.name}</span>
                                                            <span className="block font-mono text-[10px] text-slate-400">{group.code}</span>
                                                        </td>
                                                        <td className="px-3 py-2.5 text-slate-600">{group.owner_username}</td>
                                                        <td className="px-3 py-2.5 text-slate-600">
                                                            {group.members.length === 0 && <span className="text-slate-400">{texts.noStudents}</span>}
                                                            {group.members.length > 0 && (
                                                                <div className="flex flex-wrap gap-1">
                                                                    {group.members.map((member) => (
                                                                        <span key={member.username} title={member.username} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                                                                            {member.display_name}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </section>
                            ))}
                            {schoolBuckets.length === 0 && (
                                <p className="text-sm text-slate-400">{texts.noGroups}</p>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
