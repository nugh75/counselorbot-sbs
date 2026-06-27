'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Save, Server, Cpu, Plus, Trash2, ChevronUp, ChevronDown, Palette, RefreshCw } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';

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
    questionnaire_type: string;
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
    groq: {
        label: 'Groq (veloce)',
        models: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3-32b', 'llama-3.1-8b-instant']
    },
    cerebras: {
        label: 'Cerebras (veloce)',
        models: ['llama-3.3-70b', 'qwen-3-32b', 'gpt-oss-120b', 'llama3.1-8b']
    },
    deepseek: {
        label: 'DeepSeek (diretto)',
        models: ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner']
    },
    together: {
        label: 'Together AI',
        models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct-Turbo', 'mistralai/Mixtral-8x7B-Instruct-v0.1']
    },
    fireworks: {
        label: 'Fireworks AI',
        models: ['accounts/fireworks/models/llama-v3p3-70b-instruct', 'accounts/fireworks/models/qwen2p5-72b-instruct']
    },
    deepinfra: {
        label: 'DeepInfra',
        models: ['meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen2.5-72B-Instruct', 'mistralai/Mistral-Small-24B-Instruct-2501']
    },
    openrouter: {
        label: 'OpenRouter',
        models: [
            // Modelli :free per primi: il cambio provider seleziona il primo della lista
            'meta-llama/llama-3.3-70b-instruct:free',
            'qwen/qwen3-next-80b-a3b-instruct:free',
            'qwen/qwen3-coder:free',
            'google/gemini-2.0-flash-001',
            'deepseek/deepseek-chat',
            'anthropic/claude-3.7-sonnet',
            'openai/gpt-4o-mini',
            'mistralai/mistral-large-2411',
        ]
    },
    llamacpp: {
        label: 'llama.cpp / llama-swap (Local)',
        models: [
            'default',
            'qwen3',
            'qwen2.5',
            'gemma3',
            'llama3.3',
            'mistral',
        ]
    },
    ollama: {
        label: 'Ollama (Local)',
        models: [
            'qwen3.5:9b',
            'gemma4:e4b',
            'gemma4:e2b',
            'gemma4:31b',
            'gemma4:26b',
            'qwen3:32b',
            'qwen3:latest',
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
    { value: 'qsar-factor', label: 'QSAr Analisi Fattori' },
    { value: 'qsar-second-level', label: 'QSAr Secondo Livello' },
    { value: 'qsar-generic', label: 'QSAr Generica' },
    { value: 'ztpi-factor', label: 'ZTPI Analisi Fattori' },
    { value: 'ztpi-btp', label: 'ZTPI Profilo Temporale Bilanciato' },
    { value: 'savickas-interview', label: 'Savickas Intervista' },
    { value: 'savickas-summary', label: 'Savickas Sintesi' },
    { value: 'qpcs-factor', label: 'QPCS Analisi Fattori' },
    { value: 'qpcc-factor', label: 'QPCC Analisi Fattori' },
    { value: 'qap-factor', label: 'QAP Analisi Risorse' },
    { value: 'qpcs-interview', label: 'QPCS Percorso Guidato' },
    { value: 'qpcs-summary', label: 'QPCS Sintesi' },
    { value: 'qpcc-interview', label: 'QPCC Percorso Guidato' },
    { value: 'qpcc-summary', label: 'QPCC Sintesi' },
    { value: 'qap-interview', label: 'QAP Percorso Guidato' },
    { value: 'qap-summary', label: 'QAP Sintesi' },
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

// Auth gestita al bordo da ai4auth (forward-auth): nessun token lato client.
function authHeaders(): Record<string, string> {
    return {};
}

function authJsonHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json' };
}

// --- Component ---

export function ConfigForm() {
    const { t, lang } = useI18n();
    const [configs, setConfigs] = useState<ConfigItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [section, setSection] = useState<string>('general');
    const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    const showToast = (type: 'success' | 'error', msg: string) => {
        setToast({ type, msg });
        window.setTimeout(() => setToast(null), 2500);
    };
    const [activeProvider, setActiveProvider] = useState('openai');
    const [activeModel, setActiveModel] = useState('gpt-4o');
    const [envOverrides, setEnvOverrides] = useState<Record<string, boolean>>({});

    // Modelli realmente serviti dal provider (live). Vuoto = usa il fallback statico.
    const [liveModels, setLiveModels] = useState<string[]>([]);
    const [modelsLoading, setModelsLoading] = useState(false);

    // Dynamic guided steps
    const [guidedSteps, setGuidedSteps] = useState<GuidedStep[]>([]);
    const [showNewStepForm, setShowNewStepForm] = useState(false);
    const [newStep, setNewStep] = useState<GuidedStep>({
        id: '', sort_order: 0, label: '', prompt: '',
        system_prompt_mode: 'generic', color_theme: 'blue', questionnaire_type: 'QSA',
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
                window.location.href = '/';
            }

            if (envRes.ok) setEnvOverrides(await envRes.json());
            if (stepsRes.ok) setGuidedSteps(await stepsRes.json());
        } catch (error) {
            console.error('Failed to fetch config', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchModels = async (provider: string) => {
        setModelsLoading(true);
        try {
            const res = await fetch(`/api/admin/models?provider=${encodeURIComponent(provider)}`, { headers: authHeaders() });
            if (res.ok) {
                const data = await res.json();
                setLiveModels(Array.isArray(data?.models) ? data.models : []);
            } else {
                setLiveModels([]);
            }
        } catch {
            setLiveModels([]);
        } finally {
            setModelsLoading(false);
        }
    };

    // Provider che richiedono una API key (ollama/llamacpp usano un URL locale con default).
    const PROVIDER_KEY_FIELD: Record<string, string> = {
        openai: 'api_key_openai',
        anthropic: 'api_key_anthropic',
        gemini: 'api_key_gemini',
        mistral: 'api_key_mistral',
        openrouter: 'api_key_openrouter',
        groq: 'api_key_groq',
        cerebras: 'api_key_cerebras',
        deepseek: 'api_key_deepseek',
        together: 'api_key_together',
        fireworks: 'api_key_fireworks',
        deepinfra: 'api_key_deepinfra',
    };
    const activeKeyField = PROVIDER_KEY_FIELD[activeProvider];
    const activeKeyMissing = !!activeKeyField
        && !envOverrides[activeKeyField]
        && !(configs.find(c => c.key === activeKeyField)?.value || '').trim();

    useEffect(() => { fetchConfigs(); }, []);
    useEffect(() => {
        if (activeKeyMissing) { setLiveModels([]); return; }
        fetchModels(activeProvider);
    }, [activeProvider, activeKeyMissing]);

    // Opzioni della tendina: modelli live se disponibili, altrimenti fallback statico.
    // Il modello attivo viene sempre incluso così resta selezionato anche se non in elenco.
    const modelOptions = (() => {
        const base = liveModels.length > 0 ? liveModels : (PROVIDERS[activeProvider]?.models || []);
        return activeModel && !base.includes(activeModel) ? [activeModel, ...base] : base;
    })();

    // --- Config helpers ---

    const handleSaveConfig = async (item: ConfigItem): Promise<boolean> => {
        try {
            const res = await fetch('/api/admin/config', {
                method: 'POST',
                headers: authJsonHeaders(),
                body: JSON.stringify(item),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            showToast('success', t('admin.config.saved'));
            return true;
        } catch (error) {
            console.error('Failed to save config', error);
            showToast('error', t('admin.config.saveError'));
            return false;
        }
    };

    const getConfigValue = (key: string) => configs.find(c => c.key === key)?.value || '';

    // Testi rivolti allo studente: salvati per-lingua con chiave suffissata (es. text_..._en).
    // L'italiano usa la chiave base; le altre lingue la chiave suffissata (fallback all'italiano).
    const isSecondaryLang = lang !== 'it';
    const textConfigKey = (baseKey: string) => isSecondaryLang ? `${baseKey}__${lang}` : baseKey;
    const getTextValue = (baseKey: string) => {
        const k = textConfigKey(baseKey);
        const found = configs.find(c => c.key === k)?.value;
        if (found !== undefined && found !== '') return found;
        return isSecondaryLang ? getConfigValue(baseKey) : '';
    };

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
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            showToast('success', t('admin.config.saved'));
        } catch (error) {
            console.error('Failed to save step', error);
            showToast('error', t('admin.config.saveError'));
        }
    };

    const handleCreateStep = async () => {
        if (!newStep.id.trim() || !newStep.label.trim()) return;
        const sameType = guidedSteps.filter(s => s.questionnaire_type === newStep.questionnaire_type);
        const stepToCreate = {
            ...newStep,
            id: newStep.id.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
            sort_order: sameType.length > 0 ? Math.max(...sameType.map(s => s.sort_order)) + 1 : 1,
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
                setNewStep({ id: '', sort_order: 0, label: '', prompt: '', system_prompt_mode: 'generic', color_theme: 'blue', questionnaire_type: newStep.questionnaire_type });
                setShowNewStepForm(false);
                showToast('success', t('admin.config.saved'));
            } else {
                throw new Error(`HTTP ${res.status}`);
            }
        } catch (error) {
            console.error('Failed to create step', error);
            showToast('error', t('admin.config.saveError'));
        }
    };

    const handleDeleteStep = async (stepId: string) => {
        if (!confirm(t('admin.config.confirmDeleteStep', { id: stepId }))) return;
        try {
            const res = await fetch(`/api/admin/guided-steps/${stepId}`, {
                method: 'DELETE',
                headers: authHeaders(),
            });
            if (res.ok) {
                setGuidedSteps(prev => prev.filter(s => s.id !== stepId));
                showToast('success', t('admin.config.deleted'));
            } else {
                throw new Error(`HTTP ${res.status}`);
            }
        } catch (error) {
            console.error('Failed to delete step', error);
            showToast('error', t('admin.config.saveError'));
        }
    };

    const handleMoveStep = async (stepId: string, direction: 'up' | 'down') => {
        const step = guidedSteps.find(s => s.id === stepId);
        if (!step) return;
        // Riordino ristretto agli step dello stesso questionario.
        const siblings = guidedSteps
            .filter(s => s.questionnaire_type === step.questionnaire_type)
            .sort((a, b) => a.sort_order - b.sort_order);
        const idx = siblings.findIndex(s => s.id === stepId);
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= siblings.length) return;

        const a = siblings[idx];
        const b = siblings[swapIdx];
        // Scambia i sort_order tra i due step adiacenti.
        setGuidedSteps(prev => prev.map(s => {
            if (s.id === a.id) return { ...s, sort_order: b.sort_order };
            if (s.id === b.id) return { ...s, sort_order: a.sort_order };
            return s;
        }));

        try {
            const res = await fetch('/api/admin/guided-steps/reorder', {
                method: 'PATCH',
                headers: authJsonHeaders(),
                body: JSON.stringify([
                    { id: a.id, sort_order: b.sort_order },
                    { id: b.id, sort_order: a.sort_order },
                ]),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            showToast('success', t('admin.config.saved'));
        } catch (error) {
            console.error('Failed to reorder steps', error);
            showToast('error', t('admin.config.saveError'));
        }
    };

    const updateStepField = (stepId: string, field: keyof GuidedStep, value: string | number) => {
        setGuidedSteps(prev => prev.map(s => s.id === stepId ? { ...s, [field]: value } : s));
    };

    // --- Render ---

    if (loading) return <div className="text-center py-8 text-gray-400">{t('admin.config.loading')}</div>;

    const apiKeys = [
        { key: 'api_key_openai', label: 'API Key OpenAI' },
        { key: 'api_key_anthropic', label: 'API Key Anthropic' },
        { key: 'api_key_gemini', label: 'API Key Gemini' },
        { key: 'api_key_mistral', label: 'API Key Mistral' },
        { key: 'api_key_openrouter', label: 'API Key OpenRouter' },
        { key: 'api_key_groq', label: 'API Key Groq' },
        { key: 'api_key_cerebras', label: 'API Key Cerebras' },
        { key: 'api_key_deepseek', label: 'API Key DeepSeek' },
        { key: 'api_key_together', label: 'API Key Together' },
        { key: 'api_key_fireworks', label: 'API Key Fireworks' },
        { key: 'api_key_deepinfra', label: 'API Key DeepInfra' },
        { key: 'ollama_ip', label: 'Ollama IP Address' },
        { key: 'llamacpp_url', label: 'llama.cpp / llama-swap URL' },
    ];

    const questionnaireConfigs = [
        {
            id: 'qsa',
            questionnaireType: 'QSA',
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
            id: 'qsar',
            questionnaireType: 'QSAr',
            title: 'QSAr — Questionario Strategie di Apprendimento Ridotto',
            color: 'sky' as const,
            systemPrompts: [
                { key: 'prompt_qsar_factor', label: 'Prompt Analisi Fattori' },
                { key: 'prompt_qsar_second_level', label: 'Prompt Secondo Livello' },
                { key: 'prompt_qsar_factor_qa', label: 'Prompt Approfondimento' },
                { key: 'prompt_qsar_generic', label: 'Prompt Chat Generica' },
            ],
            texts: [
                { key: 'text_qsar_questions_intro', label: 'Messaggio Intro Fase Domande', type: 'textarea' as const },
                { key: 'text_qsar_conclusion', label: 'Messaggio Conclusione', type: 'textarea' as const },
            ],
        },
        {
            id: 'ztpi',
            questionnaireType: 'ZTPI',
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
            questionnaireType: 'SAVICKAS',
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
        {
            id: 'qpcs',
            questionnaireType: 'QPCS',
            title: 'QPCS — Percezione delle Competenze Strategiche',
            color: 'purple' as const,
            systemPrompts: [
                { key: 'prompt_qpcs_factor', label: 'Prompt Analisi Fattori' },
                ...(configs.some(c => c.key === 'prompt_qpcs_interview')
                    ? [{ key: 'prompt_qpcs_interview', label: 'Prompt Percorso Guidato' }]
                    : []),
                ...(configs.some(c => c.key === 'prompt_qpcs_summary')
                    ? [{ key: 'prompt_qpcs_summary', label: 'Prompt Sintesi Finale' }]
                    : []),
            ],
            texts: [
                { key: 'text_qpcs_questions_intro', label: 'Messaggio Intro Fase Domande', type: 'textarea' as const },
                { key: 'text_qpcs_conclusion', label: 'Messaggio Conclusione', type: 'textarea' as const },
            ],
        },
        {
            id: 'qpcc',
            questionnaireType: 'QPCC',
            title: 'QPCC — Percezione delle Competenze e Convinzioni',
            color: 'indigo' as const,
            systemPrompts: [
                { key: 'prompt_qpcc_factor', label: 'Prompt Analisi Fattori' },
                ...(configs.some(c => c.key === 'prompt_qpcc_interview')
                    ? [{ key: 'prompt_qpcc_interview', label: 'Prompt Percorso Guidato' }]
                    : []),
                ...(configs.some(c => c.key === 'prompt_qpcc_summary')
                    ? [{ key: 'prompt_qpcc_summary', label: 'Prompt Sintesi Finale' }]
                    : []),
            ],
            texts: [
                { key: 'text_qpcc_questions_intro', label: 'Messaggio Intro Fase Domande', type: 'textarea' as const },
                { key: 'text_qpcc_conclusion', label: 'Messaggio Conclusione', type: 'textarea' as const },
            ],
        },
        {
            id: 'qap',
            questionnaireType: 'QAP',
            title: 'QAP — Adattabilità Professionale',
            color: 'green' as const,
            systemPrompts: [
                { key: 'prompt_qap_factor', label: 'Prompt Analisi Risorse' },
                ...(configs.some(c => c.key === 'prompt_qap_interview')
                    ? [{ key: 'prompt_qap_interview', label: 'Prompt Percorso Guidato' }]
                    : []),
                ...(configs.some(c => c.key === 'prompt_qap_summary')
                    ? [{ key: 'prompt_qap_summary', label: 'Prompt Sintesi Finale' }]
                    : []),
            ],
            texts: [
                { key: 'text_qap_questions_intro', label: 'Messaggio Intro Fase Domande', type: 'textarea' as const },
                { key: 'text_qap_conclusion', label: 'Messaggio Conclusione', type: 'textarea' as const },
            ],
        },
    ];

    const colorMap = {
        blue: { border: 'border-blue-400', bg: 'bg-blue-50', title: 'text-blue-700', dot: 'bg-blue-500', ring: 'focus:ring-blue-500', subBg: 'bg-blue-100/50', subTitle: 'text-blue-600' },
        sky: { border: 'border-sky-400', bg: 'bg-sky-50', title: 'text-sky-700', dot: 'bg-sky-500', ring: 'focus:ring-sky-500', subBg: 'bg-sky-100/50', subTitle: 'text-sky-600' },
        purple: { border: 'border-purple-400', bg: 'bg-purple-50', title: 'text-purple-700', dot: 'bg-purple-500', ring: 'focus:ring-purple-500', subBg: 'bg-purple-100/50', subTitle: 'text-purple-600' },
        indigo: { border: 'border-indigo-400', bg: 'bg-indigo-50', title: 'text-indigo-700', dot: 'bg-indigo-500', ring: 'focus:ring-indigo-500', subBg: 'bg-indigo-100/50', subTitle: 'text-indigo-600' },
        emerald: { border: 'border-emerald-400', bg: 'bg-emerald-50', title: 'text-emerald-700', dot: 'bg-emerald-500', ring: 'focus:ring-emerald-500', subBg: 'bg-emerald-100/50', subTitle: 'text-emerald-600' },
        amber: { border: 'border-amber-400', bg: 'bg-amber-50', title: 'text-amber-700', dot: 'bg-amber-500', ring: 'focus:ring-amber-500', subBg: 'bg-amber-100/50', subTitle: 'text-amber-600' },
        green: { border: 'border-green-400', bg: 'bg-green-50', title: 'text-green-700', dot: 'bg-green-500', ring: 'focus:ring-green-500', subBg: 'bg-green-100/50', subTitle: 'text-green-600' },
    };

    const questTabs = questionnaireConfigs.map((q) => ({
        id: q.id,
        label: q.title.split('—')[0].trim(),
        color: q.color,
    }));

    return (
        <div className="space-y-8">
            {/* Toast feedback salvataggi — portal su body: evita l'antenato con transform
                (animate-fade-in-up) che altrimenti intrappola il position:fixed. */}
            {toast && typeof document !== 'undefined' && createPortal(
                <div
                    className={`fixed top-6 right-6 z-[100] px-4 py-3 rounded-md shadow-lg text-sm font-medium border ${
                        toast.type === 'success'
                            ? 'bg-green-50 border-green-200 text-green-700'
                            : 'bg-red-50 border-red-200 text-red-700'
                    }`}
                    role="status"
                >
                    {toast.msg}
                </div>,
                document.body
            )}

            {/* Sub-tab nav per risorsa */}
            <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
                <button
                    onClick={() => setSection('general')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors border ${
                        section === 'general'
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                >
                    <Server className="w-4 h-4" />
                    {t('admin.config.section.general')}
                </button>
                {questTabs.map((tab) => {
                    const c = colorMap[tab.color];
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setSection(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors border ${
                                section === tab.id
                                    ? `${c.bg} ${c.border} ${c.title}`
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {section === 'general' && (
            <div className="space-y-8">
            {/* 1. Provider & Model Selection */}
            <div className="glass-panel p-6 space-y-6">
                <h3 className="text-lg font-medium text-slate-900 flex items-center gap-2">
                    <Server className="w-5 h-5 text-indigo-600" />
                    {t('admin.config.aiActive')}
                </h3>

                <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">{t('admin.config.provider')}</label>
                        <select
                            value={activeProvider}
                            onChange={(e) => handleProviderChange(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded-md p-3 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                            {Object.entries(PROVIDERS).map(([key, data]) => (
                                <option key={key} value={key}>{data.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-slate-700">{t('admin.config.model')}</label>
                            <button
                                type="button"
                                onClick={() => fetchModels(activeProvider)}
                                disabled={modelsLoading || activeKeyMissing}
                                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                                title={t('admin.config.reloadTitle')}
                            >
                                <RefreshCw className={`w-3 h-3 ${modelsLoading ? 'animate-spin' : ''}`} />
                                {modelsLoading
                                    ? t('admin.config.modelsLoading')
                                    : liveModels.length > 0
                                        ? t('admin.config.modelsLive', { n: liveModels.length })
                                        : t('admin.config.reload')}
                            </button>
                        </div>
                        <div className="relative">
                            <Cpu className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                            <select
                                value={activeKeyMissing ? '' : activeModel}
                                onChange={(e) => handleModelChange(e.target.value)}
                                disabled={activeKeyMissing}
                                className="w-full bg-slate-50 border border-slate-300 rounded-md p-3 pl-10 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {activeKeyMissing ? (
                                    <option value="">{t('admin.config.modelNeedsKey')}</option>
                                ) : (
                                    modelOptions.map((model) => (
                                        <option key={model} value={model}>{model}</option>
                                    ))
                                )}
                            </select>
                        </div>
                        {activeKeyMissing ? (
                            <p className="text-xs text-amber-600">{t('admin.config.modelNeedsKeyHint')}</p>
                        ) : (
                            liveModels.length === 0 && !modelsLoading && (
                                <p className="text-xs text-amber-600">{t('admin.config.providerUnreachable')}</p>
                            )
                        )}
                    </div>

                    <div className="md:col-span-2 flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                        <input
                            id="disable_thinking"
                            type="checkbox"
                            className="w-4 h-4 accent-blue-600 cursor-pointer"
                            checked={getConfigValue('disable_thinking') === 'true'}
                            onChange={(e) => {
                                const val = e.target.checked ? 'true' : 'false';
                                setConfigDraft('disable_thinking', val, 'Disattiva il reasoning/thinking sui modelli che lo supportano');
                                handleSaveConfig({ key: 'disable_thinking', value: val, description: 'Disattiva il reasoning/thinking sui modelli che lo supportano' });
                            }}
                        />
                        <label htmlFor="disable_thinking" className="text-sm font-medium text-slate-700 cursor-pointer">
                            {t('admin.config.noThinking')} <strong>{t('admin.config.noThinkingName')}</strong>
                            <span className="block text-xs text-slate-400 font-normal">{t('admin.config.noThinkingDesc')}</span>
                        </label>
                    </div>
                </div>
            </div>

            {/* 2. API Keys */}
            <div className="grid gap-4">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('admin.config.apiKeys')}</h3>
                {apiKeys.map((def) => {
                    const currentVal = configs.find(c => c.key === def.key)?.value || '';
                    const isEnvOverridden = envOverrides[def.key] || false;
                    const isActive =
                        (!!activeKeyField && def.key === activeKeyField) ||
                        (activeProvider === 'ollama' && def.key === 'ollama_ip') ||
                        (activeProvider === 'llamacpp' && def.key === 'llamacpp_url');

                    return (
                        <div key={def.key} className={`glass-panel p-4 flex items-center gap-4 transition-colors ${isActive ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-300' : 'hover:border-slate-300'}`}>
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
                                    placeholder={isEnvOverridden ? t('admin.config.envSet') : 'sk-...'}
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
                                    className="p-2 hover:bg-slate-100 rounded-md text-indigo-600 transition-colors"
                                >
                                    <Save className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            </div>
            )}

            {/* 3. Prompt e Testi — solo questionario attivo */}
            {questionnaireConfigs.filter((q) => q.id === section).map((q) => {
                const c = colorMap[q.color];
                const allKeys = [...q.systemPrompts.map(p => p.key), ...q.texts.map(t => textConfigKey(t.key))];
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
                                title={t('admin.config.saveAllTitle')}
                            >
                                <Save className="w-3.5 h-3.5" />
                                {t('admin.config.saveAll')}
                            </button>
                        </div>

                        {/* Sub: Prompt di Sistema */}
                        <div className="space-y-3">
                            <div className={`${c.subBg} rounded px-3 py-1.5`}>
                                <h4 className={`text-xs font-bold ${c.subTitle} uppercase tracking-wider`}>
                                    {t('admin.config.systemPrompts')}
                                </h4>
                            </div>
                            {q.systemPrompts.map((def) => {
                                const currentVal = getConfigValue(def.key);
                                return (
                                    <div key={def.key} className="glass-panel p-5 space-y-3">
                                        <div className="flex justify-between items-start gap-3">
                                            <h3 className={`text-sm font-bold ${c.title}`}>{t(`admin.config.label.${def.key}`)}</h3>
                                            <button
                                                onClick={() => saveConfigKey(def.key, def.label)}
                                                className="p-2 hover:bg-slate-100 rounded-md text-indigo-600 transition-colors shrink-0"
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
                                <div className={`${c.subBg} rounded px-3 py-1.5 flex items-center justify-between`}>
                                    <h4 className={`text-xs font-bold ${c.subTitle} uppercase tracking-wider`}>
                                        {t('admin.config.textsMessages')}
                                    </h4>
                                    <span className={`text-[10px] font-bold ${c.subTitle} bg-white/60 px-2 py-0.5 rounded uppercase`}>
                                        {t('admin.config.editingLang')}: {lang.toUpperCase()}
                                    </span>
                                </div>
                                {q.texts.map((def) => {
                                    const localizedKey = textConfigKey(def.key);
                                    const currentVal = getTextValue(def.key);
                                    return (
                                        <div key={def.key} className="glass-panel p-5 space-y-3">
                                            <div className="flex justify-between items-start gap-3">
                                                <h3 className={`text-sm font-bold ${c.title}`}>{t(`admin.config.label.${def.key}`)}</h3>
                                                <button
                                                    onClick={() => saveConfigKey(localizedKey, def.label)}
                                                    className="p-2 hover:bg-slate-100 rounded-md text-indigo-600 transition-colors shrink-0"
                                                >
                                                    <Save className="w-4 h-4" />
                                                </button>
                                            </div>
                                            {def.type === 'input' ? (
                                                <input
                                                    className={`w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-sm ${c.ring} outline-none text-slate-900`}
                                                    value={currentVal}
                                                    onChange={(e) => setConfigDraft(localizedKey, e.target.value, def.label)}
                                                />
                                            ) : (
                                                <textarea
                                                    className={`w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-sm min-h-[80px] ${c.ring} outline-none font-mono text-slate-900`}
                                                    value={currentVal}
                                                    onChange={(e) => setConfigDraft(localizedKey, e.target.value, def.label)}
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

            {/* 4. Dynamic Guided Steps — per questionario attivo */}
            {section !== 'general' && (() => {
            const qType = questionnaireConfigs.find((q) => q.id === section)?.questionnaireType || section.toUpperCase();
            const sectionSteps = guidedSteps
                .filter(s => s.questionnaire_type === qType)
                .sort((a, b) => a.sort_order - b.sort_order);
            return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('admin.config.guidedSteps')}</h3>
                        <p className="text-xs text-slate-500 ml-1 mt-1">
                            {t('admin.config.guidedStepsDesc')}
                        </p>
                    </div>
                    <button
                        onClick={() => { setNewStep(prev => ({ ...prev, questionnaire_type: qType })); setShowNewStepForm(true); }}
                        className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-md transition-colors shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        {t('admin.config.addStep')}
                    </button>
                </div>

                {/* New Step Form */}
                {showNewStepForm && (
                    <div className="glass-panel p-6 space-y-4 border-2 border-dashed border-indigo-300 bg-indigo-50/30">
                        <h3 className="text-sm font-semibold text-indigo-700">{t('admin.config.newStep')}</h3>

                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-500">{t('admin.config.stepId')}</label>
                                <input
                                    className="w-full bg-white border border-slate-300 rounded-md p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 font-mono"
                                    placeholder={t('admin.config.placeholderStepId')}
                                    value={newStep.id}
                                    onChange={(e) => setNewStep(prev => ({ ...prev, id: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-500">{t('admin.config.stepTitle')}</label>
                                <input
                                    className="w-full bg-white border border-slate-300 rounded-md p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900"
                                    placeholder={t('admin.config.placeholderStepTitle')}
                                    value={newStep.label}
                                    onChange={(e) => setNewStep(prev => ({ ...prev, label: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-500">{t('admin.config.stepSystemPrompt')}</label>
                                <select
                                    className="w-full bg-white border border-slate-300 rounded-md p-3 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={newStep.system_prompt_mode}
                                    onChange={(e) => setNewStep(prev => ({ ...prev, system_prompt_mode: e.target.value }))}
                                >
                                    {SYSTEM_PROMPT_MODES.map(m => (
                                        <option key={m.value} value={m.value}>{t(`admin.mode.${m.value}`)}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-500">{t('admin.config.stepColor')}</label>
                                <select
                                    className="w-full bg-white border border-slate-300 rounded-md p-3 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={newStep.color_theme}
                                    onChange={(e) => setNewStep(prev => ({ ...prev, color_theme: e.target.value }))}
                                >
                                    {COLOR_THEMES.map(c => (
                                        <option key={c.value} value={c.value}>{t(`admin.color.${c.value}`)}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-500">{t('admin.config.stepPromptCreate')}</label>
                            <textarea
                                className="w-full bg-white border border-slate-300 rounded-md p-3 text-sm min-h-[100px] focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-slate-900"
                                placeholder={t('admin.config.placeholderStepPrompt')}
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
                                {t('admin.config.createStep')}
                            </button>
                            <button
                                onClick={() => setShowNewStepForm(false)}
                                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg transition-colors"
                            >
                                {t('admin.config.cancel')}
                            </button>
                        </div>
                    </div>
                )}

                {/* Existing Steps */}
                <div className="space-y-4">
                    {sectionSteps.map((step, idx) => {
                        const colorDef = COLOR_THEMES.find(c => c.value === step.color_theme);
                        return (
                            <div key={step.id} className="glass-panel p-6 space-y-4">
                                {/* Header with dynamic title */}
                                <div className="flex justify-between items-start gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-3 h-3 rounded-full ${colorDef?.dot || 'bg-indigo-500'}`} />
                                        <h3 className="text-sm font-semibold text-slate-900">
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
                                            title={t('admin.config.moveUp')}
                                        >
                                            <ChevronUp className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleMoveStep(step.id, 'down')}
                                            disabled={idx === sectionSteps.length - 1}
                                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-30"
                                            title={t('admin.config.moveDown')}
                                        >
                                            <ChevronDown className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleSaveStep(step)}
                                            className="p-1.5 hover:bg-slate-100 rounded-md text-indigo-600 transition-colors"
                                            title={t('admin.config.save')}
                                        >
                                            <Save className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteStep(step.id)}
                                            className="p-1.5 hover:bg-red-50 rounded-lg text-red-400 hover:text-red-600 transition-colors"
                                            title={t('admin.config.delete')}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Editable fields */}
                                <div className="grid md:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-slate-500">{t('admin.config.stepTitle')}</label>
                                        <input
                                            className="w-full bg-slate-50 border border-slate-300 rounded-md p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900"
                                            value={step.label}
                                            onChange={(e) => updateStepField(step.id, 'label', e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-slate-500">{t('admin.config.stepSystemPrompt')}</label>
                                        <select
                                            className="w-full bg-slate-50 border border-slate-300 rounded-md p-3 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                                            value={step.system_prompt_mode}
                                            onChange={(e) => updateStepField(step.id, 'system_prompt_mode', e.target.value)}
                                        >
                                            {SYSTEM_PROMPT_MODES.map(m => (
                                                <option key={m.value} value={m.value}>{t(`admin.mode.${m.value}`)}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                                            <Palette className="w-3 h-3" /> {t('admin.config.stepColor')}
                                        </label>
                                        <select
                                            className="w-full bg-slate-50 border border-slate-300 rounded-md p-3 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                                            value={step.color_theme}
                                            onChange={(e) => updateStepField(step.id, 'color_theme', e.target.value)}
                                        >
                                            {COLOR_THEMES.map(c => (
                                                <option key={c.value} value={c.value}>{t(`admin.color.${c.value}`)}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-500">{t('admin.config.stepPromptSend')}</label>
                                    <textarea
                                        className="w-full bg-slate-50 border border-slate-300 rounded-md p-3 text-sm min-h-[100px] focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-slate-900"
                                        value={step.prompt}
                                        onChange={(e) => updateStepField(step.id, 'prompt', e.target.value)}
                                    />
                                </div>
                            </div>
                        );
                    })}

                    {sectionSteps.length === 0 && !showNewStepForm && (
                        <div className="text-center py-8 text-slate-400 text-sm">
                            {t('admin.config.noSteps')}
                        </div>
                    )}
                </div>
            </div>
            );
            })()}

        </div>
    );
}
