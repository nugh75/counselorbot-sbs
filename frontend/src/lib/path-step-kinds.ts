// «+ Aggiungi passo» (#173): what the student does in a step, before its form.
export type StepKind = 'questionnaire' | 'guided_chat' | 'activity' | 'tool' | 'meeting' | 'discussion';
export const STEP_KINDS: StepKind[] = ['questionnaire', 'guided_chat', 'activity', 'tool', 'meeting', 'discussion'];
// Templates have no meetings yet: they need a date and a class (#175 adds them to class paths).
export const TEMPLATE_STEP_KINDS: StepKind[] = STEP_KINDS.filter(kind => kind !== 'meeting');

// Questionnaires enter a path only through an administration, which collects their data.
export const ADMINISTRATION_QUESTIONNAIRES = ['QSA', 'QSAr', 'ZTPI', 'QPCS', 'QPCC', 'QAP'];
// The app's «Percorsi guidati»: guided chats without a questionnaire, tool steps until
// the guided chat type exists (#177).
export const STANDALONE_GUIDED_CHATS = ['SAVICKAS', 'EVENTO_STUDIO', 'EVENTO_PROFESSIONALE', 'OBIETTIVO_STUDIO', 'IDEA'];

interface ToolRow { key: string; kind: 'instrument' | 'personal'; category: string }

/** The tool menu: personal and support tools only, never questionnaires, chats or the forum switch. */
export function isPersonalTool(tool: ToolRow): boolean {
    return tool.kind === 'personal' && (tool.category === 'personal' || tool.category === 'support');
}

/** A class instrument that is a guided chat, not a questionnaire to administer. */
export function isStandaloneGuidedChat(tool: ToolRow): boolean {
    return tool.kind === 'instrument' && !ADMINISTRATION_QUESTIONNAIRES.includes(tool.key);
}

/**
 * Guided chats a class path can offer: the class's enabled guided instruments, plus
 * built-in guided paths with no catalog row (not toggleable, so always available).
 */
export function guidedChatKeys(tools: (ToolRow & { enabled: boolean })[]): string[] {
    const listed = new Set(tools.map(tool => tool.key.toUpperCase()));
    return [
        ...tools.filter(tool => tool.enabled && isStandaloneGuidedChat(tool)).map(tool => tool.key),
        ...STANDALONE_GUIDED_CHATS.filter(key => !listed.has(key)),
    ];
}

/** An older step that opens a questionnaire as a plain tool: it still works but collects no administration data. */
export function isLegacyQuestionnaireTool(step: { step_type?: string; tool_key: string }): boolean {
    return (step.step_type ?? 'tool') === 'tool' && ADMINISTRATION_QUESTIONNAIRES.includes(step.tool_key);
}
