import type { QuestionnaireType } from './questionnaires';

export type ToolCategory = 'assessment' | 'guided';

export interface ToolCategoryDefinition {
    id: ToolCategory;
    questionnaireIds: readonly QuestionnaireType[];
}

export const ACTIVE_QUESTIONNAIRE_IDS: readonly QuestionnaireType[] = [
    'QSA',
    'QSAr',
    'ZTPI',
    'QPCS',
    'QPCC',
    'QAP',
    'SAVICKAS',
    'EVENTO_STUDIO',
    'EVENTO_PROFESSIONALE',
    'OBIETTIVO_STUDIO',
    'OBIETTIVO_DOCENZA',
    'IDEA',
];

export const TOOL_CATEGORIES: readonly ToolCategoryDefinition[] = [
    {
        id: 'assessment',
        questionnaireIds: ['QSA', 'QSAr', 'ZTPI', 'QPCS', 'QPCC', 'QAP'],
    },
    {
        id: 'guided',
        questionnaireIds: ['SAVICKAS', 'EVENTO_STUDIO', 'EVENTO_PROFESSIONALE', 'OBIETTIVO_STUDIO', 'IDEA'],
    },
];

// Attivi ma fuori dalle categorie della home: OBIETTIVO_DOCENZA è lo
// strumento del docente, si raggiunge dall'area docenti e il deep link
// `/?start=` resta valido. Chiunque aggiunga uno strumento a questa lista
// deve avere un motivo esplicito come questo.
export const TEACHER_AREA_INSTRUMENT_IDS: readonly QuestionnaireType[] = ['OBIETTIVO_DOCENZA'];

export function isStartableQuestionnaireId(value: string): value is QuestionnaireType {
    return ACTIVE_QUESTIONNAIRE_IDS.includes(value as QuestionnaireType);
}

export function orientationToolHref(id: string): string {
    if (isStartableQuestionnaireId(id)) return `/?start=${encodeURIComponent(id)}`;
    if (id === 'pqbl') return '/profilo/pqbl';
    return '/?view=questionnaires';
}

export function safeOrientationNext(value: string | null): string | null {
    return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/bussola')
        ? value
        : null;
}

// Chi preme "vai agli strumenti" sulla Bussola non deve poi essere rimbalzato
// indietro dal cancello alla prima rotta che apre. Vale per la visita e non
// oltre: `sessionStorage` muore con la scheda, e nel frattempo il primo
// strumento davvero aperto rende `required` falso da solo lato server, quindi
// non serve registrare un rifiuto da nessuna parte.
const ORIENTATION_SKIP_KEY = 'orientation-skipped-this-visit';

export function skipOrientationThisVisit(): void {
    // Finestra anonima, storage disattivato: il salto non deve diventare un errore.
    try { sessionStorage.setItem(ORIENTATION_SKIP_KEY, '1'); } catch { /* nulla da fare */ }
}

export function orientationSkippedThisVisit(): boolean {
    try { return sessionStorage.getItem(ORIENTATION_SKIP_KEY) === '1'; } catch { return false; }
}

export function orientationGateBypass(pathname: string, search = ''): boolean {
    const exemptPaths = ['/inizia', '/counselor', '/profilo', '/pqbl', '/bussola', '/login', '/register', '/guide', '/telegram-link', '/questionario'];
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
