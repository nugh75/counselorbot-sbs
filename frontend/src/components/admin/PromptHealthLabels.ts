'use client';

import { useCallback } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { promptLabel } from '@/lib/prompt-health';
import type { PromptHealthPath } from './PromptCompare';

/** Prefer the existing translated names; keep registry ids in technical details. */
export function usePromptName(paths: PromptHealthPath[]) {
    const { t, tf, lang } = useI18n();
    return useCallback((id: string) => {
        if (id.startsWith('code:')) {
            return tf(`admin.promptHealth.source.${promptLabel(id)}`, t('admin.promptHealth.source.request'));
        }
        if (id.startsWith('guided_step:')) {
            for (const path of paths) {
                const step = path.steps.find(item => item.id === promptLabel(id));
                if (step) return `${path.instrument} · ${step.label_i18n?.[lang] || step.label}`;
            }
        }
        return tf(`admin.config.label.${promptLabel(id)}`, promptLabel(id).replace(/_/g, ' '));
    }, [paths, t, tf, lang]);
}

export function useSurfaceName(paths: PromptHealthPath[]) {
    const { tf, lang } = useI18n();
    return useCallback((surface: string) => {
        const [instrument, stepId, mode] = surface.split(' · ');
        const step = paths.find(path => path.instrument === instrument)?.steps.find(item => item.id === stepId);
        return step ? `${instrument} · ${step.label_i18n?.[lang] || step.label} · ${tf(`admin.promptHealth.mode.${mode}`, mode || '')}`
            : tf(`admin.promptHealth.surface.${surface}`, surface);
    }, [paths, tf, lang]);
}
