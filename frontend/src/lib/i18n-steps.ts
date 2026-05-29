// Etichette degli step guidati tradotte (EN/SV).
// Sono testi NOSTRI dell'interfaccia (non gli item degli strumenti).
// L'italiano resta gestito dal DB (admin-editable) e usato come fallback.
import type { Lang } from './i18n';

type StepLabelMap = Record<string, string>;

const en: StepLabelMap = {
    // QSA
    'cognitive': '1. Cognitive Factors',
    'affective': '2. Affective Factors',
    'sl-elaboration': '3.1 Elaboration & Org.',
    'sl-selfcontrol': '3.2 Self-control',
    'sl-motivation': '3.3 Motivation',
    'sl-emotions': '3.4 Emotional Management',
    'sl-attribution': '3.5 Attributional Style',
    'sl-social': '3.6 Social Dimension',
    // QSAr
    'qsar-cognitive': '1. Cognitive Factors',
    'qsar-affective': '2. Affective Factors',
    'qsar-processing': '3. Elaboration & Organisation',
    'qsar-selfcontrol': '4. Self-regulation & Attention',
    'qsar-motivation': '5. Motivation & Competence',
    'qsar-emotions': '6. Emotional Management',
    'qsar-attributions': '7. Causal Attributions',
    // ZTPI
    'ztpi-t1': '1. Past Negative',
    'ztpi-t2': '2. Past Positive',
    'ztpi-t3': '3. Present Hedonistic',
    'ztpi-t4': '4. Present Fatalistic',
    'ztpi-t5': '5. Future',
    'ztpi-btp': '6. Balanced Time Profile',
    // Savickas
    'savickas-patto': '0. Collaboration Agreement',
    'savickas-q1': '1. Role Models',
    'savickas-q2': '2. Favourite Media',
    'savickas-q3': '3. Favourite Story',
    'savickas-q4': '4. Personal Motto',
    'savickas-q5': '5. Early Recollections',
    'savickas-final': "6. Narrative Synthesis & Action Plan",
    // QPCS / QPCC / QAP (analisi fattori su punteggi)
    'qpcs-factors': '1. Skills Analysis',
    'qpcc-factors': '1. Competences & Beliefs Analysis',
    'qap-factors': '1. Resources Analysis',
};

const sv: StepLabelMap = {
    // QSA
    'cognitive': '1. Kognitiva faktorer',
    'affective': '2. Affektiva faktorer',
    'sl-elaboration': '3.1 Bearbetning & org.',
    'sl-selfcontrol': '3.2 Självkontroll',
    'sl-motivation': '3.3 Motivation',
    'sl-emotions': '3.4 Känslohantering',
    'sl-attribution': '3.5 Attributionsstil',
    'sl-social': '3.6 Social dimension',
    // QSAr
    'qsar-cognitive': '1. Kognitiva faktorer',
    'qsar-affective': '2. Affektiva faktorer',
    'qsar-processing': '3. Bearbetning & organisation',
    'qsar-selfcontrol': '4. Självreglering & uppmärksamhet',
    'qsar-motivation': '5. Motivation & kompetens',
    'qsar-emotions': '6. Känslohantering',
    'qsar-attributions': '7. Orsaksattributioner',
    // ZTPI
    'ztpi-t1': '1. Negativt förflutet',
    'ztpi-t2': '2. Positivt förflutet',
    'ztpi-t3': '3. Hedonistisk nutid',
    'ztpi-t4': '4. Fatalistisk nutid',
    'ztpi-t5': '5. Framtid',
    'ztpi-btp': '6. Balanserad tidsprofil',
    // Savickas
    'savickas-patto': '0. Samarbetsöverenskommelse',
    'savickas-q1': '1. Förebilder',
    'savickas-q2': '2. Favoritmedier',
    'savickas-q3': '3. Favoritberättelse',
    'savickas-q4': '4. Personligt motto',
    'savickas-q5': '5. Tidiga minnen',
    'savickas-final': '6. Narrativ sammanfattning & handlingsplan',
    // QPCS / QPCC / QAP (analisi fattori su punteggi)
    'qpcs-factors': '1. Kompetensanalys',
    'qpcc-factors': '1. Analys av kompetenser & föreställningar',
    'qap-factors': '1. Resursanalys',
};

const es: StepLabelMap = {
    'cognitive': '1. Factores cognitivos',
    'affective': '2. Factores afectivos',
    'sl-elaboration': '3.1 Elaboración y organización',
    'sl-selfcontrol': '3.2 Autocontrol',
    'sl-motivation': '3.3 Motivación',
    'sl-emotions': '3.4 Gestión emocional',
    'sl-attribution': '3.5 Estilo atribucional',
    'sl-social': '3.6 Dimensión social',
    'qsar-cognitive': '1. Factores cognitivos',
    'qsar-affective': '2. Factores afectivos',
    'qsar-processing': '3. Elaboración y organización',
    'qsar-selfcontrol': '4. Autorregulación y atención',
    'qsar-motivation': '5. Motivación y competencia',
    'qsar-emotions': '6. Gestión emocional',
    'qsar-attributions': '7. Atribuciones causales',
    'ztpi-t1': '1. Pasado negativo',
    'ztpi-t2': '2. Pasado positivo',
    'ztpi-t3': '3. Presente hedonista',
    'ztpi-t4': '4. Presente fatalista',
    'ztpi-t5': '5. Futuro',
    'ztpi-btp': '6. Perfil temporal equilibrado',
    'savickas-patto': '0. Acuerdo de colaboración',
    'savickas-q1': '1. Modelos de referencia',
    'savickas-q2': '2. Medios preferidos',
    'savickas-q3': '3. Historia preferida',
    'savickas-q4': '4. Lema personal',
    'savickas-q5': '5. Primeros recuerdos',
    'savickas-final': '6. Síntesis narrativa y plan de acción',
    'qpcs-factors': '1. Análisis de competencias',
    'qpcc-factors': '1. Análisis de competencias y creencias',
    'qap-factors': '1. Análisis de recursos',
};

