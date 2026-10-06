import type { Lang } from './i18n';

export type ExtendedLang = Lang | 'pt';

export const CATEGORY_LABELS: Record<string, Record<string, string>> = {
    filosofo: {
        it: 'Filosofo',
        en: 'Philosopher',
        es: 'Filósofo',
        fr: 'Philosophe',
        de: 'Philosoph',
        sv: 'Filosof',
        pt: 'Filósofo',
    },
    psicologo: {
        it: 'Psicologo',
        en: 'Psychologist',
        es: 'Psicólogo',
        fr: 'Psychologue',
        de: 'Psychologe',
        sv: 'Psykolog',
        pt: 'Psicólogo',
    },
    docente: {
        it: 'Docente',
        en: 'Teacher',
        es: 'Docente',
        fr: 'Enseignant',
        de: 'Lehrkraft',
        sv: 'Lärare',
        pt: 'Docente',
    },
    orientatore: {
        it: 'Orientatore',
        en: 'Guidance Counselor',
        es: 'Orientador',
        fr: "Conseiller d'orientation",
        de: 'Bildungsberater',
        sv: 'Studievägledare',
        pt: 'Orientador',
    },
    tutor: {
        it: 'Tutor',
        en: 'Tutor',
        es: 'Tutor',
        fr: 'Tuteur',
        de: 'Tutor',
        sv: 'Handledare',
        pt: 'Tutor',
    },
    maieutico: {
        it: 'Maieutico',
        en: 'Socratic',
        es: 'Mayéutico',
        fr: 'Maïeutique',
        de: 'Mäeutisch',
        sv: 'Förlossande',
        pt: 'Maiêutico',
    },
    pragmatico: {
        it: 'Pragmatico',
        en: 'Pragmatic',
        es: 'Pragmático',
        fr: 'Pragmatique',
        de: 'Pragmatisch',
        sv: 'Pragmatisk',
        pt: 'Pragmático',
    },
    empatico: {
        it: 'Empatico',
        en: 'Empathetic',
        es: 'Empático',
        fr: 'Empathique',
        de: 'Empathisch',
        sv: 'Empatisk',
        pt: 'Empático',
    },
    analitico: {
        it: 'Analitico',
        en: 'Analytical',
        es: 'Analítico',
        fr: 'Analytique',
        de: 'Analytisch',
        sv: 'Analytisk',
        pt: 'Analítico',
    },
    motivazionale: {
        it: 'Motivazionale',
        en: 'Motivational',
        es: 'Motivacional',
        fr: 'Motivationnel',
        de: 'Motivierend',
        sv: 'Motiverande',
        pt: 'Motivacional',
    },
    metodico: {
        it: 'Metodico',
        en: 'Methodical',
        es: 'Metódico',
        fr: 'Méthodique',
        de: 'Methodisch',
        sv: 'Metodisk',
        pt: 'Metódico',
    },
    ricercatore: {
        it: 'Ricercatore',
        en: 'Researcher',
        es: 'Investigador',
        fr: 'Chercheur',
        de: 'Forscher',
        sv: 'Forskare',
        pt: 'Pesquisador',
    },
    riflessivo: {
        it: 'Riflessivo',
        en: 'Reflective',
        es: 'Reflexivo',
        fr: 'Réflexif',
        de: 'Reflektierend',
        sv: 'Reflekterande',
        pt: 'Reflexivo',
    },
    diretto: {
        it: 'Diretto',
        en: 'Direct',
        es: 'Directo',
        fr: 'Direct',
        de: 'Direkt',
        sv: 'Direkt',
        pt: 'Direto',
    },
    accogliente: {
        it: 'Accogliente',
        en: 'Welcoming',
        es: 'Acogedor',
        fr: 'Accueillant',
        de: 'Einladend',
        sv: 'Välkomnande',
        pt: 'Acolhedor',
    },
    sintetico: {
        it: 'Sintetico',
        en: 'Concise',
        es: 'Sintético',
        fr: 'Synthétique',
        de: 'Prägnant',
        sv: 'Syntetisk',
        pt: 'Sintético',
    },
    equilibrato: {
        it: 'Equilibrato',
        en: 'Balanced',
        es: 'Equilibrado',
        fr: 'Équilibré',
        de: 'Ausgewogen',
        sv: 'Balanserad',
        pt: 'Equilibrado',
    },
    coach: {
        it: 'Coach',
        en: 'Coach',
        es: 'Coach',
        fr: 'Coach',
        de: 'Coach',
        sv: 'Coach',
        pt: 'Coach',
    },
    organizzativo: {
        it: 'Organizzativo',
        en: 'Organizational',
        es: 'Organizativo',
        fr: 'Organisationnel',
        de: 'Organisatorisch',
        sv: 'Organisatorisk',
        pt: 'Organizacional',
    },
    'teorico-pratico': {
        it: 'Teorico-pratico',
        en: 'Theory & practice',
        es: 'Teórico-práctico',
        fr: 'Théorie et pratique',
        de: 'Theorie-Praxis',
        sv: 'Teori och praktik',
        pt: 'Teórico-prático',
    },
};

/**
 * Traduce l'etichetta di una categoria nella lingua indicata con fallback.
 */
export function formatCategoryLabel(category: string, lang: string = 'it'): string {
    const key = category.toLowerCase().trim();
    const entry = CATEGORY_LABELS[key];
    if (entry) {
        if (entry[lang]) return entry[lang];
        if (entry.it) return entry.it;
        if (entry.en) return entry.en;
    }
    return category.charAt(0).toUpperCase() + category.slice(1);
}
