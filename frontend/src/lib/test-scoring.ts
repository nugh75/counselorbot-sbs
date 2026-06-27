import { AdministrationInstrument, AdministrationLocale } from './test-administrations';

export type ProfileOrientation = 'resource' | 'difficulty' | 'neutral';
export type FrequencyBand = 'lower' | 'moderate' | 'higher';

interface FactorDefinition {
    code: string;
    dimension: string;
    orientation: ProfileOrientation;
    itemNumbers: number[];
    reverseItems?: number[];
    labels: Partial<Record<AdministrationLocale, string>> & { en: string };
}

export interface ExperimentalProfileResult {
    code: string;
    label: string;
    dimension: string;
    orientation: ProfileOrientation;
    average: number;
    percentage: number;
    band: FrequencyBand;
    bandLabel: string;
    interpretation: string;
}

/*
 * The QSA item groupings follow the public CompetenzeStrategiche QSA factor
 * pages. QSAr assignments follow matching shortened QSA items together with
 * the eight-factor structure published for QSAr. EN/SV results must therefore
 * remain a raw experimental preview until adapted versions are validated.
 */
const QSA_FACTORS: FactorDefinition[] = [
    {
        code: 'C1', dimension: 'cognitive', orientation: 'resource',
        itemNumbers: [7, 17, 22, 26, 31, 36, 41, 48, 85, 100],
        labels: { en: 'Elaborative strategies', sv: 'Elaborativa strategier' },
    },
    {
        code: 'C5', dimension: 'cognitive', orientation: 'resource',
        itemNumbers: [18, 37, 44, 56, 71, 90], reverseItems: [71],
        labels: { en: 'Graphic organisers', sv: 'Grafiska organisatörer' },
    },
    {
        code: 'C7', dimension: 'cognitive', orientation: 'resource',
        itemNumbers: [6, 25, 35],
        labels: { en: 'Self-questioning', sv: 'Självfrågor' },
    },
    {
        code: 'C2', dimension: 'cognitive', orientation: 'resource',
        itemNumbers: [1, 2, 11, 12, 21, 27, 34, 63, 65, 80, 81],
        labels: { en: 'Self-regulation', sv: 'Självreglering' },
    },
    {
        code: 'C3', dimension: 'cognitive', orientation: 'difficulty',
        itemNumbers: [3, 8, 32, 40, 43, 46, 52, 96, 98],
        labels: { en: 'Disorientation in studying', sv: 'Desorientering i studierna' },
    },
    {
        code: 'C6', dimension: 'cognitive', orientation: 'difficulty',
        itemNumbers: [60, 69, 79, 84, 89], reverseItems: [60],
        labels: { en: 'Difficulty concentrating', sv: 'Koncentrationssvårigheter' },
    },
    {
        code: 'C4', dimension: 'cognitive', orientation: 'resource',
        itemNumbers: [13, 30, 50, 57, 74, 86, 99], reverseItems: [13, 57, 99],
        labels: { en: 'Collaboration', sv: 'Samarbete' },
    },
    {
        code: 'A1', dimension: 'affective', orientation: 'difficulty',
        itemNumbers: [4, 9, 19, 23, 28, 33, 38, 45, 77, 97],
        labels: { en: 'Test anxiety', sv: 'Provängslan' },
    },
    {
        code: 'A7', dimension: 'affective', orientation: 'difficulty',
        itemNumbers: [55, 66, 87, 92],
        labels: { en: 'Emotional interference', sv: 'Känslomässig påverkan' },
    },
    {
        code: 'A2', dimension: 'affective', orientation: 'resource',
        itemNumbers: [42, 49, 54, 58, 62, 67, 70, 91, 95],
        labels: { en: 'Volition', sv: 'Viljestyrning' },
    },
    {
        code: 'A5', dimension: 'affective', orientation: 'difficulty',
        itemNumbers: [53, 61, 75, 76, 82],
        labels: { en: 'Lack of perseverance', sv: 'Bristande uthållighet' },
    },
    {
        code: 'A3', dimension: 'affective', orientation: 'resource',
        itemNumbers: [5, 15, 29, 68, 73, 83, 94],
        labels: { en: 'Attribution to controllable factors', sv: 'Tillskrivning till kontrollerbara faktorer' },
    },
    {
        code: 'A4', dimension: 'affective', orientation: 'difficulty',
        itemNumbers: [10, 24, 47, 51, 59, 64, 78, 88],
        labels: { en: 'Attribution to uncontrollable factors', sv: 'Tillskrivning till okontrollerbara faktorer' },
    },
    {
        code: 'A6', dimension: 'affective', orientation: 'resource',
        itemNumbers: [14, 16, 20, 39, 72, 93],
        labels: { en: 'Perceived competence', sv: 'Upplevd kompetens' },
    },
];

