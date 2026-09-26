import type { Lang } from './i18n';

const it = {
    assign: 'Assegna', received: 'Assegnazioni ricevute', sent: 'Assegnazioni effettuate',
    intro: 'Obiettivi, strategie e materiali assegnati dai docenti, con le loro indicazioni.',
    group: 'Gruppo o classe', choose: 'Scegli un gruppo o una classe', recipient: 'Destinatario',
    all: 'Intero gruppo o classe', instructions: 'Indicazioni del docente (facoltative)',
    current: 'L’assegnazione resta disponibile per tutta la classe, anche per chi si iscriverà in seguito, fino alla revoca.', recipients: 'Destinatari',
    send: 'Conferma assegnazione', cancel: 'Annulla', saved: 'Assegnazione inviata.',
    emptyTargets: 'Nessun gruppo o classe disponibile.',
    emptyReceived: 'Non hai ancora assegnazioni ricevute.', emptySent: 'Non hai ancora effettuato assegnazioni.',
    loading: 'Caricamento…', error: 'Operazione non riuscita. Riprova.', retry: 'Riprova',
    revoke: 'Revoca assegnazione', confirmRevoke: 'Revocare questa assegnazione per tutti i suoi destinatari?',
    revoked: 'Revocata', from: 'Assegnato da', where: 'Dove trovarlo', source: 'Fonte',
    goal: 'Obiettivo', strategy: 'Strategia', reading: 'Libro, film o altro materiale',
    // F31: blocco "Assegnazioni della classe" nella scheda gruppo di /docente/classi.
    groupAssignments: 'Assegnazioni della classe',
    groupAssignmentsEmpty: 'Nessuna assegnazione per questa classe o gruppo.',
    groupAssignmentsManage: 'Gestisci o assegna',
};
type Key = keyof typeof it;
const dictionaries: Record<Lang, Record<Key, string>> = {
    it,
    en: {
        assign: 'Assign', received: 'Received assignments', sent: 'Sent assignments', intro: 'Goals, strategies and resources assigned by teachers, with their instructions.',
        group: 'Group or class', choose: 'Choose a group or class', recipient: 'Recipient', all: 'Entire group or class', instructions: 'Teacher instructions (optional)', current: 'The assignment remains available to the entire class, including future members, until revoked.', recipients: 'Recipients', send: 'Confirm assignment', cancel: 'Cancel', saved: 'Assignment sent.', emptyTargets: 'No group or class is available.', emptyReceived: 'You have no received assignments yet.', emptySent: 'You have not sent any assignments yet.', loading: 'Loading…', error: 'Operation failed. Please try again.', retry: 'Retry', revoke: 'Revoke assignment', confirmRevoke: 'Revoke this assignment for all its recipients?', revoked: 'Revoked', from: 'Assigned by', where: 'Where to find it', source: 'Source', goal: 'Goal', strategy: 'Strategy', reading: 'Book, film or other resource',
        groupAssignments: 'Class assignments', groupAssignmentsEmpty: 'No assignments for this class or group.', groupAssignmentsManage: 'Manage or assign',
    },
    es: {
        assign: 'Asignar', received: 'Asignaciones recibidas', sent: 'Asignaciones realizadas', intro: 'Objetivos, estrategias y materiales asignados por docentes, con sus indicaciones.', group: 'Grupo o clase', choose: 'Elige un grupo o una clase', recipient: 'Destinatario', all: 'Todo el grupo o la clase', instructions: 'Indicaciones del docente (opcionales)', current: 'La asignación permanece disponible para toda la clase, incluidas las personas que se inscriban después, hasta que se revoque.', recipients: 'Destinatarios', send: 'Confirmar asignación', cancel: 'Cancelar', saved: 'Asignación enviada.', emptyTargets: 'No hay grupos o clases disponibles.', emptyReceived: 'Aún no has recibido asignaciones.', emptySent: 'Aún no has realizado asignaciones.', loading: 'Cargando…', error: 'La operación ha fallado. Inténtalo de nuevo.', retry: 'Reintentar', revoke: 'Revocar asignación', confirmRevoke: '¿Revocar esta asignación para todos sus destinatarios?', revoked: 'Revocada', from: 'Asignado por', where: 'Dónde encontrarlo', source: 'Fuente', goal: 'Objetivo', strategy: 'Estrategia', reading: 'Libro, película u otro material',
        groupAssignments: 'Asignaciones de la clase', groupAssignmentsEmpty: 'No hay asignaciones para esta clase o grupo.', groupAssignmentsManage: 'Gestionar o asignar',
    },
    fr: {
        assign: 'Attribuer', received: 'Attributions reçues', sent: 'Attributions effectuées', intro: 'Objectifs, stratégies et ressources attribués par les enseignants, avec leurs consignes.', group: 'Groupe ou classe', choose: 'Choisissez un groupe ou une classe', recipient: 'Destinataire', all: 'Tout le groupe ou la classe', instructions: 'Consignes de l’enseignant (facultatives)', current: 'L’attribution reste disponible pour toute la classe, y compris les futurs membres, jusqu’à sa révocation.', recipients: 'Destinataires', send: 'Confirmer l’attribution', cancel: 'Annuler', saved: 'Attribution envoyée.', emptyTargets: 'Aucun groupe ou classe disponible.', emptyReceived: 'Vous n’avez pas encore reçu d’attributions.', emptySent: 'Vous n’avez pas encore effectué d’attributions.', loading: 'Chargement…', error: 'L’opération a échoué. Réessayez.', retry: 'Réessayer', revoke: 'Révoquer l’attribution', confirmRevoke: 'Révoquer cette attribution pour tous ses destinataires ?', revoked: 'Révoquée', from: 'Attribué par', where: 'Où le trouver', source: 'Source', goal: 'Objectif', strategy: 'Stratégie', reading: 'Livre, film ou autre ressource',
        groupAssignments: 'Attributions de la classe', groupAssignmentsEmpty: 'Aucune attribution pour cette classe ou ce groupe.', groupAssignmentsManage: 'Gérer ou attribuer',
    },
    de: {
        assign: 'Zuweisen', received: 'Erhaltene Zuweisungen', sent: 'Gesendete Zuweisungen', intro: 'Von Lehrkräften zugewiesene Ziele, Strategien und Materialien mit ihren Hinweisen.', group: 'Gruppe oder Klasse', choose: 'Gruppe oder Klasse auswählen', recipient: 'Empfänger', all: 'Gesamte Gruppe oder Klasse', instructions: 'Hinweise der Lehrkraft (optional)', current: 'Die Zuweisung bleibt bis zum Widerruf für die gesamte Klasse verfügbar, auch für später angemeldete Mitglieder.', recipients: 'Empfänger', send: 'Zuweisung bestätigen', cancel: 'Abbrechen', saved: 'Zuweisung gesendet.', emptyTargets: 'Keine Gruppe oder Klasse verfügbar.', emptyReceived: 'Du hast noch keine Zuweisungen erhalten.', emptySent: 'Sie haben noch keine Zuweisungen gesendet.', loading: 'Wird geladen…', error: 'Der Vorgang ist fehlgeschlagen. Bitte erneut versuchen.', retry: 'Erneut versuchen', revoke: 'Zuweisung widerrufen', confirmRevoke: 'Diese Zuweisung für alle Empfänger widerrufen?', revoked: 'Widerrufen', from: 'Zugewiesen von', where: 'Bezugsquelle', source: 'Quelle', goal: 'Ziel', strategy: 'Strategie', reading: 'Buch, Film oder anderes Material',
        groupAssignments: 'Zuweisungen der Klasse', groupAssignmentsEmpty: 'Keine Zuweisungen für diese Klasse oder Gruppe.', groupAssignmentsManage: 'Verwalten oder zuweisen',
    },
    sv: {
        assign: 'Tilldela', received: 'Mottagna tilldelningar', sent: 'Skickade tilldelningar', intro: 'Mål, strategier och material som lärare har tilldelat, med deras anvisningar.', group: 'Grupp eller klass', choose: 'Välj en grupp eller klass', recipient: 'Mottagare', all: 'Hela gruppen eller klassen', instructions: 'Lärarens anvisningar (valfritt)', current: 'Tilldelningen är tillgänglig för hela klassen, även för framtida medlemmar, tills den återkallas.', recipients: 'Mottagare', send: 'Bekräfta tilldelning', cancel: 'Avbryt', saved: 'Tilldelningen har skickats.', emptyTargets: 'Ingen grupp eller klass finns tillgänglig.', emptyReceived: 'Du har inte fått några tilldelningar ännu.', emptySent: 'Du har inte skickat några tilldelningar ännu.', loading: 'Laddar…', error: 'Åtgärden misslyckades. Försök igen.', retry: 'Försök igen', revoke: 'Återkalla tilldelning', confirmRevoke: 'Återkalla denna tilldelning för alla mottagare?', revoked: 'Återkallad', from: 'Tilldelad av', where: 'Var den finns', source: 'Källa', goal: 'Mål', strategy: 'Strategi', reading: 'Bok, film eller annat material',
        groupAssignments: 'Klassens tilldelningar', groupAssignmentsEmpty: 'Inga tilldelningar för den här klassen eller gruppen.', groupAssignmentsManage: 'Hantera eller tilldela',
    },
};
export const assignmentText = (lang: Lang, key: Key) => dictionaries[lang][key];
