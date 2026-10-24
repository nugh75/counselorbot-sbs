// Configurazione pubblica letta all'AVVIO del server, non al build (F1-03):
// la stessa build standalone serve Docker, portabile e desktop, dove l'URL del
// tunnel cambia a ogni avvio. Il server la espone in /runtime-config.js, che
// il layout carica prima dell'idratazione; i valori assenti usano i default
// di createAuthUrls (installazione ai4educ).
export interface RuntimeConfig {
    appUrl?: string;
    authBase?: string;
    portalUrl?: string;
    managerUrl?: string;
    projectId?: string;
}

const ENV_KEYS: Record<keyof RuntimeConfig, string> = {
    appUrl: 'COUNSELORBOT_APP_URL',
    authBase: 'COUNSELORBOT_AUTH_URL',
    portalUrl: 'COUNSELORBOT_PORTAL_URL',
    managerUrl: 'COUNSELORBOT_MANAGER_URL',
    projectId: 'COUNSELORBOT_PROJECT_ID',
};

const GLOBAL_KEY = '__COUNSELORBOT_CONFIG__';

export function runtimeConfigFromEnv(env: Record<string, string | undefined>): RuntimeConfig {
    const config: RuntimeConfig = {};
    for (const [field, key] of Object.entries(ENV_KEYS) as [keyof RuntimeConfig, string][]) {
        const value = env[key]?.trim();
        if (value) config[field] = value;
    }
    return config;
}

// `<` escapato: il JSON non può chiudere un tag script né aprire un commento HTML.
export function runtimeConfigScript(config: RuntimeConfig): string {
    return `window.${GLOBAL_KEY}=${JSON.stringify(config).replace(/</g, '\\u003c')};\n`;
}

// Sul server (SSR) non c'è window: si usano i default, come prima dell'idratazione.
export function getRuntimeConfig(): RuntimeConfig {
    if (typeof window === 'undefined') return {};
    return (window as unknown as Record<string, RuntimeConfig | undefined>)[GLOBAL_KEY] ?? {};
}