const QSAR_FACTORS: FactorDefinition[] = [
    {
        code: 'C1r', dimension: 'cognitive', orientation: 'resource',
        itemNumbers: [3, 12, 14, 19, 24, 43],
        labels: { en: 'Elaborative strategies for understanding and remembering', sv: 'Elaborativa strategier för att förstå och minnas' },
    },
    {
        code: 'C2r', dimension: 'cognitive', orientation: 'resource',
        itemNumbers: [1, 7, 11, 15, 18, 31, 40],
        labels: { en: 'Self-regulatory strategies', sv: 'Självreglerande strategier' },
    },
    {
        code: 'C3r', dimension: 'cognitive', orientation: 'resource',
        itemNumbers: [20, 23, 28, 36, 42],
        labels: { en: 'Graphic strategies for understanding and remembering', sv: 'Grafiska strategier för förståelse och minne' },
    },
    {
        code: 'C4r', dimension: 'cognitive', orientation: 'difficulty',
        itemNumbers: [34, 41, 44],
        labels: { en: 'Difficulty controlling attention', sv: 'Svårigheter att kontrollera uppmärksamheten' },
    },
    {
        code: 'A1r', dimension: 'affective', orientation: 'difficulty',
        itemNumbers: [2, 5, 9, 16, 22, 38],
        labels: { en: 'Difficulty regulating anxiety', sv: 'Svårigheter att reglera oro' },
    },
    {
        code: 'A2r', dimension: 'affective', orientation: 'resource',
        itemNumbers: [25, 27, 29, 32, 35, 46],
        labels: { en: 'Volition', sv: 'Viljestyrning' },
    },
    {
        code: 'A3r', dimension: 'affective', orientation: 'resource',
        itemNumbers: [6, 10, 13, 17, 26, 30, 33, 39], reverseItems: [6, 13, 26, 30, 39],
        labels: { en: 'Controllable causal attributions', sv: 'Kontrollerbara orsaksförklaringar' },
    },
    {
        code: 'A4r', dimension: 'affective', orientation: 'resource',
        itemNumbers: [4, 8, 21, 37, 45],
        labels: { en: 'Perceived competence', sv: 'Upplevd kompetens' },
    },
];

// ZTPI factor definitions (Zimbardo & Boyd, 1999)
// 56 items, 5 factors. Factor assignment is experimental pending review.
const ZTPI_FACTORS: FactorDefinition[] = [
    {
        code: 'T1', dimension: 'pn', orientation: 'neutral',
        itemNumbers: [4, 16, 22, 25, 27, 33, 34, 36, 40, 45],
        labels: { en: 'Past Negative', sv: 'Negativt förflutet' },
    },
    {
        code: 'T2', dimension: 'pp', orientation: 'neutral',
        itemNumbers: [2, 7, 11, 15, 20, 29, 41, 50],
        labels: { en: 'Past Positive', sv: 'Positivt förflutet' },
    },
    {
        code: 'T3', dimension: 'ph', orientation: 'neutral',
        itemNumbers: [1, 8, 12, 17, 19, 23, 26, 28, 31, 32, 35, 42, 44, 51, 54, 55, 56],
        labels: { en: 'Present Hedonistic', sv: 'Hedonistisk nutid' },
    },
    {
        code: 'T4', dimension: 'pf', orientation: 'neutral',
        itemNumbers: [3, 5, 9, 14, 24, 37, 38, 39],
        labels: { en: 'Present Fatalistic', sv: 'Fatalistisk nutid' },
    },
    {
        code: 'T5', dimension: 'f', orientation: 'neutral',
        itemNumbers: [6, 10, 13, 18, 21, 30, 43, 46, 47, 48, 49, 52, 53],
        labels: { en: 'Future', sv: 'Framtid' },
    },
];

