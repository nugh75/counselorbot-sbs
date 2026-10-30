'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n-context';
import { canUseServer, localLlmText, modelsSummary, serverStatusText, type LocalDetectResponse } from '@/lib/local-llm';

interface Props {
    // Unsaved address typed in the «Server locale / compatibile OpenAI» field.
    customUrl: string;
    currentValues: Record<string, string>;
    envOverrides: Record<string, boolean>;
    onUse: (key: string, value: string) => void;
}

export function LocalLlmDetect({ customUrl, currentValues, envOverrides, onUse }: Props) {
    const { lang } = useI18n();
    const [result, setResult] = useState<LocalDetectResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const detect = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/admin/local-llm/detect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CounselorBot' },
                body: JSON.stringify({ custom_url: customUrl.trim() || null }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setResult(await res.json());
        } catch (err) {
            setResult(null);
            setError(`${localLlmText(lang, 'failed')}: ${err instanceof Error ? err.message : ''}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="rounded-card border border-line bg-surface shadow-card p-4 space-y-4" data-testid="local-llm-detect">
            <div className="flex flex-wrap items-center gap-4">
                <Button type="button" size="sm" variant="secondary" onClick={detect} disabled={loading}>
                    <RefreshCw aria-hidden className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    {localLlmText(lang, loading ? 'detecting' : 'detect')}
                </Button>
                <p className="flex-1 min-w-[16rem] text-xs text-ink-muted">{localLlmText(lang, 'help')}</p>
            </div>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            {result && (
                <div className="space-y-2" aria-live="polite">
                    {result.in_docker && <p className="text-xs text-ink-muted">{localLlmText(lang, 'dockerNote')}</p>}
                    <ul className="space-y-2">
                        {result.servers.map(server => {
                            const reachable = server.status === 'ok' || server.status === 'auth_required';
                            const current = currentValues[server.config_key] || '';
                            return (
                                <li key={server.id} className="rounded-control border border-line p-4 text-sm">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-semibold text-ink">{localLlmText(lang, `server.${server.id}`)}</span>
                                        <span className={`rounded-full px-2 py-1 text-xs ${reachable ? 'bg-success-soft text-success-ink' : 'bg-surface-raised text-ink-muted'}`}>
                                            {serverStatusText(lang, server)}
                                        </span>
                                        <code className="text-xs text-ink-muted break-all">{server.url}</code>
                                        {canUseServer(server, current, envOverrides[server.config_key] || false) ? (
                                            <Button type="button" size="sm" variant="ghost" className="ml-auto"
                                                onClick={() => onUse(server.config_key, server.config_value)}>
                                                {localLlmText(lang, 'use')}
                                            </Button>
                                        ) : reachable && server.config_value === current.trim() && (
                                            <span className="ml-auto text-xs text-ink-muted">{localLlmText(lang, 'inUse')}</span>
                                        )}
                                    </div>
                                    {server.status === 'ok' && (
                                        <p className="mt-1 text-xs text-ink-muted break-words">
                                            {server.models.length
                                                ? localLlmText(lang, 'models', { list: modelsSummary(server.models) })
                                                : localLlmText(lang, 'noModels')}
                                        </p>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                    <p className="text-xs text-ink-muted">
                        {result.api_key.configured
                            ? localLlmText(lang, 'keyConfigured', { variable: result.api_key.environment_variable ?? '' })
                            : localLlmText(lang, 'keyMissing', { variable: result.api_key.preferred_environment_variable })}
                    </p>
                </div>
            )}
        </div>
    );
}
