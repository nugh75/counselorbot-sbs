'use client';

import { useState, useEffect } from 'react';
import { Save, Server, Cpu, Plus, Trash2, ChevronUp, ChevronDown, Palette } from 'lucide-react';

// --- Types ---

interface ConfigItem {
    key: string;
    value: string;
    description: string;
}

interface GuidedStep {
    id: string;
    sort_order: number;
    label: string;
    prompt: string;
    system_prompt_mode: string;
    color_theme: string;
}

// --- Constants ---

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
        models: [
            'gemma4:31b',
            'gemma4:26b',
            'qwen3:32b',
            'qwen3:latest',
            'qwen3.5:9b',
            'qwen3-coder-next:latest',
            'qwen2.5-coder:7b',
            'gemma3:27b',
            'gemma3:12b',
            'gemma3:latest',
            'deepseek-r1:latest',
            'deepseek-r1:8b',
            'deepseek-v3.1:671b-cloud',
            'gemini-3-flash-preview:cloud',
            'nemotron-3-nano:30b',
            'nemotron-cascade-2:30b',
            'mistral:7b',
            'gpt-oss:20b',
        ]
    }
};

const SYSTEM_PROMPT_MODES = [
    { value: 'factor', label: 'Analisi Fattori' },
    { value: 'second-level', label: 'Secondo Livello' },
    { value: 'generic', label: 'Generica' },
];

const COLOR_THEMES = [
    { value: 'blue', label: 'Blu', dot: 'bg-blue-500' },
    { value: 'purple', label: 'Viola', dot: 'bg-purple-500' },
    { value: 'indigo', label: 'Indigo', dot: 'bg-indigo-500' },
    { value: 'pink', label: 'Rosa', dot: 'bg-pink-500' },
    { value: 'orange', label: 'Arancione', dot: 'bg-orange-500' },
    { value: 'teal', label: 'Teal', dot: 'bg-teal-500' },
    { value: 'green', label: 'Verde', dot: 'bg-green-500' },
    { value: 'red', label: 'Rosso', dot: 'bg-red-500' },
    { value: 'amber', label: 'Ambra', dot: 'bg-amber-500' },
    { value: 'cyan', label: 'Ciano', dot: 'bg-cyan-500' },
    { value: 'slate', label: 'Grigio', dot: 'bg-slate-500' },
    { value: 'rose', label: 'Rosa chiaro', dot: 'bg-rose-500' },
];

// --- Helper to get auth header ---

function authHeaders(): Record<string, string> {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
}

function authJsonHeaders(): Record<string, string> {
    return { ...authHeaders(), 'Content-Type': 'application/json' };
}

// --- Component ---

