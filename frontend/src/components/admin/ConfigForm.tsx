'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Cpu, FileText, Layers, Palette, Plus, RefreshCw, Save, Server, Trash2, ChevronUp, ChevronDown, Pencil, Award } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { fetchCounselors, type PublicCounselor } from '@/lib/counselor';

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

interface QuestionnaireResult {
    id: number;
    session_id: string;
    questionnaire_type: string;
    username?: string | null;
    submitted_at: string;
}

interface PromptPreview {
    envelope?: { system_prompt_final?: string; full_message?: string; history?: unknown[] };
    components?: Record<string, unknown>;
    component_flags?: Record<string, boolean>;
    component_options?: { certified_strategy_limit?: number; allowed_strategies?: string[] };
    component_config_key?: string;
    knowledge?: { included?: boolean; context_length?: number; strategy_ids?: string[]; certified_strategy_ids?: string[] };
    selected_result?: { session_id: string; username?: string | null; submitted_at?: string | null } | null;
}

type InstrumentSubsection = 'step-prompts' | 'system-prompts' | 'texts' | 'guided-steps';

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
    { value: 'intro', label: 'Presentazione' },
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

const DEFAULT_PLACEHOLDERS: Record<string, [string, string]> = {
    it: ['Italian', 'italiano'],
    en: ['English', 'English'],
    es: ['Spanish', 'español'],
    fr: ['French', 'français'],
    de: ['German', 'Deutsch'],
    sv: ['Swedish', 'svenska'],
};

const INSTRUMENT_SUBSECTIONS: Array<{ id: InstrumentSubsection; labelKey: string }> = [
    { id: 'step-prompts', labelKey: 'admin.config.inner.stepPrompts' },
    { id: 'system-prompts', labelKey: 'admin.config.inner.systemPrompts' },
    { id: 'texts', labelKey: 'admin.config.inner.texts' },
    { id: 'guided-steps', labelKey: 'admin.config.inner.guidedSteps' },
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

const SYSTEM_PROMPT_KEY_BY_MODE: Record<string, string> = {
    factor: 'prompt_factor',
    'factor-qa': 'prompt_factor_qa',
    'second-level': 'prompt_second_level',
    generic: 'prompt_generic',
    'qsar-factor': 'prompt_qsar_factor',
    'qsar-factor-qa': 'prompt_qsar_factor_qa',
    'qsar-second-level': 'prompt_qsar_second_level',
    'qsar-generic': 'prompt_qsar_generic',
    'ztpi-factor': 'prompt_ztpi_factor',
    'ztpi-btp': 'prompt_ztpi_btp',
    'savickas-interview': 'prompt_savickas_interview',
    'savickas-summary': 'prompt_savickas_summary',
    'qpcs-factor': 'prompt_qpcs_factor',
    'qpcc-factor': 'prompt_qpcc_factor',
    'qap-factor': 'prompt_qap_factor',
    'qpcs-interview': 'prompt_qpcs_interview',
    'qpcs-summary': 'prompt_qpcs_summary',
    'qpcc-interview': 'prompt_qpcc_interview',
    'qpcc-summary': 'prompt_qpcc_summary',
    'qap-interview': 'prompt_qap_interview',
    'qap-summary': 'prompt_qap_summary',
};const PROMPT_COMPONENT_DEFAULTS: Record<string, boolean> = {
    system_prompt: true,
    step_prompt: true,
    cognitive_factors: true,
    affective_factors: true,
    other_scores: true,
    knowledge: true,
    history: true,
    counselor: true,
    metadata: true,
    profile: true,
    student_booklet: true,
    rag_counselorbot: false,
    rag_competenzestrategiche: true,
    rag_questionari: false,
    approved_strategies: true,
    certified_strategies: true,
    shared_responses: true,
};

const PROMPT_LANGUAGES = [
    { code: 'it', label: 'Italiano' },
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Español' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
    { code: 'sv', label: 'Svenska' },
];

const PROMPT_COMPONENT_TEXTS: Record<string, { title: string; labels: Record<string, string> }> = {
    it: {
        title: 'Componenti passati alla fase',
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
            profile: 'Profilo / portfolio',
            student_booklet: 'Taccuino studente',
            rag_counselorbot: 'RAG CounselorBot (docs-counselorbot)',
            rag_competenzestrategiche: 'RAG Competenzestrategiche (guide)',
            rag_questionari: 'RAG Questionari e Strumenti',
            approved_strategies: 'Strategie approvate QSA',
            certified_strategies: 'Strategie certificate',
            shared_responses: 'Risposte condivise votate utili',
        },
    },
    en: {
        title: 'Components passed to this phase',
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
            profile: 'Profile / portfolio',
            student_booklet: 'Student notebook',
            rag_counselorbot: 'RAG CounselorBot (docs-counselorbot)',
            rag_competenzestrategiche: 'RAG Competenzestrategiche (guides)',
            rag_questionari: 'RAG Questionnaires & Instruments',
            approved_strategies: 'Approved QSA strategies',
            certified_strategies: 'Certified strategies',
            shared_responses: 'Shared responses voted helpful',
        },
    },
    es: {
        title: 'Componentes pasados a esta fase',
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
            profile: 'Perfil / portafolio',
            student_booklet: 'Cuaderno del estudiante',
            rag_counselorbot: 'RAG CounselorBot (docs-counselorbot)',
            rag_competenzestrategiche: 'RAG Competenzestrategiche (guías)',
            rag_questionari: 'RAG Cuestionarios e Instrumentos',
            approved_strategies: 'Estrategias aprobadas QSA',
            certified_strategies: 'Estrategias certificadas',
            shared_responses: 'Respuestas compartidas votadas útiles',
        },
    },
    fr: {
        title: 'Composants transmis à cette phase',
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
            profile: 'Profil / portfolio',
            student_booklet: 'Carnet étudiant',
            rag_counselorbot: 'RAG CounselorBot (docs-counselorbot)',
            rag_competenzestrategiche: 'RAG Competenzestrategiche (guides)',
            rag_questionari: 'RAG Questionnaires & Instruments',
            approved_strategies: 'Stratégies approuvées QSA',
            certified_strategies: 'Stratégies certifiées',
            shared_responses: 'Réponses partagées votées utiles',
        },
    },
    de: {
        title: 'An diese Phase übergebene Komponenten',
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
            profile: 'Profil / Portfolio',
            student_booklet: 'Studierenden-Notizbuch',
            rag_counselorbot: 'RAG CounselorBot (docs-counselorbot)',
            rag_competenzestrategiche: 'RAG Competenzestrategiche (Leitfäden)',
            rag_questionari: 'RAG Fragebögen & Instrumente',
            approved_strategies: 'Zugelassene QSA-Strategien',
            certified_strategies: 'Zertifizierte Strategien',
            shared_responses: 'Geteilte Antworten als hilfreich bewertet',
        },
    },
    sv: {
        title: 'Komponenter som skickas till denna fas',
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
            profile: 'Profil / portfolio',
            student_booklet: 'Studentens anteckningsbok',
            rag_counselorbot: 'RAG CounselorBot (docs-counselorbot)',
            rag_competenzestrategiche: 'RAG Competenzestrategiche (guider)',
            rag_questionari: 'RAG Frågeformulär & Instrument',
            approved_strategies: 'Godkända QSA-strategier',
            certified_strategies: 'Certifierade strategier',
            shared_responses: 'Delade svar som röstats fram som hjälpsamma',
        },
    },
};

