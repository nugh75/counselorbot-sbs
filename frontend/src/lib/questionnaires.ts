// Questionnaire Configuration
// This file defines all available questionnaires and their configurations

export type QuestionnaireType = 'QSA' | 'QSAr' | 'QPCS' | 'QPCC' | 'ZTPI' | 'QAP' | 'SAVICKAS';

export interface QuestionnaireConfig {
    id: QuestionnaireType;
    name: string;
    fullName: string;
    description: string;
    factorPrefix: string[];  // e.g., ['C', 'A'] for cognitive and affective
    factors: FactorDefinition[];
    invertedFactors: string[];
    color: string;
    icon: string;
}

export interface FactorDefinition {
    code: string;
    name: string;
    description: string;
    lowLabel: string;
    midLabel: string;
    highLabel: string;
}

// Factor definitions for QSA (already implemented)
const QSA_FACTOR_DEFINITIONS: FactorDefinition[] = [
    { code: 'C1', name: 'Strategie elaborative', description: 'Capacità di elaborare le informazioni', lowLabel: 'Area di crescita', midLabel: 'Adeguato', highLabel: 'Forza' },
    { code: 'C2', name: 'Autoregolazione', description: 'Capacità di regolare il proprio studio', lowLabel: 'Area di crescita', midLabel: 'Adeguato', highLabel: 'Forza' },
    { code: 'C3', name: 'Disorientamento', description: 'Senso di confusione nello studio', lowLabel: 'Forza', midLabel: 'Normale', highLabel: 'Area di crescita' },
    { code: 'C4', name: 'Disponibilità alla collaborazione', description: 'Propensione al lavoro di gruppo', lowLabel: 'Area di crescita', midLabel: 'Adeguato', highLabel: 'Forza' },
    { code: 'C5', name: 'Organizzatori semantici', description: 'Uso di mappe e schemi', lowLabel: 'Area di crescita', midLabel: 'Adeguato', highLabel: 'Forza' },
    { code: 'C6', name: 'Difficoltà di concentrazione', description: 'Problemi di attenzione', lowLabel: 'Forza', midLabel: 'Normale', highLabel: 'Area di crescita' },
    { code: 'C7', name: 'Autointerrogazione', description: 'Farsi domande durante lo studio', lowLabel: 'Area di crescita', midLabel: 'Adeguato', highLabel: 'Forza' },
    { code: 'A1', name: 'Ansietà di base', description: 'Ansia generale verso lo studio', lowLabel: 'Forza', midLabel: 'Moderata', highLabel: 'Area di crescita' },
    { code: 'A2', name: 'Volizione', description: 'Forza di volontà', lowLabel: 'Area di crescita', midLabel: 'Adeguato', highLabel: 'Forza' },
    { code: 'A3', name: 'Attribuzione a cause controllabili', description: 'Attribuire successi a sé stessi', lowLabel: 'Area di crescita', midLabel: 'Equilibrata', highLabel: 'Forza' },
    { code: 'A4', name: 'Attribuzione a cause incontrollabili', description: 'Attribuire a fortuna/caso', lowLabel: 'Forza', midLabel: 'Normale', highLabel: 'Area di crescita' },
    { code: 'A5', name: 'Mancanza di perseveranza', description: 'Tendenza a mollare', lowLabel: 'Forza', midLabel: 'Normale', highLabel: 'Area di crescita' },
    { code: 'A6', name: 'Percezione di competenza', description: 'Sentirsi capaci', lowLabel: 'Area di crescita', midLabel: 'Adeguata', highLabel: 'Forza' },
    { code: 'A7', name: 'Interferenze emotive', description: 'Emozioni che disturbano', lowLabel: 'Forza', midLabel: 'Normale', highLabel: 'Area di crescita' },
];

// QSAr codes carry an "r" suffix to avoid collisions with QSA factors
// that use the same base code with a different construct or direction.
const QSAR_FACTOR_DEFINITIONS: FactorDefinition[] = [
    { code: 'C1r', name: 'Strategie elaborative per comprendere e ricordare', description: 'Elaborazione e collegamento delle informazioni', lowLabel: 'Area di crescita', midLabel: 'Adeguato', highLabel: 'Forza' },
    { code: 'C2r', name: 'Strategie autoregolative', description: 'Organizzazione e controllo del proprio studio', lowLabel: 'Area di crescita', midLabel: 'Adeguato', highLabel: 'Forza' },
    { code: 'C3r', name: 'Strategie grafiche e organizzatori semantici', description: 'Uso di schemi, mappe, grafici e sintesi visive', lowLabel: 'Area di crescita', midLabel: 'Adeguato', highLabel: 'Forza' },
    { code: 'C4r', name: 'Carenza nel controllo dell\'attenzione', description: 'Distrazione e difficoltà a mantenere il focus', lowLabel: 'Forza', midLabel: 'Normale', highLabel: 'Area di crescita' },
    { code: 'A1r', name: 'Ansietà e controllo delle emozioni', description: 'Interferenza dell\'ansia nelle prove scolastiche', lowLabel: 'Forza', midLabel: 'Normale', highLabel: 'Area di crescita' },
    { code: 'A2r', name: 'Volizione', description: 'Impegno e perseveranza nello studio', lowLabel: 'Area di crescita', midLabel: 'Adeguato', highLabel: 'Forza' },
    { code: 'A3r', name: 'Attribuzioni causali', description: 'Lettura delle cause di successo e insuccesso', lowLabel: 'Area di crescita', midLabel: 'Adeguato', highLabel: 'Forza' },
    { code: 'A4r', name: 'Percezione di competenza', description: 'Fiducia nelle proprie capacità di riuscire', lowLabel: 'Area di crescita', midLabel: 'Adeguato', highLabel: 'Forza' },
];

