import type { Lang } from './i18n';

type Localized = readonly [string, string, string, string, string, string];
const languages: readonly Lang[] = ['it', 'en', 'es', 'fr', 'de', 'sv'];
const texts = {
    title: ['Attività in corso', 'Activities in progress', 'Actividades en curso', 'Activités en cours', 'Laufende Aktivitäten', 'Pågående aktiviteter'],
    subtitle: [
        'Quello che hai iniziato e puoi riprendere da dove l’hai lasciato.',
        'What you have started and can pick up where you left it.',
        'Lo que has empezado y puedes retomar donde lo dejaste.',
        'Ce que tu as commencé et peux reprendre là où tu l’as laissé.',
        'Was du begonnen hast und dort fortsetzen kannst, wo du aufgehört hast.',
        'Det du har påbörjat och kan fortsätta där du slutade.',
    ],
    open: ['Apri l’attività', 'Open the activity', 'Abrir la actividad', 'Ouvrir l’activité', 'Aktivität öffnen', 'Öppna aktiviteten'],
    all: ['Vedi tutte le attività', 'See all activities', 'Ver todas las actividades', 'Voir toutes les activités', 'Alle Aktivitäten ansehen', 'Se alla aktiviteter'],
    loading: ['Carico le attività in corso…', 'Loading activities in progress…', 'Cargando las actividades en curso…', 'Chargement des activités en cours…', 'Laufende Aktivitäten werden geladen…', 'Laddar pågående aktiviteter…'],
    error: ['Non riesco a caricare le attività in corso.', 'The activities in progress could not be loaded.', 'No se han podido cargar las actividades en curso.', 'Impossible de charger les activités en cours.', 'Die laufenden Aktivitäten konnten nicht geladen werden.', 'Det gick inte att ladda de pågående aktiviteterna.'],
    retry: ['Riprova', 'Try again', 'Reintentar', 'Réessayer', 'Erneut versuchen', 'Försök igen'],
} satisfies Record<string, Localized>;

const languageIndex = (lang: Lang) => Math.max(0, languages.indexOf(lang));
export const activeActionsText = (lang: Lang, key: keyof typeof texts) => texts[key][languageIndex(lang)];