// QAP factor definitions (CAAS — Savickas & Porfeli, 2012)
// 24 items, 4 factors. No reverse items.
const QAP_FACTORS: FactorDefinition[] = [
    {
        code: 'AD1', dimension: 'concern', orientation: 'resource',
        itemNumbers: [1, 2, 3, 4, 5, 6],
        labels: { en: 'Concern', sv: 'Omsorg om framtiden' },
    },
    {
        code: 'AD2', dimension: 'control', orientation: 'resource',
        itemNumbers: [7, 8, 9, 10, 11, 12],
        labels: { en: 'Control', sv: 'Kontroll' },
    },
    {
        code: 'AD3', dimension: 'curiosity', orientation: 'resource',
        itemNumbers: [13, 14, 15, 16, 17, 18],
        labels: { en: 'Curiosity', sv: 'Nyfikenhet' },
    },
    {
        code: 'AD4', dimension: 'confidence', orientation: 'resource',
        itemNumbers: [19, 20, 21, 22, 23, 24],
        labels: { en: 'Confidence', sv: 'Tilltro' },
    },
];

// QPCS factor definitions — experimental mapping (25 items, 5 factors)
const QPCS_FACTORS: FactorDefinition[] = [
    {
        code: 'S1', dimension: 'managing_emotions', orientation: 'resource',
        itemNumbers: [1, 2, 3, 4, 5],
        labels: { en: 'Managing emotions', sv: 'Hantera känslor' },
    },
    {
        code: 'S2', dimension: 'communicative_competence', orientation: 'resource',
        itemNumbers: [6, 7, 8, 9, 10],
        labels: { en: 'Communicative competence', sv: 'Kommunikativ kompetens' },
    },
    {
        code: 'S3', dimension: 'will_perseverance', orientation: 'resource',
        itemNumbers: [11, 12, 13, 14, 15],
        labels: { en: 'Will & perseverance', sv: 'Vilja & uthållighet' },
    },
    {
        code: 'S4', dimension: 'strategies_collaboration', orientation: 'resource',
        itemNumbers: [16, 17, 18, 19, 20],
        labels: { en: 'Strategies & collaboration', sv: 'Strategier & samarbete' },
    },
    {
        code: 'S5', dimension: 'confidence_life_project', orientation: 'resource',
        itemNumbers: [21, 22, 23, 24, 25],
        labels: { en: 'Confidence & life project', sv: 'Tilltro & livsprojekt' },
    },
];

// QPCC factor definitions — experimental mapping (25 items, 5 factors)
const QPCC_FACTORS: FactorDefinition[] = [
    {
        code: 'K1', dimension: 'public_speaking', orientation: 'resource',
        itemNumbers: [1, 2, 3, 4, 5],
        labels: { en: 'Public speaking', sv: 'Tala inför andra' },
    },
    {
        code: 'K2', dimension: 'anxiety_responsibility', orientation: 'resource',
        itemNumbers: [6, 7, 8, 9, 10],
        labels: { en: 'Managing anxiety & responsibility', sv: 'Hantera ångest & ansvar' },
    },
    {
        code: 'K3', dimension: 'volition_selfregulation', orientation: 'resource',
        itemNumbers: [11, 12, 13, 14, 15],
        labels: { en: 'Volition & self-regulation', sv: 'Vilja & självreglering' },
    },
    {
        code: 'K4', dimension: 'elaboration_strategies', orientation: 'resource',
        itemNumbers: [16, 17, 18, 19, 20],
        labels: { en: 'Elaboration strategies', sv: 'Bearbetningsstrategier' },
    },
    {
        code: 'K5', dimension: 'beliefs_about_self', orientation: 'resource',
        itemNumbers: [21, 22, 23, 24, 25],
        labels: { en: 'Beliefs about oneself', sv: 'Föreställningar om sig själv' },
    },
];

