import type { Lang } from '@/lib/i18n';
import { personalAreaName } from '@/lib/i18n-personal-area';
import { QUESTIONNAIRES } from '@/lib/questionnaires';

export function resolveClassPathToolName(toolKey: string, lang: string): string {
    const key = toolKey.toLowerCase();
    try {
        const personal = personalAreaName(lang as Lang, key as any);
        if (personal) return personal;
    } catch {
        // Not a personal area slug
    }
    const upper = toolKey.toUpperCase();
    if (upper in QUESTIONNAIRES) {
        const q = QUESTIONNAIRES[upper as keyof typeof QUESTIONNAIRES];
        return q?.fullName || q?.name || toolKey;
    }
    return toolKey;
}
