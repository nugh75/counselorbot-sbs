import type { Lang } from '@/lib/i18n';
import { personalAreaName } from '@/lib/i18n-personal-area';
import { classSettingsText, classSettingsTexts } from '@/lib/i18n-class-settings';
import { QUESTIONNAIRES } from '@/lib/questionnaires';

export function resolveClassPathToolName(toolKey: string, lang: string): string {
    const key = toolKey.toLowerCase();
    // Personal tool keys (goals, actions, timeline…) are not personal-area slugs: name them like class settings do.
    if (key in classSettingsTexts) return classSettingsText(lang, key as keyof typeof classSettingsTexts);
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
