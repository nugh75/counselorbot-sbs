const personalReasons = new Set(['authentication', 'modelUnavailable', 'quota', 'rateLimit', 'privacy', 'invalidRequest', 'connection', 'configuration', 'counselor']);
const chatReasons = new Set(['connection', 'access', 'configuration']);

// Only fixed codes may cross the proxy/UI boundary; upstream messages stay private.
export function safeChatErrorCode(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    if (value.startsWith('personalAPI.errors.') && personalReasons.has(value.slice('personalAPI.errors.'.length))) return value;
    if (value.startsWith('chat.errors.') && chatReasons.has(value.slice('chat.errors.'.length))) return value;
    return undefined;
}

export function chatHTTPErrorCode(status: number, body: unknown): string {
    const data = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    const detail = data.detail;
    const nested = detail && typeof detail === 'object' ? detail as Record<string, unknown> : {};
    const code = safeChatErrorCode(data.error_code) || safeChatErrorCode(detail) || safeChatErrorCode(nested.error_code);
    if (code) return code;
    if (status === 401 || status === 403) return 'chat.errors.access';
    if ([400, 404, 409, 422].includes(status)) return 'chat.errors.configuration';
    return 'chat.errors.connection';
}
