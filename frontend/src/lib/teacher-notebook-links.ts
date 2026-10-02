import type { Lang } from './i18n';

// Navigation only: no notebook content, selected class or creation parameters.
export const notebookToolLinks = [
    { field: 'classes_overview', href: '/docente/classi', label: 'classes' },
    { field: 'formation_interests', href: '/profilo/obiettivi', label: 'goals' },
    { field: 'notes', href: '/profilo/timeline', label: 'timeline' },
    { field: 'notes', href: '/profilo/portfolio', label: 'portfolio' },
] as const;

const texts = {
    classes: ['Gestisci gruppi e classi', 'Manage groups and classes', 'Gestionar grupos y clases', 'Gérer les groupes et classes', 'Gruppen und Klassen verwalten', 'Hantera grupper och klasser'],
    goals: ['Per la mia crescita: Obiettivi personali', 'For my development: Personal goals', 'Para mi desarrollo: Objetivos personales', 'Pour mon développement : Objectifs personnels', 'Für meine Entwicklung: Persönliche Ziele', 'För min utveckling: Personliga mål'],
    timeline: ['Per una tappa: Linea del tempo', 'For a milestone: Timeline', 'Para una etapa: Línea del tiempo', 'Pour une étape : Ligne du temps', 'Für einen Meilenstein: Zeitleiste', 'För en milstolpe: Tidslinje'],
    portfolio: ['Per un lavoro: Portfolio', 'For a piece of work: Portfolio', 'Para un trabajo: Portafolio', 'Pour un travail : Portfolio', 'Für eine Arbeit: Portfolio', 'För ett arbete: Portfolio'],
    saving: ['Salvataggio in corso: attendi prima di uscire.', 'Saving: wait before leaving.', 'Guardando: espera antes de salir.', 'Enregistrement en cours : attendez avant de quitter.', 'Speichern läuft: Warten Sie, bevor Sie die Seite verlassen.', 'Sparar: vänta innan du lämnar sidan.'],
} as const;

export function notebookLinkText(lang: Lang, key: keyof typeof texts): string {
    const index = ['it', 'en', 'es', 'fr', 'de', 'sv'].indexOf(lang);
    return texts[key][index < 0 ? 1 : index];
}
