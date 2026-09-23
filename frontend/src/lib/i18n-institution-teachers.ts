import type { Lang } from './i18n';

const languages: readonly Lang[] = ['it', 'en', 'es', 'fr', 'de', 'sv'];
const labels = {
    title: ['Docenti dell’istituto', 'Institution teachers', 'Docentes de la institución', 'Enseignants de l’établissement', 'Lehrkräfte der Einrichtung', 'Institutionens lärare'],
    hint: ['Inserisci l’identificativo esatto dell’account. L’associazione è valida per l’accesso solo se l’account ha già il ruolo docente.', 'Enter the exact account username. Membership grants access only if the account already has the teacher role.', 'Introduce el identificador exacto de la cuenta. La asociación permite el acceso solo si la cuenta ya tiene el rol docente.', 'Saisissez l’identifiant exact du compte. L’association permet l’accès uniquement si le compte a déjà le rôle enseignant.', 'Gib den genauen Benutzernamen ein. Die Zuordnung erlaubt den Zugriff nur, wenn das Konto bereits die Lehrkraftrolle hat.', 'Ange kontots exakta användarnamn. Kopplingen ger åtkomst endast om kontot redan har lärarrollen.'],
    account: ['Account docente', 'Teacher account', 'Cuenta docente', 'Compte enseignant', 'Lehrkraftkonto', 'Lärarkonto'],
    associate: ['Associa', 'Associate', 'Asociar', 'Associer', 'Zuordnen', 'Koppla'],
    revoke: ['Revoca', 'Revoke', 'Revocar', 'Révoquer', 'Widerrufen', 'Återkalla'],
    empty: ['Nessun docente associato.', 'No teachers associated.', 'No hay docentes asociados.', 'Aucun enseignant associé.', 'Keine Lehrkräfte zugeordnet.', 'Inga lärare är kopplade.'],
    inactive: ['Istituto disattivato: le abilitazioni sono sospese e non puoi aggiungere docenti.', 'Inactive institution: access is suspended and teachers cannot be added.', 'Institución desactivada: los permisos están suspendidos y no puedes añadir docentes.', 'Établissement désactivé : les accès sont suspendus et aucun enseignant ne peut être ajouté.', 'Einrichtung deaktiviert: Zugriffe sind ausgesetzt und Lehrkräfte können nicht hinzugefügt werden.', 'Inaktiverad institution: åtkomsten är avstängd och lärare kan inte läggas till.'],
    loading: ['Caricamento docenti…', 'Loading teachers…', 'Cargando docentes…', 'Chargement des enseignants…', 'Lehrkräfte werden geladen…', 'Laddar lärare…'],
    loadError: ['Non riesco a caricare i docenti associati.', 'Associated teachers could not be loaded.', 'No se han podido cargar los docentes asociados.', 'Impossible de charger les enseignants associés.', 'Zugeordnete Lehrkräfte konnten nicht geladen werden.', 'Det gick inte att ladda kopplade lärare.'],
    saveError: ['Operazione non completata. Controlla l’account e ricarica l’elenco prima di riprovare.', 'The operation could not be completed. Check the account and reload the list before trying again.', 'No se ha completado la operación. Revisa la cuenta y recarga la lista antes de reintentarlo.', 'L’opération n’a pas abouti. Vérifiez le compte et rechargez la liste avant de réessayer.', 'Der Vorgang konnte nicht abgeschlossen werden. Prüfe das Konto und lade die Liste vor einem neuen Versuch neu.', 'Åtgärden kunde inte slutföras. Kontrollera kontot och ladda om listan innan du försöker igen.'],
    retry: ['Ricarica elenco', 'Reload list', 'Recargar lista', 'Recharger la liste', 'Liste neu laden', 'Ladda om listan'],
} satisfies Record<string, readonly [string, string, string, string, string, string]>;

export const institutionTeacherText = (lang: Lang, key: keyof typeof labels) => labels[key][Math.max(0, languages.indexOf(lang))];
