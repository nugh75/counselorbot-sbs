// @ts-expect-error -- Node's TypeScript runner requires the extension.
import { guideTaskCopy, type GuideTaskId } from './i18n-guide-tasks.ts';
export type GuideAudience = 'student' | 'teacher' | 'admin';
export type GuideGroup = 'start' | 'plans' | 'chat' | 'study' | 'tools' | 'data';
export const GUIDE_GROUPS: GuideGroup[] = ['start', 'plans', 'chat', 'study', 'tools', 'data'];
export interface GuideTask {
    id: GuideTaskId;
    audience: GuideAudience[];
    group: GuideGroup;
    href: string;
    image: string;
    crop?: readonly [x: number, y: number, width: number, height: number];
    related?: GuideTaskId[];
    important?: boolean;
    feature?: 'personalAPI' | 'chatgpt';
}
const student: GuideAudience[] = ['student'];
const teacher: GuideAudience[] = ['teacher'];
const admin: GuideAudience[] = ['admin'];
export const GUIDE_TASKS: GuideTask[] = [
    {id: 'start', audience: student, group: 'start', href: '/?view=intro', image: 'access', related: ['counselor', 'orientation']},
    {id: 'counselor', audience: student, group: 'start', href: '/counselor', image: 'counselors', important: true, related: ['sharing', 'chat']},
    {id: 'orientation', audience: ['student', 'teacher'], group: 'start', href: '/bussola', image: 'introduction', related: ['questionnaires']},
    {id: 'resume', audience: student, group: 'plans', href: '/profilo/piani-operativi', image: 'plan-attempt', related: ['repeat', 'meetings', 'forum']},
    {id: 'repeat', audience: student, group: 'plans', href: '/profilo/piani-operativi', image: 'plan-attempt', related: ['resume', 'questionnaires']},
    {id: 'meetings', audience: student, group: 'plans', href: '/profilo/piani-operativi', image: 'calendar', related: ['timeline']},
    {id: 'forum', audience: student, group: 'plans', href: '/profilo/classi', image: 'class-forum', important: true, related: ['resume']},
    {id: 'questionnaires', audience: student, group: 'chat', href: '/?view=home', image: 'tool-selection', important: true, related: ['chat', 'repeat']},
    {id: 'chat', audience: student, group: 'chat', href: '/?view=home', image: 'guided-chat', related: ['counselor', 'resume']},
    {id: 'pdf', audience: student, group: 'study', href: '/profilo/pqbl', image: 'pdf-study', related: ['flashcards']},
    {id: 'flashcards', audience: student, group: 'study', href: '/profilo/flashcard', image: 'flashcards', related: ['pdf', 'ideas']},
    {id: 'notebook', audience: student, group: 'tools', href: '/profilo/taccuino', image: 'notebook', important: true, related: ['sharing', 'goals']},
    {id: 'goals', audience: student, group: 'tools', href: '/profilo/obiettivi', image: 'personal-goals', related: ['timeline', 'assignments']},
    {id: 'timeline', audience: student, group: 'tools', href: '/profilo/timeline', image: 'calendar', related: ['goals', 'events']},
    {id: 'ideas', audience: student, group: 'tools', href: '/profilo/carte', image: 'cards', related: ['flashcards', 'goals']},
    {id: 'events', audience: ['student', 'teacher'], group: 'tools', href: '/?view=home', image: 'study-event', related: ['timeline']},
    {id: 'assignments', audience: student, group: 'plans', href: '/profilo/assegnazioni', image: 'received-assignments', related: ['sharing', 'goals']},
    {id: 'sharing', audience: ['student', 'teacher'], group: 'data', href: '/guide/dati-riservatezza', image: 'personal-groups', important: true, related: ['notebook', 'assignments']},
    {id: 'teacher-home', audience: teacher, group: 'start', href: '/docente', image: 'teacher-area', related: ['class-setup']},
    {id: 'class-setup', audience: teacher, group: 'plans', href: '/docente/classi', image: 'teacher-groups', important: true, related: ['class-tools', 'build-plan']},
    {id: 'class-tools', audience: teacher, group: 'plans', href: '/docente/classi', image: 'class-tools', related: ['class-setup']},
    {id: 'build-plan', audience: teacher, group: 'plans', href: '/docente/piani-operativi', image: 'teacher-class-paths', related: ['administrations', 'teacher-meetings', 'moderate']},
    {id: 'administrations', audience: teacher, group: 'chat', href: '/docente/somministrazioni', image: 'teacher-groups', related: ['build-plan', 'student-results']},
    {id: 'student-results', audience: teacher, group: 'chat', href: '/docente/compilazioni', image: 'teacher-feedback', related: ['feedback', 'guidance']},
    {id: 'catalogs', audience: teacher, group: 'study', href: '/docente/proposte', image: 'teacher-catalog', related: ['assign']},
    {id: 'assign', audience: teacher, group: 'study', href: '/docente/assegnazioni', image: 'teacher-assignment', related: ['feedback', 'catalogs']},
    {id: 'feedback', audience: teacher, group: 'study', href: '/docente/assegnazioni', image: 'teacher-feedback', related: ['student-results']},
    {id: 'moderate', audience: teacher, group: 'plans', href: '/docente/classi', image: 'teacher-forum', important: true, related: ['build-plan']},
    {id: 'teacher-meetings', audience: teacher, group: 'plans', href: '/docente/incontri', image: 'calendar', related: ['build-plan']},
    {id: 'guidance', audience: teacher, group: 'tools', href: '/docente/classi', image: 'class-overview', important: true, related: ['student-results']},
    {id: 'admin-classes', audience: admin, group: 'plans', href: '/admin?tab=groupsClasses', image: 'admin-locks', related: ['external-privacy']},
    {id: 'external-privacy', audience: admin, group: 'data', href: '/admin?tab=general', image: 'external-privacy', important: true, related: ['admin-classes']},
    {id: 'personal-api', audience: ['student', 'teacher', 'admin'], group: 'data', href: '/profilo/api-personali', image: 'personal-api', feature: 'personalAPI', important: true},
    {id: 'chatgpt', audience: ['student', 'teacher', 'admin'], group: 'data', href: '/profilo/chatgpt', image: 'chatgpt', feature: 'chatgpt'},
];
export function visibleGuideTasks(audience: GuideAudience, features: {personalAPI: boolean; chatgpt: boolean}) {
    return GUIDE_TASKS.filter(task => task.audience.includes(audience) && (!task.feature || features[task.feature]))
        .sort((a,b) => Number(b.audience.length === 1) - Number(a.audience.length === 1));
}
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
export function searchGuideTasks(tasks: GuideTask[], query: string, lang: string) {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    return tasks.filter(task => {
        const text = guideTaskCopy(lang, task.id);
        const alias = task.id === 'repeat' ? 'rifai ripeti ricomincia redo restart repeat' : '';
        const haystack = normalize([text.title, text.intro, ...text.steps, text.note, alias].join(' '));
        return terms.every(term => haystack.includes(term));
    });
}
export function guideTaskHref(id: GuideTaskId, audience: GuideAudience = 'student') {
    return `/guide?audience=${audience}&task=${id}`;
}
export function legacyGuideTask(hash: string): GuideTaskId | null {
    if (hash === '#guide-chat-controls') return 'chat';
    if (hash === '#guide-personal-api') return 'personal-api';
    if (hash === '#guide-chatgpt') return 'chatgpt';
    if (hash === '#guide-external-privacy') return 'external-privacy';
    if (hash === '#guide-admin-class-settings') return 'admin-classes';
    const matched = /^#guide-(teacher-)?section-(\d+)$/.exec(hash);
    if (!matched) return null;
    const student: GuideTaskId[] = ['start', 'orientation', 'resume', 'counselor', 'questionnaires', 'notebook', 'chat', 'pdf', 'ideas', 'events', 'events', 'goals', 'timeline', 'assignments', 'sharing', 'forum', 'resume'];
    const staff: GuideTaskId[] = ['teacher-home', 'class-setup', 'catalogs', 'assign', 'feedback', 'sharing', 'orientation', 'moderate', 'build-plan'];
    return (matched[1] ? staff : student)[Number(matched[2]) - 1] ?? null;
}
