import { apiFetch } from './auth';

export type ChatGPTModel = { slug: string; display_name: string };
export type ChatGPTStatus = {
    available: boolean; reason: string | null; connected: boolean; email: string | null;
    use_subscription: boolean; model: string | null; needs_reconnect: boolean;
    pending_link: boolean; registered: boolean; revocation_pending: boolean; models: ChatGPTModel[];
};

export type ChatGPTInstallationStatus = {
    enabled: boolean; ready: boolean; reason: string | null;
    key_source: 'managed' | 'environment';
};

async function request<T>(url: string, method: string, data?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await apiFetch(url, {
        method, signal, cache: 'no-store',
        headers: { 'X-Requested-With': 'CounselorBot', ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    if (!response.ok) {
        let code = 'chatgpt.errors.unavailable';
        try {
            const result = await response.json();
            if (typeof result.detail === 'string' && /^chatgpt\.errors\.[a-zA-Z]+$/.test(result.detail)) code = result.detail;
        } catch { /* A proxy may return HTML: do not display it. */ }
        throw new Error(code);
    }
    return response.json() as Promise<T>;
}

export function chatgptRequest<T>(path = '', method = 'GET', data?: unknown, signal?: AbortSignal): Promise<T> {
    return request(`/api/user/chatgpt${path}`, method, data, signal);
}

export function chatgptInstallationRequest(method = 'GET', data?: unknown, signal?: AbortSignal): Promise<ChatGPTInstallationStatus> {
    return request('/api/admin/chatgpt/settings', method, data, signal);
}

export function notifyChatGPTChange() {
    window.dispatchEvent(new Event('chatgpt-connection-changed'));
}
