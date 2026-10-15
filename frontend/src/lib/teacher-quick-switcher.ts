import type { StudentGroup } from '../components/teacher/class-group-types';

/**
 * Calcola l'URL verso cui navigare quando il docente o l'admin seleziona un'altra classe dallo switcher rapido,
 * preservando l'eventuale tab secondario attivo (es. partecipanti/risultati, strumenti, percorsi, forum)
 * e la rotta contestuale (/docente/classi o /admin/classi).
 */
export function computeClassSwitchUrl(
    targetGroupId: number,
    currentTab?: string,
    basePath: string = '/docente/classi'
): string {
    const tabQuery = currentTab && currentTab !== 'overview' ? `?tab=${encodeURIComponent(currentTab)}` : '';
    return `${basePath}/${targetGroupId}${tabQuery}`;
}

/**
 * Filtra e ordina le classi attive disponibili per la navigazione rapida.
 */
export function getActiveSwitchGroups(groups: StudentGroup[] | undefined): StudentGroup[] {
    if (!groups || !Array.isArray(groups)) return [];
    return groups.filter(g => g.is_active);
}
