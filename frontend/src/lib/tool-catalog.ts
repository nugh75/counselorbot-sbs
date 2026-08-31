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
