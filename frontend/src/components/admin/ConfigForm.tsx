'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Cpu, ExternalLink, FileText, KeyRound, Layers, RefreshCw, Save, Server, Award, XCircle, Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { PersonalAPIPolicy } from '@/components/admin/PersonalAPIPolicy';
import { ChatGPTSettingsPanel } from '@/components/admin/ChatGPTSettingsPanel';
import { personalAPIText } from '@/lib/i18n-personal-api';
import { ExternalPrivacySettings } from '@/components/admin/ExternalPrivacySettings';
import { DocumentRetrievalSettings } from '@/components/admin/DocumentRetrievalSettings';
import { Callout } from '@/components/ui/Callout';
import { PromptFactoryAlignment, type FactoryAlignmentResult } from '@/components/admin/PromptFactoryAlignment';
import { ModelContextSettings } from '@/components/admin/ModelContextSettings';
import { AI4EDUC_SECRETS_URL } from '@/lib/auth';
import { SectionFilter, type SectionFilterGroup } from '@/components/admin/SectionFilter';
import { PromptMap } from '@/components/admin/PromptMap';
import { ModelSearchSelect } from '@/components/admin/ModelSearchSelect';
import { validModelId } from '@/lib/model-search';
import { systemAIText } from '@/lib/i18n-system-ai';
import { formatProbeDetail, systemAIRoleLabel, type SystemAITestResponse } from '@/lib/system-ai-fallback';
import { LocalLlmDetect } from '@/components/admin/LocalLlmDetect';
import { localLlmText } from '@/lib/local-llm';

// --- Types ---

interface ConfigItem {
    key: string;
    value: string;
    description: string;
}

interface APIKeyStatus {
    provider: string;
    configured: boolean;
    source: 'environment' | 'unset';
    editable: boolean;
    environment_variable?: string | null;
    preferred_environment_variable: string;
    updated_at?: string | null;
}

type APIKeyVerification = 'idle' | 'checking' | 'working' | 'failed';

interface GuidedStep {
    id: string;
    sort_order: number;
    label: string;
    prompt: string;
    system_prompt_mode: string;
    color_theme: string;
    questionnaire_type: string;
    label_i18n?: Record<string, string> | null;
    component_defaults?: Record<string, boolean | number> | null;
    // Chiave del prompt di sistema risolta dal backend come a runtime.
    system_prompt_key?: string | null;
}

// --- Constants ---

