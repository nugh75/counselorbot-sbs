'use client';

import { useState, useEffect } from 'react';
import { Save, Server, Cpu } from 'lucide-react';

interface ConfigItem {
    key: string;
    value: string;
    description: string;
}

const PROVIDERS: Record<string, { label: string; models: string[] }> = {
    openai: {
        label: 'OpenAI',
        models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo']
    },
    anthropic: {
        label: 'Anthropic',
        models: ['claude-3-opus-20240229', 'claude-3-5-sonnet-20240620', 'claude-3-haiku-20240307']
    },
    gemini: {
        label: 'Google Gemini',
        models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro']
    },
    mistral: {
        label: 'Mistral AI',
        models: ['mistral-large-latest', 'mistral-medium', 'mistral-small']
    },
    openrouter: {
        label: 'OpenRouter',
        models: [
            'google/gemini-2.0-flash-001',
            'deepseek/deepseek-r1',
            'deepseek/deepseek-chat',
            'anthropic/claude-3.7-sonnet',
            'meta-llama/llama-3.3-70b-instruct',
            'openai/gpt-4o',
            'openai/gpt-4o-mini',
            'mistralai/mistral-large-2411',
            'nvidia/llama-3.1-nemotron-70b-instruct'
        ]
    },
    ollama: {
        label: 'Ollama (Local)',
        models: ['llama3', 'mistral', 'gemma2', 'phi3']
    }
};

