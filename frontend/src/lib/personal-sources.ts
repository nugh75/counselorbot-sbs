// Personal AI sources (#200, #202): shared by the "APIs and ChatGPT" page and the counselor details.
export type ServerBinding = { counselor_id: number; connection_id: string | null; chatgpt_model: string | null; reasoning: string | null };
// A source is '' (institution or default), 'api:<connection id>' or 'chatgpt:<model>'.
export type Binding = { counselor_id: number; source: string; reasoning: string };
export type PersonalSources = {
    available: boolean; class_blocked?: boolean; api_enabled: boolean; chatgpt_enabled: boolean; enabled: boolean; providers: string[];
    default_connection_id: string | null; default_chatgpt_model: string | null; default_reasoning: string | null;
    connections: { id: string; name: string; provider: string; model: string }[]; bindings: ServerBinding[];
    chatgpt_models: { slug: string; display_name: string; reasoning_levels: string[] }[];
    counselors: { id: number; name: string; is_personal: boolean }[];
};
export const encode = (connection: string | null, chatgpt: string | null) => connection ? `api:${connection}` : chatgpt ? `chatgpt:${chatgpt}` : '';
export const decode = (source: string) => ({ connection_id: source.startsWith('api:') ? source.slice(4) : null, chatgpt_model: source.startsWith('chatgpt:') ? source.slice(8) : null });
export const fromServer = (items: ServerBinding[]): Binding[] => items.map(b => ({ counselor_id: b.counselor_id, source: encode(b.connection_id, b.chatgpt_model), reasoning: b.reasoning ?? '' }));
// Levels offered for a source; a ChatGPT model that lists its own levels offers only those.
const API_LEVELS = ['none', 'low', 'medium', 'high'];
export const levelsFor = (data: PersonalSources | null, source: string) => {
    if (!data || !source) return [];
    if (!source.startsWith('chatgpt:')) return API_LEVELS;
    const declared = data.chatgpt_models.find(m => `chatgpt:${m.slug}` === source)?.reasoning_levels ?? [];
    return declared.length ? declared : ['low', 'medium', 'high'];
};
export const validSource = (data: PersonalSources, source: string) => !source || data.connections.some(c => `api:${c.id}` === source) || data.chatgpt_models.some(m => `chatgpt:${m.slug}` === source);
// Human label of a source, for summaries.
export const sourceLabel = (data: PersonalSources, source: string) => {
    const connection = data.connections.find(c => `api:${c.id}` === source);
    if (connection) return `${connection.name} · ${connection.model}`;
    const model = data.chatgpt_models.find(m => `chatgpt:${m.slug}` === source);
    return model ? `ChatGPT · ${model.display_name}` : source.startsWith('chatgpt:') ? `ChatGPT · ${source.slice(8)}` : '';
};
// The routing body with one counselor's choice replaced; a choice turns personal routing on.
export const routingWith = (data: PersonalSources, counselorId: number, source: string, reasoning: string) => {
    const bindings = fromServer(data.bindings).filter(b => b.counselor_id !== counselorId);
    if (source) bindings.push({ counselor_id: counselorId, source, reasoning });
    return {
        enabled: data.enabled || Boolean(source), default_connection_id: data.default_connection_id,
        default_chatgpt_model: data.default_chatgpt_model, default_reasoning: data.default_reasoning,
        bindings: bindings.map(b => ({ counselor_id: b.counselor_id, ...decode(b.source), reasoning: b.reasoning || null })),
    };
};
