/** Conservative UTF-8 estimate, shared contract with backend/model_context.py. */
export function estimateTokens(text: string): number {
    return Math.ceil(new TextEncoder().encode(text || '').length / 3) + 8;
}
