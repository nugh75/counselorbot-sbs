// Sezioni della console di amministrazione, deep-linkabili con `/admin?tab=<id>`:
// `/admin/classi` e il "torna indietro" delle impostazioni di classe tornano
// alla stessa scheda invece di una pagina staccata senza navigazione.
export const ADMIN_TABS = [
    'assistantManager', 'config', 'logs', 'costs', 'presets', 'benchmark', 'promptExperiments', 'counselors',
    'approvedStrategies', 'toolBriefs', 'threadGuard', 'certifiedStrategies', 'certifiedReadings', 'orientationReferrals',
    'skills', 'assistantQuestions', 'guidedStepQuestions', 'promptExport', 'ragDocs', 'tavoloImages', 'audio', 'surveys',
    'results', 'questionnaires', 'validation', 'researchContacts', 'administrationPlans', 'groupsClasses', 'usersSummary',
    'training', 'pqbl', 'rolePreview',
] as const;

export type AdminTab = typeof ADMIN_TABS[number];

export const DEFAULT_ADMIN_TAB: AdminTab = 'config';
export const ADMIN_CLASSES_HREF = '/admin?tab=groupsClasses';

export function parseAdminTab(search: string): AdminTab | null {
    const tab = new URLSearchParams(search).get('tab');
    return ADMIN_TABS.find(item => item === tab) ?? null;
}

// URL relativo con `?tab=` allineato alla scheda attiva (assente per quella
// predefinita), o null se è già allineato.
export function adminTabUrl(href: string, tab: AdminTab): string | null {
    const url = new URL(href);
    const current = url.searchParams.get('tab');
    const next = tab === DEFAULT_ADMIN_TAB ? null : tab;
    if (current === next) return null;
    if (next) url.searchParams.set('tab', next);
    else url.searchParams.delete('tab');
    return `${url.pathname}${url.search}${url.hash}`;
}
