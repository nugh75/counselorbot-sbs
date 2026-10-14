import type { StudentResult } from '@/components/teacher/StudentResultItem';

export interface PlanStudent {
    username: string;
    telegram_linked: boolean;
    learner_profile: Record<string, unknown> | null;
    results: StudentResult[];
}

export interface MatrixCellData {
    instrument: string;
    results: StudentResult[];
    latest: StudentResult | null;
}

export interface MatrixRowData {
    username: string;
    telegram_linked: boolean;
    cells: Record<string, MatrixCellData>;
    totalCompleted: number;
}

export interface ClassResultsMatrixData {
    instruments: string[];
    rows: MatrixRowData[];
    totalsByInstrument: Record<string, number>;
    totalStudents: number;
}

export function buildClassResultsMatrix(students: PlanStudent[]): ClassResultsMatrixData {
    const instrumentSet = new Set<string>();
    for (const s of students) {
        for (const r of s.results) {
            if (r.questionnaire_type) {
                instrumentSet.add(r.questionnaire_type);
            }
        }
    }
    const instruments = Array.from(instrumentSet).sort();
    const totalsByInstrument: Record<string, number> = {};
    for (const inst of instruments) {
        totalsByInstrument[inst] = 0;
    }

    const rows: MatrixRowData[] = students.map(student => {
        const cells: Record<string, MatrixCellData> = {};
        let totalCompleted = 0;

        for (const inst of instruments) {
            const studentResults = student.results
                .filter(r => r.questionnaire_type === inst)
                .sort((a, b) => (b.submitted_at ?? '').localeCompare(a.submitted_at ?? '') || b.id - a.id);
            const latest = studentResults[0] ?? null;
            if (latest) {
                totalCompleted++;
                totalsByInstrument[inst] = (totalsByInstrument[inst] || 0) + 1;
            }
            cells[inst] = {
                instrument: inst,
                results: studentResults,
                latest,
            };
        }

        return {
            username: student.username,
            telegram_linked: student.telegram_linked,
            cells,
            totalCompleted,
        };
    });

    return {
        instruments,
        rows,
        totalsByInstrument,
        totalStudents: students.length,
    };
}

export function formatCompactScores(scores: Record<string, number> | null, maxEntries = 3): string {
    if (!scores) return '';
    const entries = Object.entries(scores).sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) return '';
    const slice = entries.slice(0, maxEntries).map(([k, v]) => `${k}:${v}`).join(' ');
    return entries.length > maxEntries ? `${slice}…` : slice;
}