export function ConfigForm() {
    const [configs, setConfigs] = useState<ConfigItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeProvider, setActiveProvider] = useState('openai');
    const [activeModel, setActiveModel] = useState('gpt-4o');
    const [envOverrides, setEnvOverrides] = useState<Record<string, boolean>>({});

    // Dynamic guided steps
    const [guidedSteps, setGuidedSteps] = useState<GuidedStep[]>([]);
    const [showNewStepForm, setShowNewStepForm] = useState(false);
    const [newStep, setNewStep] = useState<GuidedStep>({
        id: '', sort_order: 0, label: '', prompt: '',
        system_prompt_mode: 'generic', color_theme: 'blue',
    });

    // --- Fetch all data ---

    const fetchConfigs = async () => {
        try {
            const [configRes, envRes, stepsRes] = await Promise.all([
                fetch('/api/admin/config', { headers: authHeaders() }),
                fetch('/api/admin/config/env-status', { headers: authHeaders() }),
                fetch('/api/admin/guided-steps', { headers: authHeaders() }),
            ]);

            if (configRes.ok) {
                const data: ConfigItem[] = await configRes.json();
                setConfigs(data);
                const prov = data.find(c => c.key === 'active_provider')?.value;
                const mod = data.find(c => c.key === 'model_name')?.value;
                if (prov) setActiveProvider(prov);
                if (mod) setActiveModel(mod);
            } else if (configRes.status === 401 || configRes.status === 403) {
                localStorage.removeItem('token');
                window.location.href = '/login';
            }

            if (envRes.ok) setEnvOverrides(await envRes.json());
            if (stepsRes.ok) setGuidedSteps(await stepsRes.json());
        } catch (error) {
            console.error('Failed to fetch config', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchConfigs(); }, []);

    // --- Config helpers ---

    const handleSaveConfig = async (item: ConfigItem) => {
        try {
            await fetch('/api/admin/config', {
                method: 'POST',
                headers: authJsonHeaders(),
                body: JSON.stringify(item),
            });
        } catch (error) {
            console.error('Failed to save config', error);
        }
    };

    const getConfigValue = (key: string) => configs.find(c => c.key === key)?.value || '';

    const setConfigDraft = (key: string, value: string, description: string) => {
        setConfigs(prev => {
            const others = prev.filter(p => p.key !== key);
            return [...others, { key, value, description }];
        });
    };

    const saveConfigKey = async (key: string, description: string) => {
        await handleSaveConfig({ key, value: getConfigValue(key), description });
    };

    // --- Provider/Model ---

    const handleProviderChange = (provider: string) => {
        setActiveProvider(provider);
        handleSaveConfig({ key: 'active_provider', value: provider, description: 'Provider AI attivo' });
        const firstModel = PROVIDERS[provider]?.models[0] || '';
        setActiveModel(firstModel);
        handleSaveConfig({ key: 'model_name', value: firstModel, description: 'Es. gpt-4o, claude-3-opus' });
    };

    const handleModelChange = (model: string) => {
        setActiveModel(model);
        handleSaveConfig({ key: 'model_name', value: model, description: 'Es. gpt-4o, claude-3-opus' });
    };

    // --- Guided Steps CRUD ---

    const handleSaveStep = async (step: GuidedStep) => {
        try {
            const res = await fetch(`/api/admin/guided-steps/${step.id}`, {
                method: 'PUT',
                headers: authJsonHeaders(),
                body: JSON.stringify({
                    label: step.label,
                    prompt: step.prompt,
                    system_prompt_mode: step.system_prompt_mode,
                    color_theme: step.color_theme,
                }),
            });
            if (!res.ok) console.error('Failed to save step');
        } catch (error) {
            console.error('Failed to save step', error);
        }
    };

    const handleCreateStep = async () => {
        if (!newStep.id.trim() || !newStep.label.trim()) return;
        const stepToCreate = {
            ...newStep,
            id: newStep.id.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
            sort_order: guidedSteps.length > 0 ? Math.max(...guidedSteps.map(s => s.sort_order)) + 1 : 1,
        };
        try {
            const res = await fetch('/api/admin/guided-steps', {
                method: 'POST',
                headers: authJsonHeaders(),
                body: JSON.stringify(stepToCreate),
            });
            if (res.ok) {
                const created = await res.json();
                setGuidedSteps(prev => [...prev, created]);
                setNewStep({ id: '', sort_order: 0, label: '', prompt: '', system_prompt_mode: 'generic', color_theme: 'blue' });
                setShowNewStepForm(false);
            }
        } catch (error) {
            console.error('Failed to create step', error);
        }
    };

    const handleDeleteStep = async (stepId: string) => {
        if (!confirm(`Eliminare lo step "${stepId}"? Questa azione non è reversibile.`)) return;
        try {
            const res = await fetch(`/api/admin/guided-steps/${stepId}`, {
                method: 'DELETE',
                headers: authHeaders(),
            });
            if (res.ok) {
                setGuidedSteps(prev => prev.filter(s => s.id !== stepId));
            }
        } catch (error) {
            console.error('Failed to delete step', error);
        }
    };

    const handleMoveStep = async (stepId: string, direction: 'up' | 'down') => {
        const idx = guidedSteps.findIndex(s => s.id === stepId);
        if (idx < 0) return;
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= guidedSteps.length) return;

        const newSteps = [...guidedSteps];
        const tempOrder = newSteps[idx].sort_order;
        newSteps[idx] = { ...newSteps[idx], sort_order: newSteps[swapIdx].sort_order };
        newSteps[swapIdx] = { ...newSteps[swapIdx], sort_order: tempOrder };
        [newSteps[idx], newSteps[swapIdx]] = [newSteps[swapIdx], newSteps[idx]];
        setGuidedSteps(newSteps);

        try {
            await fetch('/api/admin/guided-steps/reorder', {
                method: 'PATCH',
                headers: authJsonHeaders(),
                body: JSON.stringify(newSteps.map(s => ({ id: s.id, sort_order: s.sort_order }))),
            });
        } catch (error) {
            console.error('Failed to reorder steps', error);
        }
    };

    const updateStepField = (stepId: string, field: keyof GuidedStep, value: string | number) => {
        setGuidedSteps(prev => prev.map(s => s.id === stepId ? { ...s, [field]: value } : s));
    };

    // --- Render ---

    if (loading) return <div className="text-center py-8 text-gray-400">Caricamento configurazioni...</div>;

    const apiKeys = [
        { key: 'api_key_openai', label: 'API Key OpenAI' },
        { key: 'api_key_anthropic', label: 'API Key Anthropic' },
        { key: 'api_key_gemini', label: 'API Key Gemini' },
        { key: 'api_key_mistral', label: 'API Key Mistral' },
        { key: 'api_key_openrouter', label: 'API Key OpenRouter' },
        { key: 'ollama_ip', label: 'Ollama IP Address' },
    ];

    const questionnaireConfigs = [
        {
            id: 'qsa',
            title: 'QSA — Questionario Strategie di Apprendimento',
            color: 'blue' as const,
            systemPrompts: [
                { key: 'prompt_factor', label: 'Prompt Analisi Fattori' },
                { key: 'prompt_second_level', label: 'Prompt Secondo Livello' },
                { key: 'prompt_generic', label: 'Prompt Chat Generica' },
                { key: 'prompt_guided_questions', label: 'Prompt Fase Domande e Approfondimenti' },
            ],
            texts: [
                { key: 'label_guided_questions', label: 'Titolo Step Domande', type: 'input' as const },
                { key: 'text_guided_questions_phase_banner', label: 'Banner Ingresso Fase Domande', type: 'input' as const },
                { key: 'text_guided_questions_intro', label: 'Messaggio Intro Fase Domande', type: 'textarea' as const },
                { key: 'label_guided_conclusion', label: 'Titolo Step Conclusione', type: 'input' as const },
                { key: 'text_guided_conclusion', label: 'Messaggio Conclusione', type: 'textarea' as const },
            ],
        },
        {
            id: 'ztpi',
            title: 'ZTPI — Zimbardo Time Perspective Inventory',
            color: 'emerald' as const,
            systemPrompts: [
                { key: 'prompt_ztpi_factor', label: 'Prompt Analisi Fattori' },
                { key: 'prompt_ztpi_btp', label: 'Prompt Profilo Temporale Bilanciato' },
            ],
            texts: [
                { key: 'text_ztpi_questions_intro', label: 'Messaggio Intro Fase Domande', type: 'textarea' as const },
                { key: 'text_ztpi_conclusion', label: 'Messaggio Conclusione', type: 'textarea' as const },
            ],
        },
        {
            id: 'savickas',
            title: 'Savickas — Career Construction Interview',
            color: 'amber' as const,
            systemPrompts: [
                { key: 'prompt_savickas_interview', label: 'Prompt Intervista' },
                { key: 'prompt_savickas_summary', label: 'Prompt Sintesi Finale' },
            ],
            texts: [
                { key: 'text_savickas_questions_intro', label: 'Messaggio Intro Fase Domande', type: 'textarea' as const },
                { key: 'text_savickas_conclusion', label: 'Messaggio Conclusione', type: 'textarea' as const },
            ],
        },
    ];

    const colorMap = {
        blue: { border: 'border-blue-400', bg: 'bg-blue-50', title: 'text-blue-700', dot: 'bg-blue-500', ring: 'focus:ring-blue-500', subBg: 'bg-blue-100/50', subTitle: 'text-blue-600' },
        emerald: { border: 'border-emerald-400', bg: 'bg-emerald-50', title: 'text-emerald-700', dot: 'bg-emerald-500', ring: 'focus:ring-emerald-500', subBg: 'bg-emerald-100/50', subTitle: 'text-emerald-600' },
        amber: { border: 'border-amber-400', bg: 'bg-amber-50', title: 'text-amber-700', dot: 'bg-amber-500', ring: 'focus:ring-amber-500', subBg: 'bg-amber-100/50', subTitle: 'text-amber-600' },
    };

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
                    const isEnvOverridden = envOverrides[def.key] || false;
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
                                <label className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-2">
                                    {def.label}
                                    {isEnvOverridden && (
                                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">ENV</span>
                                    )}
                                </label>
                                <input
                                    type="password"
                                    className={`w-full bg-transparent border-none p-0 text-sm text-slate-900 focus:ring-0 placeholder-slate-400 font-mono ${isEnvOverridden ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    placeholder={isEnvOverridden ? 'Impostata tramite variabile d\'ambiente (.env)' : 'sk-...'}
                                    value={isEnvOverridden ? '' : currentVal}
                                    disabled={isEnvOverridden}
                                    onChange={(e) => {
                                        const newVal = e.target.value;
                                        setConfigs(prev => {
                                            const others = prev.filter(p => p.key !== def.key);
                                            return [...others, { key: def.key, value: newVal, description: def.label }];
                                        });
                                    }}
                                />
                            </div>
                            {!isEnvOverridden && (
                                <button
                                    onClick={() => handleSaveConfig({ key: def.key, value: configs.find(c => c.key === def.key)?.value || '', description: def.label })}
                                    className="p-2 hover:bg-slate-200 rounded-lg text-blue-600 transition-colors"
                                >
                                    <Save className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* 3. Prompt e Testi — per Questionario */}
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider ml-1">Prompt e Testi per Questionario</h3>
            {questionnaireConfigs.map((q) => {
                const c = colorMap[q.color];
                const allKeys = [...q.systemPrompts.map(p => p.key), ...q.texts.map(t => t.key)];
                return (
                    <div key={q.id} className={`space-y-4 border-l-4 ${c.border} pl-4`}>
                        {/* Header questionario */}
                        <div className={`${c.bg} rounded-lg px-4 py-3 flex items-center justify-between`}>
                            <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${c.dot}`} />
                                <h3 className={`text-sm font-bold ${c.title} uppercase tracking-wider`}>
                                    {q.title}
                                </h3>
                            </div>
                            <button
                                onClick={async () => {
                                    for (const key of allKeys) {
                                        await saveConfigKey(key, key);
                                    }
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 hover:opacity-80 ${c.title} text-xs font-bold rounded-lg transition-colors border ${c.border}`}
                                title="Salva tutto questo questionario"
                            >
                                <Save className="w-3.5 h-3.5" />
                                Salva tutto
                            </button>
                        </div>

                        {/* Sub: Prompt di Sistema */}
                        <div className="space-y-3">
                            <div className={`${c.subBg} rounded px-3 py-1.5`}>
                                <h4 className={`text-xs font-bold ${c.subTitle} uppercase tracking-wider`}>
                                    Prompt di Sistema (istruzioni per l&apos;IA)
                                </h4>
                            </div>
                            {q.systemPrompts.map((def) => {
                                const currentVal = getConfigValue(def.key);
                                return (
                                    <div key={def.key} className="glass-panel p-5 rounded-xl space-y-3">
                                        <div className="flex justify-between items-start gap-3">
                                            <h3 className={`text-sm font-bold ${c.title}`}>{def.label}</h3>
                                            <button
                                                onClick={() => saveConfigKey(def.key, def.label)}
                                                className="p-2 hover:bg-slate-100 rounded-lg text-blue-600 transition-colors shrink-0"
                                            >
                                                <Save className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <textarea
                                            className={`w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-sm min-h-[120px] ${c.ring} outline-none font-mono text-slate-900`}
                                            value={currentVal}
                                            onChange={(e) => setConfigDraft(def.key, e.target.value, def.label)}
                                        />
                                    </div>
                                );
                            })}
                        </div>

                        {/* Sub: Testi e Messaggi */}
                        {q.texts.length > 0 && (
                            <div className="space-y-3">
                                <div className={`${c.subBg} rounded px-3 py-1.5`}>
                                    <h4 className={`text-xs font-bold ${c.subTitle} uppercase tracking-wider`}>
                                        Testi e Messaggi (mostrati allo studente)
                                    </h4>
                                </div>
                                {q.texts.map((def) => {
                                    const currentVal = getConfigValue(def.key);
                                    return (
                                        <div key={def.key} className="glass-panel p-5 rounded-xl space-y-3">
                                            <div className="flex justify-between items-start gap-3">
                                                <h3 className={`text-sm font-bold ${c.title}`}>{def.label}</h3>
                                                <button
                                                    onClick={() => saveConfigKey(def.key, def.label)}
                                                    className="p-2 hover:bg-slate-100 rounded-lg text-blue-600 transition-colors shrink-0"
                                                >
                                                    <Save className="w-4 h-4" />
                                                </button>
                                            </div>
                                            {def.type === 'input' ? (
                                                <input
                                                    className={`w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-sm ${c.ring} outline-none text-slate-900`}
                                                    value={currentVal}
                                                    onChange={(e) => setConfigDraft(def.key, e.target.value, def.label)}
                                                />
                                            ) : (
                                                <textarea
                                                    className={`w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-sm min-h-[80px] ${c.ring} outline-none font-mono text-slate-900`}
                                                    value={currentVal}
                                                    onChange={(e) => setConfigDraft(def.key, e.target.value, def.label)}
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}

            {/* 4. Dynamic Guided Steps */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider ml-1">Step Guidati</h3>
                        <p className="text-xs text-slate-500 ml-1 mt-1">
                            Step di analisi automatica nel percorso guidato. Puoi aggiungere, rimuovere e riordinare.
                        </p>
                    </div>
                    <button
                        onClick={() => setShowNewStepForm(true)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Aggiungi Step
                    </button>
                </div>

                {/* New Step Form */}
                {showNewStepForm && (
                    <div className="glass-panel p-6 rounded-xl space-y-4 border-2 border-dashed border-blue-300 bg-blue-50/30">
                        <h3 className="text-sm font-bold text-blue-700">Nuovo Step</h3>

                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-500">ID (univoco, senza spazi)</label>
                                <input
                                    className="w-full bg-white border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 font-mono"
                                    placeholder="es. analisi-metodo"
                                    value={newStep.id}
                                    onChange={(e) => setNewStep(prev => ({ ...prev, id: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-500">Titolo</label>
                                <input
                                    className="w-full bg-white border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-900"
                                    placeholder="es. 4. Analisi del Metodo"
                                    value={newStep.label}
                                    onChange={(e) => setNewStep(prev => ({ ...prev, label: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-500">Prompt di Sistema</label>
                                <select
                                    className="w-full bg-white border border-slate-300 rounded-lg p-3 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={newStep.system_prompt_mode}
                                    onChange={(e) => setNewStep(prev => ({ ...prev, system_prompt_mode: e.target.value }))}
                                >
                                    {SYSTEM_PROMPT_MODES.map(m => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-500">Colore</label>
                                <select
                                    className="w-full bg-white border border-slate-300 rounded-lg p-3 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={newStep.color_theme}
                                    onChange={(e) => setNewStep(prev => ({ ...prev, color_theme: e.target.value }))}
                                >
                                    {COLOR_THEMES.map(c => (
                                        <option key={c.value} value={c.value}>{c.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-500">Prompt (inviato all&apos;AI per generare l&apos;analisi)</label>
                            <textarea
                                className="w-full bg-white border border-slate-300 rounded-lg p-3 text-sm min-h-[100px] focus:ring-2 focus:ring-blue-500 outline-none font-mono text-slate-900"
                                placeholder="Analizza i fattori..."
                                value={newStep.prompt}
                                onChange={(e) => setNewStep(prev => ({ ...prev, prompt: e.target.value }))}
                            />
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={handleCreateStep}
                                disabled={!newStep.id.trim() || !newStep.label.trim() || !newStep.prompt.trim()}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                            >
                                Crea Step
                            </button>
                            <button
                                onClick={() => setShowNewStepForm(false)}
                                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg transition-colors"
                            >
                                Annulla
                            </button>
                        </div>
                    </div>
                )}

                {/* Existing Steps */}
                <div className="space-y-4">
                    {guidedSteps.map((step, idx) => {
                        const colorDef = COLOR_THEMES.find(c => c.value === step.color_theme);
                        return (
                            <div key={step.id} className="glass-panel p-6 rounded-xl space-y-4">
                                {/* Header with dynamic title */}
                                <div className="flex justify-between items-start gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-3 h-3 rounded-full ${colorDef?.dot || 'bg-blue-500'}`} />
                                        <h3 className="text-sm font-bold text-blue-700">
                                            {step.label || step.id}
                                        </h3>
                                        <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                                            {step.id}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => handleMoveStep(step.id, 'up')}
                                            disabled={idx === 0}
                                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-30"
                                            title="Sposta su"
                                        >
                                            <ChevronUp className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleMoveStep(step.id, 'down')}
                                            disabled={idx === guidedSteps.length - 1}
                                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-30"
                                            title="Sposta giù"
                                        >
                                            <ChevronDown className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleSaveStep(step)}
                                            className="p-1.5 hover:bg-slate-100 rounded-lg text-blue-600 transition-colors"
                                            title="Salva"
                                        >
                                            <Save className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteStep(step.id)}
                                            className="p-1.5 hover:bg-red-50 rounded-lg text-red-400 hover:text-red-600 transition-colors"
                                            title="Elimina"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Editable fields */}
                                <div className="grid md:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-slate-500">Titolo</label>
                                        <input
                                            className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-900"
                                            value={step.label}
                                            onChange={(e) => updateStepField(step.id, 'label', e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-slate-500">Prompt di Sistema</label>
                                        <select
                                            className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={step.system_prompt_mode}
                                            onChange={(e) => updateStepField(step.id, 'system_prompt_mode', e.target.value)}
                                        >
                                            {SYSTEM_PROMPT_MODES.map(m => (
                                                <option key={m.value} value={m.value}>{m.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                                            <Palette className="w-3 h-3" /> Colore
                                        </label>
                                        <select
                                            className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={step.color_theme}
                                            onChange={(e) => updateStepField(step.id, 'color_theme', e.target.value)}
                                        >
                                            {COLOR_THEMES.map(c => (
                                                <option key={c.value} value={c.value}>{c.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-500">Prompt (inviato all&apos;AI)</label>
                                    <textarea
                                        className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-sm min-h-[100px] focus:ring-2 focus:ring-blue-500 outline-none font-mono text-slate-900"
                                        value={step.prompt}
                                        onChange={(e) => updateStepField(step.id, 'prompt', e.target.value)}
                                    />
                                </div>
                            </div>
                        );
                    })}

                    {guidedSteps.length === 0 && !showNewStepForm && (
                        <div className="text-center py-8 text-slate-400 text-sm">
                            Nessuno step configurato. Clicca &quot;Aggiungi Step&quot; per iniziare.
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
}
