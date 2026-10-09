// Struttura dell'Area docenti, speculare a personal-area.ts: slugs raggruppati
// per scopo, immagini d'ingresso e testi in i18n-teacher-area.ts.
export const teacherAreaSlugs = ['istituti', 'classi', 'assegnazioni', 'catalogo-obiettivi', 'strategie', 'materiali', 'orientamento', 'somministrazioni', 'taccuino', 'taccuini-prova'] as const;
export type TeacherAreaSlug = (typeof teacherAreaSlugs)[number];

export const teacherAreaGroups = [
    { id: 'classroom', slugs: ['istituti', 'classi', 'assegnazioni'] },
    { id: 'catalogs', slugs: ['catalogo-obiettivi', 'strategie', 'materiali'] },
    { id: 'research', slugs: ['orientamento', 'somministrazioni'] },
] as const;

export const teacherAreaImages: Record<TeacherAreaSlug, string> = {
    taccuino: '/images/platform/su-di-me.png',
    'taccuini-prova': '/images/platform/chat-guidata.png',
    istituti: '/images/platform/classi.png',
    classi: '/images/platform/classi.png',
    assegnazioni: '/images/platform/assegnazioni.png',
    'catalogo-obiettivi': '/images/cards/focus_goal.png',
    strategie: '/images/cards/mind_mapping.png',
    materiali: '/images/cards/library_hall.png',
    orientamento: '/images/platform/bussola.png',
    somministrazioni: '/images/platform/eventi.png',
};
