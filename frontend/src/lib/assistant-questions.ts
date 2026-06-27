// Domande suggerite dell'assistente docenti (pulsante "Prepara domanda").
// Le domande attive vivono nel DB e sono modificabili da admin; per le lingue
// senza righe il chiamante ricade sulle varianti i18n.

export type AssistantQuestionsByTopic = Record<string, string[]>;

export interface AdminAssistantQuestion {
    id: number;
    topic: string;
    language: string;
    text: string;
    sort_order: number;
    is_active: boolean;
    created_at: string;
    updated_at: string | null;
}

// Lista pubblica (solo attive) raggruppata per topic, per la lingua data.
export async function fetchAssistantQuestions(lang: string): Promise<AssistantQuestionsByTopic> {
    try {
        const res = await fetch(`/api/assistant-questions?lang=${encodeURIComponent(lang)}`);
        if (!res.ok) return {};
        return (await res.json()) as AssistantQuestionsByTopic;
    } catch {
        return {};
    }
}