const PROMPT_UI_TEXTS: Record<string, Record<string, string>> = {
    it: { languagePrompt: 'Lingua prompt', guidanceNotes: 'Appunti per modificare la fase', edit: 'Modifica', save: 'Salva', cancel: 'Annulla', loading: 'Caricamento...', finalPrompt: 'Prompt finale assemblato' },
    en: { languagePrompt: 'Prompt language', guidanceNotes: 'Notes for editing this phase', edit: 'Edit', save: 'Save', cancel: 'Cancel', loading: 'Loading...', finalPrompt: 'Final assembled prompt' },
    es: { languagePrompt: 'Idioma del prompt', guidanceNotes: 'Notas para editar esta fase', edit: 'Editar', save: 'Guardar', cancel: 'Cancelar', loading: 'Cargando...', finalPrompt: 'Prompt final ensamblado' },
    fr: { languagePrompt: 'Langue du prompt', guidanceNotes: 'Notes pour modifier cette phase', edit: 'Modifier', save: 'Enregistrer', cancel: 'Annuler', loading: 'Chargement...', finalPrompt: 'Prompt final assemblé' },
    de: { languagePrompt: 'Prompt-Sprache', guidanceNotes: 'Notizen zur Bearbeitung dieser Phase', edit: 'Bearbeiten', save: 'Speichern', cancel: 'Abbrechen', loading: 'Wird geladen...', finalPrompt: 'Final zusammengesetzter Prompt' },
    sv: { languagePrompt: 'Promptspråk', guidanceNotes: 'Anteckningar för att redigera denna fas', edit: 'Redigera', save: 'Spara', cancel: 'Avbryt', loading: 'Laddar...', finalPrompt: 'Slutlig sammanställd prompt' },
};

function promptComponentText(language: string) {
    return PROMPT_COMPONENT_TEXTS[language] || PROMPT_COMPONENT_TEXTS.it;
}

function promptUiText(language: string) {
    return PROMPT_UI_TEXTS[language] || PROMPT_UI_TEXTS.it;
}

const SYSTEM_PROMPT_KEY_BY_PHASE: Record<string, string> = {
    questions: 'prompt_guided_questions',
    intro: 'prompt_intro',
    'qsar-intro': 'prompt_qsar_intro',
    'ztpi-intro': 'prompt_ztpi_intro',
    'savickas-intro': 'prompt_savickas_intro',
    'qpcs-welcome': 'prompt_qpcs_welcome',
    'qpcc-welcome': 'prompt_qpcc_welcome',
    'qap-welcome': 'prompt_qap_welcome',
};

// --- Helper to get auth header ---

// Auth gestita al bordo da ai4auth (forward-auth): nessun token lato client.
function authHeaders(): Record<string, string> {
    return {};
}

function authJsonHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json' };
}

function normalizedQuestionnaireType(questionnaireType: string): string {
    return questionnaireType.trim().toUpperCase();
}

function textStats(text: string | null | undefined): { chars: number; lines: number } {
    const value = text || '';
    return {
        chars: value.length,
        lines: value ? value.split('\n').length : 0,
    };
}

function promptKeyForStep(step: GuidedStep | undefined): string {
    if (!step) return '';
    return SYSTEM_PROMPT_KEY_BY_PHASE[step.id] || SYSTEM_PROMPT_KEY_BY_MODE[step.system_prompt_mode] || 'prompt_generic';
}

function promptComponentConfigKey(questionnaireType: string, stepId: string): string {
    return `prompt_components_${questionnaireType.trim().toUpperCase().replace(/[^A-Za-z0-9_-]+/g, '-')}_${stepId.trim().replace(/[^A-Za-z0-9_-]+/g, '-')}`;
}

function promptGuidanceConfigKey(questionnaireType: string, stepId: string): string {
    return `prompt_guidance_${questionnaireType.trim().toUpperCase().replace(/[^A-Za-z0-9_-]+/g, '-')}_${stepId.trim().replace(/[^A-Za-z0-9_-]+/g, '-')}`;
}

function promptMetaConfigKey(questionnaireType: string, stepId?: string): string {
    const q = questionnaireType.trim().toUpperCase().replace(/[^A-Za-z0-9_-]+/g, '-');
    const base = `prompt_meta_${q}`;
    if (stepId) {
        const s = stepId.trim().replace(/[^A-Za-z0-9_-]+/g, '-');
        return `${base}_${s}`;
    }
    return base;
}

function localizedStepPromptConfigKey(stepId: string, language: string): string {
    return `guided_step_prompt_${stepId.trim().replace(/[^A-Za-z0-9_-]+/g, '-')}${language === 'it' ? '' : `__${language}`}`;
}

function parseComponentFlags(raw: string): Record<string, boolean> {
    try {
        return { ...PROMPT_COMPONENT_DEFAULTS, ...(JSON.parse(raw || '{}') || {}) };
    } catch {
        return { ...PROMPT_COMPONENT_DEFAULTS };
    }
}

