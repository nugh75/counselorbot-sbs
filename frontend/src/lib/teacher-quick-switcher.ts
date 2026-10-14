import type { StudentGroup } from '../components/teacher/class-group-types';

/**
 * Calcola l'URL verso cui navigare quando il docente seleziona un'altra classe dallo switcher rapido,
 * preservando l'eventuale tab secondario attivo (es. partecipanti/risultati, strumenti, percorsi, forum).
 */
export function computeClassSwitchUrl(targetGroupId: number, currentTab?: string): string {
    const tabQuery = currentTab && currentTab !== 'overview' ? `?tab=${encodeURIComponent(currentTab)}` : '';
    return `/docente/classi/${targetGroupId}${tabQuery}`;
}

/**
 * Filtra e ordina le classi attive disponibili per la navigazione rapida.
 */
export function getActiveSwitchGroups(groups: StudentGroup[] | undefined): StudentGroup[] {
    if (!groups || !Array.isArray(groups)) return [];
    return groups.filter(g => g.is_active);
}
