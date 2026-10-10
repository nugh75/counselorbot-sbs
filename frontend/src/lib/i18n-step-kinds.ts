// «+ Aggiungi passo» (#173): the step type choice shared by class paths and templates.
type Localized = readonly [string, string, string, string, string, string];

const texts = {
    addStep: ['+ Aggiungi passo', '+ Add step', '+ Añadir paso', '+ Ajouter une étape', '+ Schritt hinzufügen', '+ Lägg till steg'],
    question: [
        'Cosa fa lo studente in questo passo?', 'What does the student do in this step?', '¿Qué hace el estudiante en este paso?',
        'Que fait l’élève dans cette étape ?', 'Was macht die lernende Person in diesem Schritt?', 'Vad gör eleven i det här steget?',
    ],
    questionnaire: ['Compila un questionario', 'Fills in a questionnaire', 'Rellena un cuestionario', 'Remplit un questionnaire', 'Füllt einen Fragebogen aus', 'Fyller i en enkät'],
    guided_chat: ['Fa una chat guidata', 'Has a guided chat', 'Hace un chat guiado', 'Fait un chat guidé', 'Führt einen geführten Chat', 'Har en guidad chatt'],
    activity: ['Svolge un’attività', 'Does an activity', 'Realiza una actividad', 'Réalise une activité', 'Macht eine Aktivität', 'Gör en aktivitet'],
    tool: ['Usa uno strumento', 'Uses a tool', 'Usa una herramienta', 'Utilise un outil', 'Nutzt ein Werkzeug', 'Använder ett verktyg'],
    meeting: ['Partecipa a un incontro', 'Attends a meeting', 'Participa en un encuentro', 'Participe à une rencontre', 'Nimmt an einem Treffen teil', 'Deltar i ett möte'],
    discussion: ['Partecipa a una discussione', 'Joins a discussion', 'Participa en un debate', 'Participe à une discussion', 'Nimmt an einer Diskussion teil', 'Deltar i en diskussion'],
    meetingSoon: [
        'Gli incontri con la classe o il gruppo e gli appuntamenti individuali arrivano in un prossimo aggiornamento.',
        'Class or group meetings and individual appointments arrive in a coming update.',
        'Los encuentros con la clase o el grupo y las citas individuales llegan en una próxima actualización.',
        'Les rencontres de classe ou de groupe et les rendez-vous individuels arrivent dans une prochaine mise à jour.',
        'Treffen mit der Klasse oder Gruppe und Einzeltermine kommen mit einem nächsten Update.',
        'Möten med klassen eller gruppen och enskilda samtal kommer i en kommande uppdatering.',
    ],
    soon: ['in arrivo', 'coming soon', 'próximamente', 'bientôt', 'demnächst', 'kommer snart'],
    close: ['Chiudi', 'Close', 'Cerrar', 'Fermer', 'Schließen', 'Stäng'],
    chatOnResults: ['Sui risultati di un questionario del percorso', 'On the results of a questionnaire in the path', 'Sobre los resultados de un cuestionario del itinerario', 'Sur les résultats d’un questionnaire du parcours', 'Zu den Ergebnissen eines Fragebogens im Pfad', 'Om resultaten av en enkät i vägen'],
    chatStandalone: ['Percorso guidato: riflettere su un’esperienza o una scelta', 'Guided path: reflect on an experience or a choice', 'Recorrido guiado: reflexionar sobre una experiencia o una decisión', 'Parcours guidé : réfléchir à une expérience ou à un choix', 'Begleiteter Weg: über eine Erfahrung oder Entscheidung nachdenken', 'Vägledda samtal: reflektera över en erfarenhet eller ett val'],
    noChats: [
        'Nessun percorso guidato è abilitato per questa classe o gruppo.',
        'No guided path is enabled for this class or group.',
        'Ningún recorrido guiado está habilitado para esta clase o grupo.',
        'Aucun parcours guidé n’est activé pour cette classe ou ce groupe.',
        'Für diese Klasse oder Gruppe ist kein begleiteter Weg aktiviert.',
        'Inga vägledda samtal är aktiverade för den här klassen eller gruppen.',
    ],
    toolHelp: [
        'Solo strumenti personali: i questionari si aggiungono come «Compila un questionario», le chat guidate come «Fa una chat guidata».',
        'Personal tools only: questionnaires are added as «Fills in a questionnaire», guided chats as «Has a guided chat».',
        'Solo herramientas personales: los cuestionarios se añaden como «Rellena un cuestionario», los chats guiados como «Hace un chat guiado».',
        'Outils personnels seulement : les questionnaires s’ajoutent via « Remplit un questionnaire », les chats guidés via « Fait un chat guidé ».',
        'Nur persönliche Werkzeuge: Fragebögen über «Füllt einen Fragebogen aus», geführte Chats über «Führt einen geführten Chat».',
        'Bara personliga verktyg: enkäter läggs till som «Fyller i en enkät», guidade chattar som «Har en guidad chatt».',
    ],
    legacyQuestionnaire: [
        'Inserito come strumento: non raccoglie dati di somministrazione.',
        'Inserted as a tool: it collects no administration data.',
        'Insertado como herramienta: no recoge datos de administración.',
        'Inséré comme outil : il ne recueille pas de données de passation.',
        'Als Werkzeug eingefügt: Es erfasst keine Erhebungsdaten.',
        'Infogad som verktyg: den samlar inga administreringsdata.',
    ],
} satisfies Record<string, Localized>;

export type StepKindTextKey = keyof typeof texts;
const languages = ['it', 'en', 'es', 'fr', 'de', 'sv'];

export function stepKindText(lang: string, key: StepKindTextKey): string {
    return texts[key][Math.max(0, languages.indexOf(lang))];
}