function parseComponentFlagOverrides(raw: string): Record<string, boolean> {
    try {
        const parsed = JSON.parse(raw || '{}') || {};
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        return Object.fromEntries(
            Object.keys(PROMPT_COMPONENT_DEFAULTS)
                .filter((name) => name in parsed)
                .map((name) => [name, Boolean(parsed[name])])
        );
    } catch {
        return {};
    }
}

function defaultCertifiedStrategyLimit(mode: string | undefined): number {
    return mode === 'second-level' || mode === 'qsar-second-level' ? 3 : 2;
}

function parseCertifiedStrategyLimit(raw: string, fallback: number): number {
    try {
        const parsed = JSON.parse(raw || '{}') || {};
        const value = Number(parsed.certified_strategy_limit);
        if (!Number.isFinite(value)) return fallback;
        return Math.max(0, Math.min(3, Math.trunc(value)));
    } catch {
        return fallback;
    }
}

function parseAllowedStrategies(raw: string): string[] | undefined {
    try {
        const parsed = JSON.parse(raw || '{}') || {};
        if (parsed && Array.isArray(parsed.allowed_strategies)) {
            return parsed.allowed_strategies.map(String);
        }
    } catch {}
    return undefined;
}

function textValue(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value == null) return '';
    return JSON.stringify(value, null, 2);
}

