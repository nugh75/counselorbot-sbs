import type { QuestionnaireType } from './questionnaires';

export type ToolCategory = 'assessment' | 'guided' | 'learning';

export interface ToolCategoryDefinition {
    id: ToolCategory;
    questionnaireIds: readonly QuestionnaireType[];
    standaloneIds: readonly StandaloneToolId[];
}

export type StandaloneToolId = 'pqbl';

export const ACTIVE_QUESTIONNAIRE_IDS: readonly QuestionnaireType[] = [
    'QSA',
    'QSAr',
    'ZTPI',
    'QPCS',
    'QPCC',
    'QAP',
    'SAVICKAS',
    'IDEA',
];

export const TOOL_CATEGORIES: readonly ToolCategoryDefinition[] = [
    {
        id: 'assessment',
        questionnaireIds: ['QSA', 'QSAr', 'ZTPI', 'QPCS', 'QPCC', 'QAP'],
        standaloneIds: [],
    },
    {
        id: 'guided',
        questionnaireIds: ['SAVICKAS', 'IDEA'],
        standaloneIds: [],
    },
    {
        id: 'learning',
        questionnaireIds: [],
        standaloneIds: ['pqbl'],
    },
];

export function isStartableQuestionnaireId(value: string): value is QuestionnaireType {
    return ACTIVE_QUESTIONNAIRE_IDS.includes(value as QuestionnaireType);
}

export function orientationToolHref(id: string): string {
    if (isStartableQuestionnaireId(id)) return `/?start=${encodeURIComponent(id)}`;
    if (id === 'pqbl') return '/pqbl';
    return '/?view=questionnaires';
}

export function safeOrientationNext(value: string | null): string | null {
    return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/bussola')
        ? value
        : null;
}

export function orientationGateBypass(pathname: string, search = ''): boolean {
    const exemptPaths = ['/bussola', '/login', '/register', '/guide', '/telegram-link', '/questionario'];
    if (exemptPaths.some((path) => pathname.startsWith(path))) return true;
    if (pathname !== '/') return false;
    const params = new URLSearchParams(search);
    // Riprese di una sessione: il cancello le lasciava gia' passare.
    if (params.get('frozen') || params.get('resume') || params.get('session_id')) return true;
    // La radice nuda e' la presentazione, e chi arriva per la prima volta deve
    // vederla: prima il cancello lo spediva alla Bussola senza che avesse letto
    // che cos'e' questo posto -- anche chi entra come ospite, che e' uno
    // studente come gli altri per il cancello. Dalla presentazione l'unica via
    // avanti e' il tasto, e il tasto porta alla Bussola: passare di qui non e'
    // saltarla.
    // I collegamenti che entrano dritti nel percorso restano al di qua.
    return !params.get('view') && !params.get('start');
}
