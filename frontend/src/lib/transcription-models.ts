export interface TranscriptionModel {
    id: string;
    engine?: string;
    loaded: boolean;
    bytes: number | null;
}

export type TranscriptionProviders = Record<string, { configured: boolean }>;

export const isOnlineTranscription = (engine: string) => engine === 'openrouter' || engine === 'mistral';

export const transcriptionAvailable = (engine: string, providers?: TranscriptionProviders) =>
    !isOnlineTranscription(engine) || providers?.[engine]?.configured === true;

export const validTranscriptionModel = (model: string) => {
    const value = model.trim();
    return value.length > 0 && value.length <= 200 && ![...value].some(char =>
        /\s/.test(char) || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
};

export function modelForEngine(engine: string, current: string, models: TranscriptionModel[], defaults: Record<string, string>) {
    const offered = models.filter(model => (model.engine || 'faster-whisper') === engine).map(model => model.id);
    return offered.includes(current) ? current : defaults[engine] || offered[0] || '';
}
