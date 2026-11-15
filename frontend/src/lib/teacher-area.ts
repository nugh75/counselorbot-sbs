// Struttura dell'Area docenti, speculare a personal-area.ts: slugs raggruppati
// per scopo, illustrazioni d'ingresso e testi in i18n-teacher-area.ts.
import type { AreaIllustrationId } from './tool-illustrations';

export const teacherAreaSlugs = ['istituti', 'classi', 'compilazioni', 'piani-operativi', 'incontri', 'assegnazioni', 'catalogo-obiettivi', 'strategie', 'materiali', 'orientamento', 'somministrazioni', 'dispositivi', 'taccuino', 'taccuini-prova'] as const;
export type TeacherAreaSlug = (typeof teacherAreaSlugs)[number];

export const teacherAreaGroups = [
    { id: 'classroom', slugs: ['classi', 'piani-operativi', 'assegnazioni', 'incontri', 'compilazioni', 'orientamento', 'istituti'] },
    { id: 'resources', slugs: ['catalogo-obiettivi', 'strategie', 'materiali'] },
    { id: 'research', slugs: ['somministrazioni'] },
] as const;

export const teacherAreaIllustrations: Record<TeacherAreaSlug, AreaIllustrationId> = {
    taccuino: 'area-notebook',
    'taccuini-prova': 'area-test-students',
    istituti: 'area-school',
    classi: 'area-classes',
    compilazioni: 'area-responses',
    'piani-operativi': 'area-plan',
    incontri: 'area-meetings',
    assegnazioni: 'area-assignments',
    'catalogo-obiettivi': 'area-goal',
    strategie: 'area-strategy',
    materiali: 'area-library',
    orientamento: 'area-compass',
    somministrazioni: 'area-research',
    dispositivi: 'area-devices',
};