const fr: StepLabelMap = {
    'cognitive': '1. Facteurs cognitifs',
    'affective': '2. Facteurs affectifs',
    'sl-elaboration': '3.1 Élaboration et organisation',
    'sl-selfcontrol': '3.2 Autocontrôle',
    'sl-motivation': '3.3 Motivation',
    'sl-emotions': '3.4 Gestion émotionnelle',
    'sl-attribution': '3.5 Style attributionnel',
    'sl-social': '3.6 Dimension sociale',
    'qsar-cognitive': '1. Facteurs cognitifs',
    'qsar-affective': '2. Facteurs affectifs',
    'qsar-processing': '3. Élaboration et organisation',
    'qsar-selfcontrol': '4. Autorégulation et attention',
    'qsar-motivation': '5. Motivation et compétence',
    'qsar-emotions': '6. Gestion émotionnelle',
    'qsar-attributions': '7. Attributions causales',
    'ztpi-t1': '1. Passé négatif',
    'ztpi-t2': '2. Passé positif',
    'ztpi-t3': '3. Présent hédoniste',
    'ztpi-t4': '4. Présent fataliste',
    'ztpi-t5': '5. Futur',
    'ztpi-btp': '6. Profil temporel équilibré',
    'savickas-patto': '0. Accord de collaboration',
    'savickas-q1': '1. Modèles de rôle',
    'savickas-q2': '2. Médias préférés',
    'savickas-q3': '3. Histoire préférée',
    'savickas-q4': '4. Devise personnelle',
    'savickas-q5': '5. Premiers souvenirs',
    'savickas-final': "6. Synthèse narrative et plan d'action",
    'qpcs-factors': '1. Analyse des compétences',
    'qpcc-factors': '1. Analyse des compétences et croyances',
    'qap-factors': '1. Analyse des ressources',
};

const de: StepLabelMap = {
    'cognitive': '1. Kognitive Faktoren',
    'affective': '2. Affektive Faktoren',
    'sl-elaboration': '3.1 Verarbeitung und Organisation',
    'sl-selfcontrol': '3.2 Selbstkontrolle',
    'sl-motivation': '3.3 Motivation',
    'sl-emotions': '3.4 Emotionsmanagement',
    'sl-attribution': '3.5 Attributionsstil',
    'sl-social': '3.6 Soziale Dimension',
    'qsar-cognitive': '1. Kognitive Faktoren',
    'qsar-affective': '2. Affektive Faktoren',
    'qsar-processing': '3. Verarbeitung und Organisation',
    'qsar-selfcontrol': '4. Selbstregulation und Aufmerksamkeit',
    'qsar-motivation': '5. Motivation und Kompetenz',
    'qsar-emotions': '6. Emotionsmanagement',
    'qsar-attributions': '7. Kausale Attributionen',
    'ztpi-t1': '1. Negative Vergangenheit',
    'ztpi-t2': '2. Positive Vergangenheit',
    'ztpi-t3': '3. Hedonistische Gegenwart',
    'ztpi-t4': '4. Fatalistische Gegenwart',
    'ztpi-t5': '5. Zukunft',
    'ztpi-btp': '6. Ausgewogenes Zeitprofil',
    'savickas-patto': '0. Vereinbarung zur Zusammenarbeit',
    'savickas-q1': '1. Vorbilder',
    'savickas-q2': '2. Bevorzugte Medien',
    'savickas-q3': '3. Lieblingsgeschichte',
    'savickas-q4': '4. Persönliches Motto',
    'savickas-q5': '5. Frühe Erinnerungen',
    'savickas-final': '6. Narrative Synthese und Aktionsplan',
    'qpcs-factors': '1. Kompetenzanalyse',
    'qpcc-factors': '1. Analyse von Kompetenzen und Überzeugungen',
    'qap-factors': '1. Ressourcenanalyse',
};

// IT non incluso: per l'italiano si usa l'etichetta dal DB (admin-editable).
const STEP_LABELS: Partial<Record<Lang, StepLabelMap>> = { en, es, fr, de, sv };

/** Etichetta step localizzata; fallback al testo dal DB (italiano) se manca. */
export function stepLabel(lang: Lang, stepId: string, fallback: string): string {
    return STEP_LABELS[lang]?.[stepId] ?? fallback;
}
