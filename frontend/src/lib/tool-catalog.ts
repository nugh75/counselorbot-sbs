import type { InstrumentSummary } from './instruments-api';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { isToolAllowed, type UserAccess } from './user-access.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { QUESTIONNAIRE_LIST, buildDynamicQuestionnaireConfig, type QuestionnaireConfig, type QuestionnaireType } from './questionnaires.ts';

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

export function isStartableQuestionnaireId(
    value: string,
    catalog?: InstrumentSummary[] | null,
): value is QuestionnaireType {
    if (!value || typeof value !== 'string') return false;
    if (catalog) {
        const found = catalog.find((row) => row.code === value);
        if (found) return found.is_active !== false;
    }
    return ACTIVE_QUESTIONNAIRE_IDS.includes(value as QuestionnaireType);
}

export function resolveActiveStudentTools(
    catalog: InstrumentSummary[] | null,
    lang = 'it',
    access: UserAccess | null = null,
): QuestionnaireConfig[] {
    return resolvePlatformStudentTools(catalog, lang).filter((q) => isToolAllowed(access, q.id));
}

function resolvePlatformStudentTools(
    catalog: InstrumentSummary[] | null,
    lang: string,
): QuestionnaireConfig[] {
    if (catalog === null) {
        return ACTIVE_QUESTIONNAIRE_IDS
            .filter((id) => !(TEACHER_AREA_INSTRUMENT_IDS as readonly string[]).includes(id))
            .map((id) => QUESTIONNAIRE_LIST.find((q) => q.id === id))
            .filter((q): q is QuestionnaireConfig => Boolean(q));
    }

    const catalogByCode = new Map(catalog.map((c) => [c.code, c]));
    const result: QuestionnaireConfig[] = [];
    const addedCodes = new Set<string>();

    // 1. Process standard known questionnaires
    for (const q of QUESTIONNAIRE_LIST) {
        if ((TEACHER_AREA_INSTRUMENT_IDS as readonly string[]).includes(q.id)) continue;
        const row = catalogByCode.get(q.id);
        if (row) {
            if (row.is_active === false) continue;
            if (row.target_audience === 'teacher') continue;
        } else if (!ACTIVE_QUESTIONNAIRE_IDS.includes(q.id)) {
            continue;
        }
        result.push(q);
        addedCodes.add(q.id);
    }

    // 2. Append new dynamic questionnaires from catalog
    for (const row of catalog) {
        if (addedCodes.has(row.code)) continue;
        if (row.is_active === false) continue;
        if (row.target_audience === 'teacher') continue;
        result.push(buildDynamicQuestionnaireConfig(row, lang));
        addedCodes.add(row.code);
    }

    return result;
}

export function getDynamicToolCategories(
    activeTools: QuestionnaireConfig[],
    catalog?: InstrumentSummary[] | null,
): ToolCategoryDefinition[] {
    const catalogByCode = catalog ? new Map(catalog.map((c) => [c.code, c])) : null;
    const assessmentIds: QuestionnaireType[] = [];
    const guidedIds: QuestionnaireType[] = [];

    for (const tool of activeTools) {
        const row = catalogByCode?.get(tool.id);
        const category = row?.tool_category ?? (tool.agentOnly ? 'guided' : 'assessment');
        if (category === 'assessment') {
            assessmentIds.push(tool.id);
        } else {
            guidedIds.push(tool.id);
        }
    }

    return [
        { id: 'assessment', questionnaireIds: assessmentIds },
        { id: 'guided', questionnaireIds: guidedIds },
    ];
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
