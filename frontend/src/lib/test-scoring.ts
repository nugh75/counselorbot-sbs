import { AdministrationInstrument, AdministrationLocale } from './test-administrations';

export type ProfileDimension = 'cognitive' | 'affective';
export type ProfileOrientation = 'resource' | 'difficulty';
export type FrequencyBand = 'lower' | 'moderate' | 'higher';

interface FactorDefinition {
    code: string;
    dimension: ProfileDimension;
    orientation: ProfileOrientation;
    itemNumbers: number[];
    reverseItems?: number[];
    labels: Record<AdministrationLocale, string>;
}

export interface ExperimentalProfileResult {
    code: string;
    label: string;
    dimension: ProfileDimension;
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
    },
} satisfies Record<AdministrationLocale, {
    band: Record<FrequencyBand, string>;
    resource: Record<FrequencyBand, string>;
    difficulty: Record<FrequencyBand, string>;
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
    const factors = instrument === 'QSA' ? QSA_FACTORS : QSAR_FACTORS;
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
            label: factor.labels[locale],
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