const FACTOR_MAP: Record<AdministrationInstrument, FactorDefinition[]> = {
    QSA: QSA_FACTORS,
    QSAr: QSAR_FACTORS,
    ZTPI: ZTPI_FACTORS,
    QPCS: QPCS_FACTORS,
    QPCC: QPCC_FACTORS,
    QAP: QAP_FACTORS,
};

const TEXT = {
    en: {
        band: { lower: 'Lower frequency', moderate: 'Moderate frequency', higher: 'Higher frequency' },
        resource: {
            lower: 'Lower reported use of this strategy or resource.',
            moderate: 'Moderate reported use of this strategy or resource.',
            higher: 'Higher reported use of this strategy or resource.',
        },
        difficulty: {
            lower: 'Lower reported frequency of this difficulty.',
            moderate: 'Moderate reported frequency of this difficulty.',
            higher: 'Higher reported frequency of this difficulty.',
        },
        neutral: {
            lower: 'Lower reported presence of this dimension.',
            moderate: 'Moderate reported presence of this dimension.',
            higher: 'Higher reported presence of this dimension.',
        },
    },
    sv: {
        band: { lower: 'Lägre frekvens', moderate: 'Måttlig frekvens', higher: 'Högre frekvens' },
        resource: {
            lower: 'Lägre rapporterad användning av denna strategi eller resurs.',
            moderate: 'Måttlig rapporterad användning av denna strategi eller resurs.',
            higher: 'Högre rapporterad användning av denna strategi eller resurs.',
        },
        difficulty: {
            lower: 'Lägre rapporterad frekvens av denna svårighet.',
            moderate: 'Måttlig rapporterad frekvens av denna svårighet.',
            higher: 'Högre rapporterad frekvens av denna svårighet.',
        },
        neutral: {
            lower: 'Lägre rapporterad närvaro av denna dimension.',
            moderate: 'Måttlig rapporterad närvaro av denna dimension.',
            higher: 'Högre rapporterad närvaro av denna dimension.',
        },
    },
    es: {
        band: { lower: 'Frecuencia mas baja', moderate: 'Frecuencia moderada', higher: 'Frecuencia mas alta' },
        resource: {
            lower: 'Uso declarado mas bajo de esta estrategia o recurso.',
            moderate: 'Uso declarado moderado de esta estrategia o recurso.',
            higher: 'Uso declarado mas alto de esta estrategia o recurso.',
        },
        difficulty: {
            lower: 'Frecuencia declarada mas baja de esta dificultad.',
            moderate: 'Frecuencia declarada moderada de esta dificultad.',
            higher: 'Frecuencia declarada mas alta de esta dificultad.',
        },
        neutral: {
            lower: 'Presencia declarada mas baja de esta dimension.',
            moderate: 'Presencia declarada moderada de esta dimension.',
            higher: 'Presencia declarada mas alta de esta dimension.',
        },
    },
} satisfies Record<AdministrationLocale, {
    band: Record<FrequencyBand, string>;
    resource: Record<FrequencyBand, string>;
    difficulty: Record<FrequencyBand, string>;
    neutral: Record<FrequencyBand, string>;
}>;

function getBand(average: number): FrequencyBand {
    if (average < 2) return 'lower';
    if (average < 3) return 'moderate';
    return 'higher';
}

export function calculateExperimentalProfile(
    instrument: AdministrationInstrument,
    locale: AdministrationLocale,
    answers: Record<number, number>,
): ExperimentalProfileResult[] {
    const factors = FACTOR_MAP[instrument];
    if (!factors) throw new Error(`Unknown instrument: ${instrument}`);
    const copy = TEXT[locale];

    return factors.map((factor) => {
        const reverseItems = new Set(factor.reverseItems ?? []);
        const total = factor.itemNumbers.reduce((sum, itemNumber) => {
            const answer = answers[itemNumber];
            return sum + (reverseItems.has(itemNumber) ? 5 - answer : answer);
        }, 0);
        const average = total / factor.itemNumbers.length;
        const band = getBand(average);

        return {
            code: factor.code,
            label: factor.labels[locale] ?? factor.labels.en,
            dimension: factor.dimension,
            orientation: factor.orientation,
            average,
            percentage: ((average - 1) / 3) * 100,
            band,
            bandLabel: copy.band[band],
            interpretation: copy[factor.orientation][band],
        };
    });
}