// `?section=` keeps the chosen configuration section across reloads and shared links.
// ConfigForm renders only after the client-side auth check, so reading the URL here is safe.
const readSectionParam = () => {
    try { return new URLSearchParams(window.location.search).get('section') || 'general'; } catch { return 'general'; }
};
export const writeSectionParam = (section: string | null) => {
    try {
        const url = new URL(window.location.href);
        if (section) url.searchParams.set('section', section);
        else if (url.searchParams.has('section')) url.searchParams.delete('section');
        else return;
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch { /* best effort only */ }
};

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
        label: 'Groq',
        models: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3-32b', 'llama-3.1-8b-instant']
    },
    cerebras: {
        label: 'Cerebras',
        models: ['llama-3.3-70b', 'qwen-3-32b', 'gpt-oss-120b', 'llama3.1-8b']
    },
    deepseek: {
        label: 'DeepSeek',
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
    omniroute: {
        label: 'OmniRoute',
        models: ['auto/best-chat', 'auto/best-free', 'auto/best-fast', 'auto/best-reasoning']
    },
    openrouter: {
        label: 'OpenRouter',
        models: [
            // Modelli :free per primi: il cambio provider seleziona il primo della lista
            'openrouter/free',
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
        label: 'Server locale / compatibile OpenAI',
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
        label: 'Ollama',
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

// Suggerimento mostrato sopra l'elenco: spiega quali modelli sono adatti e perché.
// Candidati mostrati solo se presenti nel catalogo live; etichette e consigli sono tradotti.
interface ModelRecommendation {
    id: string;
    label: string;
    tag: 'recommended' | 'quality' | 'fast' | 'free' | 'reasoning';
}

const RECOMMENDED_MODELS: Record<string, ModelRecommendation[]> = {
    openrouter: [
        {
            id: 'google/gemini-3.8-flash',
            label: 'Gemini 3.8 Flash',
            tag: 'recommended',
        },
        {
            id: 'anthropic/claude-sonnet-5.5',
            label: 'Claude Sonnet 5.5',
            tag: 'quality',
        },
        {
            id: 'deepseek/deepseek-v4.1-flash',
            label: 'DeepSeek V4.1 Flash',
            tag: 'fast',
        },
        {
            id: 'qwen/qwen3.8-27b',
            label: 'Qwen 3.8 27B',
            tag: 'quality',
        },
        {
            id: 'meta-llama/llama-3.3-70b-instruct:free',
            label: 'Llama 3.3 70B (Free)',
            tag: 'free',
        },
    ],

};

// Etichette e colori dei tag delle categorie di modello (Consigliato/Alta qualità/…).
const MODEL_TAG_KEYS: Record<ModelRecommendation['tag'], string> = {
    recommended: 'admin.config.modelTagRecommended',
    quality: 'admin.config.modelTagQuality',
    fast: 'admin.config.modelTagFast',
    free: 'admin.config.modelTagFree',
    reasoning: 'admin.config.modelTagReasoning',
};

const MODEL_TAG_STYLES: Record<ModelRecommendation['tag'], string> = {
    recommended: 'bg-emerald-100 text-emerald-800',
    quality: 'bg-indigo-100 text-indigo-800',
    fast: 'bg-sky-100 text-sky-800',
    free: 'bg-amber-100 text-amber-800',
    reasoning: 'bg-violet-100 text-violet-800',
};

// Modelli in fascia gratuita: ottimi per prove, soggetti ai limiti del provider.
const isFreeModel = (modelName: string): boolean => {
    const lower = (modelName || '').toLowerCase();
    return lower.includes(':free') || lower === 'openrouter/free' || lower.endsWith('/free');
};

const DEFAULT_PLACEHOLDERS: Record<string, [string, string]> = {
    it: ['Italian', 'italiano'],
    en: ['English', 'English'],
    es: ['Spanish', 'español'],
    fr: ['French', 'français'],
    de: ['German', 'Deutsch'],
    sv: ['Swedish', 'svenska'],
};

const PROMPT_COMPONENT_TEXTS: Record<string, {
    labels: Record<string, string>;
}> = {
    it: {
        labels: {
            system_prompt: 'Prompt di sistema',
            meta_system_prompt: 'Meta system prompt strumento',
            step_prompt: 'Prompt dello step',
            cognitive_factors: 'Fattori cognitivi',
            affective_factors: 'Fattori affettivi',
            other_scores: 'Altri punteggi/profilo',
            knowledge: 'RAG / conoscenza',
            history: 'Memoria / cronologia',
            counselor: 'Persona counselor',
            metadata: 'Metadati fase/studente',
            profile: 'Taccuino / portfolio',
            student_booklet: 'La mia lettura',
            rag_counselorbot: 'RAG CounselorBot (docs-counselorbot)',
            rag_competenzestrategiche: 'RAG Competenzestrategiche (guide)',
            rag_questionari: 'RAG Questionari e Strumenti',
            approved_strategies: 'Strategie approvate QSA',
            certified_strategies: 'Strategie certificate',
            shared_responses: 'Risposte condivise votate utili',
        },
    },
    en: {
        labels: {
            system_prompt: 'System prompt',
            meta_system_prompt: 'Instrument meta system prompt',
            step_prompt: 'Step prompt',
            cognitive_factors: 'Cognitive factors',
            affective_factors: 'Affective factors',
            other_scores: 'Other scores/profile',
            knowledge: 'RAG / knowledge',
            history: 'Memory / history',
            counselor: 'Counselor persona',
            metadata: 'Phase/student metadata',
            profile: 'Notebook / portfolio',
            student_booklet: 'My reading',
            rag_counselorbot: 'RAG CounselorBot (docs-counselorbot)',
            rag_competenzestrategiche: 'RAG Competenzestrategiche (guides)',
            rag_questionari: 'RAG Questionnaires & Instruments',
            approved_strategies: 'Approved QSA strategies',
            certified_strategies: 'Certified strategies',
            shared_responses: 'Shared responses voted helpful',
        },
    },
    es: {
        labels: {
            system_prompt: 'Prompt de sistema',
            meta_system_prompt: 'Meta prompt de sistema del instrumento',
            step_prompt: 'Prompt del paso',
            cognitive_factors: 'Factores cognitivos',
            affective_factors: 'Factores afectivos',
            other_scores: 'Otros puntajes/perfil',
            knowledge: 'RAG / conocimiento',
            history: 'Memoria / historial',
            counselor: 'Persona del orientador',
            metadata: 'Metadatos fase/estudiante',
            profile: 'Cuaderno / portafolio',
            student_booklet: 'Mi lectura',
            rag_counselorbot: 'RAG CounselorBot (docs-counselorbot)',
            rag_competenzestrategiche: 'RAG Competenzestrategiche (guías)',
            rag_questionari: 'RAG Cuestionarios e Instrumentos',
            approved_strategies: 'Estrategias aprobadas QSA',
            certified_strategies: 'Estrategias certificadas',
            shared_responses: 'Respuestas compartidas votadas útiles',
        },
    },
    fr: {
        labels: {
            system_prompt: 'Prompt système',
            meta_system_prompt: 'Meta prompt système de l’instrument',
            step_prompt: "Prompt de l’étape",
            cognitive_factors: 'Facteurs cognitifs',
            affective_factors: 'Facteurs affectifs',
            other_scores: 'Autres scores/profil',
            knowledge: 'RAG / connaissance',
            history: 'Mémoire / historique',
            counselor: 'Persona du conseiller',
            metadata: 'Métadonnées phase/étudiant',
            profile: 'Carnet / portfolio',
            student_booklet: 'Ma lecture',
            rag_counselorbot: 'RAG CounselorBot (docs-counselorbot)',
            rag_competenzestrategiche: 'RAG Competenzestrategiche (guides)',
            rag_questionari: 'RAG Questionnaires & Instruments',
            approved_strategies: 'Stratégies approuvées QSA',
            certified_strategies: 'Stratégies certifiées',
            shared_responses: 'Réponses partagées votées utiles',
        },
    },
    de: {
        labels: {
            system_prompt: 'System-Prompt',
            meta_system_prompt: 'Instrument-Meta-System-Prompt',
            step_prompt: 'Schritt-Prompt',
            cognitive_factors: 'Kognitive Faktoren',
            affective_factors: 'Affektive Faktoren',
            other_scores: 'Weitere Werte/Profil',
            knowledge: 'RAG / Wissen',
            history: 'Gedächtnis / Verlauf',
            counselor: 'Counselor-Persona',
            metadata: 'Phasen-/Studierenden-Metadaten',
            profile: 'Notizbuch / Portfolio',
            student_booklet: 'Meine Deutung',
            rag_counselorbot: 'RAG CounselorBot (docs-counselorbot)',
            rag_competenzestrategiche: 'RAG Competenzestrategiche (Leitfäden)',
            rag_questionari: 'RAG Fragebögen & Instrumente',
            approved_strategies: 'Zugelassene QSA-Strategien',
            certified_strategies: 'Zertifizierte Strategien',
            shared_responses: 'Geteilte Antworten als hilfreich bewertet',
        },
    },
    sv: {
        labels: {
            system_prompt: 'Systemprompt',
            meta_system_prompt: 'Instrumentets meta-systemprompt',
            step_prompt: 'Stegprompt',
            cognitive_factors: 'Kognitiva faktorer',
            affective_factors: 'Affektiva faktorer',
            other_scores: 'Övriga poäng/profil',
            knowledge: 'RAG / kunskap',
            history: 'Minne / historik',
            counselor: 'Counselor-persona',
            metadata: 'Fas-/studentmetadata',
            profile: 'Anteckningsbok / portfolio',
            student_booklet: 'Min tolkning',
            rag_counselorbot: 'RAG CounselorBot (docs-counselorbot)',
            rag_competenzestrategiche: 'RAG Competenzestrategiche (guider)',
            rag_questionari: 'RAG Frågeformulär & Instrument',
            approved_strategies: 'Godkända QSA-strategier',
            certified_strategies: 'Certifierade strategier',
            shared_responses: 'Delade svar som röstats fram som hjälpsamma',
        },
    },
};

function promptComponentText(language: string) {
    return PROMPT_COMPONENT_TEXTS[language] || PROMPT_COMPONENT_TEXTS.it;
}

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
    const [savedConfigs, setSavedConfigs] = useState<ConfigItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [section, setSection] = useState<string>(readSectionParam);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
    const [factoryAlignmentBusy, setFactoryAlignmentBusy] = useState(false);
    const [pendingPromptSaves, setPendingPromptSaves] = useState(0);

    const showToast = (type: 'success' | 'error', msg: string) => {
        setToast({ type, msg });
        window.setTimeout(() => setToast(null), 2500);
    };
    const [activeProvider, setActiveProvider] = useState('');
    const [activeModel, setActiveModel] = useState('');
    const [systemAITesting, setSystemAITesting] = useState(false);
    const [systemAIProbeResults, setSystemAIProbeResults] = useState<SystemAITestResponse | null>(null);
    const [envOverrides, setEnvOverrides] = useState<Record<string, boolean>>({});
    const [apiKeyStatuses, setApiKeyStatuses] = useState<APIKeyStatus[]>([]);
    const [apiKeyVerification, setApiKeyVerification] = useState<Record<string, APIKeyVerification>>({});

    // Modelli realmente serviti dal provider (live). Vuoto = usa il fallback statico.
    const [liveModels, setLiveModels] = useState<string[]>([]);
    const [modelsLoading, setModelsLoading] = useState(false);
    const modelRequest = useRef<AbortController | null>(null);

    // Ricerca nell'elenco modelli (OpenRouter ne espone centinaia) e inserimento manuale dell'ID.
    const [customModelMode, setCustomModelMode] = useState(false);
    const [customModelDraft, setCustomModelDraft] = useState('');

    // Dynamic guided steps
    const [guidedSteps, setGuidedSteps] = useState<GuidedStep[]>([]);
    const [placeholderDraft, setPlaceholderDraft] = useState<Record<string, [string, string]>>({});

    const openSection = (nextSection: string) => {
        setSection(nextSection);
        writeSectionParam(nextSection === 'general' ? null : nextSection);
    };

    // --- Fetch all data ---

    const fetchConfigs = async () => {
        try {
            const [configRes, envRes, apiKeysRes, stepsRes] = await Promise.all([
                fetch('/api/admin/config', { headers: authHeaders() }),
                fetch('/api/admin/config/env-status', { headers: authHeaders() }),
                fetch('/api/admin/api-keys', { headers: authHeaders() }),
                fetch('/api/admin/guided-steps', { headers: authHeaders() }),
            ]);

            if (configRes.ok) {
                const data: ConfigItem[] = await configRes.json();
                setConfigs(data);
                setSavedConfigs(data);
                const prov = data.find(c => c.key === 'active_provider')?.value;
                const mod = data.find(c => c.key === 'model_name')?.value;
                if (prov !== undefined) setActiveProvider(prov || '');
                if (mod !== undefined) setActiveModel(mod || '');
            } else if (configRes.status === 401 || configRes.status === 403) {
                window.location.href = '/';
            }

            if (envRes.ok) setEnvOverrides(await envRes.json());
            if (apiKeysRes.ok) setApiKeyStatuses(await apiKeysRes.json());
            if (stepsRes.ok) { const steps: GuidedStep[] = await stepsRes.json(); setGuidedSteps(steps); }
        } catch (error) {
            console.error('Failed to fetch config', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchModels = async (provider: string) => {
        modelRequest.current?.abort();
        const controller = new AbortController();
        modelRequest.current = controller;
        if (!provider) { setLiveModels([]); setModelsLoading(false); return; }
        setModelsLoading(true);
        try {
            const res = await fetch(`/api/admin/models?provider=${encodeURIComponent(provider)}`, { headers: authHeaders(), signal: controller.signal });
            const data = res.ok ? await res.json() : null;
            if (!controller.signal.aborted) setLiveModels(Array.isArray(data?.models) ? data.models : []);
        } catch {
            if (!controller.signal.aborted) setLiveModels([]);
        } finally {
            if (!controller.signal.aborted) setModelsLoading(false);
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
    const activeKeyField = activeProvider ? PROVIDER_KEY_FIELD[activeProvider] : undefined;
    const activeKeyMissing = !!activeKeyField
        && !apiKeyStatuses.find(item => item.provider === activeProvider)?.configured;

    useEffect(() => { fetchConfigs(); }, []);
    useEffect(() => {
        if (!activeProvider || activeKeyMissing) { setLiveModels([]); return; }
        void fetchModels(activeProvider);
        return () => modelRequest.current?.abort();
    }, [activeProvider, activeKeyMissing]);

    useEffect(() => {
        const raw = getConfigValue('placeholder_language_mappings');
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                const norm: Record<string, [string, string]> = {};
                for (const [code, val] of Object.entries(parsed)) {
                    if (Array.isArray(val) && val.length === 2) {
                        norm[code] = [String(val[0]), String(val[1])];
                    }
                }
                if (Object.keys(norm).length > 0) {
                    setPlaceholderDraft(norm);
                    return;
                }
            } catch { /* fallback */ }
        }
        setPlaceholderDraft({ ...DEFAULT_PLACEHOLDERS });
    }, [configs]);

    // Opzioni della tendina: modelli live se disponibili, altrimenti fallback statico.
    // Il modello attivo viene sempre incluso così resta selezionato anche se non in elenco.
    const modelOptions = (() => {
        if (!activeProvider) return [];
        const base = liveModels.length > 0 ? liveModels : (PROVIDERS[activeProvider]?.models || []);
        return activeModel && !base.includes(activeModel) ? [activeModel, ...base] : base;
    })();

    // Etichette leggibili dei modelli consigliati: servono anche alla ricerca, così
    // si può filtrare per nome ("claude", "gemini") oltre che per ID.
    const modelLabels = Object.fromEntries(Object.values(RECOMMENDED_MODELS).flat().map(item => [item.id, item.label + ' · ' + item.id]));
    const providerRecommendations = (RECOMMENDED_MODELS[activeProvider] || []).filter(item => liveModels.includes(item.id));

    // Inserimento manuale: un ID valido è non vuoto e senza spazi.
    const manualModelValue = customModelDraft.trim();
    const manualModelInvalid = /\s/.test(manualModelValue);
    const canSaveManualModel = !!activeProvider && !activeKeyMissing && validModelId(manualModelValue);

    const toggleCustomModelMode = (enabled: boolean) => {
        setCustomModelMode(enabled);
        // Entrando in modale manuale si parte dal modello attivo, per modificarlo.
        setCustomModelDraft(enabled ? activeModel : '');
    };

    const commitManualModel = () => {
        if (!canSaveManualModel) return;
        handleModelChange(manualModelValue);
    };

    // --- Config helpers ---

    const handleSaveConfig = async (item: ConfigItem): Promise<boolean> => {
        setPendingPromptSaves(count => count + 1);
        try {
            const res = await fetch('/api/admin/config', {
                method: 'POST',
                headers: authJsonHeaders(),
                body: JSON.stringify(item),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setSavedConfigs(previous => [...previous.filter(c => c.key !== item.key), item]);
            showToast('success', t('admin.config.saved'));
            return true;
        } catch (error) {
            console.error('Failed to save config', error);
            showToast('error', t('admin.config.saveError'));
            return false;
        } finally {
            setPendingPromptSaves(count => count - 1);
        }
    };

    const handleVerifyAPIKey = async (provider: string) => {
        setApiKeyVerification(prev => ({ ...prev, [provider]: 'checking' }));
        try {
            const res = await fetch(`/api/admin/api-keys/${provider}/verify`, {
                method: 'POST',
                headers: authHeaders(),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const result = await res.json();
            setApiKeyVerification(prev => ({ ...prev, [provider]: result.working ? 'working' : 'failed' }));
        } catch (error) {
            console.error('Failed to verify API key', error);
            setApiKeyVerification(prev => ({ ...prev, [provider]: 'failed' }));
        }
    };

    const getConfigValue = (key: string) => configs.find(c => c.key === key)?.value || '';

    const setConfigDraft = (key: string, value: string, description: string) => {
        setConfigs(prev => {
            const others = prev.filter(p => p.key !== key);
            return [...others, { key, value, description }];
        });
    };

    // --- Provider/Model ---

    const handleProviderChange = (provider: string) => {
        modelRequest.current?.abort();
        setLiveModels([]);
        setActiveProvider(provider);
        handleSaveConfig({ key: 'active_provider', value: provider, description: 'Provider AI attivo' });
        const firstModel = PROVIDERS[provider]?.models[0] || '';
        setActiveModel(firstModel);
        // Nuovo provider, nuovo elenco: ricerca e ID manuale ripartono da zero.
        setCustomModelDraft('');
        setCustomModelMode(false);
        handleSaveConfig({ key: 'model_name', value: firstModel, description: 'Es. gpt-4o, claude-3-opus' });
    };

    const handleModelChange = (model: string) => {
        setActiveModel(model);
        handleSaveConfig({ key: 'model_name', value: model, description: 'Es. gpt-4o, claude-3-opus' });
    };

    const handleTestSystemAI = async () => {
        setSystemAITesting(true);
        setSystemAIProbeResults(null);
        try {
            const res = await fetch('/api/admin/system-ai/test', {
                method: 'POST',
                headers: {
                    ...authHeaders(),
                    'X-Requested-With': 'CounselorBot',
                },
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                const detail = typeof errorData.detail === 'string' ? errorData.detail : `HTTP ${res.status}`;
                showToast('error', detail);
                return;
            }
            const data: SystemAITestResponse = await res.json();
            setSystemAIProbeResults(data);
            if (!data.system_configured || data.results.length === 0) {
                showToast('error', systemAIText(lang, 'toastNotConfigured'));
            } else if (data.results.every(r => r.ok)) {
                showToast('success', systemAIText(lang, 'toastSuccess'));
            } else {
                showToast('error', systemAIText(lang, 'toastFailed'));
            }
        } catch (error) {
            console.error('Failed to test system AI fallback', error);
            showToast('error', systemAIText(lang, 'toastNetworkError'));
        } finally {
            setSystemAITesting(false);
        }
    };

    // --- Render ---

    if (loading) return <div className="text-center py-8 text-slate-500">{t('admin.config.loading')}</div>;

    const localConnections = [
        { key: 'ollama_ip', label: 'Ollama IP Address' },
        { key: 'llamacpp_url', label: localLlmText(lang, 'customLabel') },
    ];

    const sectionGroups: SectionFilterGroup[] = [
        {
            label: t('admin.config.section.groupSettings'),
            items: [
                { id: 'general', label: t('admin.config.section.general'), icon: <Server aria-hidden className="w-4 h-4 shrink-0 text-indigo-600" /> },
                { id: 'prompt-map', label: t('admin.promptMap.section'), detail: t('admin.promptMap.sectionDetail'), icon: <Layers aria-hidden className="w-4 h-4 shrink-0 text-indigo-600" /> },
                { id: 'directives', label: t('admin.config.section.directives'), icon: <FileText aria-hidden className="w-4 h-4 shrink-0 text-amber-600" /> },
            ],
        },
    ];
    // An unknown `?section=` (old link, removed instrument) falls back to the general settings.
    const activeSection = sectionGroups.some(group => group.items.some(item => item.id === section)) ? section : 'general';

    const hasUnsavedChanges = pendingPromptSaves > 0
        || configs.some(item => item.value !== savedConfigs.find(saved => saved.key === item.key)?.value);

    const applyFactoryResult = (result: FactoryAlignmentResult) => {
        const updateConfigs = (items: ConfigItem[]) => items.map(item =>
            Object.hasOwn(result.config_values, item.key) ? { ...item, value: result.config_values[item.key] } : item);
        setConfigs(updateConfigs);
        setSavedConfigs(updateConfigs);
    };

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

            <PromptFactoryAlignment disabled={hasUnsavedChanges}
                stepLabels={Object.fromEntries(guidedSteps.map(step => [step.id, `${step.questionnaire_type} — ${step.label_i18n?.[lang] || step.label}`]))}
                onApplied={applyFactoryResult} onBusyChange={setFactoryAlignmentBusy} />

            <fieldset disabled={factoryAlignmentBusy} className="contents">
            {/* Filtro di sezione: impostazioni e strumenti raggruppati */}
            <div className="border-b border-slate-200 pb-3">
                <SectionFilter
                    label={t('admin.config.section.label')}
                    searchPlaceholder={t('admin.config.section.search')}
                    emptyLabel={t('admin.config.section.empty')}
                    groups={sectionGroups}
                    value={activeSection}
                    onChange={openSection}
                />
            </div>

            {activeSection === 'general' && (
            <div className="space-y-8">
            {/* 1. Funzioni */}
            <div className="space-y-4 rounded-lg border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-700">{t('admin.features.title')}</h3>
                <div className="space-y-2">
                    <label htmlFor="feature_tavolo" className="block text-sm font-medium text-slate-700">{t('admin.features.tavolo')}</label>
                    <select
                        id="feature_tavolo"
                        value={getConfigValue('feature_tavolo') === 'true' ? 'true' : 'false'}
                        onChange={event => setConfigDraft('feature_tavolo', event.target.value, t('admin.features.tavolo'))}
                        className="w-full rounded-md border border-slate-300 bg-slate-50 p-2 font-mono text-xs text-slate-900"
                    >
                        <option value="false">{String(false)}</option>
                        <option value="true">{String(true)}</option>
                    </select>
                    <Button onClick={() => handleSaveConfig({
                        key: 'feature_tavolo',
                        value: getConfigValue('feature_tavolo') || 'false',
                        description: t('admin.features.tavolo'),
                    })}>
                        {t('common.save')}
                    </Button>
                </div>
            </div>

            {/* 2. AI dello studente: chiavi personali, ChatGPT, privacy verso provider esterni */}
            <section aria-labelledby="student-ai-settings-title" className="space-y-4" data-testid="student-ai-settings">
                <div>
                    <h3 id="student-ai-settings-title" className="text-sm font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('admin.config.studentAi.title')}</h3>
                    <p className="mt-1 ml-1 text-sm text-slate-600">{t('admin.config.studentAi.intro')}</p>
                </div>
                <p className="ml-1 text-sm text-slate-600">{personalAPIText(lang, 'adminSectionHelp')}</p>
                <PersonalAPIPolicy />
                <ChatGPTSettingsPanel />
                <ExternalPrivacySettings />
            </section>

            {/* Recupero documenti: provider di embedding (locale, esterno, nessuno) e indici */}
            <DocumentRetrievalSettings />

            {/* 3. API Keys */}
            <div className="space-y-4">
                <div>
                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('admin.config.apiKeys')}</h3>
                    <p className="mt-1 ml-1 text-sm text-slate-600">{t('admin.config.apiKeysIntro')}</p>
                </div>
                <Callout variant="info" title={t('admin.config.apiKeysContractTitle')}>
                    <div className="space-y-2">
                        <p>{t('admin.config.apiKeysContract')}</p>
                        <a
                            href={AI4EDUC_SECRETS_URL}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 font-semibold text-indigo-700 hover:text-indigo-800 hover:underline"
                        >
                            {t('admin.config.apiKeysManagedLink')}
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                    </div>
                </Callout>
                <div className="grid gap-3 lg:grid-cols-2">
                    {apiKeyStatuses.map((status) => {
                        const verification = apiKeyVerification[status.provider] || 'idle';
                        const providerLabel = PROVIDERS[status.provider]?.label || status.provider;
                        const active = status.provider === activeProvider;

                        return (
                            <section
                                key={status.provider}
                                className={`glass-panel p-4 space-y-3 ${active ? 'bg-indigo-50 ring-1 ring-indigo-300' : ''}`}
                                aria-labelledby={`api-key-${status.provider}`}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                        <h4 id={`api-key-${status.provider}`} className="flex items-center gap-2 font-semibold text-slate-900">
                                            <KeyRound className="w-4 h-4 text-indigo-600" />
                                            {providerLabel}
                                        </h4>
                                        <p className="mt-1 text-xs text-slate-500">
                                            {status.source === 'environment'
                                                ? t('admin.config.apiKeySourceEnvironment')
                                                : t('admin.config.apiKeySourceUnset')}
                                        </p>
                                    </div>
                                    <span role="status" aria-live="polite" className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                                        verification === 'working'
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : verification === 'failed'
                                                ? 'bg-red-100 text-red-800'
                                                : status.configured
                                                    ? 'bg-amber-100 text-amber-800'
                                                    : 'bg-slate-100 text-slate-700'
                                    }`}>
                                        {verification === 'working' && <CheckCircle2 className="w-3.5 h-3.5" />}
                                        {verification === 'failed' && <XCircle className="w-3.5 h-3.5" />}
                                        {verification === 'checking'
                                            ? t('admin.config.apiKeyChecking')
                                            : verification === 'working'
                                                ? t('admin.config.apiKeyWorking')
                                                : verification === 'failed'
                                                    ? t('admin.config.apiKeyFailed')
                                                    : status.configured
                                                        ? t('admin.config.apiKeyConfiguredUnverified')
                                                        : t('admin.config.apiKeyNotConfigured')}
                                    </span>
                                </div>

                                <p className="rounded-md bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700">
                                    {t(
                                        status.configured
                                            ? 'admin.config.apiKeyEnvironmentInstructions'
                                            : 'admin.config.apiKeyUnsetInstructions',
                                        { variable: status.environment_variable || status.preferred_environment_variable },
                                    )}
                                </p>

                                {verification === 'failed' && (
                                    <p className="text-xs leading-relaxed text-red-700">{t('admin.config.apiKeyFailedHint')}</p>
                                )}

                                {status.configured && (
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => handleVerifyAPIKey(status.provider)}
                                            disabled={verification === 'checking'}
                                        >
                                            <RefreshCw className={`w-4 h-4 ${verification === 'checking' ? 'animate-spin' : ''}`} />
                                            {t('admin.config.apiKeyVerify')}
                                        </Button>
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </div>

                <div className="space-y-3 pt-2">
                    <h4 className="text-sm font-semibold text-slate-700">{t('admin.config.localConnections')}</h4>
                    {localConnections.map((def) => {
                        const currentVal = configs.find(c => c.key === def.key)?.value || '';
                        const isEnvOverridden = envOverrides[def.key] || false;
                        return (
                            <div key={def.key} className="glass-panel p-4 flex items-center gap-4">
                                <div className="flex-1">
                                    <label className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-2">
                                        {def.label}
                                        {isEnvOverridden && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-800">ENV</span>}
                                    </label>
                                    <input
                                        type="url"
                                        className="w-full border-none bg-transparent p-0 font-mono text-sm text-slate-900 focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
                                        placeholder={isEnvOverridden ? t('admin.config.envSet') : 'http://host.docker.internal:11434'}
                                        value={isEnvOverridden ? '' : currentVal}
                                        disabled={isEnvOverridden}
                                        onChange={(event) => setConfigDraft(def.key, event.target.value, def.label)}
                                    />
                                </div>
                                {!isEnvOverridden && (
                                    <Button type="button" size="sm" variant="ghost" onClick={() => handleSaveConfig({ key: def.key, value: currentVal, description: def.label })}>
                                        <Save className="w-4 h-4" />
                                        <span className="sr-only">{t('admin.config.save')}</span>
                                    </Button>
                                )}
                            </div>
                        );
                    })}
                    <LocalLlmDetect
                        customUrl={getConfigValue('llamacpp_url')}
                        currentValues={{ ollama_ip: getConfigValue('ollama_ip'), llamacpp_url: getConfigValue('llamacpp_url') }}
                        envOverrides={envOverrides}
                        onUse={(key, value) => {
                            const label = localConnections.find(def => def.key === key)?.label || key;
                            setConfigDraft(key, value, label);
                            handleSaveConfig({ key, value, description: label });
                        }}
                    />
                </div>
            </div>

            {/* Riserva di sistema (quando l'utente non ha ChatGPT o una chiave personale) */}
            <details
                className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6"
                data-testid="system-ai-fallback-section"
            >
                <summary className="flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none">
                    <div className="flex items-center gap-2">
                        <Server className="w-5 h-5 text-indigo-600 shrink-0" />
                        <h3 className="text-base font-semibold text-slate-900 inline">
                            {systemAIText(lang, 'title')}
                        </h3>
                    </div>
                    <div className="flex items-center gap-2">
                        {activeProvider && activeModel ? (
                            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                                {systemAIText(lang, 'configured')}: {PROVIDERS[activeProvider]?.label || activeProvider} ({activeModel})
                            </span>
                        ) : (
                            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                                {systemAIText(lang, 'notConfigured')}
                            </span>
                        )}
                        <span className="text-xs text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                    </div>
                </summary>

                <div className="space-y-6 pt-2">
                    {/* Spiegazione ordine di scelta 1-2-3 */}
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3.5 text-xs text-slate-700 leading-relaxed space-y-1">
                        <p className="font-semibold text-slate-800">
                            {systemAIText(lang, 'orderHelp')}
                        </p>
                        <p className="text-slate-600">
                            {systemAIText(lang, 'sectionHelp')}
                        </p>
                    </div>

                    {/* Avviso stato reale quando non configurata */}
                    {(!activeProvider || !activeModel) && (
                        <Callout variant="warning">
                            {systemAIText(lang, 'noFallbackWarning')}
                        </Callout>
                    )}

                    {/* Selezione Provider e Modello */}
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">
                                {systemAIText(lang, 'provider')}
                            </label>
                            <select
                                value={activeProvider}
                                onChange={(e) => handleProviderChange(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-300 rounded-md p-3 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="">{systemAIText(lang, 'noProviderSelected')}</option>
                                {Object.entries(PROVIDERS).map(([key, data]) => (
                                    <option key={key} value={key}>{data.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-slate-700">
                                    {systemAIText(lang, 'model')}
                                </label>
                                {activeProvider && (
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
                                )}
                            </div>

                            {/* Elenco del provider oppure ID digitato a mano (modelli non in elenco). */}
                            {activeProvider && (
                                <div className="flex rounded-md border border-slate-300 bg-slate-50 p-0.5 text-xs">
                                    <button
                                        type="button"
                                        aria-pressed={!customModelMode}
                                        onClick={() => toggleCustomModelMode(false)}
                                        className={`flex-1 rounded px-2 py-1.5 font-medium transition-colors ${!customModelMode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                                    >
                                        {t('admin.config.useDropdownList')}
                                    </button>
                                    <button
                                        type="button"
                                        aria-pressed={customModelMode}
                                        onClick={() => toggleCustomModelMode(true)}
                                        className={`flex-1 rounded px-2 py-1.5 font-medium transition-colors ${customModelMode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                                    >
                                        {t('admin.config.customModelToggle')}
                                    </button>
                                </div>
                            )}

                            {customModelMode ? (
                                <div className="space-y-2">
                                    <div className="relative">
                                        <Cpu className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                                        <input
                                            id="system_ai_model_manual"
                                            type="text"
                                            value={customModelDraft}
                                            onChange={(e) => setCustomModelDraft(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    commitManualModel();
                                                }
                                            }}
                                            placeholder={t('admin.config.customModelPlaceholder')}
                                            className="w-full bg-slate-50 border border-slate-300 rounded-md p-3 pl-10 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                                        />
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            onClick={commitManualModel}
                                            disabled={!canSaveManualModel}
                                            className="flex items-center gap-1.5"
                                        >
                                            <Save className="w-3.5 h-3.5" />
                                            {t('common.save')}
                                        </Button>
                                        {manualModelInvalid && (
                                            <p className="text-xs text-red-600">{t('admin.config.customModelInvalid')}</p>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <ModelSearchSelect
                                        key={activeProvider}
                                        id="system_ai_model"
                                        models={modelOptions}
                                        value={activeKeyMissing ? '' : activeModel}
                                        onChange={handleModelChange}
                                        disabled={!activeProvider || activeKeyMissing}
                                        loading={modelsLoading}
                                        emptyLabel={!activeProvider ? systemAIText(lang, 'modelEmpty') : activeKeyMissing ? t('admin.config.modelNeedsKey') : undefined}
                                        labels={modelLabels}
                                    />
                                    {activeProvider && activeKeyMissing ? (
                                        <p className="text-xs text-amber-600">{t('admin.config.modelNeedsKeyHint')}</p>
                                    ) : (
                                        activeProvider && liveModels.length === 0 && !modelsLoading && (
                                            <p className="text-xs text-amber-600">{t('admin.config.providerUnreachable')}</p>
                                        )
                                    )}
                                </>
                            )}

                            {/* Avvisi sul modello attivo: reasoning e fascia gratuita. */}
                            {activeModel && (
                                <p className="flex items-start gap-1.5 text-xs text-violet-700">
                                    <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                    <span>{t('admin.config.reasoningHint')}</span>
                                </p>
                            )}
                            {activeModel && isFreeModel(activeModel) && (
                                <p className="flex items-start gap-1.5 text-xs text-amber-700">
                                    <Award className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                    <span>{t('admin.config.freeTierHint')}</span>
                                </p>
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
                                <span className="block text-xs text-slate-500 font-normal">{t('admin.config.noThinkingDesc')}</span>
                            </label>
                        </div>
                    </div>

                    {/* Suggerimento: quali modelli sono adatti per CounselorBot e perché. */}
                    {providerRecommendations.length > 0 && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                            <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                                {t('admin.config.recommendedModels')}
                            </p>
                            <ul className="grid gap-2 sm:grid-cols-2">
                                {providerRecommendations.map((recommendation) => {
                                    const selected = activeModel === recommendation.id;
                                    return (
                                        <li key={recommendation.id}>
                                            <button
                                                type="button"
                                                aria-pressed={selected}
                                                disabled={activeKeyMissing}
                                                onClick={() => handleModelChange(recommendation.id)}
                                                className={cn(
                                                    'h-full w-full rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                                                    selected
                                                        ? 'border-indigo-400 bg-indigo-50'
                                                        : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40',
                                                )}
                                            >
                                                <span className="flex flex-wrap items-center gap-2">
                                                    <span className="text-sm font-semibold text-slate-900">{recommendation.label}</span>
                                                    <span className={cn('rounded-full px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide', MODEL_TAG_STYLES[recommendation.tag])}>
                                                        {t(MODEL_TAG_KEYS[recommendation.tag])}
                                                    </span>
                                                    {selected && <CheckCircle2 className="w-4 h-4 text-indigo-600" />}
                                                </span>
                                                <span className="mt-1 block break-all font-mono text-xs text-slate-500">{recommendation.id}</span>
                                                <span className="mt-1 block text-xs text-slate-600">{t('admin.config.modelAdvice.' + recommendation.tag)}</span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}

                    {/* Risposta a "dove si regolano le grandezze delle risposte". */}
                    <Callout variant="info" icon={Layers}>
                        {t('admin.config.lengthProfilesHint')}
                    </Callout>

                    {/* Pulsante Prova */}
                    <div className="flex flex-wrap items-center gap-3 pt-2">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={handleTestSystemAI}
                            disabled={systemAITesting}
                            className="flex items-center gap-2"
                        >
                            <RefreshCw className={`w-4 h-4 ${systemAITesting ? 'animate-spin' : ''}`} />
                            {systemAITesting ? systemAIText(lang, 'testingButton') : systemAIText(lang, 'testButton')}
                        </Button>
                    </div>

                    {/* Risultati prova */}
                    {systemAIProbeResults && (
                        <div className="space-y-3">
                            {(!systemAIProbeResults.system_configured || systemAIProbeResults.results.length === 0) ? (
                                <Callout variant="warning" title={systemAIText(lang, 'notConfigured')}>
                                    <p className="text-xs">{systemAIText(lang, 'noFallbackWarning')}</p>
                                </Callout>
                            ) : (
                                <Callout
                                    variant={systemAIProbeResults.results.every(r => r.ok) ? 'success' : 'danger'}
                                    title={systemAIText(lang, systemAIProbeResults.results.every(r => r.ok) ? 'testSuccessTitle' : 'testFailureTitle')}
                                >
                                    <p className="text-xs mb-3">{systemAIText(lang, 'testResultsIntro')}</p>
                                    <div className="space-y-2">
                                        {systemAIProbeResults.results.map((result, idx) => {
                                            const roleText = systemAIRoleLabel(lang, result.role, result.role === 'fallback' ? idx : undefined);
                                            const detailText = formatProbeDetail(lang, result);
                                            return (
                                                <div
                                                    key={`${result.role}-${result.provider}-${result.model}-${idx}`}
                                                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-md border border-slate-200/80 bg-white/90 text-xs text-slate-800"
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="font-semibold text-slate-900 shrink-0">
                                                            {roleText}:
                                                        </span>
                                                        <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px] truncate">
                                                            {result.provider} / {result.model}
                                                        </code>
                                                    </div>
                                                    <div className="flex items-center gap-3 shrink-0">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-medium ${
                                                            result.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                                                        }`}>
                                                            {result.ok ? 'OK' : (result.error_code || 'error')}
                                                        </span>
                                                        <span className="text-slate-500">
                                                            {`${result.elapsed_ms} ms`}
                                                        </span>
                                                    </div>
                                                    {detailText && (
                                                        <div className="sm:hidden text-[11px] text-slate-600">
                                                            {detailText}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </Callout>
                            )}
                        </div>
                    )}

                    {/* Dettaglio avanzato per JSON di routing e timeout */}
                    <details className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-4">
                        <summary className="cursor-pointer text-sm font-semibold text-slate-700 select-none">
                            {systemAIText(lang, 'advancedTitle')}
                        </summary>
                        <p className="text-xs text-slate-600">
                            {systemAIText(lang, 'advancedHelp')}
                        </p>
                        {[
                            ['ai_fallback_targets', 'admin.routing.targets', '[]'],
                            ['ai_timeout_seconds', 'admin.routing.timeout', '120'],
                        ].map(([key, label, fallback]) => (
                            <div key={key} className="space-y-2">
                                <label htmlFor={key} className="block text-sm font-medium text-slate-700">{t(label)}</label>
                                <textarea
                                    id={key}
                                    rows={key === 'ai_timeout_seconds' ? 1 : 3}
                                    value={getConfigValue(key) || fallback}
                                    onChange={event => setConfigDraft(key, event.target.value, t(label))}
                                    className="w-full rounded-md border border-slate-300 bg-white p-2 font-mono text-xs text-slate-900"
                                />
                                <Button
                                    size="sm"
                                    onClick={() => handleSaveConfig({ key, value: getConfigValue(key) || fallback, description: t(label) })}
                                >
                                    {t('common.save')}
                                </Button>
                            </div>
                        ))}
                        <p className="text-xs text-slate-500">{t('admin.routing.example')}</p>
                        <code className="block overflow-x-auto text-xs text-slate-700 font-mono p-2 bg-white rounded border border-slate-200">
                            {'[{"provider":"openrouter","model":"openrouter/free"},{"provider":"omniroute","model":"auto/best-chat"}]'}
                        </code>
                        <ModelContextSettings />
                    </details>
                </div>
            </details>

            {/* Placeholder Language Mappings */}
            <div className="glass-panel p-6 space-y-4">
                <h3 className="text-lg font-medium text-slate-900 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-indigo-600" />
                    {t('admin.config.placeholder.title')}
                </h3>
                <p className="text-xs text-slate-500 max-w-2xl">
                    {t('admin.config.placeholder.desc')}
                </p>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200">
                                <th className="text-left py-2 px-3 text-slate-500 font-medium w-24">{t('admin.config.placeholder.code')}</th>
                                <th className="text-left py-2 px-3 text-slate-500 font-medium">{t('admin.config.placeholder.englishName')}</th>
                                <th className="text-left py-2 px-3 text-slate-500 font-medium">{t('admin.config.placeholder.nativeName')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(DEFAULT_PLACEHOLDERS).map(([code]) => {
                                const val = placeholderDraft[code] || ['', ''];
                                return (
                                    <tr key={code} className="border-b border-slate-100">
                                        <td className="py-2 px-3 font-mono text-slate-700">{code}</td>
                                        <td className="py-2 px-3">
                                            <input
                                                className="w-full bg-slate-50 border border-slate-300 rounded-md px-2 py-1.5 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                                                value={val[0]}
                                                onChange={(e) => {
                                                    setPlaceholderDraft(prev => ({
                                                        ...prev,
                                                        [code]: [e.target.value, prev[code]?.[1] || ''],
                                                    }));
                                                }}
                                                placeholder={t('admin.config.placeholder.englishPlaceholder')}
                                            />
                                        </td>
                                        <td className="py-2 px-3">
                                            <input
                                                className="w-full bg-slate-50 border border-slate-300 rounded-md px-2 py-1.5 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                                                value={val[1]}
                                                onChange={(e) => {
                                                    setPlaceholderDraft(prev => ({
                                                        ...prev,
                                                        [code]: [prev[code]?.[0] || '', e.target.value],
                                                    }));
                                                }}
                                                placeholder={t('admin.config.placeholder.nativePlaceholder')}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="flex justify-end pt-2">
                    <button
                        onClick={() => {
                            const json = JSON.stringify(placeholderDraft);
                            handleSaveConfig({ key: 'placeholder_language_mappings', value: json, description: 'Language placeholder mapping' });
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                    >
                        <Save className="w-4 h-4" />
                        {t('admin.config.placeholder.save')}
                    </button>
                </div>
            </div>

            </div>
            )}

            {activeSection === 'directives' && (
            <div className="space-y-6">
                <div className="glass-panel p-6 space-y-6">
                    <h3 className="text-lg font-medium text-slate-900 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-amber-600" />
                        {t('admin.config.section.directives')}
                    </h3>
                    <p className="text-xs text-slate-500 max-w-2xl">
                        {t('admin.config.directives.desc')}
                    </p>
                    {[
                        { key: 'directive_language', label: t('admin.config.directive.language'), hint: t('admin.config.directive.languageHint') },
                        { key: 'directive_register', label: t('admin.config.directive.register') },
                        { key: 'directive_thinking', label: t('admin.config.directive.thinking') },
                    ].map((def) => {
                        const currentVal = getConfigValue(def.key);
                        return (
                            <div key={def.key} className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm font-semibold text-slate-700">{def.label}</label>
                                    <button
                                        onClick={() => handleSaveConfig({ key: def.key, value: getConfigValue(def.key), description: def.label })}
                                        className="p-2 hover:bg-slate-100 rounded-md text-indigo-600 transition-colors shrink-0"
                                    >
                                        <Save className="w-4 h-4" />
                                    </button>
                                </div>
                                {def.hint && <p className="text-xs text-amber-600">{def.hint}</p>}
                                <textarea
                                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-sm min-h-[160px] ring-amber-500 outline-none font-mono text-slate-900 focus:ring-2"
                                    value={currentVal}
                                    onChange={(e) => setConfigDraft(def.key, e.target.value, def.label)}
                                    placeholder={t('admin.config.directive.placeholder')}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
            )}

            {/* 3. Strumento attivo: prompt, testi e step separati in tab interne */}
            {activeSection === 'prompt-map' && <PromptMap componentLabels={promptComponentText(lang).labels} />}

            </fieldset>
        </div>
    );
}
