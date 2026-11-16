import type { Lang } from './i18n';

// #1020: which AI key answers the person, as returned by GET /api/me/ai-source.
export interface AISource {
    source: 'system' | 'own_api' | 'teacher_api' | 'chatgpt';
    owner_role: 'admin' | 'student' | 'teacher';
    viewer_role: 'student' | 'teacher';
    owner_label: string | null;
    provider: string;
    connection: 'api' | 'subscription';
    model: string;
    fallback: boolean;
    fallback_reason: string | null;
}

export type ProviderLogo = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'generic';

const PROVIDER_NAMES: Record<string, string> = {
    openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Google Gemini', mistral: 'Mistral', openrouter: 'OpenRouter',
    ollama: 'Ollama', llamacpp: 'llama.cpp', groq: 'Groq', cerebras: 'Cerebras', deepseek: 'DeepSeek',
    together: 'Together', fireworks: 'Fireworks', deepinfra: 'DeepInfra',
};
// Simple Icons logos; Mistral and OpenRouter use the neutral icon (no brand permission checked).
const LOGOS: Record<string, ProviderLogo> = { openai: 'openai', anthropic: 'anthropic', gemini: 'gemini', ollama: 'ollama' };

const it = {
    title: 'Con quale AI stai parlando', managedBy: 'Gestito da', byPlatform: 'la piattaforma', byYou: 'te', byTeacher: 'il tuo docente',
    chatgpt: 'ChatGPT (abbonamento)', manage: 'Gestisci le tue API',
    fallback: 'La tua chiave non risponde: stai usando la chiave di sistema',
};
type Key = keyof typeof it;
const dictionaries: Record<Lang, Record<Key, string>> = {
    it,
    en: {
        title: 'Which AI you are talking to', managedBy: 'Managed by', byPlatform: 'the platform', byYou: 'you', byTeacher: 'your teacher',
        chatgpt: 'ChatGPT (subscription)', manage: 'Manage your APIs',
        fallback: 'Your key is not responding: you are using the system key',
    },
    es: {
        title: 'Con qué IA estás hablando', managedBy: 'Gestionado por', byPlatform: 'la plataforma', byYou: 'ti', byTeacher: 'tu docente',
        chatgpt: 'ChatGPT (suscripción)', manage: 'Gestiona tus API',
        fallback: 'Tu clave no responde: estás usando la clave del sistema',
    },
    fr: {
        title: 'Avec quelle IA tu parles', managedBy: 'Géré par', byPlatform: 'la plateforme', byYou: 'toi', byTeacher: 'ton enseignant',
        chatgpt: 'ChatGPT (abonnement)', manage: 'Gérer tes API',
        fallback: 'Ta clé ne répond pas : tu utilises la clé du système',
    },
    de: {
        title: 'Mit welcher KI du sprichst', managedBy: 'Verwaltet von', byPlatform: 'der Plattform', byYou: 'dir', byTeacher: 'deiner Lehrkraft',
        chatgpt: 'ChatGPT (Abonnement)', manage: 'Deine APIs verwalten',
        fallback: 'Dein Schlüssel antwortet nicht: Du verwendest den Systemschlüssel',
    },
    sv: {
        title: 'Vilken AI du pratar med', managedBy: 'Hanteras av', byPlatform: 'plattformen', byYou: 'dig', byTeacher: 'din lärare',
        chatgpt: 'ChatGPT (abonnemang)', manage: 'Hantera dina API:er',
        fallback: 'Din nyckel svarar inte: du använder systemnyckeln',
    },
};

const MANAGER: Record<AISource['source'], Key> = { system: 'byPlatform', own_api: 'byYou', teacher_api: 'byTeacher', chatgpt: 'byYou' };

export function aiSourceView(source: AISource, lang: Lang) {
    const t = dictionaries[lang] ?? it;
    const provider = PROVIDER_NAMES[source.provider] ?? source.provider;
    const label = source.source === 'teacher_api' && source.owner_label ? `${t.byTeacher} (${source.owner_label})` : t[MANAGER[source.source]];
    const managed = `${t.managedBy}: ${label}`;
    const detail = `${source.connection === 'subscription' ? t.chatgpt : `${provider} API`} · ${source.model}`;
    const warning = source.fallback ? t.fallback : null;
    return {
        badge: source.owner_role,
        logo: LOGOS[source.provider] ?? 'generic' as ProviderLogo,
        title: t.title,
        managed,
        detail,
        warning,
        aria: [`${t.title}: ${managed}`, detail, warning].filter(Boolean).join('. '),
        manage: t.manage,
        manageHref: source.viewer_role === 'teacher' ? '/docente/api-personali' : '/profilo/api-personali',
    };
}