// Placeholder factor definitions for other questionnaires
const PLACEHOLDER_FACTORS: FactorDefinition[] = [
    { code: 'F1', name: 'Fattore 1', description: 'Da definire', lowLabel: 'Basso', midLabel: 'Medio', highLabel: 'Alto' },
    { code: 'F2', name: 'Fattore 2', description: 'Da definire', lowLabel: 'Basso', midLabel: 'Medio', highLabel: 'Alto' },
    { code: 'F3', name: 'Fattore 3', description: 'Da definire', lowLabel: 'Basso', midLabel: 'Medio', highLabel: 'Alto' },
];

// ZTPI factor definitions (T1-T5, scala 1-9)
// T1 e T4 sono fattori INVERTITI (punteggio basso = Forza)
const ZTPI_FACTOR_DEFINITIONS: FactorDefinition[] = [
    { code: 'T1', name: 'Passato Negativo', description: 'Ricordi negativi e rimpianti legati al passato', lowLabel: 'Forza', midLabel: 'Normale', highLabel: 'Area di crescita' },
    { code: 'T2', name: 'Passato Positivo', description: 'Visione calda e nostalgica del passato', lowLabel: 'Area di crescita', midLabel: 'Adeguato', highLabel: 'Forza' },
    { code: 'T3', name: 'Presente Edonistico', description: "Capacità di vivere l'attimo (carpe diem), orientamento al piacere nel presente", lowLabel: 'Area di crescita', midLabel: 'Adeguato', highLabel: 'Forza' },
    { code: 'T4', name: 'Presente Fatalistico', description: 'Senso di impotenza e rassegnazione verso la vita', lowLabel: 'Forza', midLabel: 'Normale', highLabel: 'Area di crescita' },
    { code: 'T5', name: 'Futuro', description: 'Orientamento verso obiettivi, pianificazione e carriera', lowLabel: 'Area di crescita', midLabel: 'Adeguato', highLabel: 'Forza' },
];

export const QUESTIONNAIRES: Record<QuestionnaireType, QuestionnaireConfig> = {
    QSA: {
        id: 'QSA',
        name: 'QSA',
        fullName: 'Questionario sulle Strategie di Apprendimento',
        description: 'Analisi delle strategie cognitive e affettive di apprendimento',
        factorPrefix: ['C', 'A'],
        factors: QSA_FACTOR_DEFINITIONS,
        invertedFactors: ['C3', 'C6', 'A1', 'A4', 'A5', 'A7'],
        color: 'bg-blue-500',
        icon: '📊',
    },
    QSAr: {
        id: 'QSAr',
        name: 'QSAr',
        fullName: 'Questionario sulle Strategie di Apprendimento - Ridotto',
        description: 'Versione ridotta del QSA per valutazioni rapide',
        factorPrefix: ['C', 'A'],
        factors: QSAR_FACTOR_DEFINITIONS,
        invertedFactors: ['C4r', 'A1r'],
        color: 'bg-sky-500',
        icon: '📋',
    },
    QPCS: {
        id: 'QPCS',
        name: 'QPCS',
        fullName: 'Questionario sulla Percezione delle proprie Competenze Strategiche',
        description: 'Valutazione della percezione delle competenze metacognitive',
        factorPrefix: ['P'],
        factors: PLACEHOLDER_FACTORS,
        invertedFactors: [],
        color: 'bg-purple-500',
        icon: '🎯',
    },
    QPCC: {
        id: 'QPCC',
        name: 'QPCC',
        fullName: 'Questionario di Percezione delle proprie Competenze e Convinzioni',
        description: 'Analisi delle competenze percepite e delle convinzioni personali',
        factorPrefix: ['C'],
        factors: PLACEHOLDER_FACTORS,
        invertedFactors: [],
        color: 'bg-indigo-500',
        icon: '💡',
    },
    ZTPI: {
        id: 'ZTPI',
        name: 'ZTPI',
        fullName: 'Zimbardo Time Perspective Inventory',
        description: 'Valutazione della prospettiva temporale secondo Zimbardo',
        factorPrefix: ['T'],
        factors: ZTPI_FACTOR_DEFINITIONS,
        invertedFactors: ['T1', 'T4'],
        color: 'bg-amber-500',
        icon: '⏰',
    },
    SAVICKAS: {
        id: 'SAVICKAS',
        name: 'SAVICKAS',
        fullName: 'Intervista Savickas di Career Counseling',
        description: 'Percorso narrativo guidato con le 5 domande della Career Construction Interview',
        factorPrefix: [],
        factors: [],
        invertedFactors: [],
        color: 'bg-emerald-500',
        icon: '🧭',
    },
    QAP: {
        id: 'QAP',
        name: 'QAP',
        fullName: 'Questionario di Adattabilità Professionale',
        description: 'Valutazione delle capacità di adattamento al contesto lavorativo',
        factorPrefix: ['A'],
        factors: PLACEHOLDER_FACTORS,
        invertedFactors: [],
        color: 'bg-green-500',
        icon: '💼',
    },
};

export const QUESTIONNAIRE_LIST = Object.values(QUESTIONNAIRES);

// Helper to get questionnaire by ID
export function getQuestionnaire(id: QuestionnaireType): QuestionnaireConfig {
    return QUESTIONNAIRES[id];
}
