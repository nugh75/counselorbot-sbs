'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import type { ResponseFormat } from '@/lib/chat-preferences';

export interface ClassChatSettings {
    response_format: ResponseFormat | null;
    response_length: 'short' | 'medium' | 'long' | null;
    response_reasoning: 'off' | 'standard' | 'deep' | null;
    allow_student_response_format: boolean;
    allow_student_response_length: boolean;
    allow_student_response_reasoning: boolean;
}

export function useClassChatSettings(enabled = true) {
    const [policy, setPolicy] = useState<ClassChatSettings | null>(null);
    const [error, setError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        if (!enabled) return;
        const controller = new AbortController();
        void apiFetch('/api/student/class-chat-settings', { signal: controller.signal })
            .then(async response => {
                if (!response.ok) throw new Error('Class settings unavailable');
                const value = await response.json();
                if (!['format', 'length', 'reasoning'].every(key => typeof value?.[`allow_student_response_${key}`] === 'boolean'))
                    throw new Error('Invalid class settings');
                if (!controller.signal.aborted) { setPolicy(value); setError(false); }
            }).catch(() => { if (!controller.signal.aborted) setError(true); });
        return () => controller.abort();
    }, [enabled, attempt]);
    return {
        policy: enabled ? policy : null, error: enabled && error,
        allowsFormat: !enabled || policy?.allow_student_response_format === true,
        allowsLength: !enabled || policy?.allow_student_response_length === true,
        allowsReasoning: !enabled || policy?.allow_student_response_reasoning === true,
        retry: () => setAttempt(value => value + 1),
    };
}
