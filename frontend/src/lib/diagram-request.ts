export interface DiagramFromMessageRequest {
    text: string;
    lang: string;
    spec_only: true;
    instruction: string;
    counselor_id: number;
    session_id?: string;
    source_text?: string;
}

export function buildDiagramFromMessageRequest(
    text: string,
    lang: string,
    instruction: string,
    counselorId: number,
    sessionId?: string,
    sourceText?: string,
): DiagramFromMessageRequest {
    return {
        text: text.slice(0, 8000),
        lang,
        spec_only: true,
        instruction: instruction.trim().slice(0, 400),
        counselor_id: counselorId,
        ...(sessionId ? { session_id: sessionId, source_text: sourceText || text } : {}),
    };
}

export async function messageDiagramKey(sourceText: string): Promise<string> {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sourceText.trim()));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
