export type QSAFactorCode =
    | 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7'
    | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7';

export interface QSAFactor {
    code: QSAFactorCode;
    name: string;
    description: string;
    isInverted: boolean; // True if Low (1-3) is Good/Strength
}

export const QSA_FACTORS: Record<QSAFactorCode, QSAFactor> = {
    C1: { code: 'C1', name: 'Strategie elaborative', description: 'Capacità di elaborare l\'informazione', isInverted: false },
    C2: { code: 'C2', name: 'Autoregolazione', description: 'Capacità di regolarsi', isInverted: false },
    C3: { code: 'C3', name: 'Disorientamento', description: 'Senso di confusione', isInverted: true },
    C4: { code: 'C4', name: 'Collaborazione', description: 'Lavoro di gruppo', isInverted: false },
    C5: { code: 'C5', name: 'Organizzatori semantici', description: 'Uso di schemi/mappe', isInverted: false },
    C6: { code: 'C6', name: 'Difficoltà concentrazione', description: 'Problemi di attenzione', isInverted: true },
    C7: { code: 'C7', name: 'Autointerrogazione', description: 'Farsi domande mentre si studia', isInverted: false },
    A1: { code: 'A1', name: 'Ansietà di base', description: 'Ansia generale', isInverted: true },
    A2: { code: 'A2', name: 'Volizione', description: 'Forza di volontà', isInverted: false },
    A3: { code: 'A3', name: 'Attribuzione controllabile', description: 'Attribuire successi a sé', isInverted: false },
    A4: { code: 'A4', name: 'Attribuzione incontrollabile', description: 'Attribuire a fortuna/slrt', isInverted: true },
    A5: { code: 'A5', name: 'Mancanza perseveranza', description: 'Mollare facilmente', isInverted: true },
    A6: { code: 'A6', name: 'Percezione competenza', description: 'Sentirsi capaci', isInverted: false },
    A7: { code: 'A7', name: 'Interferenze emotive', description: 'Emozioni che disturbano', isInverted: true },
};

export type QFLevel = 'Debolezza' | 'Adeguato' | 'Forza'; // Generalized labels, might vary slightly by table
// Specific mapping from USER REQUEST:
// Normal: 1-3 Debolezza, 4-6 Adeguato, 7-9 Forza
// Inverted: 1-3 Forza, 4-6 Normale, 7-9 Debolezza (Note: "Normale" vs "Adeguato" treated as middle ground)

export interface QSAResult {
    scores: Record<QSAFactorCode, number>;
}

export function analyzeScore(code: QSAFactorCode, score: number): { level: 'Low' | 'Mid' | 'High', interpretation: string } {
    const factor = QSA_FACTORS[code];
    let level: 'Low' | 'Mid' | 'High';

    if (score <= 3) level = 'Low';
    else if (score <= 6) level = 'Mid';
    else level = 'High';

    // Interpretation based on inversion
    let interpretation = '';

    if (factor.isInverted) {
        // Low=Forza, Mid=Normale, High=Debolezza
        if (level === 'Low') interpretation = 'Forza';
        if (level === 'Mid') interpretation = 'Normale';
        if (level === 'High') interpretation = 'Debolezza';
    } else {
        // Low=Debolezza, Mid=Adeguato, High=Forza
        // Note: A3 middle is "Equilibrata", A6 is "Adeguata". modifying slightly to be generic or specific can be done.
        if (level === 'Low') interpretation = 'Debolezza';
        if (level === 'Mid') interpretation = (code === 'A3' ? 'Equilibrata' : 'Adeguato');
        if (level === 'High') interpretation = 'Forza';
    }

    return { level, interpretation };
}

export function getQSAGraphData(scores: Record<QSAFactorCode, number>) {
    // For Radar chart, we might want to normalize "Goodness" 
    // i.e. if Inverted, 1 should be visualized as high performance? 
    // Or just visualize raw scores?
    // Usually radar charts show "Area". If 9 is bad for Anxiety, a big area in Anxiety is bad.
    // Let's return raw scores for now, but maybe a "PerformanceScore" for normalized view.

    return Object.entries(scores).map(([key, value]) => {
        const code = key as QSAFactorCode;
        const analysis = analyzeScore(code, value);
        return {
            subject: code,
            A: value,
            fullMark: 9,
            interpretation: analysis.interpretation
        };
    });
}
