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
    title: 'Con quale AI stai parlando', system: 'Chiave di sistema', own_api: 'La tua chiave', teacher_api: 'Chiave del docente',
    chatgpt: 'Il tuo abbonamento ChatGPT', key: 'Chiave', link: 'Collegamento', provider: 'Provider', model: 'Modello',
    pays: 'Chi paga', api: 'API', subscription: 'abbonamento', paysSystem: 'L’istituzione', paysOwn: 'Tu',
    paysTeacher: 'Il docente', paysChatgpt: 'Il tuo abbonamento', manage: 'Gestisci le tue API',
    fallback: 'La tua chiave non risponde: stai usando la chiave di sistema',
};
type Key = keyof typeof it;
const dictionaries: Record<Lang, Record<Key, string>> = {
    it,
    en: {
        title: 'Which AI you are talking to', system: 'System key', own_api: 'Your key', teacher_api: 'Teacher’s key',
        chatgpt: 'Your ChatGPT subscription', key: 'Key', link: 'Connection', provider: 'Provider', model: 'Model',
        pays: 'Who pays', api: 'API', subscription: 'subscription', paysSystem: 'The institution', paysOwn: 'You',
        paysTeacher: 'The teacher', paysChatgpt: 'Your subscription', manage: 'Manage your APIs',
        fallback: 'Your key is not responding: you are using the system key',
    },
    es: {
        title: 'Con qué IA estás hablando', system: 'Clave del sistema', own_api: 'Tu clave', teacher_api: 'Clave del docente',
        chatgpt: 'Tu suscripción de ChatGPT', key: 'Clave', link: 'Conexión', provider: 'Proveedor', model: 'Modelo',
        pays: 'Quién paga', api: 'API', subscription: 'suscripción', paysSystem: 'La institución', paysOwn: 'Tú',
        paysTeacher: 'El docente', paysChatgpt: 'Tu suscripción', manage: 'Gestiona tus API',
        fallback: 'Tu clave no responde: estás usando la clave del sistema',
    },
    fr: {
        title: 'Avec quelle IA tu parles', system: 'Clé du système', own_api: 'Ta clé', teacher_api: 'Clé de l’enseignant',
        chatgpt: 'Ton abonnement ChatGPT', key: 'Clé', link: 'Connexion', provider: 'Fournisseur', model: 'Modèle',
        pays: 'Qui paie', api: 'API', subscription: 'abonnement', paysSystem: 'L’établissement', paysOwn: 'Toi',
        paysTeacher: 'L’enseignant', paysChatgpt: 'Ton abonnement', manage: 'Gérer tes API',
        fallback: 'Ta clé ne répond pas : tu utilises la clé du système',
    },
    de: {
        title: 'Mit welcher KI du sprichst', system: 'Systemschlüssel', own_api: 'Dein Schlüssel', teacher_api: 'Schlüssel der Lehrkraft',
        chatgpt: 'Dein ChatGPT-Abonnement', key: 'Schlüssel', link: 'Verbindung', provider: 'Anbieter', model: 'Modell',
        pays: 'Wer zahlt', api: 'API', subscription: 'Abonnement', paysSystem: 'Die Einrichtung', paysOwn: 'Du',
        paysTeacher: 'Die Lehrkraft', paysChatgpt: 'Dein Abonnement', manage: 'Deine APIs verwalten',
        fallback: 'Dein Schlüssel antwortet nicht: Du verwendest den Systemschlüssel',
    },
    sv: {
        title: 'Vilken AI du pratar med', system: 'Systemnyckel', own_api: 'Din nyckel', teacher_api: 'Lärarens nyckel',
        chatgpt: 'Ditt ChatGPT-abonnemang', key: 'Nyckel', link: 'Anslutning', provider: 'Leverantör', model: 'Modell',
        pays: 'Vem betalar', api: 'API', subscription: 'abonnemang', paysSystem: 'Institutionen', paysOwn: 'Du',
        paysTeacher: 'Läraren', paysChatgpt: 'Ditt abonnemang', manage: 'Hantera dina API:er',
        fallback: 'Din nyckel svarar inte: du använder systemnyckeln',
    },
};

const PAYS: Record<AISource['source'], Key> = { system: 'paysSystem', own_api: 'paysOwn', teacher_api: 'paysTeacher', chatgpt: 'paysChatgpt' };

export function aiSourceView(source: AISource, lang: Lang) {
    const t = dictionaries[lang] ?? it;
    const provider = PROVIDER_NAMES[source.provider] ?? source.provider;
    const owner = source.source === 'teacher_api' && source.owner_label ? `${t.teacher_api} · ${source.owner_label}` : t[source.source];
    const connection = t[source.connection];
    const rows: [string, string][] = [[t.key, owner], [t.link, connection], [t.provider, provider], [t.model, source.model],
        [t.pays, t[PAYS[source.source]]]];
    const warning = source.fallback ? t.fallback : null;
    return {
        badge: source.owner_role,
        logo: LOGOS[source.provider] ?? 'generic' as ProviderLogo,
        title: t.title,
        owner,
        rows,
        warning,
        aria: [`${t.title}: ${owner}`, `${connection}, ${provider}, ${source.model}`, warning].filter(Boolean).join('. '),
        manage: t.manage,
        manageHref: source.viewer_role === 'teacher' ? '/docente/api-personali' : '/profilo/api-personali',
    };
}
