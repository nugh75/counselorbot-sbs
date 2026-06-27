export type ZTPIFactorCode = 'T1' | 'T2' | 'T3' | 'T4' | 'T5';

export interface ZTPIFactor {
    code: ZTPIFactorCode;
    name: string;
    description: string;
    isInverted: boolean; // true if Low (1-3) is Forza
}

export interface ZTPIRange {
    min: number;
    max: number;
    label: string;
}

interface ZTPIRange5 {
    min: number;
    max: number;
}

export type ZTPIAlignment = 'ideal' | 'near' | 'far';

export const ZTPI_FACTORS: Record<ZTPIFactorCode, ZTPIFactor> = {
    T1: {
        code: 'T1',
        name: 'Passato Negativo',
        description: 'Ricordi negativi e rimpianti legati al passato',
        isInverted: true,
    },
    T2: {
        code: 'T2',
        name: 'Passato Positivo',
        description: 'Visione calda e nostalgica del passato',
        isInverted: false,
    },
    T3: {
        code: 'T3',
        name: 'Presente Edonistico',
        description: "Capacità di vivere l'attimo (carpe diem), orientamento al piacere nel presente",
        isInverted: false,
    },
    T4: {
        code: 'T4',
        name: 'Presente Fatalistico',
        description: 'Senso di impotenza e rassegnazione verso la vita',
        isInverted: true,
    },
    T5: {
        code: 'T5',
        name: 'Futuro',
        description: 'Orientamento verso obiettivi, pianificazione e carriera',
        isInverted: false,
    },
};

// Reference values from Zimbardo/Boyd online DBTP profile on 1-5 scale:
// PN 2.1, PP 3.67, PF 1.67, PH 4.33, F 3.69.
// Mapped proportionally to app's 1-9 input scale with x9 = 1 + (x5 - 1) * 2.
// Green = ideal band; yellow = close to ideal; red = far from ideal.
export function convertZTPIScale5To9(value: number): number {
    return 1 + (value - 1) * 2;
}

const ZTPI_BTP_IDEAL_5: Record<ZTPIFactorCode, ZTPIRange5> = {
    T1: { min: 1.5, max: 2.5 },
    T2: { min: 3.0, max: 4.0 },
    T3: { min: 4.0, max: 4.5 },
    T4: { min: 1.0, max: 2.0 },
    T5: { min: 3.0, max: 4.0 },
};

const ZTPI_BTP_NEAR_5: Record<ZTPIFactorCode, ZTPIRange5> = {
    T1: { min: 1.0, max: 3.0 },
    T2: { min: 2.5, max: 4.5 },
    T3: { min: 3.5, max: 5.0 },
    T4: { min: 1.0, max: 2.5 },
    T5: { min: 2.5, max: 4.5 },
};

function mapRange5To9(range: ZTPIRange5, label: string): ZTPIRange {
    const min = Math.max(1, Math.floor(convertZTPIScale5To9(range.min)));
    const max = Math.min(9, Math.ceil(convertZTPIScale5To9(range.max)));
    return { min, max, label: `${label} (${min}-${max})` };
}

function mapRangeRecord5To9(source: Record<ZTPIFactorCode, ZTPIRange5>, label: string): Record<ZTPIFactorCode, ZTPIRange> {
    return (Object.entries(source) as [ZTPIFactorCode, ZTPIRange5][])
        .reduce((acc, [code, range]) => {
            acc[code] = mapRange5To9(range, label);
            return acc;
        }, {} as Record<ZTPIFactorCode, ZTPIRange>);
}

export const ZTPI_BTP_IDEAL: Record<ZTPIFactorCode, ZTPIRange> = mapRangeRecord5To9(ZTPI_BTP_IDEAL_5, 'Ideale');

export const ZTPI_BTP_NEAR: Record<ZTPIFactorCode, ZTPIRange> = mapRangeRecord5To9(ZTPI_BTP_NEAR_5, 'Vicino');

function getLowMidHigh(score: number): 'Low' | 'Mid' | 'High' {
    if (score <= 3) return 'Low';
    if (score <= 6) return 'Mid';
    return 'High';
}

export function classifyZTPIScore(code: ZTPIFactorCode, score: number): ZTPIAlignment {
    const ideal = ZTPI_BTP_IDEAL[code];
    const near = ZTPI_BTP_NEAR[code];

    if (score >= ideal.min && score <= ideal.max) return 'ideal';
    if (score >= near.min && score <= near.max) return 'near';
    return 'far';
}

export function getZTPIAlignmentColorClass(code: ZTPIFactorCode, score: number): string {
    const alignment = classifyZTPIScore(code, score);
    if (alignment === 'ideal') return 'bg-green-500';
    if (alignment === 'near') return 'bg-yellow-500';
    return 'bg-red-500';
}

export function getZTPIAlignmentColorHex(code: ZTPIFactorCode, score: number): string {
    const alignment = classifyZTPIScore(code, score);
    if (alignment === 'ideal') return '#22c55e';
    if (alignment === 'near') return '#eab308';
    return '#ef4444';
}

export function analyzeZTPIScore(
    code: ZTPIFactorCode,
    score: number
): { level: 'Low' | 'Mid' | 'High'; interpretation: string; zone: ZTPIAlignment } {
    const level = getLowMidHigh(score);
    const zone = classifyZTPIScore(code, score);

    if (zone === 'ideal') return { level, interpretation: 'In linea con il profilo equilibrato', zone };
    if (zone === 'near') return { level, interpretation: 'Vicino al profilo equilibrato', zone };
    return { level, interpretation: 'Area di crescita', zone };
}
