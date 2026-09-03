'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Link2, Plus, Share2, Trash2, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { apiFetch } from '@/lib/auth';
import { fetchInstitutions, type Institution } from '@/lib/referrals-api';
import { PlanStudentsPanel } from './PlanStudentsPanel';

interface StudentGroup {
    id: number;
    code: string;
    name: string;
    school: string | null;
    school_level: string | null;
    institution_id: number | null;
    owner_username: string;
    is_active: boolean;
    members_count: number;
    created_at: string | null;
}

// Local copy is complete for every supported interface language.
const TEXTS = {
    it: {
        title: 'Gruppi e classi',
        subtitle: 'Le tue classi: gli studenti entrano con il link di invito (web o Telegram) o inserendo il codice classe dall’area personale. Aggancia la classe a un piano di somministrazione per taggare i risultati.',
        newGroup: 'Nuova classe',
        namePlaceholder: 'Nome classe (es. 3B Informatica)',
        schoolPlaceholder: 'Scuola/istituto (opzionale)',
        school: 'Scuola',
        levelLabel: 'Fascia',
        levelNone: 'Fascia non indicata',
        levelSecondaria: 'Secondaria',
        levelUniversita: 'Universita',
        levelAdulti: 'Adulti',
        levelHint: 'Filtra le letture consigliate: senza fascia il bot chiede allo studente a che punto degli studi si trova.',
        institutionLabel: 'Istituto',
        institutionNone: 'Nessun istituto',
        institutionHint: "Alimenta il fallback per gli studenti che non scelgono l'istituto nel taccuino.",
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
        shareTitle: 'Condivisa con',
        shareBtn: 'Aggiungi selezionati',
        sharedWith: 'Condivisa con',
        removeShare: 'Rimuovi',
        noShares: 'Non condivisa con altri.',
        shareError: 'Condivisione non riuscita.',
        shareSelectUsers: 'Seleziona utenti da aggiungere',
        shareAlreadyShared: 'gia\' condivisa',
        shareNoUsers: 'Nessun utente disponibile.',
    },
    en: {
        title: 'Groups and classes',
        subtitle: 'Your classes: students join via the invitation link (web or Telegram) or by entering the class code from their personal area. Attach the class to an administration plan to tag results.',
        newGroup: 'New class',
        namePlaceholder: 'Class name (e.g. 3B Computer Science)',
        schoolPlaceholder: 'School/institute (optional)',
        school: 'School',
        levelLabel: 'Level',
        levelNone: 'No level set',
        levelSecondaria: 'Secondary',
        levelUniversita: 'University',
        levelAdulti: 'Adults',
        levelHint: 'Filters the readings the bot may suggest: with no level it asks the student where they are in their studies.',
        institutionLabel: 'Institution',
        institutionNone: 'No institution',
        institutionHint: 'Feeds the fallback for students who never choose an institution in their notebook.',
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
        shareTitle: 'Shared with',
        shareBtn: 'Add selected',
        sharedWith: 'Shared with',
        removeShare: 'Remove',
        noShares: 'Not shared with anyone.',
        shareError: 'Share failed.',
        shareSelectUsers: 'Select users to add',
        shareAlreadyShared: 'already shared',
        shareNoUsers: 'No users available.',
    },
    es: {
        title: 'Grupos y clases',
        subtitle: 'Tus clases: los estudiantes entran mediante el enlace de invitación (web o Telegram) o introduciendo el código de clase desde su área personal. Vincula la clase a un plan de administración para etiquetar los resultados.',
        newGroup: 'Nueva clase', namePlaceholder: 'Nombre de la clase (p. ej., 3B Informática)',
        schoolPlaceholder: 'Escuela o centro (opcional)', school: 'Escuela', levelLabel: 'Nivel', levelNone: 'Nivel no indicado',
        levelSecondaria: 'Secundaria', levelUniversita: 'Universidad', levelAdulti: 'Adultos',
        levelHint: 'Filtra las lecturas recomendadas: sin un nivel, el bot pregunta al estudiante en qué etapa de sus estudios se encuentra.',
        institutionLabel: 'Institución', institutionNone: 'Sin institución',
        institutionHint: 'Alimenta el resguardo para los estudiantes que nunca eligen una institución en su cuaderno.',
        create: 'Crear', cancel: 'Cancelar', members: 'miembros', inactive: 'inactiva', webLink: 'Enlace de invitación',
        telegramLink: 'Enlace de Telegram', code: 'Código de clase', students: 'Estudiantes', deactivate: 'Desactivar',
        activate: 'Reactivar', deleteGroup: 'Eliminar', empty: 'Aún no hay clases. Crea una y comparte el enlace con tus estudiantes.',
        privacy: 'Los estudiantes que se unen ven el aviso: el docente o investigador de la clase puede consultar los resultados y las conversaciones.',
        error: 'La operación ha fallado.', shareTitle: 'Compartida con', shareBtn: 'Añadir seleccionados', sharedWith: 'Compartida con',
        removeShare: 'Quitar', noShares: 'No compartida con nadie.', shareError: 'No se pudo compartir.',
        shareSelectUsers: 'Selecciona usuarios para añadir', shareAlreadyShared: 'ya compartida', shareNoUsers: 'No hay usuarios disponibles.',
    },
    fr: {
        title: 'Groupes et classes',
        subtitle: 'Vos classes : les étudiants rejoignent la classe grâce au lien d’invitation (web ou Telegram) ou en saisissant le code depuis leur espace personnel. Associez la classe à un plan de passation pour étiqueter les résultats.',
        newGroup: 'Nouvelle classe', namePlaceholder: 'Nom de la classe (ex. 3B Informatique)',
        schoolPlaceholder: 'École ou établissement (facultatif)', school: 'École', levelLabel: 'Niveau', levelNone: 'Niveau non indiqué',
        levelSecondaria: 'Secondaire', levelUniversita: 'Université', levelAdulti: 'Adultes',
        levelHint: 'Filtre les lectures recommandées : sans niveau, le bot demande à l’étudiant où il en est dans ses études.',
        institutionLabel: 'Établissement', institutionNone: 'Aucun établissement',
        institutionHint: "Alimente le repli pour les étudiants qui ne choisissent jamais d'établissement dans leur carnet.",
        create: 'Créer', cancel: 'Annuler', members: 'membres', inactive: 'inactive', webLink: 'Lien d’invitation',
        telegramLink: 'Lien Telegram', code: 'Code de classe', students: 'Étudiants', deactivate: 'Désactiver',
        activate: 'Réactiver', deleteGroup: 'Supprimer', empty: 'Aucune classe. Créez-en une et partagez le lien avec vos étudiants.',
        privacy: 'Les étudiants qui rejoignent la classe voient l’avis : l’enseignant ou le chercheur peut consulter les résultats et les conversations.',
        error: 'L’opération a échoué.', shareTitle: 'Partagée avec', shareBtn: 'Ajouter la sélection', sharedWith: 'Partagée avec',
        removeShare: 'Retirer', noShares: 'Partagée avec personne.', shareError: 'Échec du partage.',
        shareSelectUsers: 'Sélectionnez les utilisateurs à ajouter', shareAlreadyShared: 'déjà partagée', shareNoUsers: 'Aucun utilisateur disponible.',
    },
    de: {
        title: 'Gruppen und Klassen',
        subtitle: 'Ihre Klassen: Lernende treten über den Einladungslink (Web oder Telegram) oder durch Eingabe des Klassencodes in ihrem persönlichen Bereich bei. Verknüpfen Sie die Klasse mit einem Durchführungsplan, um Ergebnisse zuzuordnen.',
        newGroup: 'Neue Klasse', namePlaceholder: 'Klassenname (z. B. 3B Informatik)',
        schoolPlaceholder: 'Schule oder Einrichtung (optional)', school: 'Schule', levelLabel: 'Stufe', levelNone: 'Keine Stufe angegeben',
        levelSecondaria: 'Sekundarstufe', levelUniversita: 'Universität', levelAdulti: 'Erwachsene',
        levelHint: 'Filtert empfohlene Lektüren: Ohne Stufe fragt der Bot die Lernenden nach ihrem Ausbildungsstand.',
        institutionLabel: 'Einrichtung', institutionNone: 'Keine Einrichtung',
        institutionHint: 'Speist den Fallback für Lernende, die im Lernheft nie eine Einrichtung wählen.',
        create: 'Erstellen', cancel: 'Abbrechen', members: 'Mitglieder', inactive: 'inaktiv', webLink: 'Einladungslink',
        telegramLink: 'Telegram-Link', code: 'Klassencode', students: 'Lernende', deactivate: 'Deaktivieren',
        activate: 'Reaktivieren', deleteGroup: 'Löschen', empty: 'Noch keine Klassen. Erstellen Sie eine und teilen Sie den Link mit den Lernenden.',
        privacy: 'Beitretende Lernende sehen den Hinweis: Die Lehrkraft oder Forschungsperson der Klasse kann Ergebnisse und Unterhaltungen einsehen.',
        error: 'Der Vorgang ist fehlgeschlagen.', shareTitle: 'Geteilt mit', shareBtn: 'Ausgewählte hinzufügen', sharedWith: 'Geteilt mit',
        removeShare: 'Entfernen', noShares: 'Mit niemandem geteilt.', shareError: 'Teilen fehlgeschlagen.',
        shareSelectUsers: 'Hinzuzufügende Benutzer auswählen', shareAlreadyShared: 'bereits geteilt', shareNoUsers: 'Keine Benutzer verfügbar.',
    },
    sv: {
        title: 'Grupper och klasser',
        subtitle: 'Dina klasser: studenter går med via inbjudningslänken (webb eller Telegram) eller genom att ange klasskoden i sin personliga vy. Koppla klassen till en genomförandeplan för att märka resultaten.',
        newGroup: 'Ny klass', namePlaceholder: 'Klassnamn (t.ex. 3B Datavetenskap)',
        schoolPlaceholder: 'Skola eller lärosäte (valfritt)', school: 'Skola', levelLabel: 'Nivå', levelNone: 'Ingen nivå angiven',
        levelSecondaria: 'Gymnasienivå', levelUniversita: 'Universitet', levelAdulti: 'Vuxna',
        levelHint: 'Filtrerar rekommenderad läsning: utan nivå frågar boten studenten var i utbildningen hen befinner sig.',
        institutionLabel: 'Institution', institutionNone: 'Ingen institution',
        institutionHint: 'Förser reservvärdet för studenter som aldrig väljer en institution i sin anteckningsbok.',
        create: 'Skapa', cancel: 'Avbryt', members: 'medlemmar', inactive: 'inaktiv', webLink: 'Inbjudningslänk',
        telegramLink: 'Telegram-länk', code: 'Klasskod', students: 'Studenter', deactivate: 'Inaktivera',
        activate: 'Återaktivera', deleteGroup: 'Ta bort', empty: 'Inga klasser ännu. Skapa en och dela länken med dina studenter.',
        privacy: 'Studenter som går med ser informationen: klassens lärare eller forskare kan se resultat och samtal.',
        error: 'Åtgärden misslyckades.', shareTitle: 'Delad med', shareBtn: 'Lägg till valda', sharedWith: 'Delad med',
        removeShare: 'Ta bort', noShares: 'Inte delad med någon.', shareError: 'Delningen misslyckades.',
        shareSelectUsers: 'Välj användare att lägga till', shareAlreadyShared: 'redan delad', shareNoUsers: 'Inga användare tillgängliga.',
    },
};

