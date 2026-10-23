// Rilevamento dei server LLM locali (Ollama, LM Studio, server compatibile OpenAI): testi e regole del pannello.
import type { Lang } from './i18n';

export type LocalServerStatus = 'ok' | 'unreachable' | 'auth_required' | 'error';

export interface LocalServer {
    id: 'ollama' | 'lmstudio' | 'custom';
    provider: 'ollama' | 'llamacpp';
    config_key: 'ollama_ip' | 'llamacpp_url';
    config_value: string;
    url: string;
    tried: string[];
    status: LocalServerStatus;
    http_status?: number;
    models: string[];
}

export interface LocalDetectResponse {
    in_docker: boolean;
    api_key: { configured: boolean; environment_variable: string | null; preferred_environment_variable: string };
    servers: LocalServer[];
}

export type LocalLlmKey =
    | 'customLabel' | 'detect' | 'detecting' | 'help' | 'dockerNote' | 'failed'
    | 'server.ollama' | 'server.lmstudio' | 'server.custom'
    | 'status.ok' | 'status.unreachable' | 'status.auth_required' | 'status.error'
    | 'models' | 'noModels' | 'use' | 'inUse' | 'keyConfigured' | 'keyMissing';

// it, en, es, fr, de, sv
const TEXTS: Record<LocalLlmKey, string[]> = {
    customLabel: ['Server locale / compatibile OpenAI (URL)', 'Local / OpenAI-compatible server (URL)', 'Servidor local / compatible con OpenAI (URL)', 'Serveur local / compatible OpenAI (URL)', 'Lokaler / OpenAI-kompatibler Server (URL)', 'Lokal / OpenAI-kompatibel server (URL)'],
    detect: ['Rileva server locali', 'Detect local servers', 'Detectar servidores locales', 'Détecter les serveurs locaux', 'Lokale Server erkennen', 'Hitta lokala servrar'],
    detecting: ['Rilevamento…', 'Detecting…', 'Detectando…', 'Détection…', 'Erkennung…', 'Söker…'],
    help: [
        'Cerca Ollama (porta 11434), LM Studio (porta 1234) e il server compatibile OpenAI indicato sopra (vLLM, LiteLLM, llama-server, server di scuola). Elenca i modelli di chat trovati.',
        'Looks for Ollama (port 11434), LM Studio (port 1234) and the OpenAI-compatible server entered above (vLLM, LiteLLM, llama-server, school server). Lists the chat models found.',
        'Busca Ollama (puerto 11434), LM Studio (puerto 1234) y el servidor compatible con OpenAI indicado arriba (vLLM, LiteLLM, llama-server, servidor del centro). Muestra los modelos de chat encontrados.',
        'Recherche Ollama (port 11434), LM Studio (port 1234) et le serveur compatible OpenAI indiqué ci-dessus (vLLM, LiteLLM, llama-server, serveur de l’école). Affiche les modèles de chat trouvés.',
        'Sucht Ollama (Port 11434), LM Studio (Port 1234) und den oben angegebenen OpenAI-kompatiblen Server (vLLM, LiteLLM, llama-server, Schulserver). Zeigt die gefundenen Chat-Modelle.',
        'Söker efter Ollama (port 11434), LM Studio (port 1234) och den OpenAI-kompatibla servern ovan (vLLM, LiteLLM, llama-server, skolans server). Visar de chattmodeller som hittas.',
    ],
    dockerNote: [
        'Il backend gira in Docker: 127.0.0.1 è il container, quindi si prova prima host.docker.internal (il computer che lo ospita).',
        'The backend runs in Docker: 127.0.0.1 is the container, so host.docker.internal (the host computer) is tried first.',
        'El backend se ejecuta en Docker: 127.0.0.1 es el contenedor, así que primero se prueba host.docker.internal (el equipo anfitrión).',
        'Le backend tourne dans Docker : 127.0.0.1 est le conteneur, donc host.docker.internal (l’ordinateur hôte) est essayé en premier.',
        'Das Backend läuft in Docker: 127.0.0.1 ist der Container, daher wird zuerst host.docker.internal (der Host-Rechner) versucht.',
        'Backend körs i Docker: 127.0.0.1 är containern, så host.docker.internal (värddatorn) provas först.',
    ],
    failed: ['Rilevamento non riuscito', 'Detection failed', 'La detección ha fallado', 'Échec de la détection', 'Erkennung fehlgeschlagen', 'Sökningen misslyckades'],
    'server.ollama': ['Ollama', 'Ollama', 'Ollama', 'Ollama', 'Ollama', 'Ollama'],
    'server.lmstudio': ['LM Studio', 'LM Studio', 'LM Studio', 'LM Studio', 'LM Studio', 'LM Studio'],
    'server.custom': ['Server compatibile OpenAI', 'OpenAI-compatible server', 'Servidor compatible con OpenAI', 'Serveur compatible OpenAI', 'OpenAI-kompatibler Server', 'OpenAI-kompatibel server'],
    'status.ok': ['Raggiungibile', 'Reachable', 'Accesible', 'Joignable', 'Erreichbar', 'Nåbar'],
    'status.unreachable': ['Non raggiungibile', 'Not reachable', 'No accesible', 'Injoignable', 'Nicht erreichbar', 'Inte nåbar'],
    'status.auth_required': ['Raggiungibile, chiede una chiave', 'Reachable, needs a key', 'Accesible, requiere una clave', 'Joignable, demande une clé', 'Erreichbar, Schlüssel erforderlich', 'Nåbar, kräver en nyckel'],
    'status.error': ['Errore del server ({code})', 'Server error ({code})', 'Error del servidor ({code})', 'Erreur du serveur ({code})', 'Serverfehler ({code})', 'Serverfel ({code})'],
    models: ['Modelli: {list}', 'Models: {list}', 'Modelos: {list}', 'Modèles : {list}', 'Modelle: {list}', 'Modeller: {list}'],
    noModels: ['Nessun modello di chat caricato', 'No chat model loaded', 'Ningún modelo de chat cargado', 'Aucun modèle de chat chargé', 'Kein Chat-Modell geladen', 'Ingen chattmodell laddad'],
    use: ['Usa questo indirizzo', 'Use this address', 'Usar esta dirección', 'Utiliser cette adresse', 'Diese Adresse verwenden', 'Använd den här adressen'],
    inUse: ['In uso', 'In use', 'En uso', 'Utilisée', 'In Verwendung', 'Används'],
    keyConfigured: [
        'Chiave del server compatibile OpenAI: impostata ({variable}).',
        'OpenAI-compatible server key: set ({variable}).',
        'Clave del servidor compatible con OpenAI: definida ({variable}).',
        'Clé du serveur compatible OpenAI : définie ({variable}).',
        'Schlüssel des OpenAI-kompatiblen Servers: gesetzt ({variable}).',
        'Nyckel för den OpenAI-kompatibla servern: angiven ({variable}).',
    ],
    keyMissing: [
        'Chiave del server compatibile OpenAI: non impostata (facoltativa). Se il server la chiede, impostala come {variable} in ai4educ Console, pagina Segreti.',
        'OpenAI-compatible server key: not set (optional). If the server needs one, set it as {variable} in ai4educ Console, Secrets page.',
        'Clave del servidor compatible con OpenAI: no definida (opcional). Si el servidor la pide, defínela como {variable} en ai4educ Console, página Secretos.',
        'Clé du serveur compatible OpenAI : non définie (facultative). Si le serveur la demande, définissez-la comme {variable} dans ai4educ Console, page Secrets.',
        'Schlüssel des OpenAI-kompatiblen Servers: nicht gesetzt (optional). Falls der Server einen verlangt, als {variable} in ai4educ Console, Seite Geheimnisse, setzen.',
        'Nyckel för den OpenAI-kompatibla servern: inte angiven (valfri). Om servern kräver en, ange den som {variable} i ai4educ Console, sidan Hemligheter.',
    ],
};

const LANG_INDEX: Record<Lang, number> = { it: 0, en: 1, es: 2, fr: 3, de: 4, sv: 5 };

export function localLlmText(lang: Lang, key: LocalLlmKey, params?: Record<string, string | number>): string {
    let template = TEXTS[key][LANG_INDEX[lang] ?? 0] || TEXTS[key][0];
    for (const [name, value] of Object.entries(params ?? {})) template = template.replaceAll(`{${name}}`, String(value));
    return template;
}

export function serverStatusText(lang: Lang, server: LocalServer): string {
    return localLlmText(lang, `status.${server.status}`, { code: server.http_status ?? '?' });
}

// A server that answered (even asking for a key) can be adopted; an address forced by the environment cannot.
export function canUseServer(server: LocalServer, currentValue: string, envOverridden: boolean): boolean {
    return !envOverridden && (server.status === 'ok' || server.status === 'auth_required')
        && server.config_value !== currentValue.trim();
}

export function modelsSummary(models: string[], max = 6): string {
    return models.length > max ? `${models.slice(0, max).join(', ')} +${models.length - max}` : models.join(', ');
}
