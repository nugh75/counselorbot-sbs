// Student-facing presentation of an operational-plan step.
//
// A step already names its object: the tool, the questionnaire plan, the
// assignment, the meeting or the discussion type. The saved `title` and
// `due_date` are overrides, not required data: empty means "use the object".
// One resolver keeps the teacher editor, the student views and the deadline
// logic on the same values.
// @ts-expect-error -- Node's TypeScript runner requires the extension.
import { administrationStepText } from './i18n-administration-steps.ts';
// @ts-expect-error -- Node's TypeScript runner requires the extension.
import { resultsChatText } from './i18n-results-chats.ts';
// @ts-expect-error -- Node's TypeScript runner requires the extension.
import { pathAssignmentText } from './i18n-path-assignments.ts';
// @ts-expect-error -- Node's TypeScript runner requires the extension.
import { pathForumText } from './i18n-path-forum.ts';
// @ts-expect-error -- Node's TypeScript runner requires the extension.
import { classMeetingText } from './i18n-class-meetings.ts';

export type PresentationStepType =
    | 'tool'
    | 'guided_chat'
    | 'questionnaire_administration'
    | 'guided_results_chat'
    | 'assignment'
    | 'forum'
    | 'meeting'
    | 'pending';

/** The fields a step needs to resolve its presentation, teacher or student side. */
export interface PresentationStep {
    step_type?: PresentationStepType | string | null;
    tool_key?: string | null;
    title?: string | null;
    instructions?: string | null;
    due_date?: string | null;
    target_summary?: {
        instrument_code?: string;
        code?: string;
        title?: string;
        /** Added for the plan's own date; older payloads simply omit it. */
        scheduled_at?: string | null;
    } | null;
    assignment_summary?: {title?: string; due_date?: string | null} | null;
    meeting_summary?: {title?: string; starts_at?: string | null} | null;
    pending_config?: {
        kind?: Exclude<PresentationStepType, 'tool' | 'pending'>;
        instrument_code?: string;
        locale?: string;
        plan_title?: string;
        tool_key?: string;
        title?: string;
    } | null;
}

export type TitleSource = 'override' | 'target';
export type DueDateSource = 'override' | 'meeting' | 'assignment' | 'administration';

export interface StepPresentation {
    /** What the student reads as the step heading. */
    title: string;
    titleSource: TitleSource;
    /** The object's own name, shown as a subtitle when the title is overridden. */
    derivedTitle: string;
    note: string | null;
    /** Effective date (YYYY-MM-DD, local) used by deadlines and progress. */
    dueDate: string | null;
    dueDateSource: DueDateSource | null;
    /** Whether a path row shows the date: a meeting shows it in its own details. */
    showDueDate: boolean;
}

interface PresentationOptions {
    /** Class-aware tool label; the raw key when omitted (pure helper, no aliases). */
    toolName?: (key: string) => string;
    /** Editor fallback for a pending step, whose target does not exist yet. */
    fallbackTitle?: string;
}

function stepType(step: PresentationStep): PresentationStepType {
    const value = step.step_type;
    return value === 'guided_chat' || value === 'questionnaire_administration'
        || value === 'guided_results_chat' || value === 'assignment'
        || value === 'forum' || value === 'meeting' || value === 'pending'
        ? value
        : 'tool';
}

function pendingTitle(lang: string, step: PresentationStep): string {
    const config = step.pending_config;
    if (!config) return '';
    if (config.kind === 'questionnaire_administration') {
        return `${administrationStepText(lang, 'administration')} · ${[config.instrument_code, (config.locale || '').toUpperCase()].filter(Boolean).join(' ')}`;
    }
    if (config.kind === 'assignment') return pathAssignmentText(lang, 'assignment');
    if (config.kind === 'forum') return [pathForumText(lang, 'forum'), config.title].filter(Boolean).join(' · ');
    if (config.kind === 'guided_results_chat') {
        return config.tool_key
            ? `${resultsChatText(lang, 'analyzeQuestionnaire')} · ${config.tool_key} · ${resultsChatText(lang, 'personalResults')}`
            : administrationStepText(lang, 'deepDive');
    }
    return '';
}

/** The name the object already has; never the saved override. */
export function derivedStepTitle(lang: string, step: PresentationStep, toolName: (key: string) => string = key => key): string {
    const type = stepType(step);
    if (type === 'assignment') {
        return step.assignment_summary?.title
            ? `${pathAssignmentText(lang, 'assignment')} · ${step.assignment_summary.title}`
            : pathAssignmentText(lang, 'assignment');
    }
    if (type === 'meeting') {
        return step.meeting_summary?.title
            ? `${classMeetingText(lang, 'meeting')} · ${step.meeting_summary.title}`
            : classMeetingText(lang, 'meeting');
    }
    if (type === 'forum') return pathForumText(lang, 'forum');
    if (type === 'questionnaire_administration') {
        const plan = step.target_summary;
        return plan?.title
            || [plan?.instrument_code, plan?.code].filter(Boolean).join(' · ')
            || administrationStepText(lang, 'administration');
    }
    if (type === 'guided_results_chat') {
        if (step.tool_key) {
            return `${resultsChatText(lang, 'analyzeQuestionnaire')} · ${step.tool_key} · ${resultsChatText(lang, 'personalResults')}`;
        }
        const target = [step.target_summary?.instrument_code, step.target_summary?.code].filter(Boolean).join(' · ');
        return target
            ? `${administrationStepText(lang, 'deepDive')} · ${target}`
            : administrationStepText(lang, 'deepDive');
    }
    if (type === 'pending') return pendingTitle(lang, step);
    const key = step.tool_key || '';
    return toolName(key) || key;
}

/** A datetime becomes the calendar day in the reader's own timezone; a date-only value never shifts. */
export function localIsoDate(value: string | null | undefined): string | null {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    const pad = (number: number) => String(number).padStart(2, '0');
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

/**
 * The date the path counts for this step: the teacher's override, otherwise the
 * target's own date. A meeting without a date (individual slots) has none.
 */
export function effectiveDueDate(step: PresentationStep): {value: string | null; source: DueDateSource | null} {
    if (step.due_date) return {value: step.due_date, source: 'override'};
    const type = stepType(step);
    if (type === 'meeting') return {value: localIsoDate(step.meeting_summary?.starts_at), source: 'meeting'};
    if (type === 'assignment') {
        return {value: localIsoDate(step.assignment_summary?.due_date), source: 'assignment'};
    }
    if (type === 'questionnaire_administration') {
        return {value: localIsoDate(step.target_summary?.scheduled_at), source: 'administration'};
    }
    return {value: null, source: null};
}

export function resolveStepPresentation(
    lang: string,
    step: PresentationStep,
    options: PresentationOptions = {},
): StepPresentation {
    const derivedTitle = derivedStepTitle(lang, step, options.toolName);
    const fallback = options.fallbackTitle?.trim() || derivedTitle;
    const override = step.title?.trim() || '';
    const {value: dueDate, source: dueDateSource} = effectiveDueDate(step);
    const type = stepType(step);
    return {
        title: override || fallback,
        titleSource: override ? 'override' : 'target',
        derivedTitle: fallback,
        note: step.instructions?.trim() || null,
        dueDate,
        dueDateSource,
        // The meeting date already sits in the meeting details: show it once.
        showDueDate: dueDateSource === 'override' || (type !== 'meeting' && dueDate != null),
    };
}
