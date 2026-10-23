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
        <div className="glass-panel p-4 space-y-3" data-testid="local-llm-detect">
            <div className="flex flex-wrap items-center gap-3">
                <Button type="button" size="sm" variant="secondary" onClick={detect} disabled={loading}>
                    <RefreshCw aria-hidden className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    {localLlmText(lang, loading ? 'detecting' : 'detect')}
                </Button>
                <p className="flex-1 min-w-[16rem] text-xs text-slate-500">{localLlmText(lang, 'help')}</p>
            </div>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            {result && (
                <div className="space-y-2" aria-live="polite">
                    {result.in_docker && <p className="text-xs text-slate-500">{localLlmText(lang, 'dockerNote')}</p>}
                    <ul className="space-y-2">
                        {result.servers.map(server => {
                            const reachable = server.status === 'ok' || server.status === 'auth_required';
                            const current = currentValues[server.config_key] || '';
                            return (
                                <li key={server.id} className="rounded-md border border-slate-200 p-3 text-sm">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-semibold text-slate-800">{localLlmText(lang, `server.${server.id}`)}</span>
                                        <span className={`rounded-full px-2 py-0.5 text-xs ${reachable ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
                                            {serverStatusText(lang, server)}
                                        </span>
                                        <code className="text-xs text-slate-500 break-all">{server.url}</code>
                                        {canUseServer(server, current, envOverrides[server.config_key] || false) ? (
                                            <Button type="button" size="sm" variant="ghost" className="ml-auto"
                                                onClick={() => onUse(server.config_key, server.config_value)}>
                                                {localLlmText(lang, 'use')}
                                            </Button>
                                        ) : reachable && server.config_value === current.trim() && (
                                            <span className="ml-auto text-xs text-slate-500">{localLlmText(lang, 'inUse')}</span>
                                        )}
                                    </div>
                                    {server.status === 'ok' && (
                                        <p className="mt-1 text-xs text-slate-600 break-words">
                                            {server.models.length
                                                ? localLlmText(lang, 'models', { list: modelsSummary(server.models) })
                                                : localLlmText(lang, 'noModels')}
                                        </p>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                    <p className="text-xs text-slate-500">
                        {result.api_key.configured
                            ? localLlmText(lang, 'keyConfigured', { variable: result.api_key.environment_variable ?? '' })
                            : localLlmText(lang, 'keyMissing', { variable: result.api_key.preferred_environment_variable })}
                    </p>
                </div>
            )}
        </div>
    );
}