export function GroupsPanel() {
    const { lang } = useI18n();
    const texts = TEXTS[lang as keyof typeof TEXTS] ?? TEXTS.en;
    const [groups, setGroups] = useState<StudentGroup[] | null>(null);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newSchool, setNewSchool] = useState('');
    const [newLevel, setNewLevel] = useState('');
    const [newInstitutionId, setNewInstitutionId] = useState('');
    const [institutions, setInstitutions] = useState<Institution[]>([]);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [openStudentsId, setOpenStudentsId] = useState<number | null>(null);
    const [origin, setOrigin] = useState('');
    const [botUsername, setBotUsername] = useState('');
    const [shares, setShares] = useState<Record<number, { id: number; shared_with_username: string }[]>>({});
    const [allUsers, setAllUsers] = useState<{ username: string; display_name: string; in_plans: boolean; in_groups: boolean; in_notes: boolean; in_research_contacts: boolean; research_contact_id: number | null }[]>([]);
    const [selectedShares, setSelectedShares] = useState<Record<number, Set<string>>>({});
    const [shareOpen, setShareOpen] = useState<number | null>(null);

    useEffect(() => { setOrigin(window.location.origin); }, []);
    useEffect(() => {
        fetchInstitutions().then(setInstitutions).catch(() => setInstitutions([]));
    }, []);
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

    const loadShares = useCallback(async (groupId: number) => {
        const res = await apiFetch(`/api/admin/groups/${groupId}/shares`);
        if (res.ok) {
            const data: { id: number; shared_with_username: string }[] = await res.json();
            setShares((prev) => ({ ...prev, [groupId]: data }));
        }
    }, []);

    const loadUsers = useCallback(async () => {
        const res = await apiFetch('/api/admin/users-summary');
        if (res.ok) {
            const data: { users: { username: string; display_name: string; in_plans: boolean; in_groups: boolean; in_notes: boolean; in_research_contacts: boolean; research_contact_id: number | null }[] } = await res.json();
            setAllUsers(data.users);
        }
    }, []);

    const addShares = async (groupId: number) => {
        const selected = selectedShares[groupId];
        if (!selected || selected.size === 0) return;
        setBusy(true);
        setMessage('');
        try {
            let failed = false;
            for (const username of selected) {
                const res = await apiFetch(`/api/admin/groups/${groupId}/shares`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ shared_with_username: username }),
                });
                // 409 = gia' condivisa: non e' un errore da mostrare
                if (!res.ok && res.status !== 409) failed = true;
            }
            if (failed) setMessage(texts.shareError);
            setSelectedShares((prev) => ({ ...prev, [groupId]: new Set() }));
            await loadShares(groupId);
        } catch {
            setMessage(texts.shareError);
        } finally {
            setBusy(false);
        }
    };

    const removeShare = async (groupId: number, shareId: number) => {
        setBusy(true);
        try {
            await apiFetch(`/api/admin/groups/${groupId}/shares/${shareId}`, { method: 'DELETE' });
            await loadShares(groupId);
        } finally {
            setBusy(false);
        }
    };

    const toggleSelected = (groupId: number, username: string) => {
        setSelectedShares((prev) => {
            const current = prev[groupId] || new Set();
            const next = new Set(current);
            if (next.has(username)) {
                next.delete(username);
            } else {
                next.add(username);
            }
            return { ...prev, [groupId]: next };
        });
    };

    const toggleShare = (groupId: number) => {
        if (shareOpen === groupId) {
            setShareOpen(null);
        } else {
            setShareOpen(groupId);
            if (!shares[groupId]) loadShares(groupId);
            if (allUsers.length === 0) loadUsers();
            setSelectedShares((prev) => ({ ...prev, [groupId]: new Set() }));
        }
    };

    const copy = async (key: string, text: string) => {
        if (!navigator.clipboard) return;
        await navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 1500);
    };

    const updateLevel = async (groupId: number, level: string) => {
        try {
            const res = await apiFetch(`/api/admin/groups/${groupId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ school_level: level || null }),
            });
            if (!res.ok) throw new Error('update failed');
            load();
        } catch {
            setMessage(texts.error);
        }
    };

    const updateInstitution = async (groupId: number, institutionId: string) => {
        try {
            const res = await apiFetch(`/api/admin/groups/${groupId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ institution_id: institutionId ? Number(institutionId) : null }),
            });
            if (!res.ok) throw new Error('update failed');
            load();
        } catch {
            setMessage(texts.error);
        }
    };

    const create = async () => {
        if (!newName.trim()) return;
        setBusy(true);
        setMessage('');
        try {
            const res = await apiFetch('/api/admin/groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newName.trim(),
                    school: newSchool.trim() || null,
                    school_level: newLevel || null,
                    institution_id: newInstitutionId ? Number(newInstitutionId) : null,
                }),
            });
            if (!res.ok) throw new Error('create failed');
            setNewName('');
            setNewSchool('');
            setNewLevel('');
            setNewInstitutionId('');
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
                    <input
                        value={newSchool}
                        onChange={(event) => setNewSchool(event.target.value)}
                        placeholder={texts.schoolPlaceholder}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                    <select
                        value={newLevel}
                        onChange={(event) => setNewLevel(event.target.value)}
                        title={texts.levelHint}
                        aria-label={texts.levelLabel}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-48"
                    >
                        <option value="">{texts.levelNone}</option>
                        <option value="secondaria">{texts.levelSecondaria}</option>
                        <option value="universita">{texts.levelUniversita}</option>
                        <option value="adulti">{texts.levelAdulti}</option>
                    </select>
                    <select
                        value={newInstitutionId}
                        onChange={(event) => setNewInstitutionId(event.target.value)}
                        title={texts.institutionHint}
                        aria-label={texts.institutionLabel}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-48"
                    >
                        <option value="">{texts.institutionNone}</option>
                        {institutions.map((institution) => (
                            <option key={institution.id} value={String(institution.id)}>{institution.name}</option>
                        ))}
                    </select>
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
                            onClick={() => { setCreating(false); setNewName(''); setNewSchool(''); }}
                            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}

            {message && <p className="text-sm text-red-600">{message}</p>}
            {groups !== null && groups.length === 0 && <p className="text-sm text-slate-500">{texts.empty}</p>}

            <div className="space-y-3">
                {(groups || []).map((group) => (
                    <section key={group.id} className={`rounded-md border border-slate-200 bg-white p-4 ${group.is_active ? '' : 'opacity-60'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <h3 className="font-bold text-slate-800">
                                    {group.name}
                                    {!group.is_active && <span className="ml-2 text-xs font-normal text-slate-500">({texts.inactive})</span>}
                                </h3>
                                <p className="text-xs text-slate-500">
                                    {texts.code}: <span className="font-mono font-semibold text-slate-600">{group.code}</span>
                                    {' - '}{group.members_count} {texts.members}
                                    {' - '}{group.owner_username}
                                    {group.school ? ` - ${texts.school}: ${group.school}` : ''}
                                    {' - '}
                                    <select
                                        value={group.school_level ?? ''}
                                        aria-label={texts.levelLabel}
                                        title={texts.levelHint}
                                        onChange={(event) => void updateLevel(group.id, event.target.value)}
                                        className="rounded border border-slate-200 bg-white px-1 py-0.5 text-xs text-slate-600"
                                    >
                                        <option value="">{texts.levelNone}</option>
                                        <option value="secondaria">{texts.levelSecondaria}</option>
                                        <option value="universita">{texts.levelUniversita}</option>
                                        <option value="adulti">{texts.levelAdulti}</option>
                                    </select>
                                    {' - '}
                                    <select
                                        value={group.institution_id === null ? '' : String(group.institution_id)}
                                        aria-label={texts.institutionLabel}
                                        title={texts.institutionHint}
                                        onChange={(event) => void updateInstitution(group.id, event.target.value)}
                                        className="rounded border border-slate-200 bg-white px-1 py-0.5 text-xs text-slate-600"
                                    >
                                        <option value="">{texts.institutionNone}</option>
                                        {institutions.map((institution) => (
                                            <option key={institution.id} value={String(institution.id)}>{institution.name}</option>
                                        ))}
                                    </select>
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
                        <p className="mt-2 text-xs text-slate-500">{texts.privacy}</p>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => toggleShare(group.id)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                            >
                                <Share2 className="h-3.5 w-3.5" />
                                {texts.shareTitle}
                                {shares[group.id]?.length ? ` (${shares[group.id].length})` : ''}
                            </button>
                        </div>

                        {shareOpen === group.id && (
                            <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                                <p className="mb-2 text-xs font-semibold text-slate-500">{texts.shareSelectUsers}</p>
                                <div className="max-h-40 space-y-1 overflow-y-auto">
                                    {allUsers
                                        .filter((u) => u.in_research_contacts || u.in_plans || u.in_groups || u.in_notes)
                                        .filter((u) => u.username !== group.owner_username)
                                        .map((user) => {
                                            const alreadyShared = shares[group.id]?.some((s) => s.shared_with_username === user.username);
                                            const selected = selectedShares[group.id]?.has(user.username) ?? false;
                                            return (
                                                <label key={user.username} className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-white">
                                                    <input
                                                        type="checkbox"
                                                        checked={selected}
                                                        disabled={busy || !!alreadyShared}
                                                        onChange={() => toggleSelected(group.id, user.username)}
                                                        className="accent-indigo-600"
                                                    />
                                                    <span className="flex-1 text-slate-700">
                                                        {user.display_name}
                                                        <span className="ml-1 text-2xs text-slate-500">{user.username}</span>
                                                    </span>
                                                    {alreadyShared && (
                                                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-2xs font-medium text-slate-500">
                                                            {texts.shareAlreadyShared}
                                                        </span>
                                                    )}
                                                </label>
                                            );
                                        })}
                                    {allUsers.filter((u) => u.in_research_contacts || u.in_plans || u.in_groups || u.in_notes).length === 0 && (
                                        <p className="text-xs text-slate-500">{texts.shareNoUsers}</p>
                                    )}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        disabled={busy || !selectedShares[group.id]?.size}
                                        onClick={() => void addShares(group.id)}
                                        className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                                    >
                                        <UserPlus className="h-3.5 w-3.5" />
                                        {texts.shareBtn}
                                    </button>
                                </div>
                                {shares[group.id]?.length > 0 && (
                                    <div className="mt-3">
                                        <p className="mb-1 text-xs font-semibold text-slate-500">{texts.sharedWith}</p>
                                        <div className="space-y-1">
                                            {shares[group.id]?.map((share) => (
                                                <div key={share.id} className="flex items-center justify-between rounded-md bg-white px-2 py-1.5 text-xs">
                                                    <span className="text-slate-700">
                                                        {allUsers.find((u) => u.username === share.shared_with_username)?.display_name || share.shared_with_username}
                                                        <span className="ml-1 text-2xs text-slate-500">{share.shared_with_username}</span>
                                                    </span>
                                                    <button
                                                        type="button"
                                                        disabled={busy}
                                                        onClick={() => void removeShare(group.id, share.id)}
                                                        className="inline-flex items-center gap-1 text-red-500 hover:text-red-700"
                                                    >
                                                        <UserMinus className="h-3.5 w-3.5" />
                                                        {texts.removeShare}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {(!shares[group.id] || shares[group.id].length === 0) && (
                                    <p className="mt-2 text-xs text-slate-500">{texts.noShares}</p>
                                )}
                            </div>
                        )}

                        {openStudentsId === group.id && (
                            <PlanStudentsPanel base={`/api/admin/groups/${group.id}`} withNotes />
                        )}
                    </section>
                ))}
            </div>
        </div>
    );
}
