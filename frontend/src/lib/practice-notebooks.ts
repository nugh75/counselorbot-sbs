// Taccuini studente di prova del docente: studenti immaginari con cui allenarsi
// nelle chat guidate. Gli stessi campi del taccuino reale che il server porta
// nel prompt; le etichette riusano quelle del taccuino studente (lp.field.*).

export const PRACTICE_NOTEBOOK_FIELDS = [
    { key: 'age', labelKey: 'lp.field.age' },
    { key: 'gender', labelKey: 'lp.field.gender' },
    { key: 'school_class', labelKey: 'lp.field.schoolClass' },
    { key: 'school_year', labelKey: 'lp.field.schoolYear' },
    { key: 'context', labelKey: 'lp.field.context' },
    { key: 'goal', labelKey: 'lp.field.goal' },
    { key: 'main_difficulty', labelKey: 'lp.field.difficulty' },
    { key: 'strengths', labelKey: 'lp.field.strengths', multiline: true },
    { key: 'weaknesses', labelKey: 'lp.field.weaknesses', multiline: true },
    { key: 'notes', labelKey: 'lp.field.notes', multiline: true },
] as const;

export type PracticeNotebookField = (typeof PRACTICE_NOTEBOOK_FIELDS)[number]['key'];
export type PracticeNotebookData = Partial<Record<PracticeNotebookField, string>>;

// Stessi limiti del backend (schemas.PRACTICE_NOTEBOOK_*).
export const PRACTICE_TITLE_MAX_CHARS = 120;
export const PRACTICE_FIELD_MAX_CHARS = 600;

export interface PracticeNotebook {
    id: number;
    title: string;
    data: PracticeNotebookData;
    // Classi dello studente simulato: il server tiene solo quelle del docente
    // o condivise con lui; in chat il contesto entra solo se condiviso.
    group_ids: number[];
    archived_at?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
}

export function parsePracticeNotebooks(payload: unknown): PracticeNotebook[] {
    if (!Array.isArray(payload)) return [];
    return payload.filter((row): row is PracticeNotebook =>
        Boolean(row) && typeof row === 'object'
        && Number.isInteger((row as PracticeNotebook).id)
        && typeof (row as PracticeNotebook).title === 'string',
    ).map((row) => ({
        ...row,
        data: row.data && typeof row.data === 'object' ? row.data : {},
        group_ids: Array.isArray(row.group_ids) ? row.group_ids.filter((id) => Number.isInteger(id)) : [],
    }));
}

// Corpo da inviare: nome ripulito, solo campi noti e non vuoti.
export function practiceNotebookBody(title: string, values: PracticeNotebookData): { title: string; data: PracticeNotebookData } {
    const data: PracticeNotebookData = {};
    for (const { key } of PRACTICE_NOTEBOOK_FIELDS) {
        const value = (values[key] ?? '').trim().slice(0, PRACTICE_FIELD_MAX_CHARS);
        if (value) data[key] = value;
    }
    return { title: title.trim().slice(0, PRACTICE_TITLE_MAX_CHARS), data };
}

// Repertorio di prove: profili di questionario dello studente simulato.
export const PRACTICE_RESULT_TYPES = ['QSA', 'QSAr', 'ZTPI', 'QPCS', 'QPCC', 'QAP'] as const;

export interface PracticeResult {
    id: number;
    notebook_id: number;
    questionnaire_type: string;
    scores: Record<string, number>;
    session_id: string;
    source: 'manual' | 'generated' | 'chat';
    created_at?: string | null;
}

export function parsePracticeResults(payload: unknown): PracticeResult[] {
    if (!Array.isArray(payload)) return [];
    return payload.filter((row): row is PracticeResult =>
        Boolean(row) && typeof row === 'object'
        && Number.isInteger((row as PracticeResult).id)
        && typeof (row as PracticeResult).questionnaire_type === 'string'
        && Boolean((row as PracticeResult).scores) && typeof (row as PracticeResult).scores === 'object',
    );
}

// Profilo plausibile sulla scala 1-9: media di due tiri, quindi più spesso al
// centro che agli estremi, come un profilo reale. `random` è iniettabile per i test.
export function generatePracticeScores(codes: readonly string[], random: () => number = Math.random): Record<string, number> {
    const roll = () => 1 + Math.floor(random() * 9);
    return Object.fromEntries(codes.map((code) => [code, Math.round((roll() + roll()) / 2)]));
}
