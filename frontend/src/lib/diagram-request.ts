export interface DiagramFromMessageRequest {
    text: string;
    lang: string;
    spec_only: true;
    instruction: string;
    counselor_id: number;
}

export function buildDiagramFromMessageRequest(
    text: string,
    lang: string,
    instruction: string,
    counselorId: number,
): DiagramFromMessageRequest {
    return {
        text: text.slice(0, 8000),
        lang,
        spec_only: true,
        instruction: instruction.trim().slice(0, 400),
        counselor_id: counselorId,
    };
}
