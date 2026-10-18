import type { Lang } from './i18n';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { systemAIText, type SystemAIKey } from './i18n-system-ai.ts';

export interface SystemAIProbeResult {
    role: 'primary' | 'fallback';
    provider: string;
    model: string;
    effective_model?: string | null;
    ok: boolean;
    error_code?: string | null;
    elapsed_ms: number;
}

export interface SystemAITestResponse {
    system_configured: boolean;
    results: SystemAIProbeResult[];
}

const ERROR_KEY_MAP: Record<string, SystemAIKey> = {
    auth: 'errorAuth',
    model_not_found: 'errorModelNotFound',
    quota: 'errorQuota',
    network: 'errorNetwork',
    timeout: 'errorTimeout',
    rate_limit: 'errorRateLimit',
    invalid_request: 'errorInvalidRequest',
    not_configured: 'errorNotConfigured',
};

export function formatSystemAIError(lang: Lang, errorCode?: string | null): string {
    if (!errorCode) return systemAIText(lang, 'errorUnknown');
    const key = ERROR_KEY_MAP[errorCode] || 'errorUnknown';
    return systemAIText(lang, key);
}

export function systemAIRoleLabel(lang: Lang, role: 'primary' | 'fallback', fallbackIndex?: number): string {
    if (role === 'primary') {
        return systemAIText(lang, 'primaryRole');
    }
    return systemAIText(lang, 'fallbackRole', { n: fallbackIndex ?? 1 });
}

export function formatProbeDetail(lang: Lang, probe: SystemAIProbeResult): string {
    if (!probe.ok) {
        return formatSystemAIError(lang, probe.error_code);
    }
    const parts: string[] = [];
    if (probe.effective_model && probe.effective_model !== probe.model) {
        parts.push(`${systemAIText(lang, 'effectiveModelLabel')}: ${probe.effective_model}`);
    }
    parts.push(`${probe.elapsed_ms} ms`);
    return parts.join(' · ');
}