export function ConfigForm() {
    const [configs, setConfigs] = useState<ConfigItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeProvider, setActiveProvider] = useState('openai');
    const [activeModel, setActiveModel] = useState('gpt-4o');

    const fetchConfigs = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/admin/config`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data: ConfigItem[] = await res.json();
                setConfigs(data);

                // Sync local state
                const prov = data.find(c => c.key === 'active_provider')?.value;
                const mod = data.find(c => c.key === 'model_name')?.value;
                if (prov) setActiveProvider(prov);
                if (mod) setActiveModel(mod);
            } else {
                if (res.status === 401 || res.status === 403) {
                    localStorage.removeItem('token');
                    window.location.href = '/counselorbot/login';
                }
                console.error('Failed to fetch config:', res.statusText);
            }
        } catch (error) {
            console.error('Failed to fetch config', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConfigs();
    }, []);

    const handleSave = async (item: ConfigItem) => {
        try {
            const token = localStorage.getItem('token');
            await fetch(`/api/admin/config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(item),
            });
        } catch (error) {
            console.error('Failed to save config', error);
        }
    };

    const handleProviderChange = (provider: string) => {
        setActiveProvider(provider);
        handleSave({ key: 'active_provider', value: provider, description: 'Provider AI attivo' });

        // Default to first model of new provider
        const firstModel = PROVIDERS[provider]?.models[0] || '';
        setActiveModel(firstModel);
        handleSave({ key: 'model_name', value: firstModel, description: 'Es. gpt-4o, claude-3-opus' });
    };

    const handleModelChange = (model: string) => {
        setActiveModel(model);
        handleSave({ key: 'model_name', value: model, description: 'Es. gpt-4o, claude-3-opus' });
    };

    if (loading) return <div className="text-center py-8 text-gray-400">Caricamento configurazioni...</div>;

    const apiKeys = [
        { key: 'api_key_openai', label: 'API Key OpenAI' },
        { key: 'api_key_anthropic', label: 'API Key Anthropic' },
        { key: 'api_key_gemini', label: 'API Key Gemini' },
        { key: 'api_key_mistral', label: 'API Key Mistral' },
        { key: 'api_key_openrouter', label: 'API Key OpenRouter' },
        { key: 'ollama_ip', label: 'Ollama IP Address' },
    ];

    const prompts = [
        { key: 'prompt_factor', label: 'Prompt Analisi Fattori' },
        { key: 'prompt_second_level', label: 'Prompt Secondo Livello' },
        { key: 'prompt_generic', label: 'Prompt Chat Generica' },
    ];

    return (
        <div className="space-y-8">
            {/* 1. Provider & Model Selection */}
            <div className="glass-panel p-6 rounded-xl space-y-6">
                <h3 className="text-lg font-medium text-slate-900 flex items-center gap-2">
                    <Server className="w-5 h-5 text-blue-600" />
                    Configurazione IA Attiva
                </h3>

                <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Provider</label>
                        <select
                            value={activeProvider}
                            onChange={(e) => handleProviderChange(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            {Object.entries(PROVIDERS).map(([key, data]) => (
                                <option key={key} value={key}>{data.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Modello</label>
                        <div className="relative">
                            <Cpu className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                            <select
                                value={activeModel}
                                onChange={(e) => handleModelChange(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 pl-10 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                                {PROVIDERS[activeProvider]?.models.map((model) => (
                                    <option key={model} value={model}>{model}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. API Keys */}
            <div className="grid gap-4">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider ml-1">API Keys</h3>
                {apiKeys.map((def) => {
                    const currentVal = configs.find(c => c.key === def.key)?.value || '';
                    const isActive =
                        (activeProvider === 'openai' && def.key === 'api_key_openai') ||
                        (activeProvider === 'anthropic' && def.key === 'api_key_anthropic') ||
                        (activeProvider === 'gemini' && def.key === 'api_key_gemini') ||
                        (activeProvider === 'mistral' && def.key === 'api_key_mistral') ||
                        (activeProvider === 'openrouter' && def.key === 'api_key_openrouter') ||
                        (activeProvider === 'ollama' && def.key === 'ollama_ip');

                    return (
                        <div key={def.key} className={`glass-panel p-4 rounded-xl flex items-center gap-4 transition-colors ${isActive ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400' : 'hover:border-slate-400'}`}>
                            <div className="flex-1">
                                <label className="text-xs font-semibold text-slate-500 mb-1 block">{def.label}</label>
                                <input
                                    type="password"
                                    className="w-full bg-transparent border-none p-0 text-sm text-slate-900 focus:ring-0 placeholder-slate-400 font-mono"
                                    placeholder="sk-..."
                                    value={currentVal}
                                    onChange={(e) => {
                                        const newVal = e.target.value;
                                        setConfigs(prev => {
                                            const others = prev.filter(p => p.key !== def.key);
                                            return [...others, { key: def.key, value: newVal, description: def.label }];
                                        });
                                    }}
                                />
                            </div>
                            <button
                                onClick={() => handleSave({ key: def.key, value: configs.find(c => c.key === def.key)?.value || '', description: def.label })}
                                className="p-2 hover:bg-slate-200 rounded-lg text-blue-600 transition-colors"
                            >
                                <Save className="w-4 h-4" />
                            </button>
                        </div>
                    )
                })}
            </div>

            {/* 3. Prompts */}
            <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider ml-1">System Prompts</h3>
                {prompts.map((def) => {
                    const currentVal = configs.find(c => c.key === def.key)?.value || '';

                    return (
                        <div key={def.key} className="glass-panel p-6 rounded-xl space-y-3">
                            <div className="flex justify-between items-start">
                                <h3 className="text-sm font-bold text-blue-700">{def.label}</h3>
                                <button
                                    onClick={() => handleSave({ key: def.key, value: currentVal, description: def.label })}
                                    className="p-2 hover:bg-slate-100 rounded-lg text-blue-600 transition-colors"
                                >
                                    <Save className="w-4 h-4" />
                                </button>
                            </div>

                            <textarea
                                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-sm min-h-[120px] focus:ring-2 focus:ring-blue-500 outline-none font-mono text-slate-900"
                                value={currentVal}
                                onChange={(e) => {
                                    const newVal = e.target.value;
                                    setConfigs(prev => {
                                        const others = prev.filter(p => p.key !== def.key);
                                        return [...others, { key: def.key, value: newVal, description: def.label }];
                                    });
                                }}
                            />
                        </div>
                    )
                })}
            </div>
        </div>
    );
}
