// Uso reale dei prompt (#762): tipi e funzioni pure del pannello admin.

export const USAGE_DEFECTS = [
    'visible_json', 'visible_reasoning', 'too_many_questions',
    'strategies_in_factor_step', 'wrong_language', 'missing_step_marker',
] as const;

export const USAGE_SURFACES = ['guided', 'telegram', 'free_chat', 'assistant', 'bussola'] as const;

export const USAGE_WINDOWS = [7, 30, 90] as const;

export type UsageTrend = 'up' | 'down' | 'flat' | null;

interface DefectStats {
    defects: Record<string, number>;
    defects_total: number;
    previous_total: number;
    trend: UsageTrend;
}

export interface PromptUsageRow extends DefectStats {
    id: string;
    last_used: string;
    uses: number;
}

export interface StepUsageRow extends DefectStats {
    surface: string;
    instrument: string | null;
    step: string | null;
    turns: number;
}

export interface PromptUsageReport {
    days: number;
    retention_days: number;
    turns: number;
    tracking_since: string | null;
    partial: boolean;
    prompts: PromptUsageRow[];
    steps: StepUsageRow[];
    never_used: string[];
}

/** Difetti dal più frequente, a parità nell'ordine del registro. */
export function sortedDefects(defects: Record<string, number>): [string, number][] {
    const order = (code: string) => {
        const index = (USAGE_DEFECTS as readonly string[]).indexOf(code);
        return index < 0 ? USAGE_DEFECTS.length : index;
    };
    return Object.entries(defects).filter(([, count]) => count > 0)
        .sort(([a, x], [b, y]) => y - x || order(a) - order(b));
}

/** Righe con almeno un difetto nel periodo o nel precedente (un calo resta visibile). */
export function withDefects<T extends DefectStats>(rows: T[]): T[] {
    return rows.filter(row => row.defects_total > 0 || row.previous_total > 0);
}

/** Etichetta del passo: strumento · passo, o la sola superficie per Assistente e Bussola. */
export function stepLabel(row: Pick<StepUsageRow, 'instrument' | 'step'>): string {
    return [row.instrument, row.step].filter(Boolean).join(' · ');
}
