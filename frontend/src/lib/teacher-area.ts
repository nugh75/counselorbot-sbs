// Struttura dell'Area docenti, speculare a personal-area.ts: slugs raggruppati
// per scopo, immagini d'ingresso e testi in i18n-teacher-area.ts.
export const teacherAreaSlugs = ['classi', 'assegnazioni', 'catalogo-obiettivi', 'strategie', 'materiali', 'orientamento', 'somministrazioni'] as const;
export type TeacherAreaSlug = (typeof teacherAreaSlugs)[number];

export const teacherAreaGroups = [
    { id: 'classroom', slugs: ['classi', 'assegnazioni'] },
    { id: 'catalogs', slugs: ['catalogo-obiettivi', 'strategie', 'materiali'] },
    { id: 'research', slugs: ['orientamento', 'somministrazioni'] },
] as const;

export const teacherAreaImages: Record<TeacherAreaSlug, string> = {
    classi: '/images/platform/classi.png',
    assegnazioni: '/images/platform/assegnazioni.png',
    'catalogo-obiettivi': '/images/cards/focus_goal.png',
    strategie: '/images/cards/mind_mapping.png',
    materiali: '/images/cards/library_hall.png',
    orientamento: '/images/platform/bussola.png',
    somministrazioni: '/images/platform/eventi.png',
};