function PromptTextBlock({
    title,
    subtitle,
    text,
    emptyLabel,
}: {
    title: string;
    subtitle?: string;
    text: string | null | undefined;
    emptyLabel: string;
}) {
    const value = text || '';
    const stats = textStats(value);
    return (
        <div className="rounded-lg border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <div>
                    <h5 className="text-sm font-semibold text-slate-800">{title}</h5>
                    {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500">
                    {stats.chars} char · {stats.lines} righe
                </span>
            </div>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-4 text-xs leading-relaxed text-slate-700">
                {value.trim() ? value : emptyLabel}
            </pre>
        </div>
    );
}

function EditablePromptTextBlock({
    title,
    subtitle,
    text,
    emptyLabel,
    editing,
    draft,
    onEdit,
    onDraftChange,
    onSave,
    onCancel,
    editLabel,
    saveLabel,
    cancelLabel,
}: {
    title: string;
    subtitle?: string;
    text: string | null | undefined;
    emptyLabel: string;
    editing: boolean;
    draft: string;
    onEdit: () => void;
    onDraftChange: (value: string) => void;
    onSave: () => void;
    onCancel: () => void;
    editLabel: string;
    saveLabel: string;
    cancelLabel: string;
}) {
    const value = editing ? draft : (text || '');
    const stats = textStats(value);
    return (
        <div className="rounded-lg border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <div>
                    <h5 className="text-sm font-semibold text-slate-800">{title}</h5>
                    {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
                </div>
                <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500">
                        {stats.chars} char · {stats.lines} righe
                    </span>
                    {!editing && (
                        <button type="button" onClick={onEdit} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-600" title={editLabel}>
                            <Pencil className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>
            {editing ? (
                <div className="space-y-3 p-4">
                    <textarea
                        className="min-h-[220px] w-full rounded-md border border-slate-300 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                        value={draft}
                        onChange={(event) => onDraftChange(event.target.value)}
                    />
                    <div className="flex gap-2">
                        <button type="button" onClick={onSave} className="rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700">{saveLabel}</button>
                        <button type="button" onClick={onCancel} className="rounded-md bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-300">{cancelLabel}</button>
                    </div>
                </div>
            ) : (
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-4 text-xs leading-relaxed text-slate-700">
                    {value.trim() ? value : emptyLabel}
                </pre>
            )}
        </div>
    );
}

function StepPromptsPanel({
    questionnaireType,
    steps,
    selectedStepId,
    onSelectStep,
    onEditSystemPrompts,
    onEditStep,
    configs,
    results,
    selectedSessionId,
    onSelectSession,
    selectedCounselorId,
    onSelectCounselor,
    selectedLanguage,
    onSelectLanguage,
    onSaveComponentFlags,
    onSaveSystemPrompt,
    onSaveMetaPrompt,
    onSaveGuidance,
    onSaveStepPrompt,
    t,
}: {
    questionnaireType: string;
    steps: GuidedStep[];
    selectedStepId: string;
    onSelectStep: (stepId: string) => void;
    onEditSystemPrompts: () => void;
    onEditStep: () => void;
    configs: ConfigItem[];
    results: QuestionnaireResult[];
    selectedSessionId: string;
    onSelectSession: (sessionId: string) => void;
    selectedCounselorId: number | '';
    onSelectCounselor: (counselorId: number | '') => void;
    selectedLanguage: string;
    onSelectLanguage: (language: string) => void;
    onSaveComponentFlags: (key: string, flags: Record<string, unknown>) => void;
    onSaveSystemPrompt: (key: string, value: string) => void;
    onSaveMetaPrompt: (key: string, value: string) => void;
    onSaveGuidance: (key: string, value: string) => void;
    onSaveStepPrompt: (step: GuidedStep, value: string, language: string, localizedKey: string) => void;
    t: (key: string, vars?: Record<string, string | number>) => string;
}) {
    const selectedStep = steps.find((step) => step.id === selectedStepId) || steps[0];
    const systemPromptKey = promptKeyForStep(selectedStep);
    const systemPrompt = configs.find((config) => config.key === systemPromptKey)?.value || '';
    const componentKey = selectedStep ? promptComponentConfigKey(questionnaireType, selectedStep.id) : '';
    const guidanceKey = selectedStep ? promptGuidanceConfigKey(questionnaireType, selectedStep.id) : '';
    const metaPromptKey = promptMetaConfigKey(questionnaireType, selectedStep?.id);
    const instrumentMetaKey = promptMetaConfigKey(questionnaireType);
    const componentConfigValue = configs.find((config) => config.key === componentKey)?.value || '';
    const configFlags = parseComponentFlags(componentConfigValue);
    const configFlagOverrides = parseComponentFlagOverrides(componentConfigValue);
    const defaultCertifiedLimit = defaultCertifiedStrategyLimit(selectedStep?.system_prompt_mode);
    const configCertifiedStrategyLimit = parseCertifiedStrategyLimit(componentConfigValue, defaultCertifiedLimit);
    const guidanceText = configs.find((config) => config.key === guidanceKey)?.value || '';
    const metaPrompt = configs.find((config) => config.key === metaPromptKey)?.value
        || configs.find((config) => config.key === instrumentMetaKey)?.value
        || '';
    const localizedStepKey = selectedStep ? localizedStepPromptConfigKey(selectedStep.id, selectedLanguage) : '';
    const localizedStepValue = selectedLanguage === 'it'
        ? selectedStep?.prompt || ''
        : (configs.find((config) => config.key === localizedStepKey)?.value || selectedStep?.prompt || '');
    const [preview, setPreview] = useState<PromptPreview | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    // ponytail: reuse public /counselors fetch (active only), filter client-side by instrument.
    const [counselors, setCounselors] = useState<PublicCounselor[]>([]);
    useEffect(() => { fetchCounselors().then(setCounselors).catch(() => setCounselors([])); }, []);

    const [allApprovedStrategies, setAllApprovedStrategies] = useState<any[]>([]);
    const [allCertifiedStrategies, setAllCertifiedStrategies] = useState<any[]>([]);
    useEffect(() => {
        fetch('/api/admin/approved-strategies')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (data && Array.isArray(data.strategies)) {
                    setAllApprovedStrategies(data.strategies);
                }
            })
            .catch(() => {});

        fetch('/api/admin/certified-strategies')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (Array.isArray(data)) {
                    setAllCertifiedStrategies(data);
                }
            })
            .catch(() => {});
    }, []);
    // Counselors with empty/null questionnaire_types are "available for all instruments"
    // (matches backend behavior in prompt_audit.py _add_static_warnings).
    const instrumentCounselors = counselors.filter((c) =>
        !c.questionnaire_types || c.questionnaire_types.length === 0 ||
        c.questionnaire_types.some((t) => normalizedQuestionnaireType(t) === normalizedQuestionnaireType(questionnaireType))
    );
    const [editingPrompt, setEditingPrompt] = useState<'system' | 'meta' | 'guidance' | 'step' | null>(null);
    const [systemDraft, setSystemDraft] = useState(systemPrompt);
    const [metaDraft, setMetaDraft] = useState(metaPrompt);
    const [guidanceDraft, setGuidanceDraft] = useState(guidanceText);
    const [stepDraft, setStepDraft] = useState(selectedStep?.prompt || '');
    const modeLabel = selectedStep?.system_prompt_mode
        ? t(`admin.mode.${selectedStep.system_prompt_mode}`)
        : '';

    const flags = {
        ...PROMPT_COMPONENT_DEFAULTS,
        ...(preview?.component_flags || configFlags),
        ...configFlagOverrides,
    };
    const certifiedStrategyLimit = preview?.component_options?.certified_strategy_limit ?? configCertifiedStrategyLimit;
    const configAllowedStrategies = parseAllowedStrategies(componentConfigValue);
    const allowedStrategies = preview?.component_options?.allowed_strategies ?? configAllowedStrategies;
    const componentConfigPayload = {
        ...flags,
        certified_strategy_limit: certifiedStrategyLimit,
        allowed_strategies: allowedStrategies,
    };
    const flagsJson = JSON.stringify(componentConfigPayload);

    useEffect(() => {
        if (!selectedStep) return;
        let cancelled = false;
        const loadingTimer = window.setTimeout(() => {
            if (!cancelled) setPreviewLoading(true);
        }, 0);
        fetch('/api/admin/prompt-audit/dry-run', {
            method: 'POST',
            headers: authJsonHeaders(),
            body: JSON.stringify({
                questionnaire_type: questionnaireType,
                language: selectedLanguage,
                phase: selectedStep.id,
                mode: selectedStep.system_prompt_mode || 'generic',
                message: localizedStepValue,
                use_phase_prompt: false,
                session_id: selectedSessionId || undefined,
                counselor_id: selectedCounselorId || undefined,
                include_knowledge: true,
                include_history: true,
                component_flags: JSON.parse(flagsJson),
            }),
        })
            .then((res) => res.ok ? res.json() : null)
            .then((data) => { if (!cancelled) setPreview(data); })
            .catch(() => { if (!cancelled) setPreview(null); })
            .finally(() => { if (!cancelled) setPreviewLoading(false); });
        return () => { cancelled = true; window.clearTimeout(loadingTimer); };
    }, [questionnaireType, selectedStep?.id, selectedStep?.system_prompt_mode, selectedSessionId, selectedCounselorId, selectedLanguage, localizedStepValue, flagsJson]);

    const toggleFlag = (name: string) => {
        if (!componentKey) return;
        onSaveComponentFlags(componentKey, { ...componentConfigPayload, [name]: !flags[name] });
    };
    const updateCertifiedStrategyLimit = (value: number) => {
        if (!componentKey) return;
        onSaveComponentFlags(componentKey, { ...componentConfigPayload, certified_strategy_limit: value });
    };
    const eligibleApproved = allApprovedStrategies.filter((s) =>
        Array.isArray(s.questionnaires) &&
        s.questionnaires.some((q: string) => q.toUpperCase() === questionnaireType.toUpperCase())
    );
    const eligibleCertified = allCertifiedStrategies.filter((s) =>
        Array.isArray(s.questionnaire_types) &&
        s.questionnaire_types.some((q: string) => q.toUpperCase() === questionnaireType.toUpperCase()) &&
        s.is_active
    );
    const isStrategyAllowed = (idOrSlug: string) => {
        if (!componentConfigPayload.allowed_strategies) {
            return true;
        }
        return componentConfigPayload.allowed_strategies.includes(idOrSlug);
    };
    const toggleStrategyAllowed = (idOrSlug: string) => {
        if (!componentKey) return;
        let currentList: string[];
        if (!componentConfigPayload.allowed_strategies) {
            const allSlugs = [
                ...eligibleApproved.map((s) => s.id),
                ...eligibleCertified.map((s) => s.slug),
            ];
            currentList = allSlugs;
        } else {
            currentList = [...componentConfigPayload.allowed_strategies];
        }
        if (currentList.includes(idOrSlug)) {
            currentList = currentList.filter((item) => item !== idOrSlug);
        } else {
            currentList.push(idOrSlug);
        }
        onSaveComponentFlags(componentKey, {
            ...componentConfigPayload,
            allowed_strategies: currentList,
        });
    };
    const ragSummary = preview?.knowledge
        ? `RAG: ${preview.knowledge.included ? 'ON' : 'OFF'}\ncontext_length: ${preview.knowledge.context_length || 0}\nstrategy_ids: ${(preview.knowledge.strategy_ids || []).join(', ') || '-'}\ncertified_strategy_ids: ${(preview.knowledge.certified_strategy_ids || []).join(', ') || '-'}`
        : '';
    const componentText = promptComponentText(selectedLanguage);
    const uiText = promptUiText(selectedLanguage);
    const finalPrompt = preview?.envelope
        ? `SYSTEM\n${preview.envelope.system_prompt_final || ''}\n\nUSER MESSAGE\n${preview.envelope.full_message || ''}\n\n${componentText.labels.history}\n${JSON.stringify(preview.envelope.history || [], null, 2)}`
        : '';
    const loadingLabel = previewLoading ? uiText.loading : t('admin.promptAudit.empty');

    return (
        <div className="glass-panel p-5 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-700">
                        <Layers className="h-4 w-4 text-indigo-600" />
                        {t('admin.promptAudit.title')}
                    </h3>
                    <p className="mt-1 max-w-3xl text-xs text-slate-500">
                        {t('admin.promptAudit.subtitle')}
                    </p>
                </div>
            </div>

            <EditablePromptTextBlock
                title={uiText.guidanceNotes}
                subtitle={guidanceKey}
                text={guidanceText}
                emptyLabel={t('admin.promptAudit.empty')}
                editing={editingPrompt === 'guidance'}
                draft={guidanceDraft}
                onEdit={() => { setGuidanceDraft(guidanceText); setEditingPrompt('guidance'); }}
                onDraftChange={setGuidanceDraft}
                onSave={() => {
                    if (!guidanceKey) return;
                    onSaveGuidance(guidanceKey, guidanceDraft);
                    setEditingPrompt(null);
                }}
                onCancel={() => { setGuidanceDraft(guidanceText); setEditingPrompt(null); }}
                editLabel={uiText.edit}
                saveLabel={uiText.save}
                cancelLabel={uiText.cancel}
            />

            <div className="grid gap-4 lg:grid-cols-4">
                <label className="space-y-2 text-xs font-semibold text-slate-500">
                    {t('admin.promptAudit.stepSelect')}
                    <select className="w-full rounded-md border border-slate-300 bg-white p-3 text-sm font-normal text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500" value={selectedStep?.id || ''} onChange={(event) => onSelectStep(event.target.value)}>
                        {steps.map((step) => <option key={step.id} value={step.id}>{step.sort_order}. {step.label || step.id}</option>)}
                    </select>
                </label>
                <label className="space-y-2 text-xs font-semibold text-slate-500">
                    {t('admin.promptAudit.sessionSelect')}
                    <select className="w-full rounded-md border border-slate-300 bg-white p-3 text-sm font-normal text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500" value={selectedSessionId} onChange={(event) => onSelectSession(event.target.value)}>
                        <option value="">{t('admin.promptAudit.noSession')}</option>
                        {results.map((result) => <option key={result.session_id} value={result.session_id}>{result.username || '-'} · {result.session_id} · {new Date(result.submitted_at).toLocaleDateString()}</option>)}
                    </select>
                </label>
                <label className="space-y-2 text-xs font-semibold text-slate-500">
                    {t('admin.promptAudit.counselorSelect')}
                    <select className="w-full rounded-md border border-slate-300 bg-white p-3 text-sm font-normal text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500" value={selectedCounselorId} onChange={(event) => onSelectCounselor(event.target.value ? Number(event.target.value) : '')}>
                        <option value="">{t('admin.promptAudit.noCounselor')}</option>
                        {instrumentCounselors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </label>
                <label className="space-y-2 text-xs font-semibold text-slate-500">
                    {uiText.languagePrompt}
                    <select className="w-full rounded-md border border-slate-300 bg-white p-3 text-sm font-normal text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500" value={selectedLanguage} onChange={(event) => onSelectLanguage(event.target.value)}>
                        {PROMPT_LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
                    </select>
                </label>
                <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-3 lg:col-span-4">
                    <div><p className="font-semibold uppercase tracking-wider text-slate-400">{t('admin.promptAudit.instrument')}</p><p className="mt-1 font-mono text-slate-800">{questionnaireType}</p></div>
                    <div><p className="font-semibold uppercase tracking-wider text-slate-400">{t('admin.promptAudit.mode')}</p><p className="mt-1 text-slate-800">{modeLabel}</p></div>
                    <div><p className="font-semibold uppercase tracking-wider text-slate-400">{t('admin.promptAudit.promptKey')}</p><p className="mt-1 break-words font-mono text-slate-800">{systemPromptKey || '-'}</p></div>
                </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
                <div>
                    <h4 className="text-sm font-semibold text-slate-800">{componentText.title}</h4>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {Object.keys(PROMPT_COMPONENT_DEFAULTS)
                            .filter((name) => !['rag_counselorbot', 'rag_competenzestrategiche', 'rag_questionari', 'approved_strategies', 'certified_strategies', 'shared_responses'].includes(name))
                            .map((name) => (
                                <label key={name} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors">
                                    <input type="checkbox" className="accent-indigo-600" checked={flags[name]} onChange={() => toggleFlag(name)} />
                                    {componentText.labels[name] || name}
                                </label>
                            ))}
                    </div>
                </div>

                {flags.knowledge && (
                    <div className="space-y-4">
                        {/* Fonti RAG e Documentazione */}
                        <div className="rounded-lg border border-indigo-100 bg-indigo-50/20 p-4 space-y-3">
                            <h5 className="text-xs font-semibold uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
                                <Layers className="w-3.5 h-3.5 text-indigo-600" />
                                Fonti di Conoscenza RAG e Risposte
                            </h5>
                            <div className="grid gap-2">
                                {['rag_counselorbot', 'rag_competenzestrategiche', 'rag_questionari', 'shared_responses'].map((name) => (
                                    <label key={name} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors">
                                        <input type="checkbox" className="accent-indigo-600" checked={flags[name]} onChange={() => toggleFlag(name)} />
                                        {componentText.labels[name] || name}
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Strategie QSA */}
                        <div className="rounded-lg border border-emerald-100 bg-emerald-50/20 p-4 space-y-3">
                            <h5 className="text-xs font-semibold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
                                <Award className="w-3.5 h-3.5 text-emerald-600" />
                                Strategie Consigliate
                            </h5>
                            <div className="grid gap-2">
                                {['approved_strategies', 'certified_strategies'].map((name) => (
                                    <label key={name} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors">
                                        <input type="checkbox" className="accent-emerald-600" checked={flags[name]} onChange={() => toggleFlag(name)} />
                                        {componentText.labels[name] || name}
                                    </label>
                                ))}
                                <label className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                                    <span>Limite strategie certificate</span>
                                    <select
                                        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 disabled:bg-slate-100 disabled:text-slate-400 focus:ring-1 focus:ring-emerald-500 outline-none"
                                        value={certifiedStrategyLimit}
                                        onChange={(event) => updateCertifiedStrategyLimit(Number(event.target.value))}
                                        disabled={!flags.knowledge || !flags.certified_strategies}
                                    >
                                        <option value={0}>Nessuna</option>
                                        <option value={1}>1</option>
                                        <option value={2}>2</option>
                                        <option value={3}>3</option>
                                    </select>
                                </label>
                            </div>

                            {flags.approved_strategies && eligibleApproved.length > 0 && (
                                <div className="mt-3 space-y-1.5 border-t border-emerald-100 pt-3">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700/70 ml-1">Seleziona Strategie Approvate Attive</p>
                                    <div className="grid gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                                        {eligibleApproved.map((strategy) => (
                                            <label key={strategy.id} className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-2 text-[11px] text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors">
                                                <input
                                                    type="checkbox"
                                                    className="accent-emerald-600 mt-0.5"
                                                    checked={isStrategyAllowed(strategy.id)}
                                                    onChange={() => toggleStrategyAllowed(strategy.id)}
                                                />
                                                <div className="leading-tight">
                                                    <span className="font-mono text-[9px] font-bold text-slate-400 mr-1">[{strategy.id}]</span>
                                                    {strategy.texts?.[selectedLanguage] || strategy.texts?.it || strategy.id}
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {flags.certified_strategies && eligibleCertified.length > 0 && (
                                <div className="mt-3 space-y-1.5 border-t border-emerald-100 pt-3">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700/70 ml-1">Seleziona Strategie Certificate Attive</p>
                                    <div className="grid gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                                        {eligibleCertified.map((strategy) => (
                                            <label key={strategy.slug} className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-2 text-[11px] text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors">
                                                <input
                                                    type="checkbox"
                                                    className="accent-emerald-600 mt-0.5"
                                                    checked={isStrategyAllowed(strategy.slug)}
                                                    onChange={() => toggleStrategyAllowed(strategy.slug)}
                                                />
                                                <div className="leading-tight">
                                                    <span className="font-mono text-[9px] font-bold text-slate-400 mr-1">[{strategy.slug}]</span>
                                                    {strategy[`name_${selectedLanguage}`] || strategy.name_it || strategy.slug}
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="grid gap-4">
                <EditablePromptTextBlock
                    title={componentText.labels.step_prompt}
                    subtitle={localizedStepKey || selectedStep?.id}
                    text={localizedStepValue}
                    emptyLabel={t('admin.promptAudit.empty')}
                    editing={editingPrompt === 'step'}
                    draft={stepDraft}
                    onEdit={() => { setStepDraft(localizedStepValue); setEditingPrompt('step'); }}
                    onDraftChange={setStepDraft}
                    onSave={() => {
                        if (!selectedStep) return;
                        onSaveStepPrompt(selectedStep, stepDraft, selectedLanguage, localizedStepKey);
                        setEditingPrompt(null);
                    }}
                    onCancel={() => { setStepDraft(localizedStepValue); setEditingPrompt(null); }}
                    editLabel={uiText.edit}
                    saveLabel={uiText.save}
                    cancelLabel={uiText.cancel}
                />
                <EditablePromptTextBlock
                    title={componentText.labels.system_prompt}
                    subtitle={systemPromptKey}
                    text={systemPrompt}
                    emptyLabel={t('admin.promptAudit.empty')}
                    editing={editingPrompt === 'system'}
                    draft={systemDraft}
                    onEdit={() => { setSystemDraft(systemPrompt); setEditingPrompt('system'); }}
                    onDraftChange={setSystemDraft}
                    onSave={() => {
                        if (!systemPromptKey) return;
                        onSaveSystemPrompt(systemPromptKey, systemDraft);
                        setEditingPrompt(null);
                    }}
                    onCancel={() => { setSystemDraft(systemPrompt); setEditingPrompt(null); }}
                    editLabel={uiText.edit}
                    saveLabel={uiText.save}
                    cancelLabel={uiText.cancel}
                />
                <EditablePromptTextBlock
                    title={componentText.labels.meta_system_prompt}
                    subtitle={metaPromptKey}
                    text={metaPrompt}
                    emptyLabel={t('admin.promptAudit.empty')}
                    editing={editingPrompt === 'meta'}
                    draft={metaDraft}
                    onEdit={() => { setMetaDraft(metaPrompt); setEditingPrompt('meta'); }}
                    onDraftChange={setMetaDraft}
                    onSave={() => {
                        onSaveMetaPrompt(metaPromptKey, metaDraft);
                        setEditingPrompt(null);
                    }}
                    onCancel={() => { setMetaDraft(metaPrompt); setEditingPrompt(null); }}
                    editLabel={uiText.edit}
                    saveLabel={uiText.save}
                    cancelLabel={uiText.cancel}
                />
                <PromptTextBlock title={componentText.labels.cognitive_factors} text={textValue(preview?.components?.cognitive_factors)} emptyLabel={loadingLabel} />
                <PromptTextBlock title={componentText.labels.affective_factors} text={textValue(preview?.components?.affective_factors)} emptyLabel={loadingLabel} />
                <PromptTextBlock title={componentText.labels.other_scores} text={textValue(preview?.components?.other_scores)} emptyLabel={loadingLabel} />
                <PromptTextBlock title={componentText.labels.knowledge} text={ragSummary} emptyLabel={loadingLabel} />
                <PromptTextBlock title={componentText.labels.history} text={textValue(preview?.components?.history)} emptyLabel={loadingLabel} />
                <PromptTextBlock title={componentText.labels.counselor} text={textValue(preview?.components?.counselor)} emptyLabel={loadingLabel} />
                <PromptTextBlock title={componentText.labels.metadata} text={textValue(preview?.components?.metadata)} emptyLabel={loadingLabel} />
                <PromptTextBlock title={componentText.labels.profile} text={textValue(preview?.components?.profile)} emptyLabel={loadingLabel} />
                <PromptTextBlock title={componentText.labels.student_booklet} text={textValue(preview?.components?.student_booklet)} emptyLabel={loadingLabel} />
                <PromptTextBlock title={uiText.finalPrompt} text={finalPrompt} emptyLabel={loadingLabel} />
            </div>

            <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-4 text-xs text-slate-600">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h4 className="flex items-center gap-2 text-sm font-semibold text-indigo-800"><FileText className="h-4 w-4" />{t('admin.promptAudit.injectedList')}</h4>
                        <p className="mt-2">{t('admin.promptAudit.onlyPrompts')}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={onEditSystemPrompts} className="rounded-md border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">{t('admin.promptAudit.editSystemPrompt')}</button>
                        <button type="button" onClick={onEditStep} className="rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700">{t('admin.promptAudit.editStep')}</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- Component ---

export function ConfigForm() {
    const { t, lang } = useI18n();
    const [configs, setConfigs] = useState<ConfigItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [section, setSection] = useState<string>('general');
    const [instrumentSubsection, setInstrumentSubsection] = useState<InstrumentSubsection>('step-prompts');
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
    const [promptStepIds, setPromptStepIds] = useState<Record<string, string>>({});
    const [promptSessionIds, setPromptSessionIds] = useState<Record<string, string>>({});
    const [promptCounselorIds, setPromptCounselorIds] = useState<Record<string, number | ''>>({});
    const [promptLanguages, setPromptLanguages] = useState<Record<string, string>>({});
    const [questionnaireResults, setQuestionnaireResults] = useState<QuestionnaireResult[]>([]);
    const [placeholderDraft, setPlaceholderDraft] = useState<Record<string, [string, string]>>({});

    const openSection = (nextSection: string) => {
        setSection(nextSection);
        if (nextSection !== 'general') {
            setInstrumentSubsection('step-prompts');
            setShowNewStepForm(false);
        }
    };

    // --- Fetch all data ---

    const fetchConfigs = async () => {
        try {
            const [configRes, envRes, stepsRes, resultsRes] = await Promise.all([
                fetch('/api/admin/config', { headers: authHeaders() }),
                fetch('/api/admin/config/env-status', { headers: authHeaders() }),
                fetch('/api/admin/guided-steps', { headers: authHeaders() }),
                fetch('/api/admin/questionnaire-results?limit=100', { headers: authHeaders() }),
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
            if (resultsRes.ok) setQuestionnaireResults(await resultsRes.json());
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

    const saveComponentFlags = (key: string, flags: Record<string, unknown>) => {
        const value = JSON.stringify(flags);
        setConfigDraft(key, value, key);
        handleSaveConfig({ key, value, description: key });
    };

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
                setPromptStepIds(prev => ({ ...prev, [created.questionnaire_type]: created.id }));
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
                setPromptStepIds(prev => {
                    const next = { ...prev };
                    for (const [qType, selectedId] of Object.entries(next)) {
                        if (selectedId === stepId) delete next[qType];
                    }
                    return next;
                });
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
                { key: 'prompt_meta_QSA', label: 'Meta system prompt QSA' },
                { key: 'prompt_intro', label: 'Prompt Presentazione QSA' },
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
                { key: 'prompt_meta_QSAR', label: 'Meta system prompt QSAr' },
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
                { key: 'prompt_meta_ZTPI', label: 'Meta system prompt ZTPI' },
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
                { key: 'prompt_meta_SAVICKAS', label: 'Meta system prompt Savickas' },
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
                { key: 'prompt_meta_QPCS', label: 'Meta system prompt QPCS' },
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
                { key: 'prompt_meta_QPCC', label: 'Meta system prompt QPCC' },
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
                { key: 'prompt_meta_QAP', label: 'Meta system prompt QAP' },
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
                    onClick={() => openSection('general')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors border ${
                        section === 'general'
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                >
                    <Server className="w-4 h-4" />
                    {t('admin.config.section.general')}
                </button>
                <button
                    onClick={() => openSection('directives')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors border ${
                        section === 'directives'
                            ? 'bg-amber-50 border-amber-200 text-amber-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                >
                    <FileText className="w-4 h-4" />
                    {t('admin.config.section.directives')}
                </button>
                {questTabs.map((tab) => {
                    const c = colorMap[tab.color];
                    return (
                        <button
                            key={tab.id}
                            onClick={() => openSection(tab.id)}
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

            {/* Placeholder Language Mappings */}
            <div className="glass-panel p-6 space-y-4">
                <h3 className="text-lg font-medium text-slate-900 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-indigo-600" />
                    Placeholder lingua ({'{lang}'}, {'{lang_native}'})
                </h3>
                <p className="text-xs text-slate-500 max-w-2xl">
                    Definisci come vengono risolti i placeholder {'{lang}'} (nome inglese) e {'{lang_native}'} (nome nativo) per ogni lingua supportata. Usati nelle direttive globali e nei system prompt.
                </p>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200">
                                <th className="text-left py-2 px-3 text-slate-500 font-medium w-24">Codice</th>
                                <th className="text-left py-2 px-3 text-slate-500 font-medium">{'{lang}'} — Nome inglese</th>
                                <th className="text-left py-2 px-3 text-slate-500 font-medium">{'{lang_native}'} — Nome nativo</th>
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
                                                placeholder="English name"
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
                                                placeholder="Native name"
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
                            handleSaveConfig({ key: 'placeholder_language_mappings', value: json, description: 'Mappatura placeholder lingua' });
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                    >
                        <Save className="w-4 h-4" />
                        Salva mappatura lingue
                    </button>
                </div>
            </div>

            </div>
            )}

            {section === 'directives' && (
            <div className="space-y-6">
                <div className="glass-panel p-6 space-y-6">
                    <h3 className="text-lg font-medium text-slate-900 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-amber-600" />
                        {t('admin.config.section.directives')}
                    </h3>
                    <p className="text-xs text-slate-500 max-w-2xl">
                        Queste direttive vengono iniettate in coda a ogni system prompt del counselorbot, per tutti gli strumenti. Lascia vuoto per usare il default hardcoded. Usa {'{lang}'} e {'{lang_native}'} come placeholder nel campo &quot;Direttiva linguaggio&quot; per il nome della lingua.
                    </p>
                    {[
                        { key: 'directive_language', label: 'Direttiva linguaggio [LANGUAGE]', hint: 'Usa {lang} e {lang_native}' },
                        { key: 'directive_register', label: 'Direttiva registro [REGISTER]' },
                        { key: 'directive_thinking', label: 'Direttiva thinking [THINKING]' },
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
                                    placeholder="Lascia vuoto per default hardcoded"
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
            )}

            {/* 3. Strumento attivo: prompt, testi e step separati in tab interne */}
            {questionnaireConfigs.filter((q) => q.id === section).map((q) => {
                const c = colorMap[q.color];
                const allKeys = [...q.systemPrompts.map(p => p.key), ...q.texts.map(t => textConfigKey(t.key))];
                const sectionSteps = guidedSteps
                    .filter(s => normalizedQuestionnaireType(s.questionnaire_type) === normalizedQuestionnaireType(q.questionnaireType))
                    .sort((a, b) => a.sort_order - b.sort_order);
                const selectedPromptStepId = promptStepIds[q.questionnaireType] || sectionSteps[0]?.id || '';
                return (
                    <div key={q.id} className={`space-y-4 border-l-4 ${c.border} pl-4`}>
                        {/* Header questionario */}
                        <div className={`${c.bg} rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3`}>
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

                        <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-1">
                            {INSTRUMENT_SUBSECTIONS.map((sub) => {
                                const active = instrumentSubsection === sub.id;
                                return (
                                    <button
                                        key={sub.id}
                                        type="button"
                                        onClick={() => {
                                            setInstrumentSubsection(sub.id);
                                            if (sub.id !== 'guided-steps') setShowNewStepForm(false);
                                        }}
                                        className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                                            active
                                                ? `${c.bg} ${c.border} ${c.title}`
                                                : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                                        }`}
                                    >
                                        {t(sub.labelKey)}
                                    </button>
                                );
                            })}
                        </div>

                        {instrumentSubsection === 'step-prompts' && (
                            sectionSteps.length > 0 ? (
                                <StepPromptsPanel
                                    key={`${q.questionnaireType}-${selectedPromptStepId}-${promptLanguages[q.questionnaireType] || lang || 'it'}`}
                                    questionnaireType={q.questionnaireType}
                                    steps={sectionSteps}
                                    selectedStepId={selectedPromptStepId}
                                    onSelectStep={(stepId) => setPromptStepIds(prev => ({ ...prev, [q.questionnaireType]: stepId }))}
                                    onEditSystemPrompts={() => setInstrumentSubsection('system-prompts')}
                                    onEditStep={() => setInstrumentSubsection('guided-steps')}
                                    configs={configs}
                                    results={questionnaireResults.filter((result) => normalizedQuestionnaireType(result.questionnaire_type) === normalizedQuestionnaireType(q.questionnaireType))}
                                    selectedSessionId={promptSessionIds[q.questionnaireType] || ''}
                                    onSelectSession={(sessionId) => setPromptSessionIds(prev => ({ ...prev, [q.questionnaireType]: sessionId }))}
                                    selectedCounselorId={promptCounselorIds[q.questionnaireType] ?? ''}
                                    onSelectCounselor={(counselorId) => setPromptCounselorIds(prev => ({ ...prev, [q.questionnaireType]: counselorId }))}
                                    selectedLanguage={promptLanguages[q.questionnaireType] || lang || 'it'}
                                    onSelectLanguage={(language) => setPromptLanguages(prev => ({ ...prev, [q.questionnaireType]: language }))}
                                    onSaveComponentFlags={saveComponentFlags}
                                    onSaveSystemPrompt={(key, value) => {
                                        setConfigDraft(key, value, key);
                                        handleSaveConfig({ key, value, description: key });
                                    }}
                                    onSaveMetaPrompt={(key, value) => {
                                        setConfigDraft(key, value, key);
                                        handleSaveConfig({ key, value, description: key });
                                    }}
                                    onSaveGuidance={(key, value) => {
                                        setConfigDraft(key, value, key);
                                        handleSaveConfig({ key, value, description: key });
                                    }}
                                    onSaveStepPrompt={(step, value, language, localizedKey) => {
                                        if (language !== 'it') {
                                            setConfigDraft(localizedKey, value, localizedKey);
                                            handleSaveConfig({ key: localizedKey, value, description: localizedKey });
                                            return;
                                        }
                                        const updated = { ...step, prompt: value };
                                        setGuidedSteps(prev => prev.map(s => s.id === step.id ? updated : s));
                                        handleSaveStep(updated);
                                    }}
                                    t={t}
                                />
                            ) : (
                                <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
                                    {t('admin.config.noSteps')}
                                </div>
                            )
                        )}

                        {instrumentSubsection === 'system-prompts' && (
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
                                                className={`w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-sm min-h-[160px] ${c.ring} outline-none font-mono text-slate-900`}
                                                value={currentVal}
                                                onChange={(e) => setConfigDraft(def.key, e.target.value, def.label)}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {instrumentSubsection === 'texts' && (
                            q.texts.length > 0 ? (
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
                                                        className={`w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-sm min-h-[100px] ${c.ring} outline-none font-mono text-slate-900`}
                                                        value={currentVal}
                                                        onChange={(e) => setConfigDraft(localizedKey, e.target.value, def.label)}
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
                                    {t('admin.config.noTexts')}
                                </div>
                            )
                        )}

                        {instrumentSubsection === 'guided-steps' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('admin.config.guidedSteps')}</h3>
                                        <p className="text-xs text-slate-500 ml-1 mt-1">
                                            {t('admin.config.guidedStepsDesc')}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => { setNewStep(prev => ({ ...prev, questionnaire_type: q.questionnaireType })); setShowNewStepForm(true); }}
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
                        )}
                    </div>
                );
            })}

        </div>
    );
}
